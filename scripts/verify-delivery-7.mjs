import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),logDir=path.join(root,'.cache/delivery-7');await mkdir(logDir,{recursive:true});
process.env.PATH=[path.dirname(process.execPath),path.join(root,'.tools/pnpm/node_modules/.bin'),process.env.PATH].join(path.delimiter);
const pnpm=path.join(root,'.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs'),results=[];
async function run(name,args,command,extraEnv={}){const started=Date.now();const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,...extraEnv},shell:false,windowsHide:true});const chunks=[];child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>chunks.push(c));const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});const output=Buffer.concat(chunks).toString('utf8');await writeFile(path.join(logDir,name+'.log'),output);results.push({command,exit_code:code,milliseconds:Date.now()-started});console.log(`${name}: exit ${code}`);if(code!==0){console.error(output);throw new Error(name+' failed');}return output;}
await run('install-frozen',[pnpm,'install','--frozen-lockfile','--offline'],'pnpm install --frozen-lockfile --offline');
const tests=await run('test',[pnpm,'test'],'pnpm test');
for(const name of ['typecheck','build'])await run(name,[pnpm,name],'pnpm '+name);
await run('e2e-unified',['tests/e2e/journey.mjs'],'SAVEDEX_E2E_UNIFIED=1 node tests/e2e/journey.mjs',{SAVEDEX_E2E_UNIFIED:'1',SAVEDEX_E2E_DELIVERY:'delivery-7'});
await run('single-start',['scripts/smoke-start.mjs'],'node scripts/smoke-start.mjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const screenshots=path.join(root,'docs/evidence/delivery-7');
const report={verified_at:new Date().toISOString(),node:process.version,platform:process.platform,results,tests:{total:Number(tests.match(/# tests (\d+)/)?.[1]),passed:Number(tests.match(/# pass (\d+)/)?.[1]),failed:Number(tests.match(/# fail (\d+)/)?.[1])},browser:JSON.parse(await readFile(path.join(root,'docs/delivery-7-browser.json'),'utf8')),lockfile_sha256:hash(await readFile(path.join(root,'pnpm-lock.yaml'))),demo_sha256:hash(await readFile(path.join(root,'docs/demo/savedex.gif'))),screenshots_sha256:Object.fromEntries(await Promise.all((await readdir(screenshots)).filter(n=>n.endsWith('.png')).map(async n=>[n,hash(await readFile(path.join(screenshots,n)))])))};
await writeFile(path.join(root,'docs/delivery-7-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(`Delivery 7 automated verification: ${report.tests.passed}/${report.tests.total}, ${report.browser.checks.length} browser checks. Real acceptance is separate.`);
