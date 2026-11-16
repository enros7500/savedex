import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ExtractResult } from '@savedex/contracts/extractor';

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
const validate = ajv.compile<ExtractResult>(JSON.parse(readFileSync(new URL(import.meta.resolve('@savedex/contracts/schemas/result.json')), 'utf8')));

export function parseResult(raw: string, exitCode: number): ExtractResult {
  if (Buffer.byteLength(raw, 'utf8') > 16 * 1024 * 1024) throw new Error('Resultado demasiado grande');
  const result: unknown = JSON.parse(raw);
  if (!validate(result)) throw new Error('Resultado incompatible con schemas 3.0.0/3.1.0');
  if ((result.status === 'success') !== (exitCode === 0) || (result.status === 'partial') !== (exitCode === 2)
      || (result.status === 'error' && ![64, 65, 69, 70, 75, 130].includes(exitCode))) {
    throw new Error('Estado y código de salida incoherentes');
  }
  const fail = (ok: boolean) => { if (!ok) throw new Error('Referencias o semántica de resultado inválidas'); };
  function ids(values: { id: string }[]): Set<string> {
    const set = new Set(values.map(v => v.id)); fail(set.size === values.length); return set;
  }
  const evidence = ids(result.evidence), items = ids(result.items), assets = ids(result.source.assets), operations = ids(result.processing.operations);
  ids(result.collections);
  const allIn = (values: string[], set: Set<string>) => fail(values.every(id => set.has(id)));
  function references(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(references); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'extensions') continue;
      if (key === 'evidence_ids' || key.endsWith('_evidence_ids')) allIn(nested as string[], evidence);
      else if (['item_ids', 'affected_item_ids'].includes(key)) allIn(nested as string[], items);
      else if (key === 'asset_ids' || key.endsWith('_asset_ids')) allIn(nested as string[], assets);
      else if (key === 'item_id' && typeof nested === 'string') fail(items.has(nested));
      else if (key === 'asset_id' && typeof nested === 'string') fail(assets.has(nested));
      else if (key === 'operation_id') fail(operations.has(nested as string));
      references(nested);
    }
  }
  references(result);
  const external = result.processing.operations.filter(operation => operation.deployment === 'external');
  for (const operation of result.processing.operations) {
    if (operation.deployment === 'external') fail(operation.recipient === 'OpenAI' && operation.compute_target === 'not_applicable' && result.processing.privacy.external_inference_used);
    else fail(operation.recipient === null);
  }
  for (const entry of result.evidence) if (entry.method === 'openai_vision') fail(external.some(operation => operation.id === entry.operation_id));
  const seen = new Set(result.coverage.examined_asset_ids), unseen = new Set(result.coverage.unexamined_asset_ids);
  fail([...seen].every(id => !unseen.has(id)) && new Set([...seen, ...unseen]).size === assets.size);
  if (result.source.inventory_complete) fail(result.source.asset_count === assets.size);
  for (const item of result.items) {
    const ownEvidence = new Set(item.evidence_ids);
    for (const fact of Object.values(item.data)) {
      if (fact && typeof fact === 'object' && 'evidence_ids' in fact) allIn(fact.evidence_ids, ownEvidence);
    }
    item.uncertainties.forEach(u => allIn(u.evidence_ids, ownEvidence));
  }
  for (const collection of result.collections) {
    fail(collection.expected_count === null ? collection.missing_count === null : collection.missing_count === Math.max(0, collection.expected_count - collection.item_ids.length));
    if ((collection.missing_count ?? 0) > 0) fail(result.status !== 'success');
  }
  if (result.status === 'success') fail(result.coverage.sufficiency === 'sufficient' && !result.follow_up.extraction_gaps.some(g => g.required_for_request));
  return result;
}
