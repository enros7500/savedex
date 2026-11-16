import type Database from 'better-sqlite3';
import type { AddVideoResult, ExtractionMode, QueueEntry, Video } from '@savedex/contracts/api';
import { normalizeUrl } from './normalize-url.js';
import { projectVideoState } from '../../db/projections.js';
export interface RepositoryOptions { now?: () => Date; timezone?: string; externalInference?: 'disabled' | 'openai' }
const videoColumns = 'id, normalized_url AS url, platform, title, added_at AS addedAt, added_day AS addedDay, state';
const entryColumns = 'id, video_id AS videoId, mode, queue_order AS "order", enqueued_at AS enqueuedAt, batch_id AS batchId, state, run_id AS runId';
export class VideoRepository {
  private readonly now: () => Date;
  private readonly dayFormatter: Intl.DateTimeFormat;
  constructor(private readonly db: Database.Database, options: RepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: options.timezone ?? 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  addVideo(input: string): AddVideoResult {
    const normalized = normalizeUrl(input);
    return this.db.transaction(() => {
      const existing = this.db.prepare<[string], Video>(`SELECT ${videoColumns} FROM videos WHERE normalized_url=?`).get(normalized.url);
      if (existing) return { created: false, video: existing, entry: this.liveEntry(existing.id) };
      const instant = this.now();
      const parts = this.dayFormatter.formatToParts(instant);
      const part = (type: string) => parts.find(p => p.type === type)!.value;
      const day = `${part('year')}-${part('month')}-${part('day')}`;
      const id = Number(this.db.prepare("INSERT INTO videos(normalized_url,platform,added_at,added_day,state) VALUES(?,?,?,?,'idle')").run(normalized.url, normalized.platform, instant.toISOString(), day).lastInsertRowid);
      const entry = this.insertEntry(id, 'normal', instant.toISOString());
      return { created: true, video: this.getVideo(id), entry };
    }).immediate();
  }
  getVideo(id: number): Video {
    const video = this.db.prepare<[number], Video>(`SELECT ${videoColumns} FROM videos WHERE id=?`).get(id);
    if (!video) throw new Error('Vídeo no encontrado');
    return video;
  }
  setTitle(id: number, title: string): void {
    const clean = title.trim();
    if (!clean || clean.length > 1000 || /[\u0000-\u001f\u007f]/.test(clean)) return;
    this.db.prepare('UPDATE videos SET title=? WHERE id=? AND title IS NULL').run(clean, id);
  }
  enqueue(id: number, mode: ExtractionMode): QueueEntry {
    if (!['normal', 'exhaustive'].includes(mode)) throw new Error('Modo no válido');
    return this.db.transaction(() => {
      this.getVideo(id);
      return this.liveEntry(id) ?? this.insertEntry(id, mode, this.now().toISOString());
    }).immediate();
  }
  removePending(id: number): QueueEntry {
    return this.db.transaction(() => {
      const entry = this.getEntry(id);
      if (entry.state !== 'pending') throw new Error('Solo puede quitarse una tarea pendiente');
      this.db.prepare("UPDATE queue_entries SET state='removed' WHERE id=?").run(id);
      projectVideoState(this.db, entry.videoId);
      return this.getEntry(id);
    }).immediate();
  }
  getEntry(id: number): QueueEntry {
    const entry = this.db.prepare<[number], QueueEntry>(`SELECT ${entryColumns} FROM queue_entries WHERE id=?`).get(id);
    if (!entry) throw new Error('Tarea no encontrada');
    return entry;
  }
  listEntries(): QueueEntry[] {
    return this.db.prepare<[], QueueEntry>(`SELECT ${entryColumns} FROM queue_entries ORDER BY queue_order`).all();
  }
  private liveEntry(videoId: number): QueueEntry | null {
    return this.db.prepare<[number], QueueEntry>(`SELECT ${entryColumns} FROM queue_entries WHERE video_id=? AND state IN ('pending','processing')`).get(videoId) ?? null;
  }
  private insertEntry(videoId: number, mode: ExtractionMode, timestamp: string): QueueEntry {
    const id = Number(this.db.prepare("INSERT INTO queue_entries(video_id,mode,queue_order,enqueued_at,state) SELECT ?,?,COALESCE(MAX(queue_order),0)+1,?,'pending' FROM queue_entries").run(videoId, mode, timestamp).lastInsertRowid);
    projectVideoState(this.db, videoId);
    return this.getEntry(id);
  }
}
