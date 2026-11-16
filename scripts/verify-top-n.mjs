import assert from 'node:assert/strict';
import { readFile,writeFile,readdir,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig,readEnvironment } from '../apps/api/dist/config.js';
import { browser,until } from '../tests/e2e/browser.mjs';
const root=path.resolve(import.meta.dirname,'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const real=JSON.parse(await readFile(path.join(root,'docs/delivery-7-real.json'),'utf8'));
const accepted=real.top_n_acceptance;assert.ok(accepted?.validated);assert.equal(accepted.url,'https://www.youtube.com/watch?v=WUoujwO7iyk');
const parent=path.join(root,'.cache/delivery-7/real'),out=path.join(parent,(await readdir(parent)).sort().at(-1));
const beforeBytes=await readFile(path.join(out,`run-${accepted.before.run_id}.json`));const afterBytes=await readFile(path.join(out,`run-${accepted.after.run_id}.json`));
assert.equal(hash(beforeBytes),accepted.before.result_sha256);assert.equal(hash(afterBytes),accepted.after.result_sha256);
const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);
for(const result of [before,after]){
  assert.equal(result.status,'partial');assert.equal(result.items.length,2);
  const collection=result.collections.find(c=>c.id==='restaurants');assert.equal(collection.expected_count,10);assert.equal(collection.item_ids.length,2);assert.equal(collection.missing_count,8);
  assert.deepEqual(collection.expected_count_evidence_ids,['d1']);
  assert.match(result.evidence.find(e=>e.id==='d1').excerpt,/10 Best Restaurants/);
  assert.ok(result.items.every(i=>i.evidence_ids.length>0&&i.evidence_ids.every(id=>result.evidence.some(e=>e.id===id))));
  assert.ok(result.processing.operations.some(o=>o.purpose==='vision'&&o.implementation==='rapidocr_onnxruntime'));
  assert.ok(result.coverage.visual_positions.length>0);
}
assert.notEqual(before.request_id,after.request_id);assert.equal(accepted.before.mode,'normal');assert.equal(accepted.after.mode,'exhaustive');
assert.equal(accepted.before.exit_code,2);assert.equal(accepted.after.exit_code,2);
assert.ok(accepted.before.review.required&&accepted.after.review.required);
const config=loadConfig({...readEnvironment(),SAVEDEX_DATABASE:path.join(out,'savedex.sqlite'),SAVEDEX_EXTRACTOR_WORK_DIR:path.join(out,'work')});
const {app,runtime}=await createApplication({config,webRoot:path.join(root,'apps/web/dist/browser')});const base=await app.listen({host:'127.0.0.1',port:0});
let b;const screenshots=path.join(root,'docs/evidence/delivery-7');await mkdir(screenshots,{recursive:true});
try{
  const snapshot=runtime.snapshot();assert.equal(snapshot.queue.workerStatus,'idle');assert.equal(snapshot.queue.active,null);
  const library=await fetch(base+'/api/library').then(r=>r.json());const row=library.library.videos.find(r=>r.video.id===accepted.video_id);assert.equal(row.run.id,accepted.after.run_id);assert.equal(row.items.length,2);assert.ok(row.run.review.required);
  const history=await fetch(base+`/api/videos/${accepted.video_id}/runs`).then(r=>r.json());assert.deepEqual(history.runs.map(r=>r.id),[accepted.after.run_id,accepted.before.run_id]);
  for(const run of [accepted.before,accepted.after]){const original=await fetch(base+`/api/runs/${run.run_id}/result`).then(r=>r.text());assert.equal(hash(original),run.result_sha256);}
  b=await browser();await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});await b.send('Page.navigate',{url:base+`/library?video=${accepted.video_id}`});await b.waitText('8 pendientes de recuperar');await b.waitText('Por revisar');
  assert.equal(await b.evaluate('document.querySelectorAll("sx-item").length'),2);await b.fill('#theme','dark');
  await b.evaluate('document.querySelector("[data-video]").scrollIntoView({block:"start"})');
  const picture=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(screenshots,'top-n-result.png'),Buffer.from(picture.data,'base64'));
  await b.click('[data-evidence]');await b.click('[data-action=history]');await b.waitText('Historial de extracciones');await until(()=>b.evaluate('document.querySelectorAll("[data-run]").length===2'),'two real runs in history');
  await b.evaluate('document.querySelector(".history").scrollIntoView({block:"start"})');const historyPicture=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(screenshots,'top-n-history.png'),Buffer.from(historyPicture.data,'base64'));
  const timeOrigin=await b.evaluate('performance.timeOrigin');await b.send('Page.reload');await until(()=>b.evaluate(`performance.timeOrigin!==${timeOrigin}&&document.querySelectorAll('sx-item').length===2`),'new document retains real incomplete result');await b.waitText('8 pendientes de recuperar');
  assert.deepEqual(b.errors,[]);assert.equal(runtime.snapshot().queue.workerStatus,'idle');assert.equal(runtime.snapshot().runs.length,snapshot.runs.length);
  const summary={verified_at:new Date().toISOString(),url:accepted.url,video_id:accepted.video_id,data:'real CLI outputs, unchanged source and default resource limits; no fixtures or media substitutions',normal:accepted.before,exhaustive:accepted.after,announcement_quote:'10 Best Restaurants',item_names:after.items.map(i=>i.title),item_evidence:after.items.map(i=>({item_id:i.id,evidence_ids:i.evidence_ids,locators:i.evidence_ids.map(id=>after.evidence.find(e=>e.id===id).locator)})),visual_positions:{normal:before.coverage.visual_positions.length,exhaustive:after.coverage.visual_positions.length},api_original_hashes_match:true,history_preserved:true,latest_valid_run_selected:true,ui_two_items_and_missing_eight:true,review_remains_required:true,reload_preserves_result:true,no_automatic_runs:true,browser_exceptions:b.errors};
  await writeFile(path.join(root,'docs/delivery-7-top-n.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({normal:summary.normal,exhaustive:summary.exhaustive,api_hashes:true,history:true,ui:true,reload:true},null,2));
}finally{if(b)await b.close();await app.close();}
