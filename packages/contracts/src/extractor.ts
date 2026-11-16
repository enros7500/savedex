export type { ExtractRequest, ExtractResult } from './extractor.generated.js';
export type ProgressStep = 'start' | 'description' | 'acquisition' | 'visual_scan' | 'transcription' | 'ocr' | 'local_extraction' | 'assessment' | 'local_repair' | 'external_review' | 'validation' | 'finish';
export type ProgressEvent = { event: 'step'; ts: string; phase?: 'started' | 'completed' | 'skipped' | 'failed'; message?: string; attempt?: number; sequence?: number; details?: Record<string, string | number | boolean> } & (
 | { step: Exclude<ProgressStep, 'finish'> }
 | { step: 'finish'; status: 'success' | 'partial' | 'error'; exit_code: number }
);
