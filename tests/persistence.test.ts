import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../apps/api/src/db/connection.js';
import { VideoRepository } from '../apps/api/src/features/videos/repository.js';
import { RunRepository } from '../apps/api/src/features/runs/repository.js';
import { LibraryRepository } from '../apps/api/src/features/library/repository.js';
import type { ExtractResult } from '../packages/contracts/src/extractor.js';
import type { RunDetails } from '../packages/contracts/src/api.js';

function fixture(name = 'success'): ExtractResult {
  return JSON.parse(readFileSync(new URL(`./fixtures/extractor/${name}.json`, import.meta.url), 'utf8'));
}
function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-persistence-'));
  const filename = path.join(directory, 'savedex.sqlite');
  let db = openDatabase(filename);
  let time = '2026-11-10T23:30:00.000Z';
  const now = () => new Date(time);
  const repos = () => ({ videos: new VideoRepository(db, { now }), runs: new RunRepository(db, { now }), library: new LibraryRepository(db) });
  return {
    get db() { return db; }, filename, now, repos,
    advance(value: string) { time = value; },
    reopen() { db.close(); db = openDatabase(filename); return repos(); },
    close() { db.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
function complete(runs: RunRepository, videos: VideoRepository, videoId: number, result: ExtractResult, existing?: number): RunDetails {
  const entry = existing ?? videos.enqueue(videoId, 'normal').id;
  const run = runs.startRun(entry);
  const video = videos.getVideo(videoId);
  result.source.input_url = video.url;
  result.source.canonical_url = video.url;
  result.source.platform = video.platform;
  return runs.completeRun(run.id, { kind: 'result', resultJson: JSON.stringify(result), exitCode: result.status === 'success' ? 0 : result.status === 'partial' ? 2 : 65 });
}

test('explica el límite real desde diagnóstico anidado también para errores históricos sin alterar originales', () => {
  const s = setup();
  try {
    const { videos, runs } = s.repos();
    const added = videos.addVideo('https://youtu.be/AJiGaXRsFNU');
    const run = runs.startRun(added.entry!.id);
    const result = fixture('error');
    result.issues[0]!.message = 'Local extraction could not produce an evidence-backed result.';
    const original = JSON.stringify(result);
    const generic = result.issues[0]!.message;
    const stderr = JSON.stringify({event:'diagnostic',message:JSON.stringify({event:'diagnostic',message:'Video duration exceeds five minute limit',request_id:'savedex_run_1'})});
    runs.completeRun(run.id,{kind:'result',resultJson:original,exitCode:65,stderr});
    // Emulate the old persisted message; reads must improve it without rewriting history.
    s.db.prepare('UPDATE runs SET error_message=? WHERE id=?').run(generic,run.id);
    const reopened = s.reopen();
    assert.match(reopened.runs.getRun(run.id).errorMessage!, /supera el límite de 5 minutos/);
    assert.match(reopened.library.getLibrary().videos[0]!.latestAttempt!.errorMessage!, /5 minutos/);
    assert.equal(reopened.runs.getRun(run.id).resultJson,original);
    assert.equal(s.db.prepare<[number],{error_message:string}>('SELECT error_message FROM runs WHERE id=?').get(run.id)?.error_message,generic);
  } finally { s.close(); }
});

test('migra una base vacía, reabre sin perder datos y activa claves foráneas', () => {
  const s = setup();
  try {
    const { videos } = s.repos();
    const add = videos.addVideo('https://youtu.be/AbC_123-xyz');
    const reopened = s.reopen();
    assert.equal(reopened.videos.getVideo(add.video.id).url, 'https://www.youtube.com/watch?v=AbC_123-xyz');
    assert.equal(s.db.pragma('user_version', { simple: true }), 4);
    assert.equal(s.db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(s.db.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(s.db.pragma('foreign_key_check'), []);
    assert.throws(() => s.db.prepare("INSERT INTO queue_entries(video_id, mode, queue_order, enqueued_at, state) VALUES(999,'normal',99,'now','pending')").run());
  } finally { s.close(); }
});

test('deduplica alta y conserva fecha, estado y una única tarea; día de Madrid', () => {
  const s = setup();
  try {
    const { videos } = s.repos();
    const first = videos.addVideo('https://youtu.be/AbC_123-xyz?si=one');
    s.advance('2026-11-12T12:00:00Z');
    const second = videos.addVideo('https://m.youtube.com/shorts/AbC_123-xyz/');
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.deepEqual(second.video, first.video);
    assert.equal(first.video.addedAt, '2026-11-10T23:30:00.000Z');
    assert.equal(first.video.addedDay, '2026-11-11');
    assert.equal(first.video.state, 'pending');
    assert.equal(videos.listEntries().length, 1);
    assert.equal(second.entry?.id, first.entry?.id);
  } finally { s.close(); }
});

test('permite configurar zona horaria y no escribe una URL inválida', () => {
  const s = setup();
  try {
    const videos = new VideoRepository(s.db, { now: s.now, timezone: 'UTC' });
    assert.equal(videos.addVideo('https://youtu.be/AbC_123-xyz').video.addedDay, '2026-11-10');
    assert.throws(() => videos.addVideo('https://evil.test/video'));
    assert.equal(s.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM videos').get()?.n, 1);
    assert.throws(() => new VideoRepository(s.db, { timezone: 'not/a/zone' }));
  } finally { s.close(); }
});

test('reintentos/exhaustivos al final, sin duplicar entrada pendiente ni activa', () => {
  const s = setup();
  try {
    const { videos, runs } = s.repos();
    const a = videos.addVideo('https://youtu.be/AbC_123-xyz');
    assert.ok(a.entry);
    const b = videos.addVideo('https://youtu.be/Other123456');
    assert.ok(b.entry);
    assert.equal(videos.enqueue(a.video.id, 'exhaustive').id, a.entry.id);
    const active = runs.startRun(a.entry.id);
    assert.equal(videos.enqueue(a.video.id, 'normal').id, a.entry.id);
    assert.throws(() => runs.startRun(a.entry!.id));
    assert.throws(() => videos.removePending(a.entry!.id));
    runs.completeRun(active.id, { kind: 'timeout', message: 'Plazo agotado', exitCode: null });
    const retry = videos.enqueue(a.video.id, 'exhaustive');
    assert.ok(retry.order > b.entry.order);
    assert.equal(retry.mode, 'exhaustive');
    assert.equal(retry.batchId, null);
    assert.equal(videos.listEntries().filter(e => e.videoId === a.video.id && ['pending', 'processing'].includes(e.state)).length, 1);
  } finally { s.close(); }
});

test('quitar pendiente conserva vídeo e historial y permite encolarlo explícitamente', () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const add = videos.addVideo('https://youtu.be/AbC_123-xyz');
    assert.ok(add.entry);
    videos.removePending(add.entry.id);
    assert.equal(videos.getVideo(add.video.id).state, 'idle');
    assert.equal(videos.addVideo(add.video.url).entry, null);
    const pending = videos.enqueue(add.video.id, 'normal');
    const finished = complete(runs, videos, add.video.id, fixture(), pending.id);
    const retry = videos.enqueue(add.video.id, 'normal');
    videos.removePending(retry.id);
    assert.equal(runs.getHistory(add.video.id).length, 1);
    assert.equal(library.getLibrary().videos[0]?.run?.id, finished.id);
    assert.equal(videos.getVideo(add.video.id).state, 'completed');
  } finally { s.close(); }
});

for (const valid of ['success', 'partial']) test(`un error posterior conserva último ${valid} e indica el intento fallido`, () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const add = videos.addVideo('https://www.instagram.com/p/EXAMPLE1234/');
    const kept = complete(runs, videos, add.video.id, fixture(valid));
    const failure = complete(runs, videos, add.video.id, fixture('error'));
    const row = library.getLibrary().videos[0];
    assert.equal(row?.run?.id, kept.id);
    assert.equal(row?.latestAttempt?.id, failure.id);
    assert.equal(row?.latestAttempt?.state, 'error');
    assert.equal(row?.result?.status, valid);
    assert.ok(row!.items.length > 0);
    assert.equal(runs.getHistory(add.video.id).length, 2);
  } finally { s.close(); }
});

test('success vacío sustituye el resultado anterior, sin resucitar ítems viejos', () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const add = videos.addVideo('https://youtu.be/AbC_123-xyz');
    complete(runs, videos, add.video.id, fixture());
    const empty = complete(runs, videos, add.video.id, fixture('empty-success'));
    assert.equal(library.getLibrary().videos[0]?.run?.id, empty.id);
    assert.equal(library.getLibrary().totalItems, 0);
    assert.equal(s.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM items').get()?.n, 4);
  } finally { s.close(); }
});

test('sin resultado válido no fabrica ítems y registra fallos de proceso con diagnóstico acotado', () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const add = videos.addVideo('https://youtu.be/AbC_123-xyz');
    const run = runs.startRun(add.entry!.id);
    const fail = runs.completeRun(run.id, { kind: 'process_error', message: 'No disponible', exitCode: 69, stderr: 'ñ'.repeat(100000) });
    assert.equal(library.getLibrary().videos[0]?.run, null);
    assert.equal(library.getLibrary().totalItems, 0);
    assert.equal(fail.completionKind, 'process_error');
    assert.equal(fail.errorMessage, 'No disponible');
    assert.ok(Buffer.byteLength(fail.stderr, 'utf8') <= 65536);
    assert.ok(!fail.stderr.includes('\uFFFD'));
    assert.throws(() => runs.completeRun(run.id, { kind: 'timeout', message: 'segundo final', exitCode: null }));
  } finally { s.close(); }
});

test('aceptación vinculada al run, conserva JSON/advertencias y la nueva extracción vuelve a evaluarse', () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const add = videos.addVideo('https://www.instagram.com/p/EXAMPLE1234/');
    const run = complete(runs, videos, add.video.id, fixture('partial'));
    assert.equal(run.review.required, true);
    assert.ok(run.review.reasons.some(r => r.code === 'partial'));
    assert.ok(run.review.reasons.some(r => r.code === 'incomplete_collection' && r.message.includes('2')));
    assert.ok(run.review.reasons.some(r => r.code === 'extraction_gap'));
    const accepted = runs.setReview(run.id, 'accepted');
    assert.equal(accepted.review.required, false);
    assert.equal(accepted.resultJson, run.resultJson);
    assert.deepEqual(accepted.result?.issues, run.result?.issues);
    complete(runs, videos, add.video.id, fixture('error'));
    assert.equal(library.getLibrary().videos[0]?.run?.review.manual, 'accepted');
    const next = complete(runs, videos, add.video.id, fixture('partial'));
    assert.equal(next.review.required, true);
    assert.equal(runs.getRun(run.id).review.manual, 'accepted');
    assert.equal(library.getLibrary().videos[0]?.run?.id, next.id);
    const good = complete(runs, videos, add.video.id, fixture());
    assert.equal(runs.setReview(good.id, 'review').review.required, true);
    assert.equal(runs.setReview(good.id, 'none').review.required, false);
    const failed = complete(runs, videos, add.video.id, fixture('error'));
    assert.throws(() => runs.setReview(failed.id, 'accepted'));
  } finally { s.close(); }
});

test('mapea type/title/summary/data y resuelve evidencia compartida sin inventar conteos desde títulos', () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const add = videos.addVideo('https://www.instagram.com/p/EXAMPLE1234/');
    const run = complete(runs, videos, add.video.id, fixture());
    const row = library.getLibrary().videos[0]!;
    assert.equal(row.items[0]?.runId, run.id);
    assert.equal(row.items[0]?.type, 'tool');
    assert.equal(row.items[0]?.name, 'NotebookX');
    assert.equal(row.items[0]?.description, 'Tool presented by the author.');
    assert.deepEqual(row.items[0]?.data, run.result?.items[0]?.data);
    assert.equal(row.items[0]?.evidence[0]?.id, 'd1');
    assert.equal(row.items[1]?.evidence[0]?.id, 'd1');
    assert.deepEqual(row.result?.collections, run.result?.collections);
  } finally { s.close(); }
});

test('filtra por tipo, fecha de incorporación y texto literal Unicode sin mezclar intentos antiguos', () => {
  const s = setup();
  try {
    const { videos, runs, library } = s.repos();
    const a = videos.addVideo('https://youtu.be/AbC_123-xyz');
    const result = fixture();
    result.items[0]!.title = 'Árbol 100%_';
    complete(runs, videos, a.video.id, result);
    s.advance('2026-11-12T12:00:00Z');
    const b = videos.addVideo('https://youtu.be/Other123456');
    complete(runs, videos, b.video.id, fixture());
    assert.equal(library.getLibrary({ type: 'tool' }).totalItems, 2);
    assert.equal(library.getLibrary({ type: 'step', fromDay: '2026-11-11', toDay: '2026-11-11' }).totalItems, 3);
    assert.equal(library.getLibrary({ text: 'ÁRBOL 100%_' }).totalItems, 1);
    assert.equal(library.getLibrary({ text: '%' }).totalItems, 1);
    assert.equal(library.getLibrary({ text: "' OR 1=1 --" }).totalVideos, 0);
    assert.equal(library.getLibrary({ fromDay: '2026-11-13' }).totalVideos, 0);
    assert.throws(() => library.getLibrary({ fromDay: '2026-02-30' }));
    assert.throws(() => library.getLibrary({ fromDay: '2026-11-12', toDay: '2026-11-11' }));
    complete(runs, videos, a.video.id, fixture('empty-success'));
    assert.equal(library.getLibrary({ text: 'Árbol' }).totalVideos, 0);
  } finally { s.close(); }
});

test('resultado, ítems y transición son atómicos ante fallo SQL; preserva JSON original', () => {
  const s = setup();
  try {
    const { videos, runs } = s.repos();
    const add = videos.addVideo('https://www.instagram.com/p/EXAMPLE1234/');
    const run = runs.startRun(add.entry!.id);
    const raw = JSON.stringify(fixture(), null, 4) + '\n';
    s.db.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON items WHEN NEW.extractor_item_id='item2' BEGIN SELECT RAISE(ABORT, 'injected item failure'); END");
    assert.throws(() => runs.completeRun(run.id, { kind: 'result', resultJson: raw, exitCode: 0 }), /injected item failure/);
    assert.equal(runs.getRun(run.id).state, 'processing');
    assert.equal(videos.getEntry(add.entry!.id).state, 'processing');
    assert.equal(s.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM items').get()?.n, 0);
    s.db.exec('DROP TRIGGER injected_failure');
    runs.completeRun(run.id, { kind: 'result', resultJson: raw, exitCode: 0 });
    assert.equal(runs.getRun(run.id).resultJson, raw);
    assert.equal(videos.getEntry(add.entry!.id).state, 'completed');
    assert.equal(s.reopen().runs.getRun(run.id).resultJson, raw);
  } finally { s.close(); }
});

test('rechaza JSON inválido, partial vacío, exit/status incoherente y referencias ausentes sin modificar el run', () => {
  const s = setup();
  try {
    const { videos, runs } = s.repos();
    const add = videos.addVideo('https://www.instagram.com/p/EXAMPLE1234/');
    const run = runs.startRun(add.entry!.id);
    const partial = fixture('partial'); partial.items = [];
    const badRefs = fixture(); badRefs.items[0]!.evidence_ids = ['absent'];
    for (const [raw, code] of [['{broken', 0], [JSON.stringify(partial), 2], [JSON.stringify(fixture()), 2], [JSON.stringify(badRefs), 0]] as const) {
      assert.throws(() => runs.completeRun(run.id, { kind: 'result', resultJson: raw, exitCode: code }));
      assert.equal(runs.getRun(run.id).state, 'processing');
      assert.equal(s.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM items').get()?.n, 0);
    }
  } finally { s.close(); }
});

test('índice único impide por SQL dos tareas vivas por vídeo y dos conexiones no duplican altas', () => {
  const s = setup();
  const otherDb = openDatabase(s.filename);
  try {
    const { videos } = s.repos();
    const add = videos.addVideo('https://youtu.be/AbC_123-xyz');
    const other = new VideoRepository(otherDb, { now: s.now });
    assert.equal(other.addVideo('https://m.youtube.com/watch?v=AbC_123-xyz').created, false);
    assert.equal(other.enqueue(add.video.id, 'exhaustive').id, add.entry?.id);
    assert.throws(() => s.db.prepare("INSERT INTO queue_entries(video_id, mode, queue_order, enqueued_at, state) VALUES(?,'normal',99,'now','pending')").run(add.video.id), /UNIQUE/);
  } finally { otherDb.close(); s.close(); }
});
