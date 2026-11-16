import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const pnpm = path.join(root, '.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs');
const logDir = path.join(root, '.cache/delivery-1');
await mkdir(logDir, { recursive: true });
process.env.PATH = [path.dirname(process.execPath), path.join(root, '.tools/pnpm/node_modules/.bin'), process.env.PATH].join(path.delimiter);
const results = [];
async function run(name, args) {
  const started = Date.now();
  const child = spawn(process.execPath, [pnpm, ...args], { cwd: root, shell: false, windowsHide: true });
  const chunks = [];
  child.stdout.on('data', c => chunks.push(c));
  child.stderr.on('data', c => chunks.push(c));
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  const output = Buffer.concat(chunks).toString('utf8');
  await writeFile(path.join(logDir, name + '.log'), output);
  console.log(`${name}: exit ${code}`);
  results.push({ command: `pnpm ${args.join(' ')}`, exit_code: code, milliseconds: Date.now() - started });
  if (code !== 0) { console.error(output); throw new Error(`${name} failed`); }
}
const generatedFile = path.join(root, 'packages/contracts/src/extractor.generated.ts');
const before = await readFile(generatedFile);
await run('contracts-generate', ['contracts:generate']);
if (!before.equals(await readFile(generatedFile))) throw new Error('Contract generation is not reproducible');
for (const command of ['test', 'typecheck', 'build', 'extractor:verify']) await run(command.replace(':', '-'), [command]);
const report = {
  verified_at: new Date().toISOString(), platform: process.platform, arch: process.arch,
  node: process.version, pnpm: '10.6.3', results,
  contract_generation_reproducible: true,
  lockfile_sha256: createHash('sha256').update(await readFile(path.join(root, 'pnpm-lock.yaml'))).digest('hex'),
};
await writeFile(path.join(root, 'docs/delivery-1-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Delivery 1 checks passed. Logs: .cache/delivery-1');
