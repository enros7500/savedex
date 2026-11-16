import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../apps/api/src/app.js';

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Database: typeof import('better-sqlite3') = requireFromApi('better-sqlite3');

test('la API mínima responde en /health sin lanzar el extractor', async () => {
  const app = buildServer();
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', app: 'savedex' });
  } finally { await app.close(); }
});

test('el driver nativo SQLite guarda y recupera una transacción en Windows', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'savedex-sqlite-'));
  const file = path.join(directory, 'smoke.sqlite');
  let db = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE smoke (id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO smoke(title) VALUES (?)');
    db.transaction(() => { insert.run('Prueba sintética — vídeo'); })();
    assert.throws(db.transaction(() => { insert.run('rollback'); throw new Error('rollback'); }));
    db.close();
    db = new Database(file);
    assert.deepEqual(db.prepare('SELECT title FROM smoke').all(), [{ title: 'Prueba sintética — vídeo' }]);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});
