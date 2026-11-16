import type Database from 'better-sqlite3';
import type { ManualReview, RunCompletion, RunDetails } from '@savedex/contracts/api';
import type { RepositoryOptions } from '../videos/repository.js';
import { VideoRepository } from '../videos/repository.js';
import { normalizeUrl } from '../videos/normalize-url.js';
import { projectVideoState } from '../../db/projections.js';
import { parseResult } from './validate-result.js';
import { reviewState } from './review.js';
import { extractionErrorMessage } from './error-message.js';
import type { CompletionKind } from '@savedex/contracts/api';
import { safeProgress } from '../../extractor/safe-progress.js';
import type { ProgressEvent } from '@savedex/contracts/extractor';
import type { ExtractResult } from '@savedex/contracts/extractor';

interface RunRow {
  id: number; video_id: number; queue_entry_id: number; mode: RunDetails['mode']; state: RunDetails['state'];
  completion_kind: CompletionKind | null; result_json: string | null; stderr: string; started_at: string;
  finished_at: string | null; exit_code: number | null; error_message: string | null;
  manual_review: ManualReview; reviewed_at: string | null;
}
function details(row: RunRow, workflow: ProgressEvent[] = []): RunDetails {
  const result = row.result_json ? JSON.parse(row.result_json) as ExtractResult : null;
  return {
    workflow, id: row.id, videoId: row.video_id, queueEntryId: row.queue_entry_id, mode: row.mode, state: row.state,
    completionKind: row.completion_kind, resultJson: row.result_json, result, stderr: row.stderr,
    startedAt: row.started_at, finishedAt: row.finished_at, exitCode: row.exit_code,
    errorMessage: row.state === 'error' ? extractionErrorMessage(row.error_message, row.stderr) : row.error_message,
    reviewedAt: row.reviewed_at, review: reviewState(result, row.manual_review),
  };
}
function boundedStderr(text: string): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= 65536) return text;
  let start = bytes.length - 65536;
  // Keep the tail without splitting a multi-byte UTF-8 code point.
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  return bytes.subarray(start).toString('utf8');
}
export class RunRepository {
  private readonly now: () => Date;
  private readonly videos: VideoRepository;
  constructor(private readonly db: Database.Database, options: RepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.videos = new VideoRepository(db, options);
  }
  appendStep(id: number, value: unknown): ProgressEvent | null {
    const event = safeProgress(value); if (!event) return null;
    const key = event.sequence === undefined ? JSON.stringify([event.ts,event.step,event.phase ?? '',event.attempt ?? 0]) : `sequence:${event.sequence}`;
    this.db.prepare('INSERT OR IGNORE INTO run_steps(run_id,event_key,sequence,event_json) VALUES(?,?,?,?)').run(id,key,event.sequence ?? null,JSON.stringify(event));
    return event;
  }
  getSteps(id: number): ProgressEvent[] {
    return this.db.prepare<[number],{event_json:string}>("SELECT event_json FROM run_steps WHERE run_id=? ORDER BY CASE json_extract(event_json,'$.step') WHEN 'start' THEN 0 WHEN 'finish' THEN 2 ELSE 1 END,COALESCE(sequence,id),id").all(id).map(row=>safeProgress(JSON.parse(row.event_json))).filter((event): event is ProgressEvent=>event!==null);
  }
  startRun(entryId: number): RunDetails {
    return this.db.transaction(() => {
      const entry = this.videos.getEntry(entryId);
      if (entry.state !== 'pending') throw new Error('La tarea no está pendiente');
      const id = Number(this.db.prepare("INSERT INTO runs(video_id,queue_entry_id,mode,state,started_at) VALUES(?,?,?,'processing',?)").run(entry.videoId, entryId, entry.mode, this.now().toISOString()).lastInsertRowid);
      this.db.prepare("UPDATE queue_entries SET state='processing',run_id=? WHERE id=?").run(id, entryId);
      projectVideoState(this.db, entry.videoId);
      return this.getRun(id);
    }).immediate();
  }
  completeRun(id: number, outcome: RunCompletion): RunDetails {
    return this.db.transaction(() => {
      const run = this.getRun(id);
      const entry = this.videos.getEntry(run.queueEntryId);
      if (run.state !== 'processing' || entry.state !== 'processing' || entry.runId !== id) throw new Error('La ejecución no está activa');
      const result = outcome.kind === 'result' ? parseResult(outcome.resultJson, outcome.exitCode) : null;
      if (result && result.status !== 'error') {
        const video = this.videos.getVideo(run.videoId);
        if (normalizeUrl(result.source.input_url).url !== video.url || result.source.platform !== video.platform) throw new Error('El resultado pertenece a otro vídeo');
      }
      const recovered = (result?.extensions as Record<string, unknown> | undefined)?.['workflow:steps'];
      if (Array.isArray(recovered)) for (const event of recovered) this.appendStep(id, event);
      const state = result?.status ?? 'error';
      const message = result?.status === 'error' ? result.issues.map(i => i.message).join('; ') : outcome.kind !== 'result' ? outcome.message : null;
      this.db.prepare('UPDATE runs SET state=?,completion_kind=?,result_json=?,stderr=?,finished_at=?,exit_code=?,error_message=? WHERE id=?').run(
        state, outcome.kind, outcome.kind === 'result' ? outcome.resultJson : null,
        boundedStderr(outcome.stderr ?? ''), this.now().toISOString(), outcome.exitCode, message, id,
      );
      const insert = this.db.prepare('INSERT INTO items(run_id,video_id,extractor_item_id,type,name,description,data_json,evidence_ids_json) VALUES(?,?,?,?,?,?,?,?)');
      for (const item of result?.items ?? []) {
        insert.run(id, run.videoId, item.id, item.type, item.title, item.summary, JSON.stringify(item.data), JSON.stringify(item.evidence_ids));
      }
      this.db.prepare('UPDATE queue_entries SET state=? WHERE id=?').run(state === 'error' ? 'failed' : 'completed', entry.id);
      projectVideoState(this.db, run.videoId);
      return this.getRun(id);
    }).immediate();
  }
  getRun(id: number): RunDetails {
    const row = this.db.prepare<[number], RunRow>('SELECT * FROM runs WHERE id=?').get(id);
    if (!row) throw new Error('Ejecución no encontrada');
    return details(row, this.getSteps(row.id));
  }
  getHistory(videoId: number): RunDetails[] {
    this.videos.getVideo(videoId);
    return this.db.prepare<[number], RunRow>('SELECT * FROM runs WHERE video_id=? ORDER BY id DESC').all(videoId).map(row => details(row, this.getSteps(row.id)));
  }
  getLatest(videoId: number, validOnly = false): RunDetails | undefined {
    const row = this.db.prepare<[number], RunRow>(`SELECT * FROM runs WHERE video_id=? ${validOnly ? "AND state IN ('success','partial')" : ''} ORDER BY id DESC LIMIT 1`).get(videoId);
    return row ? details(row, this.getSteps(row.id)) : undefined;
  }
  setReview(id: number, manual: ManualReview): RunDetails {
    if (!['none', 'accepted', 'review'].includes(manual)) throw new Error('Revisión no válida');
    return this.db.transaction(() => {
      const run = this.getRun(id);
      if (!['success', 'partial'].includes(run.state)) throw new Error('Solo puede revisarse una extracción válida terminada');
      this.db.prepare('UPDATE runs SET manual_review=?,reviewed_at=? WHERE id=?').run(manual, manual === 'none' ? null : this.now().toISOString(), id);
      projectVideoState(this.db, run.videoId);
      return this.getRun(id);
    }).immediate();
  }
}


