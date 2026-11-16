// Optional follow-up after acceptance-real.mjs has released its database.
import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig,readEnvironment } from '../apps/api/dist/config.js';
const root=path.resolve(import.meta.dirname,'..');const reportFile=path.join(root,'docs/delivery-7-real.json');
const report=JSON.parse(await readFile(reportFile,'utf8'));
assert.ok(report.checks.ten_real_urls_attempted,'Complete the first real batch before top N follow-up');
if(report.checks.incomplete_collection_exhaustive){console.log('Incomplete collection already exercised');process.exit(0);}
const parent=path.join(root,'.cache/delivery-7/real');const last=(await readdir(parent)).sort().at(-1);const out=path.join(parent,last);
const config=loadConfig({...readEnvironment(),SAVEDEX_DATABASE:path.join(out,'savedex.sqlite'),SAVEDEX_EXTRACTOR_WORK_DIR:path.join(out,'work')});
const {app,runtime}=await createApplication({config});const base=await app.listen({host:'127.0.0.1',port:0});
const url='https://www.youtube.com/watch?v=OzJePV0TG8Y';
const reference='https://t.me/s/honoraryconsulatecypruscambodia?before=7789&q=%23tourism';
const detach=runtime.events.subscribe(frame=>{if(frame.type==='change')console.log(JSON.stringify({at:new Date().toISOString(),worker:frame.snapshot.queue.workerStatus,active:frame.snapshot.queue.active?.runId,step:frame.snapshot.progress?.event.step}));});
async function action(route,body){const r=await fetch(base+'/api'+route,{method:'POST',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});assert.ok(r.ok);return r.json();}
try{
  const reopened=runtime.snapshot();assert.equal(reopened.queue.workerStatus,'idle');assert.ok(reopened.runs.filter(r=>r.finishedAt).length>=10);report.checks.real_process_restart_preserves_results=true;
  const video=(await action('/videos',{url})).video;await action('/queue/start');await runtime.queue.whenIdle();
  const before=runtime.library({}).library.videos.find(r=>r.video.id===video.id);
  await action('/videos/'+video.id+'/exhaustive');await action('/queue/start');await runtime.queue.whenIdle();
  const after=runtime.library({}).library.videos.find(r=>r.video.id===video.id);
  const history=runtime.queue.runs.getHistory(video.id);
  report.urls.push({url,discovered_in:reference,supplemental:true,purpose:'top 5 travel candidate, completeness judged from actual output'});
  report.top_n={url,before_status:before.latestAttempt?.state,before_collections:before.result?.collections.map(c=>({expected:c.expected_count,missing:c.missing_count}))??[],after_status:after.latestAttempt?.state,exhaustive_attempted:history.some(r=>r.mode==='exhaustive')};
  for(const run of history){if(report.runs.some(r=>r.run_id===run.id))continue;const json=run.resultJson;report.runs.push({url,platform:'youtube',run_id:run.id,mode:run.mode,status:run.state,completion_kind:run.completionKind,exit_code:run.exitCode,items:run.result?.items.length??0,issue_codes:run.result?.issues.map(i=>i.code)??[],error:run.errorMessage,result_sha256:json?createHash('sha256').update(json).digest('hex'):null});if(json)await writeFile(path.join(out,`run-${run.id}.json`),json);}
  report.checks.failure_recorded=report.runs.some(r=>r.status==='error');
  report.checks.incomplete_collection_exhaustive=false;
  if(before.run?.state==='partial'&&before.result?.collections.some(c=>(c.missing_count??0)>0)&&report.top_n.exhaustive_attempted){report.checks.incomplete_collection_exhaustive=true;report.pending=report.pending.filter(p=>!p.startsWith('Exhaustive reprocesado'));}
  report.acceptance_complete=Object.values(report.checks).every(Boolean)&&report.pending.length===0;
}finally{detach();await app.close();report.updated_at=new Date().toISOString();await writeFile(reportFile,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report.top_n));
