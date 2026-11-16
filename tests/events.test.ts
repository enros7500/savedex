import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApi, connectSse, until, resultFor } from './helpers/api.js';
import { SnapshotSynchronizer } from '../packages/contracts/src/events.js';
import type { ApplicationSnapshot, StreamFrame, SyncState } from '../packages/contracts/src/events.js';

test('suscribe y acumula antes de cargar snapshot; evento durante la carga deja estado igual al backend', async () => {
  const s = await setupApi();
  let resolve!: (value: ApplicationSnapshot) => void;
  let captured!: ApplicationSnapshot;
  let subscribed = false;
  const states: SyncState[] = [];
  const client = new SnapshotSynchronizer({
    subscribe(event) { subscribed = true; return s.runtime.events.subscribe(event); },
    loadSnapshot() { assert.equal(subscribed, true); captured = s.runtime.snapshot(); return new Promise(r => { resolve = r; }); },
  }, state => states.push(state));
  try {
    client.start();
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    resolve(captured); await until(() => states.at(-1)?.syncing === false);
    assert.deepEqual(states.at(-1)?.snapshot, s.runtime.snapshot());
    assert.equal(states.at(-1)?.snapshot?.videos.length, 1);
  } finally { client.stop(); await s.cleanup(); }
});
test('descarta eventos anteriores al snapshot sin deshacer el estado', async () => {
  const s = await setupApi();
  let event!: (frame: StreamFrame) => void, latest: SyncState | undefined;
  const client = new SnapshotSynchronizer({ subscribe(listener) { event = listener; return s.runtime.events.subscribe(listener); }, async loadSnapshot() { return s.runtime.snapshot(); } }, state => { latest = state; });
  try {
    const old = s.runtime.snapshot();
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    client.start(); await until(() => latest?.syncing === false);
    event({ type: 'change', snapshot: old });
    assert.deepEqual(latest?.snapshot, s.runtime.snapshot());
  } finally { client.stop(); await s.cleanup(); }
});
test('un hueco de revisión fuerza snapshot; desconectar no finge worker detenido y reconectar resincroniza', async () => {
  const s = await setupApi();
  let event!: (frame: StreamFrame) => void, disconnect!: () => void, loads = 0;
  let latest: SyncState | undefined;
  const client = new SnapshotSynchronizer({
    subscribe(onEvent, onDisconnect) { event = onEvent; disconnect = onDisconnect; return s.runtime.events.subscribe(onEvent); },
    async loadSnapshot() { loads++; return s.runtime.snapshot(); },
  }, state => { latest = state; });
  try {
    client.start(); await until(() => latest?.syncing === false);
    const unsubscribe = s.runtime.events.subscribe(() => {});
    unsubscribe();
    const snapshot = s.runtime.snapshot();
    event({ type: 'change', snapshot: { ...snapshot, revision: snapshot.revision + 2 } });
    await until(() => loads === 2 && latest?.syncing === false);
    assert.deepEqual(latest?.snapshot, s.runtime.snapshot());
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 1);
    disconnect();
    assert.equal(latest?.connection, 'disconnected');
    assert.equal(latest?.snapshot?.queue.workerStatus, 'running');
    s.port.finish(0); await s.runtime.queue.whenIdle();
    event({ type: 'ready', ...s.runtime.events.stamp() });
    await until(() => latest?.connection === 'connected' && latest.syncing === false);
    assert.deepEqual(latest?.snapshot, s.runtime.snapshot());
  } finally { client.stop(); await s.cleanup(); }
});
test('buffer acotado durante carga solicita una instantánea nueva en vez de perder eventos', async () => {
  const s = await setupApi();
  let resolve!: (snapshot: ApplicationSnapshot) => void, captured!: ApplicationSnapshot, loads = 0;
  let latest: SyncState | undefined;
  const client = new SnapshotSynchronizer({
    subscribe(event) { return s.runtime.events.subscribe(event); },
    loadSnapshot() { loads++; if (loads > 1) return Promise.resolve(s.runtime.snapshot()); captured = s.runtime.snapshot(); return new Promise(r => { resolve = r; }); },
  }, state => { latest = state; }, 1);
  try {
    client.start();
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/Other123456' } });
    resolve(captured); await until(() => loads > 1 && latest?.syncing === false);
    assert.deepEqual(latest?.snapshot, s.runtime.snapshot());
  } finally { client.stop(); await s.cleanup(); }
});

test('un fallo transitorio de snapshot acumula cambios durante su reintento y converge', async () => {
  const s = await setupApi();
  let calls = 0, resolve!: (snapshot: ApplicationSnapshot) => void, captured!: ApplicationSnapshot;
  let latest: SyncState | undefined;
  const client = new SnapshotSynchronizer({
    subscribe(event) { return s.runtime.events.subscribe(event); },
    loadSnapshot() { calls++; if (calls === 1) return Promise.reject(new Error('HTTP temporal')); captured = s.runtime.snapshot(); return new Promise(r => { resolve = r; }); },
  }, state => { latest = state; });
  try {
    client.start(); await until(() => latest?.connection === 'disconnected');
    await until(() => calls === 2);
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    resolve(captured); await until(() => latest?.syncing === false && latest.connection === 'connected');
    assert.deepEqual(latest?.snapshot, s.runtime.snapshot());
  } finally { client.stop(); await s.cleanup(); }
});
test('SSE real emite ready/cambio/heartbeat, cierra cliente y el worker sigue hasta terminar', async () => {
  const s = await setupApi({ heartbeatMs: 20 });
  let stream: Awaited<ReturnType<typeof connectSse>> | undefined;
  try {
    const base = await s.app.listen({ host: '127.0.0.1', port: 0 });
    stream = await connectSse(base);
    assert.match(stream.response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal((await stream.next()).frame?.type, 'ready');
    assert.equal((await stream.next()).comment, true);
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    let change = await stream.next(); while (change.comment) change = await stream.next();
    assert.equal(change.frame?.type, 'change'); assert.ok(change.id?.includes(':'));
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 1);
    stream.close(); await until(() => s.runtime.events.subscriberCount === 0);
    assert.equal(s.runtime.snapshot().queue.workerStatus, 'running');
    s.port.finish(0); await s.runtime.queue.whenIdle();
    assert.equal(s.runtime.snapshot().queue.batch?.summary?.success, 1);
    stream = await connectSse(base); assert.equal((await stream.next()).frame?.type, 'ready');
    stream.close(); await until(() => s.runtime.events.subscriberCount === 0);
  } finally { stream?.close(); await s.cleanup(); }
});
test('Last-Event-ID reproduce historia disponible y solicita reset si el cursor quedó fuera', async () => {
  const s = await setupApi({ eventCapacity: 2, heartbeatMs: 1000 });
  let stream: Awaited<ReturnType<typeof connectSse>> | undefined;
  try {
    const base = await s.app.listen({ host: '127.0.0.1', port: 0 });
    const initial = s.runtime.events.stamp();
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    stream = await connectSse(base, `${initial.streamId}:${initial.revision}`);
    assert.equal((await stream.next()).frame?.type, 'ready');
    assert.equal((await stream.next()).frame?.type, 'change');
    stream.close(); await until(() => s.runtime.events.subscriberCount === 0);
    for (let i = 0; i < 4; i++) await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    stream = await connectSse(base, `${initial.streamId}:${initial.revision}`);
    assert.equal((await stream.next()).frame?.type, 'ready');
    assert.equal((await stream.next()).frame?.type, 'reset');
    stream.close(); await until(() => s.runtime.events.subscriberCount === 0);
    stream = await connectSse(base, 'old-epoch:999');
    assert.equal((await stream.next()).frame?.type, 'ready');
    assert.equal((await stream.next()).frame?.type, 'reset');
  } finally { stream?.close(); await s.cleanup(); }
});
test('límite de bytes del historial emite reset y no impide obtener snapshot completo', async () => {
  const s = await setupApi({ eventMaxBytes: 128 });
  const frames: StreamFrame[] = [];
  let off: (() => void) | undefined;
  try {
    off = s.runtime.events.subscribe(frame => frames.push(frame));
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    assert.ok(frames.some(frame => frame.type === 'reset'));
    assert.equal((await s.app.inject('/queue')).json().videos.length, 1);
  } finally { off?.(); await s.cleanup(); }
});

test('un snapshot grande usa reset sin saturar ni desconectar el stream del cliente', async () => {
  const s = await setupApi({ heartbeatMs: 20 });
  let stream: Awaited<ReturnType<typeof connectSse>> | undefined;
  try {
    const base = await s.app.listen({ host: '127.0.0.1', port: 0 });
    stream = await connectSse(base); await stream.next();
    await s.app.inject({ method: 'POST', url: '/videos', payload: { url: 'https://youtu.be/AbC_123-xyz' } });
    await s.app.inject({ method: 'POST', url: '/queue/start' }); await until(() => s.port.calls.length === 1);
    const outcome = resultFor(s.port.calls[0]!.request, 'partial');
    assert.equal(outcome.kind, 'result');
    const result = JSON.parse(outcome.resultJson);
    result.follow_up.extraction_gaps[0].reason = 'Contenido de revisión '.repeat(6000);
    s.port.calls[0]!.resolve({ ...outcome, resultJson: JSON.stringify(result) });
    await s.runtime.queue.whenIdle();
    let frame = await stream.next();
    while (frame.frame?.type !== 'reset') frame = await stream.next();
    assert.equal(s.runtime.events.subscriberCount, 1);
    let heartbeat = await stream.next(); while (!heartbeat.comment) heartbeat = await stream.next();
    assert.equal((await s.app.inject('/queue')).json().queue.batch.summary.partial, 1);
  } finally { stream?.close(); await s.cleanup(); }
});

test('reproducir muchas revisiones pequeñas no desconecta al cliente por backpressure', async () => {
  const s = await setupApi({ heartbeatMs: 20 });
  let stream: Awaited<ReturnType<typeof connectSse>> | undefined;
  try {
    const initial = s.runtime.events.stamp();
    for (let i = 0; i < 40; i++) await s.app.inject({ method: 'POST', url: '/videos', payload: { url: `https://youtu.be/Test${String(i).padStart(7, '0')}` } });
    const head = s.runtime.events.stamp();
    const base = await s.app.listen({ host: '127.0.0.1', port: 0 });
    stream = await connectSse(base, `${initial.streamId}:${initial.revision}`);
    assert.equal((await stream.next()).frame?.type, 'ready');
    let caughtUp = false;
    while (!caughtUp) {
      const { frame } = await stream.next();
      caughtUp = frame?.type === 'reset' ? frame.revision === head.revision : frame?.type === 'change' && frame.snapshot.revision === head.revision;
    }
    assert.equal(s.runtime.events.subscriberCount, 1);
    let heartbeat = await stream.next(); while (!heartbeat.comment) heartbeat = await stream.next();
    assert.equal((await s.app.inject('/queue')).json().videos.length, 40);
  } finally { stream?.close(); await s.cleanup(); }
});
