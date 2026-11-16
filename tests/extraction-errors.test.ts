import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractionErrorMessage } from '../apps/api/src/features/runs/error-message.js';

test('lee diagnósticos JSONL planos o anidados y traduce límites concretos', () => {
  for (const message of ['Video duration exceeds five minute limit',JSON.stringify({event:'diagnostic',message:'Video duration exceeds five minute limit'})]) {
    assert.match(extractionErrorMessage('Error genérico',JSON.stringify({event:'diagnostic',message}))!,/supera el límite de 5 minutos/);
  }
  assert.match(extractionErrorMessage('Error genérico',JSON.stringify({event:'diagnostic',message:'Resource byte limit exceeded'}))!,/tamaño/);
});

test('no inventa un motivo con stderr roto, texto ajeno o pasos; conserva el error original', () => {
  for(const stderr of ['no-json','Video duration exceeds five minute limit',JSON.stringify({event:'step',message:'Video duration exceeds five minute limit'}),JSON.stringify({event:'diagnostic',message:'C:/private/path token=secret'})]) {
    assert.equal(extractionErrorMessage('Motivo original',stderr),'Motivo original');
  }
  assert.equal(extractionErrorMessage(null,JSON.stringify({event:'diagnostic',message:'Video duration exceeds five minute limit'})),null);
});
