import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { executeCli } from '../apps/api/dist/extractor/process.js';
const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!browser) throw new Error('No browser executable available for the native SSE smoke');
const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-browser-sse-'));
const config = loadConfig({ SAVEDEX_DATABASE: path.join(directory, 'savedex.sqlite') });
let resolveRun, request, acknowledged = false;
const { app, runtime } = await createApplication({ config, heartbeatMs: 100,
  extractor: { run(value) { request = value; return new Promise(resolve => { resolveRun = resolve; }); } } });
app.get('/native-browser', (_req, reply) => reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><body>CONNECTING<script>
const events = new EventSource('/events');
events.addEventListener('ready', async () => {
  try {
    await fetch('/videos', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://youtu.be/AbC_123-xyz'})});
    await fetch('/queue/start', {method:'POST'});
    events.close();
    await fetch('/native-browser-result', {method:'POST',headers:{'Content-Type':'application/json'},body:'{"closed":true}'});
    document.body.textContent='SSE_CLOSED';
  } catch(error) { document.body.textContent='ERROR: '+String(error); }
}, {once:true});
</script></body>`));
app.post('/native-browser-result', () => { acknowledged = true; return { ok: true }; });
async function until(condition) {
  const deadline = Date.now() + 5000;
  while (!condition()) { if (Date.now() > deadline) throw new Error('Browser smoke did not reach its checkpoint'); await new Promise(r => setTimeout(r, 10)); }
}
function finish() {
  if (!resolveRun || !request) return;
  const result = JSON.parse(readFileSync(new URL('../tests/fixtures/extractor/success.json', import.meta.url), 'utf8'));
  result.request_id = request.request_id; result.source.input_url = request.url; result.source.canonical_url = request.url; result.source.platform = 'youtube';
  resolveRun({ kind: 'result', resultJson: JSON.stringify(result), exitCode: 0 });
}
try {
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const raw = await executeCli({ executable: browser, modelDir: directory, workDir: directory, timeoutSeconds: 20, exitGraceSeconds: 5, maxStdoutBytes: 256 * 1024 }, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--user-data-dir=' + path.join(directory, 'browser-profile'), '--dump-dom', '--virtual-time-budget=5000', '--timeout=15000', base + '/native-browser',
  ]);
  writeFileSync(new URL('../.cache/delivery-5/browser-dom.html', import.meta.url), raw.stdout);
  writeFileSync(new URL('../.cache/delivery-5/browser-stderr.txt', import.meta.url), raw.stderr);
  assert.equal(raw.termination, 'completed', raw.stderr); assert.equal(raw.exitCode, 0, raw.stderr);
  assert.match(raw.stdout.toString('utf8'), /<body[^>]*>SSE_CLOSED<\/body>/);
  await until(() => acknowledged && runtime.events.subscriberCount === 0);
  assert.equal(runtime.snapshot().queue.workerStatus, 'running');
  assert.ok(runtime.snapshot().queue.active);
  finish(); await runtime.queue.whenIdle();
  assert.equal(runtime.snapshot().queue.batch.summary.success, 1);
  const report = { verified_at: new Date().toISOString(), browser: path.basename(browser), mode: 'native headless browser, isolated temporary profile',
    transport: 'browser EventSource', event_source_closed: true, subscribers_after_close: runtime.events.subscriberCount,
    worker_running_after_browser_disconnect: true, completed_after_disconnect: true, success: 1,
    data: 'synthetic fixture, no media processing' };
  writeFileSync(new URL('../docs/delivery-5-browser-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { finish(); await app.close(); rmSync(directory, { recursive: true, force: true }); }
