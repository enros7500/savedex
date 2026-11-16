import type Database from 'better-sqlite3';
import type { QueueSnapshot } from '@savedex/contracts/api';
import type { ExtractorPort } from './worker.js';
import type { RepositoryOptions } from '../videos/repository.js';
import type { VideoRepository } from '../videos/repository.js';
import type { RunRepository } from '../runs/repository.js';
import { openDatabase } from '../../db/connection.js';
import { WriterLease } from '../../db/writer-lease.js';
import { VideoRepository as Videos } from '../videos/repository.js';
import { RunRepository as Runs } from '../runs/repository.js';
import { BatchRepository } from '../batches/repository.js';
import { SequentialWorker, errorMessage } from './worker.js';
export interface QueueChangeHooks { advance(): void; publish(): void }
export class QueueService {
  readonly videos: VideoRepository;
  readonly runs: RunRepository;
  private readonly batches: BatchRepository;
  private readonly worker: SequentialWorker;
  private pump: Promise<void> | null = null;
  private fault: string | null = null;
  private closing = false;
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private changeHooks: QueueChangeHooks | null = null;
  private constructor(readonly db: Database.Database, private readonly lease: WriterLease, extractor: ExtractorPort, options: RepositoryOptions) {
    this.videos = new Videos(db, options); this.runs = new Runs(db, options);
    this.batches = new BatchRepository(db, options);
    this.worker = new SequentialWorker(this.batches, this.videos, extractor, () => !this.closing, operation => this.commit(operation), options.externalInference);
  }
  static async open(filename: string, extractor: ExtractorPort, options: RepositoryOptions = {}): Promise<QueueService> {
    const lease = await WriterLease.acquire(filename);
    let db: Database.Database | undefined;
    try {
      db = openDatabase(filename);
      const service = new QueueService(db, lease, extractor, options);
      service.recoverQueue();
      return service;
    } catch (error) { db?.close(); await lease.release(); throw error; }
  }
  startQueue(): QueueSnapshot {
    this.assertOpen();
    if (!this.fault) { this.commit(() => this.batches.start()); this.kick(); }
    return this.getSnapshot();
  }
  stopQueue(): QueueSnapshot {
    this.assertOpen(); this.commit(() => this.batches.stop()); return this.getSnapshot();
  }
  recoverQueue(): void {
    this.assertOpen();
    if (this.pump) throw new Error('No se puede recuperar con un worker activo');
    const previous = this.fault;
    try { this.commit(() => { this.batches.recover(); this.fault = null; }); }
    catch (error) { this.fault = previous; throw error; }
  }
  getSnapshot(): QueueSnapshot {
    this.assertOpen();
    return this.db.transaction(() => {
      const entries = this.videos.listEntries(), batch = this.batches.current();
      const active = entries.find(e => e.state === 'processing');
      return { entries, batch, fault: this.fault,
        workerStatus: this.fault ? 'faulted' : batch?.state === 'running' ? 'running' : batch?.state === 'stopping' ? 'stopping' : 'idle',
        active: active && active.runId !== null ? { entryId: active.id, videoId: active.videoId, runId: active.runId } : null,
      } satisfies QueueSnapshot;
    })();
  }
  dismissSummary(batchId: number): QueueSnapshot {
    this.assertOpen(); this.commit(() => this.batches.dismiss(batchId)); return this.getSnapshot();
  }
  mutate<T>(operation: () => T): T { this.assertOpen(); return this.commit(operation); }
  bindChanges(hooks: QueueChangeHooks): () => void {
    if (this.changeHooks) throw new Error('La cola ya tiene publicador de cambios');
    this.changeHooks = hooks;
    return () => { if (this.changeHooks === hooks) this.changeHooks = null; };
  }
  async whenIdle(): Promise<void> { while (this.pump) await this.pump; }
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      let stopError: unknown;
      try { this.commit(() => this.batches.stop()); } catch (error) { stopError = error; }
      await this.whenIdle();
      this.closed = true;
      try { this.db.close(); } finally { await this.lease.release(); }
      if (stopError) throw stopError;
    })();
    return this.closePromise;
  }
  private kick(): void {
    if (this.pump || this.closing || this.fault || !this.batches.hasRunning()) return;
    this.pump = Promise.resolve().then(() => this.worker.drain())
      .catch(error => { this.fault = errorMessage(error); try { this.commit(() => {}); } catch { /* Storage failure remains visible after recovery/reopen. */ } })
      .finally(() => { this.pump = null; if (!this.closing && !this.fault) this.kick(); });
  }
  private commit<T>(operation: () => T): T {
    const result = this.db.transaction(() => { const value = operation(); this.changeHooks?.advance(); return value; }).immediate();
    this.changeHooks?.publish();
    return result;
  }
  private assertOpen(): void { if (this.closed || this.closing) throw new Error('La cola está cerrada'); }
}
