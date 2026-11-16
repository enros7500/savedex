import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig } from '../apps/api/dist/config.js';
const root=path.resolve(import.meta.dirname,'..');
const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-web-dev-'));
const {app}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'db.sqlite')}),extractor:{async run(){throw new Error('Read-only smoke must never extract');}}});
let child;let output='';
try{
  await app.listen({port:3210,host:'127.0.0.1'});
  // Use the same owned Windows Job Object as extractor tests; only this child tree is terminated.
  const spec=Buffer.from(JSON.stringify({executable:process.execPath,arguments:[path.join(root,'apps/web/node_modules/@angular/cli/bin/ng.js'),'serve','--host','127.0.0.1','--port','4200'],deadlineMs:45000})).toString('base64');
  child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(root,'apps/api/dist/extractor/windows-job.ps1'),'-Spec',spec,'-OwnerPid',String(process.pid)],{cwd:path.join(root,'apps/web'),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const ended=new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
  child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.stdin.end();
  const deadline=Date.now()+25000;let response;
  while(Date.now()<deadline){try{response=await fetch('http://127.0.0.1:4200',{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  assert.ok(response?.ok,'Angular dev server starts');
  const queue=await fetch('http://127.0.0.1:4200/api/queue',{signal:AbortSignal.timeout(4000)});
  assert.equal(queue.status,200,'dev proxy forwards /api/queue');assert.equal((await queue.json()).queue.workerStatus,'idle');
  const controller=new AbortController();const events=await fetch('http://127.0.0.1:4200/api/events',{signal:controller.signal});const reader=events.body.getReader();let text='';
  const timer=setTimeout(()=>controller.abort(),4000);
  try{while(!text.includes('event: ready')){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);}assert.match(text,/event: ready/);}finally{clearTimeout(timer);controller.abort();}
  const report={verified_at:new Date().toISOString(),web_status:response.status,queue_status:queue.status,sse_ready:true,worker:'idle',data:'temporary database, read-only, no media'};
  writeFileSync(path.join(root,'docs/delivery-6-dev.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  child.kill('SIGKILL');await ended;child=null;
}finally{
  if(child){const stopped=new Promise(r=>child.on('close',r));child.kill('SIGKILL');await stopped;}
  writeFileSync(path.join(root,'.cache/delivery-6/dev-server.log'),output);await app.close();rmSync(directory,{recursive:true,force:true});
}
