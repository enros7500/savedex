import type { QueueSnapshot, Video, RunSummary } from './api.js';
import type { ProgressEvent } from './extractor.js';
export interface RevisionStamp { streamId: string; revision: number }
export interface ApplicationSnapshot extends RevisionStamp {
  queue: QueueSnapshot;
  videos: Video[];
  runs: RunSummary[];
  progress: { runId: number; event: ProgressEvent; workflow?: ProgressEvent[] } | null;
}
export type StreamFrame =
  | ({ type: 'ready' } & RevisionStamp)
  | ({ type: 'reset'; reason: string } & RevisionStamp)
  | { type: 'change'; snapshot: ApplicationSnapshot };
export interface SyncTransport {
  subscribe(event: (frame: StreamFrame) => void, disconnect: () => void): () => void;
  loadSnapshot(): Promise<ApplicationSnapshot>;
}
export interface SyncState { snapshot: ApplicationSnapshot | null; connection: 'connecting' | 'connected' | 'disconnected'; syncing: boolean }
export class SnapshotSynchronizer {
  private current: ApplicationSnapshot | null = null;
  private connection: SyncState['connection'] = 'connecting';
  private loading = false;
  private stopped = true;
  private acknowledged = false;
  private dirty = false;
  private epoch: string | null = null;
  private generation = 0;
  private buffer: ApplicationSnapshot[] = [];
  private unsubscribe: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly transport: SyncTransport, private readonly onState: (state: SyncState) => void, private readonly maxBuffer = 128) {
    if (!Number.isInteger(maxBuffer) || maxBuffer < 1) throw new Error('Invalid synchronization buffer limit');
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false; this.acknowledged = false; this.connection = 'connecting'; this.emit();
    this.unsubscribe = this.transport.subscribe(frame => this.receive(frame), () => this.disconnected());
  }
  stop(): void {
    this.stopped = true; this.acknowledged = false; this.generation++; this.loading = false; this.buffer = [];
    this.unsubscribe?.(); this.unsubscribe = null;
    if (this.retry) clearTimeout(this.retry);
  }
  private emit(): void { this.onState({ snapshot: this.current, connection: this.connection, syncing: this.loading }); }
  private disconnected(): void {
    if (this.stopped) return;
    this.acknowledged = false; this.generation++; this.loading = false; this.buffer = []; this.dirty = false;
    if (this.retry) clearTimeout(this.retry);
    this.connection = 'disconnected'; this.emit();
  }
  private receive(frame: StreamFrame): void {
    if (this.stopped) return;
    if (frame.type !== 'change') {
      this.acknowledged = true; this.epoch = frame.streamId; this.connection = 'connected';
      if (this.loading) this.dirty = true;
      else this.refresh();
      return;
    }
    if (!this.acknowledged) return;
    const snapshot = frame.snapshot;
    if (this.loading) {
      if (this.buffer.length >= this.maxBuffer) { this.buffer = []; this.dirty = true; }
      else this.buffer.push(snapshot);
      return;
    }
    if (!this.current || snapshot.streamId !== this.current.streamId) { this.epoch = snapshot.streamId; this.refresh(); return; }
    if (snapshot.revision <= this.current.revision) return;
    if (snapshot.revision !== this.current.revision + 1) { this.refresh(); return; }
    this.current = snapshot; this.connection = 'connected'; if (this.retry) clearTimeout(this.retry); this.emit();
  }
  private refresh(): void {
    if (this.stopped || this.loading) return;
    if (this.retry) clearTimeout(this.retry);
    this.loading = true; this.dirty = false;
    const generation = ++this.generation;
    this.emit();
    Promise.resolve().then(() => this.transport.loadSnapshot()).then(snapshot => {
      if (this.stopped || generation !== this.generation) return;
      let next = snapshot;
      if (this.epoch !== null && next.streamId !== this.epoch) this.dirty = true;
      const buffered = this.buffer; this.buffer = [];
      for (const event of buffered.sort((a, b) => a.revision - b.revision)) {
        if (event.streamId !== next.streamId || event.revision <= next.revision) continue;
        if (event.revision !== next.revision + 1) { this.dirty = true; break; }
        next = event;
      }
      this.loading = false;
      if (this.dirty) { this.refresh(); return; }
      this.current = next; this.connection = 'connected'; this.emit();
    }).catch(() => {
      if (this.stopped || generation !== this.generation) return;
      this.loading = false; this.buffer = []; this.connection = 'disconnected'; this.emit();
      this.retry = setTimeout(() => this.refresh(), 1000);
    });
  }
}
