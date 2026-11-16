import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { ExtractorPort } from './features/queue/worker.js';
import type { QueueService } from './features/queue/service.js';
import type { EventStore } from './features/events/store.js';
import type { ApplicationSnapshot } from '@savedex/contracts/events';
import type { ProgressEvent } from '@savedex/contracts/extractor';
import type { ApiLibraryResult, LibraryFilters, PublicRunDetails } from '@savedex/contracts/api';
import type { RevisionStamp } from '@savedex/contracts/events';
import { QueueService as Queue } from './features/queue/service.js';
import { EventStore as Events } from './features/events/store.js';
import { LibraryRepository } from './features/library/repository.js';
import { CliAdapter } from './extractor/adapter.js';
import { safeProgress } from './extractor/safe-progress.js';
import { loadConfig } from './config.js';
import { buildServer } from './app.js';
import { publicResult, publicSummary, publicRun } from './http-dto.js';
export interface ApplicationOptions {
  titleResolver?: (url: string) => Promise<string | null>;
  webRoot?: string;
  config?: AppConfig;
  extractor?: ExtractorPort;
  extractorFactory?: (progress: (requestId: string, event: ProgressEvent) => void) => ExtractorPort;
  eventCapacity?: number;
  eventMaxBytes?: number;
  heartbeatMs?: number;
}
export interface ApiRuntime {
  queue: QueueService;
  events: EventStore;
  snapshot(): ApplicationSnapshot;
  observeProgress(requestId: string, event: ProgressEvent): void;
  library(filters: LibraryFilters): RevisionStamp & { library: ApiLibraryResult };
  history(videoId: number): RevisionStamp & { runs: PublicRunDetails[] };
  beginClose(): void;
  close(): Promise<void>;
}
class Runtime implements ApiRuntime {
  private readonly attemptedTitles = new Set<number>();
  private titlePump: Promise<void> | null = null;
  private readonly titleResolver: ApplicationOptions['titleResolver'];
  readonly events: Events;
  private progress: ApplicationSnapshot['progress'] = null;
  private closing = false;
  private pendingClose: Promise<void> | null = null;
  private readonly detach: () => void;
  constructor(readonly queue: QueueService, options: ApplicationOptions) {
    this.titleResolver = options.titleResolver;
    this.events = new Events(queue.db, () => this.snapshot(), {
      ...(options.eventCapacity !== undefined ? { capacity: options.eventCapacity } : {}),
      ...(options.eventMaxBytes !== undefined ? { maxBytes: options.eventMaxBytes } : {}),
    });
    this.detach = queue.bindChanges({ advance: () => this.events.advance(), publish: () => { if (!this.closing) { this.events.publish(); this.scheduleTitles(); } } });
    this.scheduleTitles();
  }
  private scheduleTitles(): void {
    if (!this.titleResolver || this.closing || this.titlePump) return;
    this.titlePump = Promise.resolve().then(async () => {
      while (!this.closing) {
        const video = this.snapshot().videos.find(v => v.platform === 'youtube' && !v.title && !this.attemptedTitles.has(v.id));
        if (!video) break;
        this.attemptedTitles.add(video.id);
        const title = await this.titleResolver!(video.url).catch(() => null);
        if (!this.closing && title) this.queue.mutate(() => this.queue.videos.setTitle(video.id, title));
      }
    }).catch(() => { /* Optional metadata cannot fault the worker. */ }).finally(() => { this.titlePump = null; });
  }
  snapshot(): ApplicationSnapshot {
    return this.queue.db.transaction(() => {
      const queue = this.queue.getSnapshot();
      if (this.progress?.runId !== queue.active?.runId) this.progress = null;
      if (queue.active) {
        const workflow = this.queue.runs.getSteps(queue.active.runId);
        const event = workflow.at(-1);
        if (event) this.progress = { runId: queue.active.runId, event, workflow };
      }
      const videos = [...new Set(queue.entries.map(e => e.videoId))].map(id => this.queue.videos.getVideo(id));
      const runIds = [...new Set(queue.entries.flatMap(e => e.runId === null ? [] : [e.runId]))];
      return { ...this.events.stamp(), queue: { ...queue, fault: queue.fault ? 'La cola requiere revisión del backend antes de continuar' : null },
        videos, runs: runIds.map(id => publicSummary(this.queue.runs.getRun(id))), progress: this.progress };
    })();
  }
  observeProgress(requestId: string, event: ProgressEvent): void {
    if (this.closing) return;
    const active = this.queue.getSnapshot().active;
    if (!active || requestId !== `savedex_run_${active.runId}`) return;
    const safe = safeProgress(event); if (!safe) return;
    const previous = this.progress;
    try { this.queue.mutate(() => { this.queue.runs.appendStep(active.runId, safe); this.progress = { runId: active.runId, event: safe }; }); }
    catch (error) { this.progress = previous; throw error; }
  }
  library(filters: LibraryFilters): RevisionStamp & { library: ApiLibraryResult } {
    return this.queue.db.transaction(() => {
      const library = new LibraryRepository(this.queue.db).getLibrary(filters);
      return { ...this.events.stamp(), library: { ...library, videos: library.videos.map(row => ({ ...row,
        run: row.run ? publicSummary(row.run) : null, latestAttempt: row.latestAttempt ? publicSummary(row.latestAttempt) : null,
        result: publicResult(row.result) })) } };
    })();
  }
  history(videoId: number): RevisionStamp & { runs: PublicRunDetails[] } {
    return this.queue.db.transaction(() => ({ ...this.events.stamp(), runs: this.queue.runs.getHistory(videoId).map(publicRun) }))();
  }
  beginClose(): void {
    if (this.closing) return;
    this.closing = true;
    this.pendingClose = this.queue.close();
    // preClose must start stopping now, not after unrelated HTTP connections drain.
    void this.pendingClose.catch(() => {});
  }
  async close(): Promise<void> { this.beginClose(); try { await this.pendingClose; } finally { this.detach(); this.events.close(); } }
}
export async function createApplication(options: ApplicationOptions = {}): Promise<{ app: FastifyInstance; runtime: ApiRuntime }> {
  const config = options.config ?? loadConfig();
  let runtime: Runtime | undefined;
  const onProgress = (id: string, event: ProgressEvent) => runtime?.observeProgress(id, event);
  const extractor = options.extractorFactory?.(onProgress) ?? options.extractor ?? new CliAdapter({ ...config.extractor, onProgress });
  const queue = await Queue.open(config.database, extractor, { timezone: config.timezone, ...(config.externalInference ? {externalInference: config.externalInference} : {}) });
  try {
    runtime = new Runtime(queue, options);
    const app = buildServer(runtime, options.heartbeatMs,options.webRoot);
    return { app, runtime };
  } catch (error) { if (runtime) await runtime.close(); else await queue.close(); throw error; }
}
