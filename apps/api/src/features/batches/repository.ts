import type Database from 'better-sqlite3';
import type { BatchSnapshot, BatchSummary, ManualReview, RunCompletion, RunDetails } from '@savedex/contracts/api';
import type { ExtractResult } from '@savedex/contracts/extractor';
import { VideoRepository, type RepositoryOptions } from '../videos/repository.js';
import { RunRepository } from '../runs/repository.js';
import { reviewState } from '../runs/review.js';
import { projectVideoState } from '../../db/projections.js';

interface BatchRow {
  id: number; state: BatchSnapshot['state']; started_at: string; finished_at: string | null;
  summary_json: string | null; summary_dismissed_at: string | null;
}
export class BatchRepository {
  private readonly now: () => Date;
  private readonly runs: RunRepository;
  private readonly videos: VideoRepository;
  constructor(private readonly db: Database.Database, options: RepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.runs = new RunRepository(db, options); this.videos = new VideoRepository(db, options);
  }
  private openRow(): BatchRow | undefined {
    return this.db.prepare<[], BatchRow>("SELECT * FROM batches WHERE state<>'completed' ORDER BY id LIMIT 1").get();
  }
  hasRunning(): boolean { return this.openRow()?.state === 'running'; }
  current(): BatchSnapshot | null {
    const row = this.openRow() ?? this.db.prepare<[], BatchRow>("SELECT * FROM batches WHERE state='completed' AND summary_dismissed_at IS NULL ORDER BY id DESC LIMIT 1").get();
    return row ? { id: row.id, state: row.state, startedAt: row.started_at, finishedAt: row.finished_at,
      summary: row.summary_json ? JSON.parse(row.summary_json) as BatchSummary : null,
      summaryDismissedAt: row.summary_dismissed_at, counts: this.counts(row.id) } : null;
  }
  start(): void {
    this.db.transaction(() => {
      const open = this.openRow();
      if (open) {
        if (open.state === 'stopping') return;
        if (open.state === 'stopped') this.db.prepare("UPDATE batches SET state='running' WHERE id=?").run(open.id);
        this.settle(open.id);
        return;
      }
      const pending = this.db.prepare<[], { n: number }>("SELECT count(*) AS n FROM queue_entries WHERE state='pending' AND batch_id IS NULL").get()!.n;
      if (!pending) return;
      const timestamp = this.now().toISOString();
      this.db.prepare("UPDATE batches SET summary_dismissed_at=? WHERE state='completed' AND summary_dismissed_at IS NULL").run(timestamp);
      const id = Number(this.db.prepare("INSERT INTO batches(started_at,state) VALUES(?,'running')").run(timestamp).lastInsertRowid);
      this.db.prepare("UPDATE queue_entries SET batch_id=? WHERE state='pending' AND batch_id IS NULL").run(id);
    }).immediate();
  }
  stop(): void {
    this.db.transaction(() => {
      const open = this.openRow();
      if (!open || open.state === 'stopped') return;
      this.db.prepare("UPDATE batches SET state='stopping' WHERE id=?").run(open.id);
      this.settle(open.id);
    }).immediate();
  }
  claimNext(): RunDetails | null {
    return this.db.transaction(() => {
      const open = this.openRow();
      if (!open || open.state !== 'running') return null;
      const entry = this.db.prepare<[number], { id: number }>("SELECT id FROM queue_entries WHERE batch_id=? AND state='pending' ORDER BY queue_order LIMIT 1").get(open.id);
      if (!entry) { this.settle(open.id); return null; }
      return this.runs.startRun(entry.id);
    }).immediate();
  }
  finishRun(runId: number, outcome: RunCompletion): void {
    this.db.transaction(() => {
      const run = this.runs.completeRun(runId, outcome);
      const entry = this.videos.getEntry(run.queueEntryId);
      if (entry.batchId === null) throw new Error('La ejecución activa no pertenece a un lote');
      this.settle(entry.batchId);
    }).immediate();
  }
  recover(): void {
    this.db.transaction(() => {
      const entries = this.videos.listEntries().filter(e => e.state === 'processing');
      for (const entry of entries) {
        if (entry.runId === null) throw new Error('Tarea activa sin ejecución; se requiere revisar la base');
        this.runs.completeRun(entry.runId, { kind: 'process_error', message: 'Backend interrumpido; tarea recuperada sin autoarranque', exitCode: null });
        this.db.prepare("UPDATE queue_entries SET state='pending',run_id=NULL WHERE id=?").run(entry.id);
        projectVideoState(this.db, entry.videoId);
      }
      this.db.prepare("UPDATE batches SET state='stopped' WHERE state IN ('running','stopping')").run();
      const open = this.openRow();
      if (open) this.settle(open.id);
    }).immediate();
  }
  dismiss(batchId: number): void {
    const changed = this.db.prepare("UPDATE batches SET summary_dismissed_at=COALESCE(summary_dismissed_at,?) WHERE id=? AND state='completed'").run(this.now().toISOString(), batchId);
    if (!changed.changes) throw new Error('Solo puede descartarse el resumen de un lote completado');
  }
  private settle(batchId: number): void {
    const counts = this.counts(batchId);
    if (counts.processing) return;
    const row = this.db.prepare<[number], BatchRow>('SELECT * FROM batches WHERE id=?').get(batchId)!;
    if (row.state === 'completed') return;
    if (!counts.pending) {
      this.db.prepare("UPDATE batches SET state='completed',finished_at=?,summary_json=? WHERE id=?").run(this.now().toISOString(), JSON.stringify(counts), batchId);
    } else if (row.state === 'stopping') this.db.prepare("UPDATE batches SET state='stopped' WHERE id=?").run(batchId);
  }
  private counts(batchId: number): BatchSummary {
    const counts: BatchSummary = { total: 0, pending: 0, processing: 0, success: 0, partial: 0, failed: 0, removed: 0, review: 0 };
    const entries = this.db.prepare<[number], { state: string; run_state: string | null; result_json: string | null; manual_review: ManualReview | null }>('SELECT q.state,r.state AS run_state,r.result_json,r.manual_review FROM queue_entries q LEFT JOIN runs r ON r.id=q.run_id WHERE q.batch_id=?').all(batchId);
    for (const entry of entries) {
      counts.total++;
      if (entry.state === 'pending' || entry.state === 'processing' || entry.state === 'failed' || entry.state === 'removed') counts[entry.state]++;
      if (entry.state === 'completed' && (entry.run_state === 'success' || entry.run_state === 'partial')) {
        counts[entry.run_state]++;
        if (reviewState(entry.result_json ? JSON.parse(entry.result_json) as ExtractResult : null, entry.manual_review ?? 'none').required) counts.review++;
      }
    }
    return counts;
  }
}
