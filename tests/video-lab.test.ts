import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLinks, coordinates, catalog, matchesSearch } from '../apps/web/src/app/explore/place-model.js';

test('pasted links normalize aliases and detect duplicates without submitting prose',()=>{
  const rows=parseLinks('Mira: youtu.be/AbC_123-xyz). https://youtube.com/shorts/AbC_123-xyz https://vimeo.com/123456 nope',[]);
  assert.deepEqual(rows.map(r=>r.status),['valid','duplicate','unsupported']);
  assert.equal(rows[0]!.url,'https://www.youtube.com/watch?v=AbC_123-xyz');
  assert.equal(parseLinks('youtu.be/AbC_123-xyz',['https://www.youtube.com/watch?v=AbC_123-xyz'])[0]!.status,'duplicate');
  assert.equal(parseLinks('nope',[])[0]!.status,'invalid');
});

test('uncertain coordinates do not become confirmed map positions',()=>{
 const row={video:{id:1,title:'Viaje',url:'https://youtu.be/AbC_123-xyz'},run:{id:1},result:{topic:{category:'travel'}},items:[{id:1,videoId:1,runId:1,type:'place',name:'Un lugar',description:'Mención',evidence:[],data:{location_mentioned:{value:null},coordinates_mentioned:{value:'34.5, 135.5',certainty:'uncertain'}}}]};
 assert.equal(catalog([row] as any)[0]!.coords,null);
});

test('agent enrichment locates a place without changing its identity, preferences or extraction',()=>{
 const row={video:{id:1,title:'Viaje',url:'https://youtu.be/AbC_123-xyz'},run:{id:1},result:{topic:{category:'travel'}},items:[{id:1,videoId:1,runId:1,type:'place',name:'Templo',description:'Del vídeo',evidence:[],data:{location_mentioned:{value:'Kyoto',certainty:'known'},coordinates_mentioned:{value:null,certainty:'unknown'}}}]};
 const before=catalog([row] as any)[0]!;
 const enriched={...row,items:[{...row.items[0],enrichment:{status:'completed',result:{latitude:34.9948,longitude:135.785,address:'Kyoto, Japan'}}}]};
 const after=catalog([enriched] as any)[0]!;
 assert.deepEqual(after.coords,{lat:34.9948,lng:135.785});assert.equal(after.id,before.id);assert.deepEqual(after.preferenceKeys,before.preferenceKeys);
 assert.equal(after.description,'Del vídeo');assert.equal(row.items[0]!.data.coordinates_mentioned.value,null);
 const ambiguous={...row,items:[{...row.items[0],enrichment:{status:'needs_review',result:{latitude:null,longitude:null}}}]};
 assert.equal(catalog([ambiguous] as any)[0]!.coords,null);
});
test('coordinates are explicit, finite and inside geographic bounds',()=>{
  assert.deepEqual(coordinates('34.6687, 135.5013'),{lat:34.6687,lng:135.5013});
  for(const v of [null,'Osaka','91, 25','0, 181','lat 34 approx','', '12, 45, 67'])assert.equal(coordinates(v),null);
});
test('search requires every word and ignores accents and case',()=>{
  assert.ok(matchesSearch('Templos de Japón · Kyoto','japon templos'));
  assert.equal(matchesSearch('Templos de Japón · Kyoto','japon ramen'),false);
});
test('catalog never merges an ambiguous name or different locations and retains sources',()=>{
  const row=(id:number,location:string)=>({video:{id,title:'Viaje',url:'https://youtu.be/AbC_123-xyz'},run:{id},result:{topic:{category:'travel'}},items:[{id,videoId:id,runId:id,type:'place',name:'Central',description:'Un parque',evidence:[],data:{location_mentioned:{value:location,certainty:'known'},coordinates_mentioned:{value:null}}}]});
  const places=catalog([row(1,'Madrid'),row(2,'Madrid'),row(3,'Lisboa'),row(4,''),row(5,'')] as any);
  assert.equal(places.length,4);assert.equal(places[0]!.sources.length,2);
  assert.equal(places[0]!.coords,null);
});

test('place preference identity survives new run and database item IDs',()=>{
  const row=(run:number,id:number)=>({video:{id:7,title:'Viaje',url:'https://youtu.be/AbC_123-xyz'},run:{id:run},result:{topic:{category:'travel'}},items:[{id,videoId:7,runId:run,type:'place',name:'Nombre sin ubicación',description:'Mención',evidence:[],data:{location_mentioned:{value:null},coordinates_mentioned:{value:null}}}]});
  const before=catalog([row(1,10)] as any)[0]!;
  const after=catalog([row(2,20)] as any)[0]!;
  assert.deepEqual(before.preferenceKeys,after.preferenceKeys);
  assert.ok(before.preferenceKeys.length>0);
});

