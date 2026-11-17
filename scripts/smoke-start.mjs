import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdirSync,mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ownedProcess } from './lib/owned-process.mjs';
import { until } from '../tests/e2e/browser.mjs';
const root=path.resolve(import.meta.dirname,'..');const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-start-'));
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const env={...process.env,PORT:String(port),SAVEDEX_DATABASE:path.join(directory,'persistent.sqlite'),SAVEDEX_EXTRACTOR_WORK_DIR:path.join(directory,'work')};
const base='http://127.0.0.1:'+port;let child;
async function ready(){await until(async()=>{try{return(await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'single server ready',35000);}
try{
  child=ownedProcess(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(root,'scripts/start.ps1')],{cwd:directory,env});await ready();
  const page=await fetch(base+'/library?video=1');assert.equal(page.status,200);assert.match(await page.text(),/<app-root>/);
  let response=await fetch(base+'/api/queue');let snapshot=await response.json();assert.equal(snapshot.queue.workerStatus,'idle');const stamp=snapshot;
  response=await fetch(base+'/api/videos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://youtu.be/STARTTEST12'})});assert.equal(response.status,201);
  const output=child.output();await child.stop();child=null;
  child=ownedProcess(process.execPath,[path.join(root,'apps/api/dist/server.js')],{cwd:directory,env});await ready();snapshot=await fetch(base+'/api/queue').then(r=>r.json());
  assert.equal(snapshot.queue.workerStatus,'idle');assert.equal(snapshot.queue.entries.filter(e=>e.state==='pending').length,1);assert.equal(snapshot.runs.length,0);assert.notEqual(snapshot.streamId,stamp.streamId);assert.ok(snapshot.revision>stamp.revision);
  const report={verified_at:new Date().toISOString(),entry:'scripts/start.ps1 from a different working directory',web_status:page.status,api_status:200,single_origin:true,persistent_pending_after_restart:1,automatic_runs:0,revision_persisted:true,stream_changed:true,configured_port:port};
  const reportDirectory=path.join(root,'.cache/delivery-7');mkdirSync(reportDirectory,{recursive:true});
  writeFileSync(path.join(reportDirectory,'start.json'),JSON.stringify(report,null,2)+'\n');writeFileSync(path.join(reportDirectory,'start.log'),output);console.log(JSON.stringify(report,null,2));
}finally{if(child)await child.stop();rmSync(directory,{recursive:true,force:true});}
