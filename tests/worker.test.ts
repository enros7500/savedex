import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { QueueService } from '../apps/api/src/features/queue/service.js';
import { LibraryRepository } from '../apps/api/src/features/library/repository.js';
import type { ExtractionOutcome, ExtractorPort } from '../apps/api/src/features/queue/worker.js';
import type { ExtractRequest, ExtractResult } from '../packages/contracts/src/extractor.js';
import type { ExtractionMode } from '../packages/contracts/src/api.js';
import { ExtractorCleanupError } from '../apps/api/src/extractor/errors.js';

const urls = ['https://youtu.be/AbC_123-xyz', 'https://youtu.be/Other123456', 'https://youtu.be/Third123456', 'https://youtu.be/Forth123456'];
function resultFor(request: ExtractRequest, name = 'success'): ExtractionOutcome {
  if (name === 'timeout') return { kind: 'timeout', message: 'Tiempo agotado sintético', exitCode: null };
  if (name === 'process_error' || name === 'protocol_error') return { kind: name, message: 'Fallo sintético', exitCode: null };
  const result = JSON.parse(readFileSync(new URL(`./fixtures/extractor/${name}.json`, import.meta.url), 'utf8')) as ExtractResult;
  result.request_id = request.request_id;
  result.source.input_url = request.url;
  result.source.canonical_url = request.url;
  result.source.platform = 'youtube';
  result.request_context.output_language = 'es';
  return { kind: 'result', resultJson: JSON.stringify(result), exitCode: name === 'success' ? 0 : name === 'partial' ? 2 : 65 };
}
async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 4000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('No se observó la condición del worker');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
class ControlledExtractor implements ExtractorPort {
  calls: { request: ExtractRequest; mode: ExtractionMode; resolve: (value: ExtractionOutcome) => void; reject: (error: Error) => void }[] = [];
  active = 0;
  maximumActive = 0;
  run(request: ExtractRequest, mode: ExtractionMode): Promise<ExtractionOutcome> {
    this.active++; this.maximumActive = Math.max(this.maximumActive, this.active);
    return new Promise<ExtractionOutcome>((resolve, reject) => this.calls.push({ request, mode, resolve, reject })).finally(() => { this.active--; });
  }
  finish(index: number, name = 'success') { const call = this.calls[index]!; call.resolve(resultFor(call.request, name)); }
  async count(n: number) { await until(() => this.calls.length >= n); }
}
async function setup(extractor: ExtractorPort = new ControlledExtractor()) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-worker-'));
  const filename = path.join(directory, 'savedex.sqlite');
  let service: QueueService;
  try { service = await QueueService.open(filename, extractor); }
  catch (e) { rmSync(directory, { recursive: true, force: true }); throw e; }
  return { directory, filename, service,
    async cleanup() {
      const closing = service.close();
      if (extractor instanceof ControlledExtractor) extractor.calls.forEach((_, i) => extractor.finish(i));
      await closing;
      rmSync(directory, { recursive: true, force: true });
    } };
}

test('sin pendientes Iniciar no crea lote ni invoca extractor', async () => {
  const port = new ControlledExtractor(), s = await setup(port);
  try { assert.equal(s.service.startQueue().batch, null); await s.service.whenIdle(); assert.equal(port.calls.length, 0); }
  finally { await s.cleanup(); }
});

test('incertidumbre de limpieza detiene el worker y no lanza otro CLI', async () => {
  let calls = 0;
  const s = await setup({ async run(request) {
    if (calls++ === 0) throw new ExtractorCleanupError('Limpieza del árbol no confirmada');
    return resultFor(request);
  } }), q = s.service;
  try {
    const first = q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
    q.startQueue(); await q.whenIdle();
    assert.equal(calls, 1);
    assert.equal(q.getSnapshot().workerStatus, 'faulted');
    assert.equal(q.runs.getLatest(first.video.id)?.state, 'processing');
    assert.match(q.getSnapshot().fault ?? '', /Limpieza/);
  } finally { await s.cleanup(); }
});

test('doble Iniciar captura una vez y solo permite un vídeo activo', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
    const a = q.startQueue(), b = q.startQueue();
    assert.equal(a.batch?.id, b.batch?.id);
    await port.count(1);
    assert.equal(q.getSnapshot().active?.videoId, q.videos.listEntries()[0]?.videoId);
    assert.equal(port.calls[0]?.request.output_language, 'es');
    assert.equal(port.calls[0]?.request.schema_version, '3.1.0');
    assert.equal(port.calls[0]?.mode, 'normal');
    q.startQueue();
    assert.equal(port.calls.length, 1);
    port.finish(0); await port.count(2); port.finish(1); await q.whenIdle();
    assert.equal(port.maximumActive, 1);
    assert.equal(q.getSnapshot().batch?.state, 'completed');
    assert.equal(q.getSnapshot().batch?.summary?.success, 2);
    assert.equal(q.getSnapshot().workerStatus, 'idle');
  } finally { await s.cleanup(); }
});

for (const outcome of ['success', 'partial', 'error', 'timeout', 'process_error', 'protocol_error']) test(`guarda ${outcome} y continúa con el siguiente vídeo`, async () => {
  let calls = 0;
  const port: ExtractorPort = { async run(request) { return resultFor(request, calls++ === 0 ? outcome : 'success'); } };
  const s = await setup(port), q = s.service;
  try {
    const first = q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
    q.startQueue(); await q.whenIdle();
    const summary = q.getSnapshot().batch?.summary;
    assert.equal(calls, 2);
    assert.equal(summary?.total, 2);
    assert.equal(summary?.failed, ['success', 'partial'].includes(outcome) ? 0 : 1);
    assert.equal(summary?.success, outcome === 'success' ? 2 : 1);
    const run = q.runs.getLatest(first.video.id)!;
    assert.equal(run.state, outcome === 'success' || outcome === 'partial' ? outcome : 'error');
    if (outcome === 'partial') {
      assert.equal(run.exitCode, 2);
      assert.equal(summary?.partial, 1);
      assert.equal(summary?.review, 1);
      assert.ok(run.review.reasons.some(r => r.code === 'incomplete_collection' && r.message.includes('2')));
      assert.equal(new LibraryRepository(q.db).getLibrary().totalItems, 7);
    }
    assert.equal(q.getSnapshot().fault, null);
  } finally { await s.cleanup(); }
});

test('altas durante un lote esperan otro Iniciar, incluso al acabar el lote actual', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    q.videos.addVideo(urls[0]!);
    const batchId = q.startQueue().batch!.id;
    await port.count(1);
    const later = q.videos.addVideo(urls[1]!);
    q.startQueue();
    assert.equal(later.entry?.batchId, null);
    port.finish(0); await q.whenIdle();
    assert.equal(port.calls.length, 1);
    assert.equal(q.videos.getEntry(later.entry!.id).state, 'pending');
    assert.equal(q.getSnapshot().batch?.summary?.total, 1);
    assert.notEqual(q.startQueue().batch?.id, batchId);
    await port.count(2); port.finish(1); await q.whenIdle();
  } finally { await s.cleanup(); }
});

test('Detener termina el activo; reanudar conserva lote y excluye nuevas altas', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    q.videos.addVideo(urls[0]!); const second = q.videos.addVideo(urls[1]!);
    const batchId = q.startQueue().batch!.id;
    await port.count(1);
    assert.equal(q.stopQueue().workerStatus, 'stopping');
    assert.equal(q.startQueue().batch?.state, 'stopping');
    const later = q.videos.addVideo(urls[2]!);
    assert.equal(port.active, 1);
    port.finish(0); await q.whenIdle();
    assert.equal(port.calls.length, 1);
    assert.equal(q.getSnapshot().batch?.state, 'stopped');
    assert.equal(q.videos.getEntry(second.entry!.id).batchId, batchId);
    assert.equal(q.startQueue().batch?.id, batchId);
    await port.count(2); port.finish(1); await q.whenIdle();
    assert.equal(port.calls.length, 2);
    assert.equal(q.videos.getEntry(later.entry!.id).batchId, null);
    assert.equal(q.getSnapshot().batch?.summary?.success, 2);
  } finally { await s.cleanup(); }
});

test('Detener antes de reclamar una tarea no la inicia; detener el último activo completa el lote', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    q.videos.addVideo(urls[0]!); q.startQueue(); q.stopQueue(); await q.whenIdle();
    assert.equal(port.calls.length, 0);
    assert.equal(q.getSnapshot().batch?.state, 'stopped');
    q.startQueue(); await port.count(1); q.stopQueue(); port.finish(0); await q.whenIdle();
    assert.equal(q.getSnapshot().batch?.state, 'completed');
  } finally { await s.cleanup(); }
});

test('reintentos y exhaustivos van al final fuera del lote capturado, sin duplicar', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    const first = q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
    const batchId = q.startQueue().batch!.id;
    await port.count(1);
    assert.equal(q.videos.enqueue(first.video.id, 'exhaustive').id, first.entry?.id);
    port.finish(0, 'partial'); await port.count(2);
    const retry = q.videos.enqueue(first.video.id, 'exhaustive');
    assert.equal(q.videos.enqueue(first.video.id, 'normal').id, retry.id);
    assert.equal(retry.batchId, null);
    assert.ok(retry.order > q.videos.listEntries()[1]!.order);
    port.finish(1); await q.whenIdle();
    assert.equal(q.getSnapshot().batch?.id, batchId);
    assert.equal(port.calls.length, 2);
    q.startQueue(); await port.count(3);
    assert.equal(port.calls[2]?.mode, 'exhaustive');
    port.finish(2); await q.whenIdle();
    assert.equal(q.runs.getHistory(first.video.id).length, 2);
  } finally { await s.cleanup(); }
});

test('quitar una tarea del lote conserva datos y aparece en el resumen como retirada', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    q.videos.addVideo(urls[0]!); const second = q.videos.addVideo(urls[1]!);
    q.startQueue(); await port.count(1);
    q.videos.removePending(second.entry!.id);
    port.finish(0); await q.whenIdle();
    assert.equal(port.calls.length, 1);
    assert.equal(q.getSnapshot().batch?.summary?.removed, 1);
    assert.equal(q.getSnapshot().batch?.summary?.total, 2);
    assert.equal(q.videos.getVideo(second.video.id).state, 'idle');
  } finally { await s.cleanup(); }
});

test('rechazo del puerto o resultado inválido se registra y no rompe los siguientes', async () => {
  for (const broken of ['reject', 'json', 'mismatch']) {
    let calls = 0;
    const s = await setup({ async run(request) {
      if (calls++ > 0) return resultFor(request);
      if (broken === 'reject') throw new Error('Puerto rechazado');
      if (broken === 'json') return { kind: 'result', resultJson: '{invalid', exitCode: 0 };
      return resultFor({ ...request, request_id: 'incorrect_request' });
    } }), q = s.service;
    try {
      const add = q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
      q.startQueue(); await q.whenIdle();
      assert.equal(q.runs.getLatest(add.video.id)?.completionKind, broken === 'reject' ? 'process_error' : 'protocol_error');
      assert.equal(q.getSnapshot().batch?.summary?.failed, 1);
      assert.equal(q.getSnapshot().batch?.summary?.success, 1);
    } finally { await s.cleanup(); }
  }
});

test('resumen final persiste tras reabrir, hasta descartar o iniciar un lote nuevo', async () => {
  const s = await setup({ async run(request) { return resultFor(request); } }), q = s.service;
  let reopened: QueueService | undefined;
  try {
    q.videos.addVideo(urls[0]!); q.startQueue(); await q.whenIdle();
    const summary = q.getSnapshot().batch;
    await q.close();
    reopened = await QueueService.open(s.filename, { async run(request) { return resultFor(request); } });
    assert.deepEqual(reopened.getSnapshot().batch, summary);
    assert.deepEqual(reopened.startQueue().batch, summary);
    assert.equal(reopened.dismissSummary(summary!.id).batch, null);
    assert.equal(new LibraryRepository(reopened.db).getLibrary().totalItems, 4);
    reopened.videos.addVideo(urls[1]!);
    assert.notEqual(reopened.startQueue().batch?.id, summary!.id);
    await reopened.whenIdle();
  } finally { await reopened?.close(); await s.cleanup(); }
});

test('un fallo SQL al guardar pausa el worker sin convertirlo en error del extractor', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    const add = q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
    q.db.exec("CREATE TRIGGER injected_queue_failure BEFORE INSERT ON items WHEN NEW.extractor_item_id='item2' BEGIN SELECT RAISE(ABORT, 'injected queue write failure'); END");
    q.startQueue(); await port.count(1); port.finish(0); await q.whenIdle();
    assert.equal(q.getSnapshot().workerStatus, 'faulted');
    assert.ok(q.getSnapshot().fault?.includes('injected queue write failure'));
    assert.equal(q.runs.getLatest(add.video.id)?.state, 'processing');
    assert.equal(q.videos.getEntry(add.entry!.id).state, 'processing');
    assert.equal(q.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM items').get()?.n, 0);
    assert.equal(port.calls.length, 1);
    q.db.exec('DROP TRIGGER injected_queue_failure');
    q.recoverQueue();
    assert.equal(q.getSnapshot().batch?.state, 'stopped');
    assert.equal(q.videos.getEntry(add.entry!.id).state, 'pending');
    q.startQueue(); await port.count(2); port.finish(1); await port.count(3); port.finish(2); await q.whenIdle();
    assert.equal(q.getSnapshot().batch?.summary?.success, 2);
    assert.equal(q.runs.getHistory(add.video.id).length, 2);
  } finally { await s.cleanup(); }
});

test('resultado, ítems, tarea y resumen final se revierten juntos si falla el lote', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    const add = q.videos.addVideo(urls[0]!);
    q.db.exec("CREATE TRIGGER injected_batch_failure BEFORE UPDATE OF summary_json ON batches WHEN NEW.summary_json IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected batch write failure'); END");
    q.startQueue(); await port.count(1); port.finish(0); await q.whenIdle();
    assert.equal(q.getSnapshot().workerStatus, 'faulted');
    assert.equal(q.runs.getLatest(add.video.id)?.state, 'processing');
    assert.equal(q.videos.getEntry(add.entry!.id).state, 'processing');
    assert.equal(q.getSnapshot().batch?.summary, null);
    assert.equal(q.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM items').get()?.n, 0);
  } finally { await s.cleanup(); }
});

test('recuperación explícita no interrumpe un worker vivo y cerrar espera al vídeo activo', async () => {
  const port = new ControlledExtractor(), s = await setup(port), q = s.service;
  try {
    q.videos.addVideo(urls[0]!); q.videos.addVideo(urls[1]!);
    q.startQueue(); await port.count(1);
    assert.throws(() => q.recoverQueue(), /activo|ejecución|worker/i);
    let closed = false;
    const closing = q.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(closed, false);
    await assert.rejects(QueueService.open(s.filename, port), /instancia|escritora|uso/i);
    port.finish(0); await closing;
    assert.equal(port.calls.length, 1);
    await assert.rejects(Promise.resolve().then(() => q.startQueue()), /cerrad/i);
  } finally { await s.cleanup(); }
});

test('dos instancias para la misma base fallan claramente y permiten relevo tras cerrar', async () => {
  const s = await setup(), q = s.service;
  let replacement: QueueService | undefined;
  try {
    await assert.rejects(QueueService.open(path.join(s.directory, '.', 'savedex.sqlite'), new ControlledExtractor()), /instancia|escritora|uso/i);
    await q.close();
    replacement = await QueueService.open(s.filename, new ControlledExtractor());
    assert.equal(replacement.getSnapshot().workerStatus, 'idle');
  } finally { await replacement?.close(); await s.cleanup(); }
});

test('caída real del backend libera exclusión; recupera processing como pending sin autoarranque', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-crash-'));
  const filename = path.join(directory, 'savedex.sqlite');
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/worker-host.ts', filename], { cwd: process.cwd(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let q: QueueService | undefined;
  let stderr = ''; child.stderr!.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No arrancó el proceso de prueba: ' + stderr)), 5000);
      child.once('message', () => { clearTimeout(timer); resolve(); });
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Salida prematura ${code}: ${stderr}`)); });
    });
    await assert.rejects(QueueService.open(filename, new ControlledExtractor()), /instancia|escritora|uso/i);
    const exited = once(child, 'exit'); child.kill(); await exited;
    const port = new ControlledExtractor();
    q = await QueueService.open(filename, port);
    const recovered = q.getSnapshot();
    assert.equal(recovered.batch?.state, 'stopped');
    assert.equal(recovered.active, null);
    assert.equal(recovered.entries[0]?.state, 'pending');
    assert.equal(recovered.entries[0]?.batchId, recovered.batch?.id);
    assert.equal(q.runs.getHistory(recovered.entries[0]!.videoId)[0]?.state, 'error');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(port.calls.length, 0);
    assert.equal(q.startQueue().batch?.id, recovered.batch?.id);
    await port.count(1); port.finish(0); await q.whenIdle();
    assert.equal(q.runs.getHistory(recovered.entries[0]!.videoId).length, 2);
    assert.equal(q.getSnapshot().batch?.summary?.success, 1);
    assert.deepEqual(q.db.pragma('foreign_key_check'), []);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await q?.close(); rmSync(directory, { recursive: true, force: true });
  }
});
