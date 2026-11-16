// Explicit real-media acceptance. Never invoked by pnpm test or the synthetic verifier.
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig,readEnvironment } from '../apps/api/dist/config.js';
import { executeCli } from '../apps/api/dist/extractor/process.js';
import { browser,until } from '../tests/e2e/browser.mjs';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'.cache/delivery-7/real',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const sources=[
  ['https://www.youtube.com/watch?v=xa6o9AArGEE','https://recipe.kantan.style/16610'],
  ['https://www.youtube.com/watch?v=zZhol4IKdtk','https://yutura.net/channel/128954/video/zZhol4IKdtk/'],
  ['https://www.youtube.com/watch?v=3I8IMqywFUc','https://eprints.whiterose.ac.uk/id/eprint/233609/1/Adami_FoodContentCreators_Article_ExtendedVersion.pdf'],
  ['https://www.youtube.com/watch?v=DZyEwuGHpHQ','https://www.reddit.com/r/cookingforbeginners/comments/1jq92zz/'],
  ['https://www.youtube.com/watch?v=QWQtg1MDAls','https://www.reddit.com/r/Cooking/comments/11q5k51/'],
  ['https://www.instagram.com/reel/DEaUoDQxh9-/','https://www.tulsakids.com/page/34/?channelid=7&order=Last+reply&sort=asc'],
  ['https://www.instagram.com/reel/DJCf8Jwi5Po/','https://balloon-juice.com/2025/06/07/saturday-morning-open-thread-the-week-in-miniature/'],
  ['https://www.instagram.com/reel/DG6om2UyUNX/','https://hypothes.is/users/chrisaldrich?page=11'],
  ['https://www.instagram.com/reel/CQs3bJGlmp_/','https://presidencia.bibliotecadigital.gencat.cat/bitstream/handle/20.500.14623/1342/Manual_governs_Instagram_EN.pdf?isAllowed=y&sequence=3'],
  ['https://www.instagram.com/reel/DO3p1xDjv1K/','https://ttabvue.uspto.gov/ttabvue/ttabvue-91303364-OPP-1.pdf'],
];
const report={started_at:new Date().toISOString(),data:'real public URLs discovered in public references; anonymous access only; availability/content not assumed',doctor:null,urls:sources.map(([url,discovered_in])=>({url,discovered_in})),checks:{},runs:[],pending:[],acceptance_complete:false};
async function save(){report.updated_at=new Date().toISOString();await writeFile(path.join(root,'docs/delivery-7-real.json'),JSON.stringify(report,null,2)+'\n');}
async function fingerprint(){const base=path.resolve(root,'../savedex-extractor');const files={};async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()&&e.name!=='__pycache__')await walk(p);else if(e.isFile()&&/\.(py|json)$/.test(e.name))files[path.relative(base,p).replaceAll('\\','/')]=createHash('sha256').update(await readFile(p)).digest('hex');}}await walk(path.join(base,'src'));files['pyproject.toml']=createHash('sha256').update(await readFile(path.join(base,'pyproject.toml'))).digest('hex');return files;}
const before=await fingerprint();
const config=loadConfig({...readEnvironment(),SAVEDEX_DATABASE:path.join(out,'savedex.sqlite'),SAVEDEX_EXTRACTOR_WORK_DIR:path.join(out,'work')});
const diagnostic=await executeCli(config.extractor,['doctor','--json','--model-dir',config.extractor.modelDir,'--work-dir',config.extractor.workDir]);
report.doctor={exit_code:diagnostic.exitCode,result:JSON.parse(diagnostic.stdout.toString('utf8'))};await save();
if(report.doctor.result.status!=='ready'){report.pending.push('Ten real URLs and real lifecycle checks: doctor reports unavailable local resources.');await save();console.log('REAL ACCEPTANCE PENDING: local resources unavailable');process.exit(0);}
let instance,b;
async function open(){instance=await createApplication({config,webRoot:path.join(root,'apps/web/dist/browser')});const base=await instance.app.listen({host:'127.0.0.1',port:0});const detach=instance.runtime.events.subscribe(frame=>{if(frame.type==='change'){const s=frame.snapshot;console.log(JSON.stringify({at:new Date().toISOString(),worker:s.queue.workerStatus,finished:s.runs.filter(r=>r.finishedAt).length,active:s.queue.active?.runId??null,step:s.progress?.event.step??null}));}});return {base,detach};}
try{
  let {base,detach}=await open();
  async function action(route,body){const res=await fetch(base+'/api'+route,{method:'POST',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});assert.ok(res.ok,route+' '+res.status);return res.json();}
  for(const [url] of sources)await action('/videos',{url});
  await action('/queue/start');await until(()=>instance.runtime.snapshot().queue.active!==null,'real active run');
  await action('/queue/stop');report.checks.stop_acknowledged=instance.runtime.snapshot().queue.workerStatus==='stopping';
  b=await browser();await b.send('Page.navigate',{url:base+'/processing'});await b.waitText('Conectado');await b.send('Page.reload');await b.waitText('Conectado');
  report.checks.reload_snapshot_matches=await b.evaluate('document.querySelector("nav a[aria-current=page]")?.textContent.includes("Procesado")');
  await b.close();b=null;report.checks.worker_survives_browser_close=['running','stopping'].includes(instance.runtime.snapshot().queue.workerStatus);
  await instance.runtime.queue.whenIdle();
  let snapshot=instance.runtime.snapshot();assert.equal(snapshot.queue.batch.state,'stopped');assert.equal(snapshot.queue.batch.counts.pending,9);report.checks.stop_finished_active_only=true;
  const firstBatch=snapshot.queue.batch.id;detach();await instance.app.close();instance=null;
  ({base,detach}=await open());snapshot=instance.runtime.snapshot();assert.equal(snapshot.queue.workerStatus,'idle');assert.equal(snapshot.queue.batch.id,firstBatch);assert.equal(snapshot.queue.batch.counts.pending,9);report.checks.restart_preserves_batch_without_autostart=true;
  await action('/queue/start');await instance.runtime.queue.whenIdle();snapshot=instance.runtime.snapshot();assert.equal(snapshot.queue.batch.state,'completed');report.checks.resumed_batch_completed=true;
  const rows=instance.runtime.library({}).library.videos;
  report.checks.incomplete_collection_exhaustive=false;
  const incomplete=rows.find(r=>r.run?.state==='partial'&&r.result?.collections.some(c=>(c.missing_count??0)>0));
  if(incomplete){await action('/videos/'+incomplete.video.id+'/exhaustive');await action('/queue/start');await instance.runtime.queue.whenIdle();report.checks.incomplete_collection_exhaustive=true;}
  else report.pending.push('Exhaustive reprocesado de un top N incompleto real: no se obtuvo una colección incompleta válida en este lote.');
  for(const video of instance.runtime.library({}).library.videos){const history=instance.runtime.queue.runs.getHistory(video.video.id);for(const run of history){const json=run.resultJson;report.runs.push({url:video.video.url,platform:video.video.platform,run_id:run.id,mode:run.mode,status:run.state,completion_kind:run.completionKind,exit_code:run.exitCode,items:run.result?.items.length??0,issue_codes:run.result?.issues.map(i=>i.code)??[],error:run.errorMessage,result_sha256:json?createHash('sha256').update(json).digest('hex'):null});if(json)await writeFile(path.join(out,`run-${run.id}.json`),json);}}
  report.checks.ten_real_urls_attempted=new Set(report.runs.map(r=>r.url)).size===10;
  report.checks.both_platforms=report.runs.some(r=>r.platform==='youtube')&&report.runs.some(r=>r.platform==='instagram');
  report.checks.failure_recorded=report.runs.some(r=>r.status==='error');report.checks.valid_real_result=report.runs.some(r=>['success','partial'].includes(r.status));
  if(!report.checks.valid_real_result)report.pending.push('Resultados/evidencia reales y evaluación de calidad: todas las URLs fallaron; no se sustituye esta evidencia por fixtures.');
  report.acceptance_complete=Object.values(report.checks).every(Boolean)&&report.pending.length===0;
  detach();
}catch(error){report.pending.push('Real run interrupted: '+error.message);console.error(error);}
finally{if(b)await b.close();if(instance)await instance.app.close();report.extractor_source_unchanged=JSON.stringify(before)===JSON.stringify(await fingerprint());report.extractor_source_sha256=before;await save();}
console.log(JSON.stringify({acceptance_complete:report.acceptance_complete,runs:report.runs.length,pending:report.pending},null,2));
