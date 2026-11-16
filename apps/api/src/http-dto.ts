import type { ExtractResult } from '@savedex/contracts/extractor';
import type { PublicExtractResult, RunSummary, RunDetails, PublicRunDetails } from '@savedex/contracts/api';
export function publicResult(result: ExtractResult | null): PublicExtractResult | null {
  if (!result) return null;
  const { processing: _processing, extensions: _extensions, ...content } = result;
  return content;
}
export function publicSummary(run: RunSummary): RunSummary {
  const messages = { timeout: 'Se agotó el tiempo de procesamiento', process_error: 'El proceso no pudo completar la extracción', protocol_error: 'El extractor devolvió una respuesta no válida' };
  return { id: run.id, videoId: run.videoId, queueEntryId: run.queueEntryId, mode: run.mode, state: run.state,
    completionKind: run.completionKind, startedAt: run.startedAt, finishedAt: run.finishedAt, exitCode: run.exitCode,
    errorMessage: run.completionKind && run.completionKind !== 'result' ? messages[run.completionKind] : run.errorMessage, review: run.review };
}
export function publicRun(run: RunDetails): PublicRunDetails {
  const workflow = run.workflow;
  const used = run.result?.processing.privacy.external_inference_used;
  const attempted = workflow.some(e => e.step === 'external_review' && e.phase !== 'skipped');
  return { ...publicSummary(run), workflow, externalInference: used ? 'openai' : attempted ? 'attempted' : 'local', reviewedAt: run.reviewedAt, resultAvailable: run.resultJson !== null, result: publicResult(run.result) };
}
