import type Database from 'better-sqlite3';
import type { ApplicationSnapshot, RevisionStamp, StreamFrame } from '@savedex/contracts/events';
import { randomUUID } from 'node:crypto';
export interface EventStoreOptions { capacity?: number; maxBytes?: number }
export class EventStore {
  private readonly streamId = randomUUID();
  private readonly listeners = new Set<(event: StreamFrame) => void>();
  private readonly history: { frame: Extract<StreamFrame, { type: 'change' }>; bytes: number }[] = [];
  private readonly capacity: number;
  private readonly maxBytes: number;
  private retainedBytes = 0;
  private failed = false;
  private lastRevision = 0;
  constructor(private readonly db: Database.Database, private readonly snapshot: () => ApplicationSnapshot, options: EventStoreOptions = {}) {
    this.capacity = options.capacity ?? 128; this.maxBytes = options.maxBytes ?? 1024 * 1024;
    if (!Number.isInteger(this.capacity) || this.capacity < 1 || !Number.isInteger(this.maxBytes) || this.maxBytes < 1) throw new Error('Límite de eventos inválido');
    this.advance();
  }
  stamp(): RevisionStamp {
    if (this.failed) throw new Error('La revisión de eventos no está disponible');
    const row = this.db.prepare<[], { revision: number }>('SELECT revision FROM app_state WHERE singleton=1').get()!;
    return { streamId: this.streamId, revision: row.revision };
  }
  advance(): void {
    try {
      this.db.prepare('UPDATE app_state SET revision=revision+1 WHERE singleton=1').run();
      this.lastRevision = this.db.prepare<[], { revision: number }>('SELECT revision FROM app_state WHERE singleton=1').get()!.revision;
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.emit({ type: 'reset', streamId: this.streamId, revision: this.lastRevision, reason: 'storage_unavailable' });
      throw error;
    }
  }
  publish(): void {
    const frame: Extract<StreamFrame, { type: 'change' }> = { type: 'change', snapshot: this.snapshot() };
    const bytes = Buffer.byteLength(JSON.stringify(frame), 'utf8');
    if (bytes > this.maxBytes) {
      this.history.length = 0; this.retainedBytes = 0;
      this.emit({ type: 'reset', ...this.stamp(), reason: 'payload_limit' }); return;
    }
    this.history.push({ frame, bytes }); this.retainedBytes += bytes;
    while (this.history.length > this.capacity || this.retainedBytes > this.maxBytes) this.retainedBytes -= this.history.shift()!.bytes;
    this.emit(frame);
  }
  subscribe(listener: (event: StreamFrame) => void, cursor?: string): () => void {
    const stamp = this.stamp();
    const split = cursor?.lastIndexOf(':') ?? -1;
    const epoch = split >= 0 ? cursor!.slice(0, split) : '';
    const revision = split >= 0 ? Number(cursor!.slice(split + 1)) : NaN;
    const replay = cursor && epoch === stamp.streamId && Number.isSafeInteger(revision) && revision >= 0 && revision <= stamp.revision
      && (revision === stamp.revision || (this.history[0]?.frame.snapshot.revision ?? Infinity) <= revision + 1);
    const frames = replay ? this.history.filter(item => item.frame.snapshot.revision > revision).map(item => item.frame) : [];
    this.listeners.add(listener);
    try {
      listener({ type: 'ready', ...stamp });
      if (cursor && !replay) listener({ type: 'reset', ...stamp, reason: epoch !== stamp.streamId ? 'epoch_changed' : 'history_lost' });
      for (const frame of frames) listener(frame);
    } catch { this.listeners.delete(listener); }
    return () => { this.listeners.delete(listener); };
  }
  get subscriberCount(): number { return this.listeners.size; }
  close(): void { this.listeners.clear(); this.history.length = 0; this.retainedBytes = 0; }
  private emit(frame: StreamFrame): void {
    for (const listener of this.listeners) { try { listener(frame); } catch { this.listeners.delete(listener); } }
  }
}
