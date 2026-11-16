import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { CliAdapter } from '../apps/api/dist/extractor/adapter.js';
import { SnapshotSynchronizer } from '../packages/contracts/dist/events.js';
const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-api-compiled-'));
const config = loadConfig({ SAVEDEX_DATABASE: path.join(directory, 'savedex.sqlite') });
const options = { config, heartbeatMs: 100,
  extractorFactory: onProgress => new CliAdapter({ executable: process.execPath,
    argsPrefix: [fileURLToPath(new URL('../tests/fixtures/fake-extractor.mjs', import.meta.url)), 'by-url', path.join(directory, 'request.json')],
    modelDir: directory, workDir: directory, timeoutSeconds: 15, exitGraceSeconds: 2, onProgress }) };
let application = await createApplication(options), base = await application.app.listen({ host: '127.0.0.1', port: 0 });
let latest, captured, release, firstLoad = true, cursor, frames = 0, controls = 0, loadCount = 0;
const requests = [];
async function json(url, method = 'GET', payload) {
  const response = await fetch(base + url, { method, ...(payload !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
  assert.ok(response.ok, `${method} ${url}: ${response.status}`);
  return response.json();
}
async function until(condition, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!condition()) { if (Date.now() > deadline) throw new Error('API smoke checkpoint timeout'); await new Promise(r => setTimeout(r, 10)); }
}
const client = new SnapshotSynchronizer({
  subscribe(onFrame, disconnected) {
    const controller = new AbortController(); let closed = false;
    const task = (async () => {
      const response = await fetch(base + '/events', { signal: controller.signal, headers: cursor ? { 'Last-Event-ID': cursor } : {} });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (!closed) {
        const part = await reader.read(); if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const text = buffer.slice(0, at); buffer = buffer.slice(at + 2);
          const data = text.split('\n').find(line => line.startsWith('data: '))?.slice(6);
          if (!data) continue;
          const id = text.split('\n').find(line => line.startsWith('id: '))?.slice(4); if (id) cursor = id;
          const frame = JSON.parse(data); frames++; if (frame.type === 'reset') controls++;
          onFrame(frame);
        }
      }
    })().catch(error => { if (!closed) throw error; }).finally(() => { if (!closed) disconnected(); });
    requests.push(task.catch(error => { if (!closed) console.error(error.message); }));
    return () => { closed = true; controller.abort(); };
  },
  async loadSnapshot() {
    loadCount++; const snapshot = await json('/queue');
    if (firstLoad) { firstLoad = false; captured = snapshot; await new Promise(resolve => { release = resolve; }); }
    return snapshot;
  },
}, state => { latest = state; });
let serverProcess;
try {
  client.start(); await until(() => captured !== undefined);
  const a = await json('/videos', 'POST', { url: 'https://youtu.be/AbC_123-xyz' });
  const duplicate = await json('/videos', 'POST', { url: 'https://m.youtube.com/shorts/AbC_123-xyz' }); assert.equal(duplicate.created, false);
  await json('/videos', 'POST', { url: 'https://youtu.be/Other123456' });
  release(); await until(() => latest?.connection === 'connected' && !latest.syncing && latest.snapshot.videos.length === 2);
  assert.deepEqual(latest.snapshot, application.runtime.snapshot());
  const raceConverged = true;
  await json('/queue/start', 'POST');
  client.stop(); await until(() => application.runtime.events.subscriberCount === 0);
  await application.runtime.queue.whenIdle();
  const completed = application.runtime.snapshot();
  assert.equal(completed.queue.batch.summary.success, 1); assert.equal(completed.queue.batch.summary.partial, 1);
  const library = await json('/library'); assert.equal(library.library.totalItems, 7);
  const history = await json(`/videos/${a.video.id}/runs`); assert.equal(history.runs[0].state, 'partial');
  client.start(); await until(() => latest?.connection === 'connected' && !latest.syncing && latest.snapshot.revision === application.runtime.snapshot().revision);
  assert.deepEqual(latest.snapshot, application.runtime.snapshot());
  const old = latest.snapshot; client.stop(); await application.app.close();
  application = await createApplication(options); base = await application.app.listen({ host: '127.0.0.1', port: 0 });
  client.start(); await until(() => latest?.connection === 'connected' && !latest.syncing && latest.snapshot.streamId !== old.streamId);
  assert.ok(latest.snapshot.revision > old.revision); assert.deepEqual(latest.snapshot, application.runtime.snapshot());
  const restartConverged = true;
  client.stop(); await application.app.close();
  // Start the actual production entry point against this synthetic DB, without starting its queue.
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  serverProcess = spawn(process.execPath, ['apps/api/dist/server.js'], { cwd: fileURLToPath(new URL('../', import.meta.url)), shell: false, windowsHide: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SAVEDEX_DATABASE: config.database } });
  let startupError = ''; serverProcess.stderr.on('data', chunk => { startupError += chunk.toString(); });
  let started;
  await until(() => started !== undefined || serverProcess.exitCode !== null, 500).catch(() => {});
  const deadline = Date.now() + 5000;
  while (!started && Date.now() < deadline) {
    try { const response = await fetch(`http://127.0.0.1:${port}/queue`); if (response.ok) started = await response.json(); } catch {}
    if (!started) await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(started, startupError || 'Production entry did not start'); assert.equal(started.queue.active, null);
  assert.equal(started.queue.workerStatus, 'idle'); assert.equal(started.videos.length, 2);
  const exited = once(serverProcess, 'exit'); serverProcess.kill(); await exited;
  await Promise.all(requests);
  const report = { verified_at: new Date().toISOString(), execution: 'compiled API + native CLI adapter + synthetic subprocesses + real HTTP/SSE + shared synchronizer',
    bind_address: '127.0.0.1', snapshot_race_converged: raceConverged, reconnection_converged: true, restart_converged: restartConverged,
    revision_persisted: true, stream_changed_after_restart: true, sse_frames: frames, reset_frames: controls, snapshot_loads: loadCount,
    summary: completed.queue.batch.summary, library_items: library.library.totalItems,
    production_entry_http_status: 200, production_entry_did_not_autostart: true, schema_version: 2 };
  writeFileSync(new URL('../docs/delivery-5-api-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  release?.(); client.stop(); await application.app.close();
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) { const exited = once(serverProcess, 'exit'); serverProcess.kill(); await exited; }
  await Promise.all(requests); rmSync(directory, { recursive: true, force: true });
}
