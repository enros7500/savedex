// Searches through real extractions; never substitutes network responses or extractor output.
import assert from 'node:assert/strict';
import { readFile,readdir,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig,readEnvironment } from '../apps/api/dist/config.js';
const root=path.resolve(import.meta.dirname,'..');const url=process.argv[2];const reference=process.argv[3]??'user-authorized public candidate search';
assert.ok(/^https:\/\/(?:www\.)?(?:instagram\.com|youtube\.com|youtu\.be)\//.test(url??''),'Provide a platform URL');
const reportPath=path.join(root,'docs/delivery-7-real.json');const report=JSON.parse(await readFile(reportPath,'utf8'));
const parent=path.join(root,'.cache/delivery-7/real');const out=path.join(parent,(await readdir(parent)).sort().at(-1));
const config=loadConfig({...readEnvironment(),SAVEDEX_DATABASE:path.join(out,'savedex.sqlite'),SAVEDEX_EXTRACTOR_WORK_DIR:path.join(out,'work')});
const {app,runtime}=await createApplication({config,webRoot:path.join(root,'apps/web/dist/browser')});const base=await app.listen({host:'127.0.0.1',port:0});
const stages=[];const detach=runtime.events.subscribe(frame=>{if(frame.type==='change'){const s=frame.snapshot;const stage={at:new Date().toISOString(),worker:s.queue.workerStatus,run_id:s.queue.active?.runId??null,step:s.progress?.event.step??null};stages.push(stage);console.log(JSON.stringify(stage));}});
const priorIds=new Set(report.runs.map(r=>r.run_id));let videoId;const startedAt=new Date().toISOString();let before,after;
async function action(route,body){const res=await fetch(base+'/api'+route,{method:'POST',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});assert.ok(res.ok,route+' '+res.status);return res.json();}
try{
  const added=await action('/videos',{url});videoId=added.video.id;
  if(!added.created)await action('/videos/'+videoId+'/retry');
  await action('/queue/start');await runtime.queue.whenIdle();
  before=runtime.queue.runs.getHistory(videoId)[0];
  const incomplete=before?.state==='partial'&&before.result?.collections.some(c=>(c.expected_count??0)>0&&(c.missing_count??0)>0&&c.item_ids.length>0);
  if(incomplete){
    assert.ok(before.review.required);await action('/videos/'+videoId+'/exhaustive');await action('/queue/start');await runtime.queue.whenIdle();
    after=runtime.queue.runs.getHistory(videoId)[0];assert.equal(after.mode,'exhaustive');assert.notEqual(after.id,before.id);
    // Preserve the initial result exactly; neither the new attempt nor review may rewrite it.
    assert.equal(runtime.queue.runs.getHistory(videoId).find(r=>r.id===before.id).resultJson,before.resultJson);
  }
  const describe=run=>run?{run_id:run.id,mode:run.mode,state:run.state,exit_code:run.exitCode,items:run.result?.items.length??0,review:run.review,collections:run.result?.collections.map(c=>({id:c.id,expected_count:c.expected_count,recovered:c.item_ids.length,missing_count:c.missing_count,count_evidence_ids:c.expected_count_evidence_ids}))??[],result_sha256:run.resultJson?createHash('sha256').update(run.resultJson).digest('hex'):null}:null;
  const attempt={started_at:startedAt,finished_at:new Date().toISOString(),url,reference,video_id:videoId,incomplete_found:!!incomplete,before:describe(before),after:describe(after),original_history_preserved:!!after};
  report.candidate_search??=[];report.candidate_search.push(attempt);
  report.urls.push({url,discovered_in:reference,supplemental:true,purpose:'real incomplete top N candidate search'});
  for(const run of runtime.queue.runs.getHistory(videoId)){
    if(priorIds.has(run.id))continue;
    const json=run.resultJson;report.runs.push({url:added.video.url,platform:added.video.platform,run_id:run.id,mode:run.mode,status:run.state,completion_kind:run.completionKind,exit_code:run.exitCode,items:run.result?.items.length??0,issue_codes:run.result?.issues.map(i=>i.code)??[],error:run.errorMessage,result_sha256:json?createHash('sha256').update(json).digest('hex'):null});
    if(json)await writeFile(path.join(out,`run-${run.id}.json`),json);
  }
  if(incomplete&&after&&['success','partial'].includes(after.state)&&after.completionKind==='result'){
    report.checks.incomplete_collection_exhaustive=true;
    report.pending=report.pending.filter(p=>!p.startsWith('Exhaustive reprocesado'));
    report.top_n_acceptance={...attempt,validated:true};
  }
  report.acceptance_complete=Object.values(report.checks).every(Boolean)&&report.pending.length===0;
  await mkdir(path.join(out,'search'),{recursive:true});await writeFile(path.join(out,'search',`video-${videoId}-stages.json`),JSON.stringify(stages,null,2)+'\n');
  console.log('CANDIDATE RESULT '+JSON.stringify(attempt));
}finally{detach();await app.close();report.updated_at=new Date().toISOString();await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
