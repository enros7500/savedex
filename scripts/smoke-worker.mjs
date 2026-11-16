import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { QueueService } from '../apps/api/dist/features/queue/service.js';
import { LibraryRepository } from '../apps/api/dist/features/library/repository.js';

const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-worker-compiled-'));
const filename = path.join(directory, 'savedex.sqlite');
let active = 0, maximumActive = 0;
const calls = [];
const pending = [];
const port = { run(request, mode) {
  active++; maximumActive = Math.max(maximumActive, active);
  calls.push({ request, mode });
  return new Promise(resolve => pending.push(resolve)).finally(() => { active--; });
} };
async function count(n) {
  const deadline = Date.now() + 3000;
  while (calls.length < n) {
    if (Date.now() > deadline) throw new Error('El worker compilado no avanzó');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
function finish(index, name) {
  if (name === 'timeout') { pending[index]({ kind: 'timeout', message: 'Timeout simulado', exitCode: null }); return; }
  const request = calls[index].request;
  const result = JSON.parse(readFileSync(new URL(`../tests/fixtures/extractor/${name}.json`, import.meta.url), 'utf8'));
  result.request_id = request.request_id; result.source.input_url = request.url;
  result.source.canonical_url = request.url; result.source.platform = 'youtube';
  result.request_context.output_language = 'es';
  pending[index]({ kind: 'result', resultJson: JSON.stringify(result), exitCode: name === 'partial' ? 2 : 0 });
}
let q = await QueueService.open(filename, port);
try {
  const first = q.videos.addVideo('https://youtu.be/AbC_123-xyz');
  q.videos.addVideo('https://youtu.be/Other123456');
  q.videos.addVideo('https://youtu.be/Third123456');
  const batchId = q.startQueue().batch.id;
  assert.equal(q.startQueue().batch.id, batchId);
  let rejection;
  try { const contender = await QueueService.open(filename, port); await contender.close(); throw new Error('Segunda instancia no bloqueada'); }
  catch (error) { assert.match(error.message, /instancia escritora/); rejection = { message: error.message, cause_code: error.cause?.code ?? null }; }
  await count(1);
  const later = q.videos.addVideo('https://youtu.be/Forth123456');
  q.stopQueue();
  finish(0, 'partial'); await q.whenIdle();
  const stopped = q.getSnapshot();
  assert.equal(stopped.batch.state, 'stopped');
  assert.equal(calls.length, 1);
  await q.close();
  q = await QueueService.open(filename, port);
  assert.equal(q.getSnapshot().batch.id, batchId);
  assert.equal(calls.length, 1);
  q.startQueue(); await count(2); finish(1, 'timeout');
  await count(3); finish(2, 'success'); await q.whenIdle();
  const completed = q.getSnapshot();
  assert.deepEqual(completed.batch.summary, { total: 3, pending: 0, processing: 0, success: 1, partial: 1, failed: 1, removed: 0, review: 1 });
  assert.equal(q.videos.getEntry(later.entry.id).batchId, null);
  assert.equal(calls.length, 3);
  assert.equal(maximumActive, 1);
  assert.equal(q.runs.getLatest(first.video.id).review.required, true);
  assert.equal(new LibraryRepository(q.db).getLibrary().totalItems, 7);
  assert.equal(q.db.pragma('integrity_check', { simple: true }), 'ok');
  assert.deepEqual(q.db.pragma('foreign_key_check'), []);
  const report = { verified_at: new Date().toISOString(), execution: 'compiled JavaScript, simulated ExtractorPort',
    platform: process.platform, initial_captured: 3, stopped_after_active: true, resumed_same_batch_after_reopen: true,
    maximum_active: maximumActive, calls: calls.length, later_entry_waits_unassigned: true,
    summary: completed.batch.summary, retained_items: 7, second_writer_rejection: rejection,
    integrity_check: 'ok', foreign_key_errors: 0 };
  writeFileSync(new URL('../docs/delivery-3-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  const closing = q.close();
  pending.forEach((_, index) => finish(index, 'success'));
  await closing;
  rmSync(directory, { recursive: true, force: true });
}
