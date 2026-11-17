import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResearch } from '../apps/api/src/features/place-agent/research.js';
import { setupApi, until, resultFor } from './helpers/api.js';
import { createApplication } from '../apps/api/src/runtime.js';
import { placeKey } from '../apps/api/src/features/place-agent/repository.js';

const research = {matched:true,name:'Kiyomizu-dera',address:'Kyoto, Japan',latitude:34.9948,longitude:135.785,description:'Templo de Kioto.',sources:[{title:'Official temple',url:'https://www.kiyomizudera.or.jp/'}],photos:[],reason:''};

test('research never shares a completed location between same-name branches or corrected coordinates',()=>{
  const item={id:1,video_id:1,extractor_item_id:'place1',type:'place',name:'Café Central',description:'Café',data_json:JSON.stringify({location_mentioned:{value:'Madrid',certainty:'known'},coordinates_mentioned:{value:'40.40,-3.70',certainty:'known'}})};
  const corrected={...item,data_json:JSON.stringify({location_mentioned:{value:'Madrid',certainty:'known'},coordinates_mentioned:{value:'40.45,-3.75',certainty:'known'}})};
  assert.notEqual(placeKey(item),placeKey(corrected));
  const unknown={...item,data_json:JSON.stringify({location_mentioned:{value:'Madrid',certainty:'known'}})};
  assert.notEqual(placeKey(unknown),placeKey({...unknown,id:2,extractor_item_id:'place2'}));
});

async function completePlace(f:Awaited<ReturnType<typeof setupApi>>){
  await until(()=>f.port.calls.length===1);
  const outcome=resultFor(f.port.calls[0]!.request);
  if(outcome.kind!=='result')throw new Error('Missing fixture');
  const result=JSON.parse(outcome.resultJson);
  const fact=(value:string|null)=>({value,certainty:value===null?'unknown':'known',evidence_ids:value===null?[]:['d1'],reason:value===null?'Not mentioned':null});
  result.items[0]={...result.items[0],type:'place',title:'Kiyomizu-dera',summary:'Templo de Kioto',data:{name:fact('Kiyomizu-dera'),location_mentioned:fact('Kyoto, Japan'),address_mentioned:fact(null),coordinates_mentioned:fact(null),maps_url_mentioned:fact(null)}};
  f.port.calls[0]!.resolve({...outcome,resultJson:JSON.stringify(result)});await f.runtime.queue.whenIdle();
}

test('agent accepts grounded coordinates, rejects malformed and unsourced output and preserves ambiguity', () => {
  assert.equal(parseResearch(JSON.stringify(research)).latitude,34.9948);
  for(const value of [{...research,latitude:100},{...research,sources:[]},{...research,sources:[{title:'bad',url:'javascript:alert(1)'}]},{...research,photos:[{url:'file:///secret',sourceUrl:'https://example.com',attribution:'x'}]},{...research,matched:false}]) {
    assert.throws(()=>parseResearch(JSON.stringify(value)));
  }
  const ambiguous={...research,matched:false,latitude:null,longitude:null,sources:[],reason:'Hay varios templos con este nombre.'};
  assert.equal(parseResearch(JSON.stringify(ambiguous)).matched,false);
});

test('API enriches a persisted place once, publishes result separately and preserves original extraction',async()=>{
  let release:((value:typeof research)=>void)|undefined;let calls=0;
  const f=await setupApi({placeResearch:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  try {
    const added=(await f.app.inject({method:'POST',url:'/videos',payload:{url:'https://youtu.be/AbC_123-xyz'}})).json();
    await f.app.inject({method:'POST',url:'/queue/start'});await completePlace(f);
    const before=f.runtime.history(added.video.id).runs[0]!;const item=f.runtime.library({}).library.videos[0]!.items.find(i=>i.type==='place')!;
    const post=await f.app.inject({method:'POST',url:`/items/${item.id}/enrich`});assert.equal(post.statusCode,202);
    await until(()=>!!release);
    assert.equal((await f.app.inject({method:'POST',url:`/items/${item.id}/enrich`})).statusCode,202);assert.equal(calls,1);
    release!(research);await until(()=>f.runtime.library({}).library.videos[0]?.items.find(i=>i.id===item.id)?.enrichment?.status==='completed');
    const after=f.runtime.history(added.video.id).runs[0]!;assert.deepEqual(after.result,before.result);
    assert.equal(f.runtime.library({}).library.videos[0]!.items.find(i=>i.id===item.id)!.enrichment!.result!.latitude,34.9948);
    assert.equal((await f.app.inject({method:'POST',url:'/items/999999/enrich'})).statusCode,404);
    const other=f.runtime.library({}).library.videos[0]!.items.find(i=>i.type!=='place')!;
    assert.equal((await f.app.inject({method:'POST',url:`/items/${other.id}/enrich`})).statusCode,409);
    await f.app.close();
    const reopened=await createApplication({config:f.config,extractor:f.port});
    try{assert.equal(reopened.runtime.library({}).library.videos[0]!.items.find(i=>i.id===item.id)!.enrichment?.status,'completed');}
    finally{await reopened.app.close();}
  }finally{release?.(research);await f.cleanup();}
});

test('restart recovers interrupted research without launching another agent',async()=>{
  const f=await setupApi();
  try{
    const job={key:'interrupted',status:'running',model:'gpt-6-sol',startedAt:new Date().toISOString(),finishedAt:null,result:null,error:null};
    f.runtime.queue.db.prepare('INSERT INTO place_enrichments VALUES(?,?)').run(job.key,JSON.stringify(job));
    await f.app.close();let calls=0;
    const reopened=await createApplication({config:f.config,extractor:f.port,placeResearch:async()=>{calls++;return research;}});
    try{const stored=reopened.runtime.queue.db.prepare('SELECT payload_json FROM place_enrichments WHERE place_key=?').get(job.key) as {payload_json:string};assert.equal(JSON.parse(stored.payload_json).status,'error');assert.equal(calls,0);}
    finally{await reopened.app.close();}
  }finally{await f.cleanup();}
});

test('agent failures and ambiguous matches remain retryable and never mark a place completed',async()=>{
  let calls=0;
  const f=await setupApi({placeResearch:async()=>{calls++;if(calls===1)throw new Error('private diagnostics');return {...research,matched:false,latitude:null,longitude:null,sources:[],reason:'Ambiguous place'};}});
  try{
    await f.app.inject({method:'POST',url:'/videos',payload:{url:'https://youtu.be/AbC_123-xyz'}});await f.app.inject({method:'POST',url:'/queue/start'});await completePlace(f);
    const id=f.runtime.library({}).library.videos[0]!.items.find(i=>i.type==='place')!.id;
    await f.app.inject({method:'POST',url:`/items/${id}/enrich`});await until(()=>f.runtime.library({}).library.videos[0]!.items.find(i=>i.id===id)!.enrichment?.status==='error');
    assert.ok(!JSON.stringify(f.runtime.library({})).includes('private diagnostics'));
    await f.app.inject({method:'POST',url:`/items/${id}/enrich`});await until(()=>f.runtime.library({}).library.videos[0]!.items.find(i=>i.id===id)!.enrichment?.status==='needs_review');
  }finally{await f.cleanup();}
});
