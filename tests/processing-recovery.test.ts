import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exceedsVideoLimit, needsAttention } from '../apps/web/src/app/processing/recovery.js';

test('completed runs without places need attention even with a title or other extracted content', () => {
  assert.equal(needsAttention('completed', 'success', 0, false), true);
  assert.equal(needsAttention('completed', 'partial', 0, false), true);
  assert.equal(needsAttention('completed', 'success', 2, false), false);
  assert.equal(needsAttention('completed', 'partial', 2, true), true);
  assert.equal(needsAttention('failed', 'error', 0, false), true);
  assert.equal(needsAttention('pending', 'success', 0, false), false);
  assert.equal(needsAttention('processing', 'success', 0, false), false);
  assert.equal(needsAttention('removed', undefined, 0, false), false);
});

test('duration rejection offers a different video; transient errors remain retryable', () => {
  assert.equal(exceedsVideoLimit('El vídeo supera el límite de 5 minutos. Usa un vídeo de 5 minutos o menos; el modo exhaustivo mantiene este límite.'), true);
  assert.equal(exceedsVideoLimit('Video duration exceeds five minute limit'), true);
  for (const message of [null, '', 'No se pudo descargar el vídeo.', 'Tiempo de espera agotado tras 5 minutos.']) {
    assert.equal(exceedsVideoLimit(message), false);
  }
});
