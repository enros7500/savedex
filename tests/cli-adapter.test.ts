import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CliAdapter, type CliAdapterOptions } from '../apps/api/src/extractor/adapter.js';
import { loadConfig } from '../apps/api/src/config.js';
import type { ExtractRequest, ProgressEvent } from '../packages/contracts/src/extractor.js';

const request: ExtractRequest = { schema_version: '3.0.0', request_id: 'adapter_synthetic', url: 'https://www.youtube.com/watch?v=AbC_123-xyz', output_language: 'es', instructions: 'Únicamente nombres; & echo NO_EJECUTAR $(literal) "comillas"' };
function setup(scenario: string, overrides: Partial<CliAdapterOptions> = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-cli-'));
  const marker = path.join(directory, 'request.json');
  const events: ProgressEvent[] = [];
  const adapter = new CliAdapter({ executable: process.execPath,
    argsPrefix: [fileURLToPath(new URL('./fixtures/fake-extractor.mjs', import.meta.url)), scenario, marker],
    modelDir: path.join(directory, 'model & literal'), workDir: path.join(directory, 'work $ literal'),
    timeoutSeconds: 15, exitGraceSeconds: 2,
    onProgress: (id, event) => { assert.equal(id, request.request_id); events.push(event); }, ...overrides });
  return { adapter, directory, marker, events, cleanup() { rmSync(directory, { recursive: true, force: true }); } };
}
async function until(condition: () => boolean, milliseconds = 5000) {
  const deadline = Date.now() + milliseconds;
  while (!condition()) { if (Date.now() > deadline) throw new Error('No se observó el proceso esperado'); await new Promise(r => setTimeout(r, 10)); }
}
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

test('configuración resuelve rutas desde raíz, fija 900+20 y no descarga recursos', () => {
  const root = path.join(os.tmpdir(), 'savedex-config');
  const config = loadConfig({}, root);
  assert.equal(config.extractor.timeoutSeconds, 900);
  assert.equal(config.extractor.exitGraceSeconds, 20);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.extractor.workDir, path.join(root, 'data', 'extractor-work'));
  const custom = loadConfig({ SAVEDEX_EXTRACTOR_TIMEOUT_SECONDS: '30', SAVEDEX_EXTRACTOR_EXIT_GRACE_SECONDS: '5', SAVEDEX_EXTRACTOR_EXE: './cli.exe' }, root);
  assert.equal(custom.extractor.executable, path.join(root, 'cli.exe'));
  assert.equal(custom.extractor.timeoutSeconds, 30);
});
test('configuración rechaza lanzadores shell, presupuestos inválidos y exposición de red', () => {
  for (const env of [{ SAVEDEX_EXTRACTOR_EXE: 'cli.cmd' }, { SAVEDEX_EXTRACTOR_EXE: 'cli.bat' }, { SAVEDEX_EXTRACTOR_TIMEOUT_SECONDS: 'NaN' }, { SAVEDEX_EXTRACTOR_TIMEOUT_SECONDS: '0' }, { SAVEDEX_EXTRACTOR_TIMEOUT_SECONDS: '90000' }, { SAVEDEX_EXTRACTOR_EXIT_GRACE_SECONDS: '-1' }, { HOST: '0.0.0.0' }]) assert.throws(() => loadConfig(env));
});
test('los límites de buffers deben ser bytes enteros positivos', () => {
  for (const key of ['maxStdoutBytes', 'maxStderrBytes', 'maxProgressLineBytes']) {
    assert.throws(() => new CliAdapter({ executable: process.execPath, modelDir: os.tmpdir(), workDir: os.tmpdir(), [key]: 0.5 }));
  }
});
test('quoting nativo conserva comillas, espacios y barra final en un argumento literal', { timeout: 20000 }, async () => {
  const literal = 'C:\\ruta ficticia\\modelo "literal"\\';
  const s = setup('success', { modelDir: literal });
  try {
    assert.equal((await s.adapter.run(request, 'normal')).kind, 'result');
    const observed = JSON.parse(readFileSync(s.marker, 'utf8'));
    assert.equal(observed.args[observed.args.indexOf('--model-dir') + 1], literal);
  } finally { s.cleanup(); }
});
for (const name of ['success', 'partial', 'error']) test(`subproceso ${name}: stdin cerrado, argumentos literales, UTF-8 y salida coherente`, { timeout: 20000 }, async () => {
  const s = setup(name);
  try {
    const outcome = await s.adapter.run(request, 'exhaustive');
    assert.equal(outcome.kind, 'result');
    assert.equal(outcome.exitCode, name === 'success' ? 0 : name === 'partial' ? 2 : 65);
    if (outcome.kind === 'result') {
      const result = JSON.parse(outcome.resultJson);
      assert.equal(result.status, name);
      if (name !== 'error') assert.equal(result.items[0].title, 'Árbol — vídeo útil');
    }
    const observed = JSON.parse(readFileSync(s.marker, 'utf8'));
    assert.deepEqual(observed.request, request);
    assert.equal(observed.stdinClosed, true);
    assert.ok(observed.args.includes('--exhaustive'));
    assert.deepEqual(observed.args.slice(0, 5), ['extract', '--request', '-', '--progress', 'jsonl']);
    assert.ok(observed.args.includes(path.join(s.directory, 'work $ literal')));
    assert.ok(s.events.some(e => e.step === 'finish'));
  } finally { s.cleanup(); }
});
test('reconstruye JSONL fragmentado, conserva pasos repetidos y línea final sin newline', { timeout: 20000 }, async () => {
  const s = setup('fragmented');
  try {
    const result = await s.adapter.run(request, 'normal');
    assert.equal(result.kind, 'result');
    assert.deepEqual(s.events.map(e => e.step), ['start', 'description', 'ocr', 'ocr', 'validation', 'finish']);
    assert.ok(result.stderr?.includes('diagnóstico ñ'));
    assert.ok(!result.stderr?.includes('\uFFFD'));
    const observed = JSON.parse(readFileSync(s.marker, 'utf8'));
    assert.ok(!observed.args.includes('--exhaustive'));
  } finally { s.cleanup(); }
});
test('diagnóstico muy extenso no impide eventos posteriores y se limita por bytes', { timeout: 20000 }, async () => {
  const s = setup('noisy', { maxStderrBytes: 1024, maxProgressLineBytes: 512 });
  try {
    const result = await s.adapter.run(request, 'normal');
    assert.equal(result.kind, 'result');
    assert.ok(Buffer.byteLength(result.stderr ?? '', 'utf8') <= 1024);
    assert.ok(!result.stderr?.includes('\uFFFD'));
    assert.deepEqual(s.events.map(e => e.step), ['start', 'ocr', 'finish']);
  } finally { s.cleanup(); }
});
for (const scenario of ['invalid-json', 'multiple-json', 'invalid-utf8', 'wrong-id', 'exit-mismatch']) test(`clasifica ${scenario} como protocolo inválido`, { timeout: 20000 }, async () => {
  const s = setup(scenario);
  try { assert.equal((await s.adapter.run(request, 'normal')).kind, 'protocol_error'); }
  finally { s.cleanup(); }
});
test('no elimina un prefijo BOM para convertir stdout ajeno en JSON válido', { timeout: 20000 }, async () => {
  const s = setup('bom');
  try { assert.equal((await s.adapter.run(request, 'normal')).kind, 'protocol_error'); }
  finally { s.cleanup(); }
});
test('watchdog no acepta un partial emitido por un proceso que sigue sin terminar', { timeout: 20000 }, async () => {
  const s = setup('partial-hang', { timeoutSeconds: 1, exitGraceSeconds: 3 });
  try {
    const outcome = await s.adapter.run(request, 'normal');
    assert.equal(outcome.kind, 'timeout');
    assert.ok(!s.events.some(e => e.step === 'finish'));
  } finally { s.cleanup(); }
});
test('finish ausente no invalida un resultado correcto', { timeout: 20000 }, async () => {
  const s = setup('no-finish');
  try { assert.equal((await s.adapter.run(request, 'normal')).kind, 'result'); assert.deepEqual(s.events.map(e => e.step), ['start']); }
  finally { s.cleanup(); }
});
test('stdout excesivo se interrumpe y no se acepta como resultado ni timeout', { timeout: 20000 }, async () => {
  const s = setup('oversized', { maxStdoutBytes: 1024 });
  try {
    const result = await s.adapter.run(request, 'normal');
    assert.equal(result.kind, 'protocol_error');
    assert.match(result.message, /stdout|salida|límite/i);
    const observed = JSON.parse(readFileSync(s.marker, 'utf8'));
    await until(() => !alive(observed.pid));
  } finally { s.cleanup(); }
});
test('ejecutable ausente y terminación sin JSON son fallos de proceso', { timeout: 20000 }, async () => {
  const s = setup('empty-error');
  try {
    assert.equal((await s.adapter.run(request, 'normal')).kind, 'process_error');
    const missing = new CliAdapter({ executable: path.join(s.directory, 'missing.exe'), modelDir: s.directory, workDir: s.directory, timeoutSeconds: 5, exitGraceSeconds: 1 });
    assert.equal((await missing.run(request, 'normal')).kind, 'process_error');
  } finally { s.cleanup(); }
});
for (const scenario of ['hang', 'hang-tree']) test(`watchdog termina ${scenario} y sus descendientes sin finish`, { timeout: 20000 }, async () => {
  const s = setup(scenario, { timeoutSeconds: 1, exitGraceSeconds: 3 });
  try {
    const result = await s.adapter.run(request, 'normal');
    assert.equal(result.kind, 'timeout');
    assert.ok(!s.events.some(e => e.step === 'finish'));
    const observed = JSON.parse(readFileSync(s.marker, 'utf8'));
    await until(() => !alive(observed.pid));
    if (scenario === 'hang-tree') {
      const child = JSON.parse(readFileSync(s.marker + '.child', 'utf8'));
      await until(() => !alive(child.descendant));
    }
  } finally { s.cleanup(); }
});
test('limpia descendiente que retiene stderr después de salir su padre', { timeout: 20000 }, async () => {
  const s = setup('orphan-tree');
  try {
    const result = await s.adapter.run(request, 'normal');
    assert.equal(result.kind, 'protocol_error');
    const child = JSON.parse(readFileSync(s.marker + '.child', 'utf8'));
    await until(() => !alive(child.descendant));
  } finally { s.cleanup(); }
});
test('un listener de progreso que lanza no rompe el protocolo del hijo', { timeout: 20000 }, async () => {
  const s = setup('fragmented', { onProgress() { throw new Error('UI desconectada'); } });
  try { assert.equal((await s.adapter.run(request, 'normal')).kind, 'result'); }
  finally { s.cleanup(); }
});
test('la caída del backend de prueba elimina el árbol del CLI, sin PID heredados vivos', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'savedex-cli-owner-'));
  const marker = path.join(directory, 'request.json');
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/adapter-owner.ts', marker], { cwd: process.cwd(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr!.on('data', c => { stderr += c.toString(); });
  try {
    await until(() => existsSync(marker + '.child'), 12000);
    const cli = JSON.parse(readFileSync(marker, 'utf8')), descendant = JSON.parse(readFileSync(marker + '.child', 'utf8'));
    const exited = once(child, 'exit'); child.kill(); await exited;
    await until(() => !alive(cli.pid) && !alive(descendant.descendant), 5000);
  } catch (error) { throw new Error(String(error) + '\n' + stderr); }
  finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    rmSync(directory, { recursive: true, force: true });
  }
});
