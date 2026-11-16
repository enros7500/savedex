// Project only recognized diagnostics into public messages. Raw stderr may contain
// local paths or third-party content and must not be sent to the interface.
const reasons: ReadonlyArray<readonly [string, string]> = [
  ['Video duration exceeds five minute limit', 'El vídeo supera el límite de 5 minutos. Usa un vídeo de 5 minutos o menos; el modo exhaustivo mantiene este límite.'],
  ['Resource byte limit exceeded', 'El contenido supera el límite de tamaño admitido por el extractor.'],
  ['No visual frames could be decoded for OCR', 'No se pudieron leer fotogramas del vídeo para reconocer su texto.'],
  ['Local extraction could not produce grounded evidence:', 'El extractor no pudo validar que los datos extraídos estuvieran respaldados por las fuentes del vídeo.'],
];

export function extractionErrorMessage(original: string | null, stderr: string): string | null {
  if (original === null) return null;
  for (const line of stderr.slice(-65536).split(/\r?\n/).reverse()) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    // The supervisor wraps the worker's JSON diagnostic in another diagnostic.
    for (let depth = 0; depth < 3; depth++) {
      if (!value || typeof value !== 'object' || !('event' in value) || value.event !== 'diagnostic' || !('message' in value) || typeof value.message !== 'string') break;
      const message = value.message;
      const reason = reasons.find(([diagnostic]) => message === diagnostic || (diagnostic.endsWith(':') && message.startsWith(diagnostic)));
      if (reason) return reason[1];
      try { value = JSON.parse(message); } catch { break; }
    }
  }
  return original;
}
