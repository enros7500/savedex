import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/dist/config.js';
import { CliAdapter } from '../apps/api/dist/extractor/adapter.js';
import { executeCli } from '../apps/api/dist/extractor/process.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const childRoot = path.resolve(root, '../savedex-extractor');
const out = path.join(root, '.cache/delivery-4/real-cli');
await mkdir(out, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fingerprint() {
  const found = {};
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== '__pycache__') await walk(file);
      else if (entry.isFile() && /\.(py|json)$/.test(entry.name)) found[path.relative(childRoot, file).replaceAll('\\', '/')] = hash(await readFile(file));
    }
  }
  await walk(path.join(childRoot, 'src'));
  found['pyproject.toml'] = hash(await readFile(path.join(childRoot, 'pyproject.toml')));
  return found;
}
const before = await fingerprint();
for (const name of ['request', 'result']) assert.equal(hash(await readFile(path.join(root, `packages/contracts/schemas/${name}.json`))), before[`src/savedex_extractor/schemas/${name}.json`]);
const config = loadConfig({ SAVEDEX_EXTRACTOR_WORK_DIR: out }, root);
async function inspect(name, args) {
  const response = await executeCli(config.extractor, args);
  assert.equal(response.termination, 'completed', response.message ?? response.stderr);
  const parsed = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(response.stdout));
  await writeFile(path.join(out, name + '.stdout.json'), response.stdout);
  await writeFile(path.join(out, name + '.stderr.txt'), response.stderr);
  return { exit_code: response.exitCode, result: parsed };
}
const version = await inspect('version', ['--version', '--json']);
assert.equal(version.exit_code, 0);
assert.ok(version.result.supported_content_schema_versions.includes('3.0.0'));
const doctor = await inspect('doctor', ['doctor', '--json', '--model-dir', config.extractor.modelDir, '--work-dir', out]);
assert.ok([0, 69].includes(doctor.exit_code));
// A missing synthetic model directory stops the real CLI before media/network/lock activity.
const events = [];
const adapter = new CliAdapter({ ...config.extractor, modelDir: path.join(out, 'absent-model-' + randomUUID()), onProgress: (_id, event) => events.push(event) });
const request = { schema_version: '3.0.0', request_id: 'savedex_delivery4_controlled', url: 'https://www.youtube.com/watch?v=AbC_123-xyz', output_language: 'es', task: 'extract' };
const outcome = await adapter.run(request, 'exhaustive');
assert.equal(outcome.kind, 'result');
assert.equal(outcome.exitCode, 69);
const result = JSON.parse(outcome.resultJson);
assert.equal(result.status, 'error');
assert.equal(result.request_id, request.request_id);
assert.equal(result.request_context.output_language, 'es');
assert.equal(result.items.length, 0);
assert.deepEqual(events.map(e => e.step), ['start', 'finish']);
await writeFile(path.join(out, 'controlled.result.json'), outcome.resultJson);
await writeFile(path.join(out, 'controlled.stderr.txt'), outcome.stderr ?? '');
assert.deepEqual(await fingerprint(), before, 'Extractor source changed during smoke');
const report = { verified_at: new Date().toISOString(), execution: 'compiled adapter + Windows supervisor + existing real CLI',
  version, doctor, controlled_invocation: { mode: 'exhaustive', expected_resource_failure: true,
    reason: 'deliberately absent synthetic model directory; no network/media processing', kind: outcome.kind,
    exit_code: outcome.exitCode, status: result.status, item_count: result.items.length,
    output_language: result.request_context.output_language, steps: events.map(e => e.step), stdout_single_json: true },
  extractor_source_unchanged: true, source_sha256: before,
  executable_sha256: hash(await readFile(config.extractor.executable)),
};
await writeFile(path.join(root, 'docs/delivery-4-real-cli.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, source_sha256: '(recorded in docs/delivery-4-real-cli.json)' }, null, 2));
