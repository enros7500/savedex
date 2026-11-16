import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { browser, until } from '../tests/e2e/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:3210';
const get = async route => { const r = await fetch(origin + route); assert.equal(r.status, 200); return r; };
const before = await (await get('/api/queue')).json();
assert.equal(before.queue.workerStatus, 'idle');
const run = before.runs.find(r => r.errorMessage?.includes('supera el límite de 5 minutos'));
assert.ok(run, 'existing real duration failure must expose its actual cause');
const original = await (await get(`/api/runs/${run.id}/result`)).text();
assert.match(original, /Local extraction could not produce an evidence-backed result/);
const out = path.join(root, 'docs/evidence/error-feedback');
await mkdir(out, { recursive: true });
const b = await browser();
try {
  await b.send('Page.navigate', { url: origin + '/add' });
  await b.waitText('Límite: 5 minutos por vídeo.');
  assert.ok(await b.evaluate('!!document.querySelector("#url")'));
  await b.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 960, deviceScaleFactor: 1, mobile: false });
  assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'warning fits mobile width');
  await writeFile(path.join(out, 'add-limit-320.png'), Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  await b.send('Page.navigate', { url: origin + '/processing' });
  await b.waitText('El vídeo supera el límite de 5 minutos.');
  await b.waitText('Los vídeos más largos no se procesan.');
  await writeFile(path.join(out, 'processing-real-error.png'), Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await b.send('Page.navigate', { url: origin + `/library?video=${run.videoId}` });
  await b.waitText('El vídeo supera el límite de 5 minutos.');
  await b.click('[data-action="history"]');
  await b.waitText('Historial de extracciones');
  await until(() => b.evaluate('document.querySelector(".history").innerText.includes("supera el límite de 5 minutos")'), 'history response loaded');
  assert.deepEqual(b.errors, []);
  const after = await (await get('/api/queue')).json();
  assert.equal(after.runs.length, before.runs.length);
  assert.equal(after.queue.workerStatus, 'idle');
  assert.equal(await (await get(`/api/runs/${run.id}/result`)).text(), original);
  const report = { verified_at: new Date().toISOString(), data: 'existing real failed run; no new extraction', run_id: run.id,
    message: run.errorMessage, warning_visible_before_start: true, mobile_width: 320,
    processing_library_history_show_cause: true, original_unchanged: true, original_sha256: createHash('sha256').update(original).digest('hex'),
    no_new_runs: true, browser_exceptions: b.errors };
  await writeFile(path.join(root, 'docs/error-feedback-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await b.close(); }
