import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ExtractRequest, ExtractResult, ProgressEvent } from '../packages/contracts/src/extractor.js';

const read = async (file: string) => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
const requestSchema = await read('../packages/contracts/schemas/request.json');
const resultSchema = await read('../packages/contracts/schemas/result.json');
const validRequest = ajv.compile<ExtractRequest>(requestSchema);
const validResult = ajv.compile<ExtractResult>(resultSchema);

test('la solicitud sintética cumple schema 3.0.0 y envía español explícito', async () => {
  const request = await read('./fixtures/extractor/request.json');
  assert.ok(validRequest(request), JSON.stringify(validRequest.errors));
  assert.equal(request.output_language, 'es');
  assert.equal(validRequest({ ...request, exhaustive: true }), false);
  assert.equal(validRequest({ ...request, schema_version: '2.0.0' }), false);
});

for (const name of ['success', 'partial', 'error', 'empty-success']) {
  test(`fixture ${name} satisface el esquema completo y resuelve evidencia por IDs`, async () => {
    const result = await read(`./fixtures/extractor/${name}.json`);
    assert.ok(validResult(result), JSON.stringify(validResult.errors));
    const ids = new Set(result.evidence.map((e: { id: string }) => e.id));
    for (const item of result.items) {
      assert.equal(typeof item.type, 'string');
      for (const id of item.evidence_ids) assert.ok(ids.has(id));
    }
    for (const collection of result.collections) {
      for (const id of collection.item_ids) assert.ok(result.items.some((i: { id: string }) => i.id === id));
    }
  });
}

test('partial vacío y error con ítems son inválidos; success vacío es válido', async () => {
  const partial = await read('./fixtures/extractor/partial.json');
  assert.equal(validResult({ ...partial, items: [] }), false);
  assert.equal(validResult({ ...partial, status: 'error' }), false);
  assert.equal(validResult({ ...partial, evidence: 'texto' }), false);
});

test('la traza sintética conserva pasos repetidos y omite pasos no observados', async () => {
  const text = await readFile(new URL('./fixtures/extractor/repeated-omitted.jsonl', import.meta.url), 'utf8');
  const events: ProgressEvent[] = text.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(e => e.step), ['start', 'description', 'ocr', 'ocr', 'validation', 'finish']);
  assert.ok(events.every(e => e.event === 'step' && Number.isFinite(Date.parse(e.ts))));
  assert.equal(events.filter(e => e.step === 'transcription').length, 0);
});
