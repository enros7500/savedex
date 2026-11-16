import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const before=JSON.parse(readFileSync(new URL('.cache/ui-refinement/before-restart.json',root),'utf8').replace(/^\uFEFF/,''));
const get=async path=>{const response=await fetch('http://127.0.0.1:3210/api'+path);assert.equal(response.status,200);return response;};
const after=await (await get('/queue')).json();
assert.equal(after.queue.workerStatus,'idle');assert.equal(after.queue.active,null);
assert.deepEqual(after.queue.entries,before.queue.entries);
assert.deepEqual(after.runs,before.runs);
assert.deepEqual(after.videos.map(({title,...video})=>video),before.videos.map(({title,...video})=>video));
const originals=[];
for(const run of after.runs){
  const current=Buffer.from(await (await get(`/runs/${run.id}/result`)).arrayBuffer());
  const original=readFileSync(new URL(`.cache/ui-refinement/original-${run.id}.json`,root));
  assert.deepEqual(current,original);
  originals.push({runId:run.id,sha256:createHash('sha256').update(current).digest('hex')});
}
const report={verifiedAt:new Date().toISOString(),worker:'idle',queueUnchanged:true,runsUnchanged:true,originalsUnchanged:true,originals,titlesAvailable:after.videos.filter(v=>v.title).length,totalVideos:after.videos.length,newExtractions:0};
writeFileSync(new URL('docs/ui-refinement-data.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
