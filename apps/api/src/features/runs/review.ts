import type { ExtractResult } from '@savedex/contracts/extractor';
import type { ManualReview, ReviewReason, ReviewState } from '@savedex/contracts/api';

export function reviewState(result: ExtractResult | null, manual: ManualReview): ReviewState {
  const reasons: ReviewReason[] = [];
  if (result?.status === 'partial') reasons.push({ code: 'partial', message: 'Extracción parcial', sourceId: null });
  for (const collection of result?.collections ?? []) {
    if (collection.missing_count !== null && collection.missing_count > 0) {
      reasons.push({ code: 'incomplete_collection', message: `${collection.missing_count} elementos pendientes en ${collection.label}`, sourceId: collection.id });
    }
  }
  for (const gap of result?.follow_up.extraction_gaps ?? []) {
    reasons.push({ code: 'extraction_gap', message: gap.reason, sourceId: gap.id });
  }
  if (manual === 'review') reasons.push({ code: 'manual', message: 'Marcada para revisión manual', sourceId: null });
  return { required: manual !== 'accepted' && reasons.length > 0, manual, reasons };
}
