// Public run details currently expose a translated message rather than an error code.
export function exceedsVideoLimit(message: string | null | undefined): boolean {
  return !!message && (message.startsWith('El vídeo supera el límite de 5 minutos.') || message === 'Video duration exceeds five minute limit');
}

export function needsAttention(entryState: string | undefined, runState: string | undefined, placeCount: number, reviewRequired: boolean): boolean {
  if (entryState === 'pending' || entryState === 'processing') return false;
  return entryState === 'failed' || runState === 'error' ||
    (runState === 'success' || runState === 'partial') && (placeCount === 0 || reviewRequired);
}
