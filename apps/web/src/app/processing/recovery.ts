// Public run details currently expose a translated message rather than an error code.
export function exceedsVideoLimit(message: string | null | undefined): boolean {
  return !!message && (message.startsWith('El vídeo supera el límite de 5 minutos.') || message === 'Video duration exceeds five minute limit');
}
