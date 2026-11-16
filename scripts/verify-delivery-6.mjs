import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),logDir=path.join(root,'.cache/delivery-6');await mkdir(logDir,{recursive:true});
process.env.PATH=[path.dirname(process.execPath),path.join(root,'.tools/pnpm/node_modules/.bin'),process.env.PATH].join(path.delimiter);
const pnpm=path.join(root,'.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs'),results=[];
async function run(name,args,command){const start=Date.now();const child=spawn(process.execPath,args,{cwd:root,shell:false,windowsHide:true});const chunks=[];child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>chunks.push(c));const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});const output=Buffer.concat(chunks).toString('utf8');await writeFile(path.join(logDir,name+'.log'),output);results.push({command,exit_code:code,milliseconds:Date.now()-start});console.log(`${name}: exit ${code}`);if(code!==0){console.error(output);throw new Error(name+' failed');}return output;}
await run('install-frozen',[pnpm,'install','--frozen-lockfile','--offline'],'pnpm install --frozen-lockfile --offline');
const tests=await run('test',[pnpm,'test'],'pnpm test');
for(const name of ['typecheck','build'])await run(name,[pnpm,name],'pnpm '+name);
await run('journey',['tests/e2e/journey.mjs'],'node tests/e2e/journey.mjs');
await run('web-dev',['scripts/smoke-web-dev.mjs'],'node scripts/smoke-web-dev.mjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const screenshotDirectory=path.join(root,'docs/evidence/delivery-6');
const report={verified_at:new Date().toISOString(),node:process.version,platform:process.platform,results,
  tests:{total:Number(tests.match(/# tests (\d+)/)?.[1]),passed:Number(tests.match(/# pass (\d+)/)?.[1]),failed:Number(tests.match(/# fail (\d+)/)?.[1])},
  browser:JSON.parse(await readFile(path.join(root,'docs/delivery-6-browser.json'),'utf8')),
  lockfile_sha256:hash(await readFile(path.join(root,'pnpm-lock.yaml'))),
  screenshots_sha256:Object.fromEntries(await Promise.all((await readdir(screenshotDirectory)).filter(n=>n.endsWith('.png')).map(async n=>[n,hash(await readFile(path.join(screenshotDirectory,n)))]))),
};
await writeFile(path.join(root,'docs/delivery-6-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(`Delivery 6: ${report.tests.passed}/${report.tests.total} tests, ${report.browser.checks.length} browser checks.`);
