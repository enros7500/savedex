import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../apps/api/dist/db/connection.js';
import { VideoRepository } from '../apps/api/dist/features/videos/repository.js';
import { RunRepository } from '../apps/api/dist/features/runs/repository.js';
import { LibraryRepository } from '../apps/api/dist/features/library/repository.js';

const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-compiled-'));
const filename = path.join(directory, 'savedex.sqlite');
let db = openDatabase(filename);
try {
  let videos = new VideoRepository(db), runs = new RunRepository(db);
  const add = videos.addVideo('https://www.instagram.com/reel/EXAMPLE1234/?igsh=synthetic');
  assert.ok(add.entry);
  const success = runs.startRun(add.entry.id);
  const raw = readFileSync(new URL('../tests/fixtures/extractor/success.json', import.meta.url), 'utf8');
  runs.completeRun(success.id, { kind: 'result', resultJson: raw, exitCode: 0 });
  const retry = videos.enqueue(add.video.id, 'normal');
  const fail = runs.startRun(retry.id);
  runs.completeRun(fail.id, { kind: 'timeout', message: 'Fallo sintético controlado', exitCode: null });
  db.close();
  db = openDatabase(filename);
  videos = new VideoRepository(db); runs = new RunRepository(db);
  const library = new LibraryRepository(db).getLibrary();
  assert.equal(library.videos[0]?.run?.id, success.id);
  assert.equal(library.videos[0]?.latestAttempt?.id, fail.id);
  assert.equal(library.totalItems, 4);
  assert.equal(runs.getRun(success.id).resultJson, raw);
  assert.equal(runs.getHistory(add.video.id).length, 2);
  assert.equal(videos.getVideo(add.video.id).state, 'error');
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'app_state' ORDER BY name").all().map(t => t.name);
  assert.deepEqual(tables, ['batches', 'items', 'queue_entries', 'runs', 'videos']);
  const report = { verified_at: new Date().toISOString(), execution: 'compiled JavaScript, no tsx',
    database: 'temporary disk file, reopened', schema_version: db.pragma('user_version', { simple: true }),
    tables, history_runs: 2, retained_items_after_failure: library.totalItems,
    original_json_unchanged: true, integrity_check: 'ok', foreign_key_errors: 0 };
  writeFileSync(new URL('../docs/delivery-2-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
