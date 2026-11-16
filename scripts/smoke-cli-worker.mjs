import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { CliAdapter } from '../apps/api/dist/extractor/adapter.js';
import { QueueService } from '../apps/api/dist/features/queue/service.js';
import { LibraryRepository } from '../apps/api/dist/features/library/repository.js';
const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-cli-worker-'));
const progress = [];
const adapter = new CliAdapter({ executable: process.execPath,
  argsPrefix: [fileURLToPath(new URL('../tests/fixtures/fake-extractor.mjs', import.meta.url)), 'by-url', path.join(directory, 'observed.json')],
  modelDir: directory, workDir: directory, timeoutSeconds: 15, exitGraceSeconds: 2,
  onProgress: (requestId, event) => progress.push({ requestId, ...event }) });
const queue = await QueueService.open(path.join(directory, 'savedex.sqlite'), adapter);
try {
  queue.videos.addVideo('https://youtu.be/AbC_123-xyz'); queue.videos.addVideo('https://youtu.be/Other123456');
  queue.startQueue(); await queue.whenIdle();
  const snapshot = queue.getSnapshot();
  assert.equal(snapshot.fault, null);
  assert.equal(snapshot.batch.summary.success, 1);
  assert.equal(snapshot.batch.summary.partial, 1);
  assert.equal(snapshot.batch.summary.review, 1);
  const library = new LibraryRepository(queue.db).getLibrary();
  assert.equal(library.totalItems, 7);
  assert.equal(new Set(progress.map(e => e.requestId)).size, 2);
  assert.ok(progress.filter(e => e.step === 'finish').length === 2);
  assert.equal(queue.db.pragma('integrity_check', { simple: true }), 'ok');
  const report = { verified_at: new Date().toISOString(), execution: 'compiled QueueService + compiled CliAdapter + real synthetic subprocesses in Windows jobs',
    summary: snapshot.batch.summary, retained_items: library.totalItems, progress_request_ids: new Set(progress.map(e => e.requestId)).size,
    finish_events: progress.filter(e => e.step === 'finish').length, integrity_check: 'ok' };
  writeFileSync(new URL('../docs/delivery-4-worker-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await queue.close(); rmSync(directory, { recursive: true, force: true }); }
