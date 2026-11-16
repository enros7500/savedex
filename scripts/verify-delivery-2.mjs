import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const logDir = path.join(root, '.cache/delivery-2');
await mkdir(logDir, { recursive: true });
process.env.PATH = [path.dirname(process.execPath), path.join(root, '.tools/pnpm/node_modules/.bin'), process.env.PATH].join(path.delimiter);
const pnpm = path.join(root, '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs');
const results = [];
const hash = data => createHash('sha256').update(data).digest('hex');
async function run(name, args, command) {
  const started = Date.now();
  const child = spawn(process.execPath, args, { cwd: root, shell: false, windowsHide: true });
  const chunks = [];
  child.stdout.on('data', c => chunks.push(c)); child.stderr.on('data', c => chunks.push(c));
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  const output = Buffer.concat(chunks).toString('utf8');
  await writeFile(path.join(logDir, name + '.log'), output);
  console.log(`${name}: exit ${code}`);
  results.push({ command, exit_code: code, milliseconds: Date.now() - started });
  if (code !== 0) { console.error(output); throw new Error(`${name} failed`); }
  return output;
}
await run('install-frozen', [pnpm, 'install', '--frozen-lockfile', '--offline'], 'pnpm install --frozen-lockfile --offline');
const testOutput = await run('test', [pnpm, 'test'], 'pnpm test');
for (const name of ['typecheck', 'build']) await run(name, [pnpm, name], `pnpm ${name}`);
await run('compiled-smoke', ['scripts/smoke-persistence.mjs'], 'node scripts/smoke-persistence.mjs');
const redLog = await readFile(path.join(logDir, 'red.log'), 'utf8');
const report = { verified_at: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  results, tests: { total: Number(testOutput.match(/# tests (\d+)/)?.[1]), passed: Number(testOutput.match(/# pass (\d+)/)?.[1]), failed: Number(testOutput.match(/# fail (\d+)/)?.[1]) },
  initial_red: { tests: Number(redLog.match(/# tests (\d+)/)?.[1]), failed: Number(redLog.match(/# fail (\d+)/)?.[1]), log_sha256: hash(redLog) },
  lockfile_sha256: hash(await readFile(path.join(root, 'pnpm-lock.yaml'))),
  migration_sha256: hash(await readFile(path.join(root, 'apps/api/src/db/migrations/001-initial.sql'))),
};
await writeFile(path.join(root, 'docs/delivery-2-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Delivery 2 checks passed. Logs: .cache/delivery-2');
