import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const [scenario, marker, ...args] = process.argv.slice(2);
if (scenario === 'descendant') {
  writeFileSync(marker, JSON.stringify({ descendant: process.pid }));
  setInterval(() => {}, 1000);
} else {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk.toString('utf8');
  const request = JSON.parse(raw);
  writeFileSync(marker, JSON.stringify({ pid: process.pid, request, args, stdinClosed: true }));
  const step = (name, extra = {}) => JSON.stringify({ event: 'step', step: name, ts: '2026-11-11T16:00:00Z', ...extra }) + '\n';
  async function write(stream, data) { if (!stream.write(data)) await once(stream, 'drain'); }
  if (['hang-tree', 'orphan-tree', 'hang'].includes(scenario)) {
    process.stderr.write(step('start'));
    if (scenario !== 'hang') {
      const descendant = spawn(process.execPath, [fileURLToPath(import.meta.url), 'descendant', marker + '.child'], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
      await new Promise((resolve, reject) => { descendant.once('spawn', resolve); descendant.once('error', reject); });
      while (true) { try { JSON.parse(readFileSync(marker + '.child', 'utf8')); break; } catch { await new Promise(r => setTimeout(r, 5)); } }
      if (scenario === 'orphan-tree') process.exit(0);
    }
    setInterval(() => {}, 1000);
  } else if (scenario === 'empty-error') process.exit(1);
  else if (scenario === 'invalid-json') { process.stdout.write('{bad'); process.exitCode = 0; }
  else if (scenario === 'multiple-json') { process.stdout.write('{}\n{}'); }
  else if (scenario === 'oversized') { for (let i = 0; i < 256; i++) await write(process.stdout, 'X'.repeat(8192)); }
  else {
    const name = scenario === 'partial' || scenario === 'partial-hang' || (scenario === 'by-url' && request.url.includes('AbC_')) ? 'partial' : scenario === 'error' ? 'error' : 'success';
    const result = JSON.parse(readFileSync(new URL(`./extractor/${name}.json`, import.meta.url), 'utf8'));
    result.request_id = scenario === 'wrong-id' ? 'another_run' : request.request_id;
    result.source.input_url = request.url;
    result.source.canonical_url = request.url;
    result.source.platform = 'youtube';
    result.source.post_id = new URL(request.url).searchParams.get('v');
    result.request_context.output_language = request.output_language;
    result.items[0] && (result.items[0].title = 'Árbol — vídeo útil');
    process.stderr.write(step('start'));
    if (scenario === 'fragmented') {
      const buffer = Buffer.from(step('description') + 'diagnóstico ñ\n' + step('ocr') + step('ocr') + step('validation'));
      for (const byte of buffer) { await write(process.stderr, Buffer.from([byte])); }
    }
    if (scenario === 'noisy') {
      for (let i = 0; i < 60; i++) await write(process.stderr, 'ñ'.repeat(4096));
      process.stderr.write('\n' + JSON.stringify({ event: 'step', step: 'invented', ts: 'nonsense' }) + '\n' + step('ocr'));
    }
    if (scenario !== 'no-finish' && scenario !== 'partial-hang') process.stderr.write(step('finish', { status: name, exit_code: name === 'partial' ? 2 : name === 'error' ? 65 : 0 }).trimEnd());
    if (scenario === 'invalid-utf8') {
      const encoded = Buffer.from(JSON.stringify(result));
      const at = encoded.indexOf(Buffer.from('Árbol'));
      encoded[at] = 0xff;
      process.stdout.write(encoded);
    } else if (scenario === 'bom') process.stdout.write(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(result))]));
    else process.stdout.write(JSON.stringify(result));
    process.exitCode = scenario === 'exit-mismatch' ? 2 : name === 'partial' ? 2 : name === 'error' ? 65 : 0;
    if (scenario === 'partial-hang') setInterval(() => {}, 1000);
  }
}
