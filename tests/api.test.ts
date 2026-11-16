import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApi, until, ApiPort } from './helpers/api.js';
import { createApplication } from '../apps/api/src/runtime.js';
import type { ProgressEvent } from '../packages/contracts/src/extractor.js';

test('POST videos valida JSON/URL, normaliza y devuelve duplicado sin otra entrada', async () => {
  const s = await setupApi();
  try {
    for (const payload of [{}, { url: 123 }, { url: 'https://evil.test/x' }, { url: 'https://youtu.be/AbC_123-xyz', extra: true }]) assert.equal((await s.app.inject({ method: 'POST', url: '/videos', payload })).statusCode, 400);
    const first = await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz?si=x' } });
    assert.equal(first.statusCode, 201); assert.equal(first.json().created, true);
    const second = await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://m.youtube.com/shorts/AbC_123-xyz' } });
    assert.equal(second.statusCode, 200); assert.equal(second.json().created, false);
    assert.equal(second.json().video.id, first.json().video.id);
    const snapshot = (await s.app.inject('/queue')).json();
    assert.equal(snapshot.queue.entries.length, 1);
    assert.equal(snapshot.videos[0].addedDay.length, 10);
    assert.equal(typeof snapshot.revision, 'number');
    assert.equal(typeof snapshot.streamId, 'string');
  } finally { await s.cleanup(); }
});
test('start/stop/reanudar desde API conserva lote y reintentos no duplican ni cambian modo activo', async () => {
  const s = await setupApi();
  try {
    const a = (await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } })).json();
    const b = (await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/Other123456' } })).json();
    const started = (await s.app.inject({ method: 'POST', url: '/queue/start' })).json();
    await until(() => s.port.calls.length === 1);
    const twice = (await s.app.inject({ method: 'POST', url: '/queue/start' })).json();
    assert.equal(twice.queue.batch.id, started.queue.batch.id);
    const duplicate = await s.app.inject({ method: 'POST', url: `/videos/${a.video.id}/exhaustive` });
    assert.equal(duplicate.json().entry.id, a.entry.id);
    assert.equal((await s.app.inject({ method: 'DELETE', url: `/queue/entries/${a.entry.id}` })).statusCode, 409);
    assert.equal((await s.app.inject({ method: 'POST', url: '/queue/stop' })).json().queue.workerStatus, 'stopping');
    s.port.finish(0, 'partial'); await s.runtime.queue.whenIdle();
    assert.equal((await s.app.inject('/queue')).json().queue.batch.state, 'stopped');
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 2);
    s.port.finish(1); await s.runtime.queue.whenIdle();
    const retry = (await s.app.inject({ method: 'POST', url: `/videos/${a.video.id}/exhaustive` })).json();
    const retryAgain = (await s.app.inject({ method: 'POST', url: `/videos/${a.video.id}/retry` })).json();
    assert.equal(retry.entry.id, retryAgain.entry.id); assert.equal(retry.entry.mode, 'exhaustive'); assert.equal(retry.entry.batchId, null);
    assert.ok(retry.entry.order > b.entry.order);
    assert.equal((await s.app.inject({ method: 'DELETE', url: `/queue/entries/${retry.entry.id}` })).statusCode, 200);
    assert.equal((await s.app.inject(`/videos/${a.video.id}/runs`)).json().runs.length, 1);
  } finally { await s.cleanup(); }
});
test('errores de IDs, filtros, revisión y conflictos usan 400/404/409 sin traza interna', async () => {
  const s = await setupApi();
  try {
    for (const url of ['/videos/no/runs', '/videos/0/runs', '/library?type=unknown', '/library?fromDay=2026-02-30', '/library?fromDay=2026-11-12&toDay=2026-11-11', '/library?unexpected=x']) assert.equal((await s.app.inject(url)).statusCode, 400, url);
    assert.equal((await s.app.inject('/videos/999/runs')).statusCode, 404);
    assert.equal((await s.app.inject({ method: 'POST', url: '/videos/999/retry' })).statusCode, 404);
    assert.equal((await s.app.inject({ method: 'DELETE', url: '/queue/entries/999' })).statusCode, 404);
    assert.equal((await s.app.inject({ method: 'PATCH', url: '/runs/999/review', payload: { review: 'accepted' } })).statusCode, 404);
    assert.equal((await s.app.inject({ method: 'PATCH', url: '/runs/999/review', payload: { review: 'other' } })).statusCode, 400);
    assert.equal((await s.app.inject({ method: 'POST', url: '/queue/start', payload: { extra: true } })).statusCode, 400);
    const response = await s.app.inject({ method: 'POST', url: '/videos', headers: { 'content-type': 'application/json' }, payload: '{bad' });
    assert.equal(response.statusCode, 400); assert.ok(!response.body.includes('stack'));
  } finally { await s.cleanup(); }
});
test('biblioteca filtra, preserva evidencia y aceptación afecta solo a su run; DTO sin paths técnicos', async () => {
  const s = await setupApi();
  try {
    const add = (await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } })).json();
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 1);
    const runId = s.runtime.queue.getSnapshot().active!.runId;
    assert.equal((await s.app.inject({ method: 'PATCH', url: `/runs/${runId}/review`, payload: { review: 'accepted' } })).statusCode, 409);
    s.port.finish(0, 'partial'); await s.runtime.queue.whenIdle();
    let library = (await s.app.inject('/library?type=recommendation&text=CV')).json();
    assert.equal(library.library.totalItems, 1);
    assert.ok(library.library.videos[0].items[0].evidence.length > 0);
    const accepted = await s.app.inject({ method: 'PATCH', url: `/runs/${runId}/review`, payload: { review: 'accepted' } });
    assert.equal(accepted.json().run.review.required, false);
    assert.ok(accepted.json().run.review.reasons.some((r: { code: string }) => r.code === 'partial'));
    const raw = await s.app.inject(`/runs/${runId}/result`);
    assert.equal(raw.statusCode, 200); assert.ok(raw.headers['content-disposition']?.includes('.json'));
    assert.ok(raw.body.includes('private-savedex'));
    for (const url of ['/queue', '/library', `/videos/${add.video.id}/runs`]) {
      const response = await s.app.inject(url);
      assert.ok(!response.body.includes('private-savedex'), url);
      assert.ok(!response.body.includes('"stderr"'), url);
      assert.ok(!response.body.includes('"resultJson"'), url);
    }
    await s.app.inject({ method: 'POST', url: `/videos/${add.video.id}/retry` });
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 2);
    s.port.finish(1, 'error'); await s.runtime.queue.whenIdle();
    library = (await s.app.inject('/library')).json();
    assert.equal(library.library.videos[0].run.id, runId);
    assert.equal(library.library.videos[0].run.review.manual, 'accepted');
    assert.equal(library.library.videos[0].latestAttempt.state, 'error');
    const latest = library.library.videos[0].latestAttempt.id;
    assert.equal((await s.app.inject({ method: 'PATCH', url: `/runs/${latest}/review`, payload: { review: 'accepted' } })).statusCode, 409);
    const batch = (await s.app.inject('/queue')).json().queue.batch.id;
    assert.equal((await s.app.inject({ method: 'POST', url: `/batches/${batch}/dismiss` })).json().queue.batch, null);
  } finally { await s.cleanup(); }
});
test('revisión se guarda en la misma transacción que la mutación y un fallo no publica estado parcial', async () => {
  const s = await setupApi();
  const frames: string[] = [];
  const unsubscribe = s.runtime.events.subscribe(frame => frames.push(frame.type));
  try {
    const before = (await s.app.inject('/queue')).json();
    s.runtime.queue.db.exec("CREATE TRIGGER event_write_failure BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT, 'private database failure'); END");
    const failed = await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    assert.equal(failed.statusCode, 503); assert.ok(!failed.body.includes('private database'));
    const unavailable = (await s.app.inject('/queue')).statusCode;
    s.runtime.queue.db.exec('DROP TRIGGER event_write_failure');
    await s.app.inject({ method: 'POST', url: '/queue/stop' });
    const after = (await s.app.inject('/queue')).json();
    assert.equal(after.revision, before.revision + 1); assert.equal(after.videos.length, 0);
    assert.ok(frames.includes('reset'), 'La revisión no disponible debe pedir resincronización');
    assert.equal(unavailable, 503);
  } finally { unsubscribe(); await s.cleanup(); }
});

test('cerrar servidor con una petición HTTP en espera termina solo el vídeo activo', async () => {
  const s = await setupApi();
  let release!: () => void, entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  s.app.get('/test-slow', async () => { entered = true; await gate; return { ok: true }; });
  try {
    const base = await s.app.listen({ host: '127.0.0.1', port: 0 });
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/Other123456' } });
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 1);
    const pending = fetch(base + '/test-slow'); await until(() => entered);
    const closing = s.app.close();
    await new Promise(resolve => setTimeout(resolve, 20));
    s.port.finish(0); await new Promise(resolve => setTimeout(resolve, 20));
    const calls = s.port.calls.length;
    release(); await (await pending).json();
    s.port.calls.forEach((_, i) => s.port.finish(i));
    const drained = await Promise.race([closing.then(() => true), new Promise<false>(resolve => setTimeout(() => resolve(false), 2000))]);
    if (!drained) s.app.server.closeIdleConnections();
    await closing;
    assert.equal(calls, 1);
    assert.equal(drained, true, 'El cierre no debe esperar al keep-alive de una respuesta ya finalizada');
  } finally { release(); await s.cleanup(); }
});
test('progreso observado se integra en snapshot, repeticiones no se pierden y se limpia al finalizar', async () => {
  let progress!: (requestId: string, event: ProgressEvent) => void;
  const port = new ApiPort();
  const s = await setupApi({ extractorFactory: callback => { progress = callback; return port; } });
  try {
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => port.calls.length === 1);
    const request = port.calls[0]!.request;
    const event = { event: 'step' as const, step: 'ocr' as const, ts: '2026-11-11T15:00:00Z' };
    const before = s.runtime.snapshot().revision;
    progress(request.request_id, event); progress(request.request_id, event);
    assert.equal(s.runtime.snapshot().revision, before + 2);
    assert.equal(s.runtime.snapshot().progress?.event.step, 'ocr');
    progress('old_run', event); assert.equal(s.runtime.snapshot().revision, before + 2);
    port.finish(0); await s.runtime.queue.whenIdle(); assert.equal(s.runtime.snapshot().progress, null);
  } finally { port.calls.forEach((_, i) => port.finish(i)); await s.cleanup(); }
});
test('nuevo arranque cambia streamId, mantiene revisión creciente y no autoarranca', async () => {
  const s = await setupApi(); let next: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    const before = s.runtime.snapshot(); await s.app.close();
    const port = new ApiPort(); next = await createApplication({ config: s.config, extractor: port });
    const after = next.runtime.snapshot();
    assert.notEqual(after.streamId, before.streamId); assert.ok(after.revision > before.revision);
    assert.equal(after.videos.length, 1); assert.equal(port.calls.length, 0);
  } finally { await next?.app.close(); await s.cleanup(); }
});
test('solo orígenes locales previstos pueden modificar la API; cabeceras de desarrollo explícitas', async () => {
  const s = await setupApi();
  try {
    assert.equal((await s.app.inject({ method: 'POST', url: '/videos', headers: { origin: 'https://evil.test' }, payload: { url: 'https://youtu.be/AbC_123-xyz' } })).statusCode, 403);
    assert.equal(s.runtime.snapshot().videos.length, 0);
    const preflight = await s.app.inject({ method: 'OPTIONS', url: '/videos', headers: { origin: 'http://127.0.0.1:4200', 'access-control-request-method': 'POST' } });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'http://127.0.0.1:4200');
    assert.equal((await s.app.inject({ url: '/queue', headers: { host: 'evil.test' } })).statusCode, 403);
  } finally { await s.cleanup(); }
});
