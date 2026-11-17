import type { ProgressEvent } from './extractor.js';
import type { ExtractResult } from './extractor.js';

export type Platform = 'instagram' | 'youtube';
export type ExtractionMode = 'normal' | 'exhaustive';
export type VideoState = 'idle' | 'pending' | 'processing' | 'completed' | 'review' | 'error';
export interface Video {
  id: number;
  url: string;
  platform: Platform;
  title: string | null;
  addedAt: string;
  addedDay: string;
  state: VideoState;
}
export interface QueueEntry {
  id: number;
  videoId: number;
  mode: ExtractionMode;
  order: number;
  enqueuedAt: string;
  batchId: number | null;
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'removed';
  runId: number | null;
}
export interface AddVideoResult { created: boolean; video: Video; entry: QueueEntry | null }
export type ManualReview = 'none' | 'accepted' | 'review';
export interface ReviewReason {
  code: 'partial' | 'incomplete_collection' | 'extraction_gap' | 'manual';
  message: string;
  sourceId: string | null;
}
export interface ReviewState { required: boolean; manual: ManualReview; reasons: ReviewReason[] }
export type CompletionKind = 'result' | 'process_error' | 'protocol_error' | 'timeout';
export type RunCompletion =
  | { kind: 'result'; resultJson: string; exitCode: number; stderr?: string }
  | { kind: Exclude<CompletionKind, 'result'>; message: string; exitCode: number | null; stderr?: string };
export interface RunSummary {
  id: number;
  videoId: number;
  queueEntryId: number;
  mode: ExtractionMode;
  state: 'processing' | 'success' | 'partial' | 'error';
  completionKind: CompletionKind | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  errorMessage: string | null;
  review: ReviewState;
}
export interface RunDetails extends RunSummary {
  workflow: ProgressEvent[];
  resultJson: string | null;
  result: ExtractResult | null;
  stderr: string;
  reviewedAt: string | null;
}
export type ItemType = ExtractResult['items'][number]['type'];
export interface LibraryFilters { type?: ItemType; fromDay?: string; toDay?: string; text?: string }
export interface LibraryItem {
  id: number;
  videoId: number;
  runId: number;
  extractorItemId: string;
  type: ItemType;
  name: string;
  description: string;
  data: ExtractResult['items'][number]['data'];
  evidenceIds: string[];
  evidence: ExtractResult['evidence'];
  enrichment?: PlaceEnrichment | null;
}
export interface PlaceResearch {
  matched: boolean;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  description: string;
  sources: { title: string; url: string }[];
  photos: { url: string; sourceUrl: string; attribution: string }[];
  reason: string;
}
export interface PlaceEnrichment {
  key: string;
  status: 'running' | 'completed' | 'needs_review' | 'error';
  model: string;
  startedAt: string;
  finishedAt: string | null;
  result: PlaceResearch | null;
  error: string | null;
}
export interface LibraryVideo {
  video: Video;
  run: RunSummary | null;
  latestAttempt: RunSummary | null;
  result: ExtractResult | null;
  items: LibraryItem[];
}
export interface LibraryResult { videos: LibraryVideo[]; totalVideos: number; totalItems: number }

export interface BatchSummary {
  total: number;
  pending: number;
  processing: number;
  success: number;
  partial: number;
  failed: number;
  removed: number;
  review: number;
}
export interface BatchSnapshot {
  id: number;
  state: 'running' | 'stopping' | 'stopped' | 'completed';
  startedAt: string;
  finishedAt: string | null;
  summary: BatchSummary | null;
  summaryDismissedAt: string | null;
  counts: BatchSummary;
}
export interface QueueSnapshot {
  workerStatus: 'idle' | 'running' | 'stopping' | 'faulted';
  fault: string | null;
  batch: BatchSnapshot | null;
  entries: QueueEntry[];
  active: { entryId: number; runId: number; videoId: number } | null;
}

export type PublicExtractResult = Omit<ExtractResult, 'processing' | 'extensions'>;
export interface PublicRunDetails extends RunSummary {
  workflow: ProgressEvent[];
  externalInference: 'local' | 'openai' | 'attempted';
  reviewedAt: string | null;
  resultAvailable: boolean;
  result: PublicExtractResult | null;
}
export interface ApiLibraryResult {
  videos: (Omit<LibraryVideo, 'result'> & { result: PublicExtractResult | null })[];
  totalVideos: number;
  totalItems: number;
}
