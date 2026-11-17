import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiLibraryResult } from '../packages/contracts/src/api.js';
import { DemoSession, DEMO_SOURCE } from '../apps/web/src/app/core/demo-session.js';
import { translate } from '../apps/web/src/app/core/messages.js';

const wait = async (check:()=>boolean) => { for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,2));}assert.fail('Demo did not finish'); };
const library = async (s:DemoSession) => (await s.request('/library') as {library:ApiLibraryResult}).library;

test('museum result and discard notices are translated completely into English',()=>{
  assert.equal(translate('5 lugares disponibles de «Top 5 museums in Madrid»','en'),'5 places available from “Top 5 museums in Madrid”');
  assert.equal(translate('«Museo Sorolla» descartado','en'),'“Museo Sorolla” discarded');
});

test('demo accepts only its fixed video and produces exactly five museums after local progress',async()=>{
  const s=new DemoSession(1);let changes=0;
  const close=s.subscribe(()=>changes++);
  try{
    await assert.rejects(s.request('/videos','POST',{url:'https://youtu.be/anything'}));
    assert.equal(s.snapshot().videos.length,0);
    await s.request('/videos','POST',{url:DEMO_SOURCE});
    await s.request('/videos','POST',{url:DEMO_SOURCE});
    assert.equal(s.snapshot().videos.length,1);
    assert.equal((await library(s)).totalItems,0);
    await s.request('/queue/start','POST');await s.request('/queue/start','POST');
    assert.equal(s.snapshot().queue.workerStatus,'running');
    await wait(()=>s.snapshot().videos[0]?.state==='completed');
    assert.equal(s.snapshot().runs.length,1);
    const l=await library(s);assert.equal(l.totalItems,5);
    assert.equal(new Set(l.videos[0]!.items.map(i=>i.name)).size,5);
    assert.ok(l.videos[0]!.items.every(i=>i.type==='place'&&!i.enrichment));
    assert.ok(changes>5);
  }finally{close();s.reset();}
});

test('each simulated agent reveals fixed coordinates once and reset cancels pending work',async()=>{
  const s=new DemoSession(1);
  try{
    await s.request('/videos','POST',{url:DEMO_SOURCE});await s.request('/queue/start','POST');
    await wait(()=>s.snapshot().videos[0]?.state==='completed');
    for(const item of (await library(s)).videos[0]!.items){
      await s.request(`/items/${item.id}/enrich`,'POST');await s.request(`/items/${item.id}/enrich`,'POST');
      await wait(()=>s.snapshot().revision>0&&s.enrichment(item.id)?.status==='completed');
      const result=s.enrichment(item.id)!.result!;
      assert.ok(result.latitude!>40&&result.latitude!<41);assert.ok(result.longitude!< -3);
      assert.ok(result.address);assert.ok(result.description);assert.deepEqual(result.photos,[]);
    }
    await assert.rejects(s.request('/items/999/enrich','POST'));
    await assert.rejects(s.request('/unimplemented','POST'));
    await s.request('/videos/1/retry','POST');await s.request('/queue/start','POST');s.reset();
    await new Promise(r=>setTimeout(r,25));
    assert.equal(s.snapshot().videos.length,0);assert.equal((await library(s)).totalItems,0);
  }finally{s.reset();}
});
