import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, languagePreference, translateReviewReason } from '../apps/web/src/app/core/messages.js';

test('UI defaults to English and accepts only supported persisted languages', () => {
  assert.equal(languagePreference(null), 'en');
  assert.equal(languagePreference('fr'), 'en');
  assert.equal(languagePreference('es'), 'es');
  assert.equal(translate('Biblioteca', 'en'), 'Library');
  assert.equal(translate('Biblioteca', 'es'), 'Biblioteca');
  assert.equal(translate('Custom extractor message', 'en'), 'Custom extractor message');
});

test('modern UI labels, whitespace and dynamic status messages support English and Spanish', () => {
  assert.equal(translate('Explorar lugares', 'en'), 'Explore places');
  assert.equal(translate('  lugares ', 'en'), '  places ');
  assert.equal(translate('Procesar 2 vídeos', 'en'), 'Process 2 videos');
  assert.equal(translate('hace 12 min', 'en'), '12 min ago');
  assert.equal(translate('Explorar lugares', 'es'), 'Explorar lugares');
});
test('extractor gap messages remain literal even when they match UI vocabulary', () => {
  assert.equal(translateReviewReason({code:'extraction_gap',message:'Texto en pantalla'},'en'),'Texto en pantalla');
  assert.equal(translateReviewReason({code:'partial',message:'Extracción parcial'},'en'),'Partial extraction');
  assert.equal(translateReviewReason({code:'custom',message:'Lugar'},'en'),'Lugar');
});
