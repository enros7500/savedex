import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../apps/api/src/db/connection.js';
const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Database: typeof import('better-sqlite3') = requireFromApi('better-sqlite3');
test('migra versión 1 existente conservando datos y añade revisión sin rehacer tablas de dominio', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-upgrade-'));
  const file = path.join(directory, 'savedex.sqlite');
  let db = new Database(file);
  try {
    db.exec(readFileSync(new URL('../apps/api/src/db/migrations/001-initial.sql', import.meta.url), 'utf8'));
    db.pragma('user_version = 1');
    db.prepare("INSERT INTO videos(normalized_url,platform,added_at,added_day,state) VALUES(?,'youtube',?,?,'idle')").run('https://www.youtube.com/watch?v=AbC_123-xyz', '2026-11-11T00:00:00Z', '2026-11-11');
    db.close(); db = openDatabase(file);
    assert.equal(db.pragma('user_version', { simple: true }), 4);
    assert.equal(db.prepare<[], { n: number }>('SELECT count(*) AS n FROM videos').get()?.n, 1);
    assert.equal(db.prepare<[], { revision: number }>('SELECT revision FROM app_state WHERE singleton=1').get()?.revision, 0);
    db.close(); db = openDatabase(file);
    assert.equal(db.prepare<[], { n: number }>('SELECT count(*) AS n FROM videos').get()?.n, 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
