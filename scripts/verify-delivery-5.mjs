import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), logDir = path.join(root, '.cache/delivery-5');
await mkdir(logDir, { recursive: true });
process.env.PATH = [path.dirname(process.execPath), path.join(root, '.tools/pnpm/node_modules/.bin'), process.env.PATH].join(path.delimiter);
const pnpm = path.join(root, '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs');
const results = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function run(name, args, command) {
  const start = Date.now(), child = spawn(process.execPath, args, { cwd: root, shell: false, windowsHide: true });
  const chunks = [];
  child.stdout.on('data', c => chunks.push(c)); child.stderr.on('data', c => chunks.push(c));
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  const output = Buffer.concat(chunks).toString('utf8');
  await writeFile(path.join(logDir, name + '.log'), output);
  results.push({ command, exit_code: code, milliseconds: Date.now() - start }); console.log(`${name}: exit ${code}`);
  if (code !== 0) { console.error(output); throw new Error(`${name} failed`); }
  return output;
}
await run('install-frozen', [pnpm, 'install', '--frozen-lockfile', '--offline'], 'pnpm install --frozen-lockfile --offline');
const testOutput = await run('test', [pnpm, 'test'], 'pnpm test');
for (const name of ['typecheck', 'build']) await run(name, [pnpm, name], `pnpm ${name}`);
await run('compiled-api-smoke', ['scripts/smoke-api.mjs'], 'node scripts/smoke-api.mjs');
await run('native-browser-smoke', ['scripts/smoke-browser-sse.mjs'], 'node scripts/smoke-browser-sse.mjs');
const previous = JSON.parse(await readFile(path.join(root, 'docs/delivery-5-checks.json'), 'utf8').catch(() => 'null'));
const red = {};
for (const name of ['red', 'red-shutdown', 'red-drain', 'red-recovery', 'red-backpressure', 'red-action-body', 'red-replay-flow']) {
  try { const log = await readFile(path.join(logDir, name + '.log'), 'utf8'); red[name] = { tests: Number(log.match(/# tests (\d+)/)?.[1]), failed: Number(log.match(/# fail (\d+)/)?.[1]), log_sha256: hash(log) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; red[name] = previous?.initial_red?.[name] ?? null; }
}
const report = { verified_at: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, results,
  tests: { total: Number(testOutput.match(/# tests (\d+)/)?.[1]), passed: Number(testOutput.match(/# pass (\d+)/)?.[1]), failed: Number(testOutput.match(/# fail (\d+)/)?.[1]) },
  initial_red: red, database_schema_version: 2,
  lockfile_sha256: hash(await readFile(path.join(root, 'pnpm-lock.yaml'))),
  migrations_sha256: Object.fromEntries(await Promise.all(['001-initial.sql', '002-events.sql'].map(async name => [name, hash(await readFile(path.join(root, 'apps/api/src/db/migrations', name)))]))),
  events_contract_sha256: hash(await readFile(path.join(root, 'packages/contracts/src/events.ts'))),
};
await writeFile(path.join(root, 'docs/delivery-5-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Delivery 5 checks passed. Logs: .cache/delivery-5');
