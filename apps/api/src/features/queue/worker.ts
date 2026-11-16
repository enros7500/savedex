import type { ExtractRequest } from '@savedex/contracts/extractor';
import type { ExtractionMode, RunCompletion } from '@savedex/contracts/api';
import { BatchRepository } from '../batches/repository.js';
import { VideoRepository } from '../videos/repository.js';
import { parseResult } from '../runs/validate-result.js';
import { normalizeUrl } from '../videos/normalize-url.js';
import { ExtractorCleanupError } from '../../extractor/errors.js';
export type ExtractionOutcome = RunCompletion;
export interface ExtractorPort {
  run(request: ExtractRequest, mode: ExtractionMode): Promise<ExtractionOutcome>;
}

export function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}

export class SequentialWorker {
  constructor(private readonly batches: BatchRepository, private readonly videos: VideoRepository,
    private readonly extractor: ExtractorPort, private readonly shouldContinue: () => boolean,
    private readonly commit: <T>(operation: () => T) => T = operation => operation(),
    private readonly externalInference: 'disabled' | 'openai' = 'disabled') {}
  async drain(): Promise<void> {
    while (this.shouldContinue()) {
      const run = this.commit(() => this.batches.claimNext());
      if (!run) return;
      const video = this.videos.getVideo(run.videoId);
      const request: ExtractRequest = { schema_version: '3.1.0', request_id: `savedex_run_${run.id}`,
        url: video.url, task: 'extract', output_language: 'es', processing_profile: 'contextual_local_v2', external_inference: this.externalInference, visual_processing: 'auto' };
      let outcome: ExtractionOutcome;
      try { outcome = await this.extractor.run(request, run.mode); }
      catch (error) {
        if (error instanceof ExtractorCleanupError) throw error;
        outcome = { kind: 'process_error', message: errorMessage(error), exitCode: null };
      }
      try {
        if (outcome.kind === 'result') {
          const result = parseResult(outcome.resultJson, outcome.exitCode);
          if (result.request_id !== request.request_id) throw new Error('request_id no corresponde a la ejecución');
          if (result.status !== 'error' && (normalizeUrl(result.source.input_url).url !== video.url || result.source.platform !== video.platform)) throw new Error('Resultado de otro vídeo');
        }
      } catch (error) { outcome = { kind: 'protocol_error', message: `Respuesta inválida del extractor: ${errorMessage(error)}`, exitCode: outcome.exitCode, stderr: outcome.stderr ?? '' }; }
      // Storage failures escape: never turn a failed transaction into an extractor failure.
      this.commit(() => this.batches.finishRun(run.id, outcome));
    }
  }
}
