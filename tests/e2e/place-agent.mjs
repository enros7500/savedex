import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApplication} from '../../apps/api/dist/runtime.js';
import {loadConfig} from '../../apps/api/dist/config.js';
import {browser,until} from './browser.mjs';

const root=path.resolve(import.meta.dirname,'../..'),directory=mkdtempSync(path.join(os.tmpdir(),'savedex-place-ui-'));
const evidence=path.join(root,'.cache/place-agent-ui');mkdirSync(evidence,{recursive:true});
let release;let researchCalls=0;
const researched={matched:true,name:'Kiyomizu-dera',address:'1-294 Kiyomizu, Kyoto',latitude:34.995317,longitude:135.783285,description:'Templo budista de Kioto con terraza de madera.',sources:[{title:'Web oficial del templo',url:'https://www.kiyomizudera.or.jp/en/location/'}],photos:[],reason:''};
const fact=value=>({value,certainty:value===null?'unknown':'known',evidence_ids:value===null?[]:['d1'],reason:value===null?'Sin dato':null});
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'db.sqlite')}),webRoot:path.join(root,'apps/web/dist/browser'),titleResolver:async()=> 'Título del vídeo',placeResearch:async()=>{researchCalls++;return new Promise(resolve=>{release=resolve;});},extractor:{async run(request){
  const r=JSON.parse(readFileSync(path.join(root,'tests/fixtures/extractor/success.json'),'utf8'));
  r.request_id=request.request_id;r.source.input_url=request.url;r.source.canonical_url=request.url;r.source.platform='youtube';r.collections=[];r.follow_up={extraction_gaps:[],research_opportunities:[]};
  r.items=request.url.includes('ZbC_')?[]:[{...r.items[0],type:'place',title:'Kiyomizu-dera',summary:'Templo de Kioto',data:{name:fact('Kiyomizu-dera'),location_mentioned:fact('Kyoto, Japan'),address_mentioned:fact(null),coordinates_mentioned:fact(null),maps_url_mentioned:fact(null)}}];
  return{kind:'result',resultJson:JSON.stringify(r),exitCode:0};
}}});
const add=async id=>(await app.inject({method:'POST',url:'/videos',payload:{url:'https://youtu.be/'+id}})).json().video;
const place=await add('AbC_123-xyz'),empty=await add('ZbC_123-xyz');runtime.queue.startQueue();await runtime.queue.whenIdle();
const origin=await app.listen({host:'127.0.0.1',port:0});let b;
const nav=async route=>{await b.send('Page.navigate',{url:origin+'/#'+route});await b.waitText(route.startsWith('explore')?'Explorar lugares':'Procesamiento');};
const shot=async name=>{const r=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));};
try{
  b=await browser();await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await b.send('Page.navigate',{url:origin});
  await until(()=>b.evaluate('!!document.querySelector("#language-select")'),'language selector');await b.fill('#language-select','es');await b.waitText('Explorar lugares');
  await nav('processing?video='+empty.id);await b.waitText('No se encontraron lugares');
  assert.equal(await b.evaluate('!!document.querySelector(".trail-complete a")'),false);
  assert.equal(await b.evaluate('!!document.querySelector(".attempt-tabs .badge")'),false);
  assert.ok(await b.evaluate(`!!document.querySelector('[data-queue-group="errors"] [data-video-id="${empty.id}"]')`));
  console.log('PASS empty extraction needs attention and has no Explore label or action');
  await b.evaluate('[...document.querySelectorAll(".trail-actions button")].find(e=>e.textContent.includes("Quitar de Procesamiento")).click()');
  await until(()=>b.evaluate(`!document.querySelector('[data-video-id="${empty.id}"]')`),'removed row');
  assert.equal(runtime.history(empty.id).runs.length,1);
  await b.evaluate('[...document.querySelectorAll(".lab-toast button")].find(e=>e.textContent.includes("Deshacer")).click()');
  await until(()=>b.evaluate(`!!document.querySelector('[data-video-id="${empty.id}"]')`),'restored row');
  console.log('PASS removing and undo preserve extraction history');
  await nav('processing?video='+place.id);await b.waitText('1 lugares extraídos');
  const height=await b.evaluate('document.querySelector(".trail-header").getBoundingClientRect().height');
  await app.inject({method:'POST',url:`/videos/${place.id}/retry`});runtime.queue.startQueue();await runtime.queue.whenIdle();
  await until(()=>b.evaluate('document.querySelectorAll(".attempt-tab").length===2'),'second attempt');
  assert.equal(await b.evaluate('document.querySelector(".trail-header").getBoundingClientRect().height'),height);
  console.log('PASS header dimensions stay stable when attempts grow');
  await nav('explore');await b.waitText('Kiyomizu-dera');await b.click('.place-card');await b.click('[data-agent-enrich]');await b.waitText('Investigando…');
  assert.equal(await b.evaluate('document.querySelector("[data-agent-enrich]").disabled'),true);assert.equal(researchCalls,1);
  release(researched);await b.waitText('Procesado por el agente');await b.waitText(researched.description);
  assert.ok(await b.evaluate('!!document.querySelector(".detail-actions a[href*=maps]")'));
  assert.equal(await b.evaluate('document.querySelectorAll(".agent-sources a").length'),1);
  await until(()=>b.evaluate('document.querySelector(".place-detail").getBoundingClientRect().right<=innerWidth+1'),'drawer entrance');
  await shot('agent-desktop');
  for(const width of [390,320]){
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
    await until(()=>b.evaluate('document.querySelector(".place-detail").getBoundingClientRect().right<=innerWidth+1'),'drawer resize');
    await shot('agent-'+width);
  }
  console.log('PASS enrichment updates sources, details and map coordinates on desktop and mobile');
  assert.deepEqual(b.errors,[]);console.log('PASS no browser errors');
}finally{release?.(researched);if(b)await b.close();await app.close();rmSync(directory,{recursive:true,force:true});}
