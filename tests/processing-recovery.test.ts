import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exceedsVideoLimit } from '../apps/web/src/app/processing/recovery.js';

test('duration rejection offers a different video; transient errors remain retryable', () => {
  assert.equal(exceedsVideoLimit('El vídeo supera el límite de 5 minutos. Usa un vídeo de 5 minutos o menos; el modo exhaustivo mantiene este límite.'), true);
  assert.equal(exceedsVideoLimit('Video duration exceeds five minute limit'), true);
  for (const message of [null, '', 'No se pudo descargar el vídeo.', 'Tiempo de espera agotado tras 5 minutos.']) {
    assert.equal(exceedsVideoLimit(message), false);
  }
});
