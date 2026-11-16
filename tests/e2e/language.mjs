import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createApplication} from '../../apps/api/dist/runtime.js';
import {loadConfig} from '../../apps/api/dist/config.js';
import {browser,until} from './browser.mjs';
const temp=await mkdtemp(join(tmpdir(),'savedex-language-'));
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:join(temp,'test.sqlite')}),webRoot:resolve('apps/web/dist/browser'),titleResolver:async()=>'Lugar',extractor:{async run(request){
 const r=JSON.parse(await readFile(resolve('tests/fixtures/extractor/success.json'),'utf8'));
 r.request_id=request.request_id;r.source.input_url=request.url;r.source.canonical_url=request.url;r.source.platform='youtube';
 r.topic={...r.topic,category:'travel',label:'Synthetic places'};
 const fact=value=>({value,certainty:value===null?'unknown':'known',evidence_ids:value===null?[]:['d1'],reason:value===null?'Sin dato en el vídeo.':null});
 r.items=[{...r.items[0],id:'place1',type:'place',title:'Lugar',summary:'Completado',data:{name:fact('Lugar'),location_mentioned:fact('Madrid'),address_mentioned:fact(null),coordinates_mentioned:fact('40.4, -3.7'),maps_url_mentioned:fact(null)}}];
 r.collections=[];r.follow_up={extraction_gaps:[],research_opportunities:[]};
 return {kind:'result',resultJson:JSON.stringify(r),exitCode:0};
}}});
const url=await app.listen({host:'127.0.0.1',port:0});
let b;const results=[];
const output=resolve('.cache/language');await mkdir(output,{recursive:true});
try{
 b=await browser();
 for(const width of [320,375,1280]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
  await b.send('Page.navigate',{url});await b.waitText('Explore places');
  await b.evaluate("localStorage.clear();location.reload()");await b.waitText('Explore places');
  assert.equal(await b.evaluate('document.documentElement.lang'),'en');
  assert.equal(await b.evaluate("document.querySelector('#language-select').value"),'en');
  assert.ok(await b.evaluate("(()=>{const r=document.querySelector('#language-select').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})()"));
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  for(const [route,en,es] of [['add','Add videos','Añadir vídeos'],['processing','Processing','Procesamiento'],['explore','Explore places','Explorar lugares']]){
   await b.click('.lab-nav a[href="#'+route+'"]');await b.waitText(en);
   const component={add:'.add-page',processing:'.processing-layout',explore:'.explore-page'}[route];
   await until(()=>b.evaluate('!!document.querySelector('+JSON.stringify(component)+')'),'route component');
   const frames=await b.evaluate(`new Promise(resolve=>{const rows=[],start=performance.now();function sample(){const el=document.querySelector(${JSON.stringify(component)});rows.push({height:document.documentElement.scrollHeight,transform:getComputedStyle(el).transform});if(performance.now()-start<350)requestAnimationFrame(sample);else resolve(rows)}sample()})`);
   assert.ok(frames.every(f=>f.transform==='none'),'No scrollbar-producing entry translation');
   if(route!=='add')assert.ok(frames.every(f=>f.height===800),'No transient document scrollbar');
   await b.fill('#language-select','es');await b.waitText(es);
   assert.equal(await b.evaluate('document.documentElement.lang'),'es');
   assert.ok((await b.evaluate('document.title')).includes(es));
   await b.fill('#language-select','en');await b.waitText(en);
   assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  }
  await b.fill('#language-select','es');await b.waitText('Explorar lugares');
  await b.send('Page.reload');await b.waitText('Explorar lugares');
  assert.equal(await b.evaluate("document.querySelector('#language-select').value"),'es');
  await b.fill('#language-select','en');await b.waitText('Explore places');
  await b.send('Page.reload');await b.waitText('Explore places');
  await b.evaluate("Promise.all(document.querySelector('.page-enter').getAnimations().map(a=>a.finished))");
  const screenshot=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'english-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
  results.push({width,defaultEnglish:true,switchesWithoutReload:true,persistedBothLanguages:true,noHorizontalOverflow:true});
 }
 const canonical=[['add','add'],['processing','processing'],['explore','explore'],['results','results']];
 const aliases=[['anadir','add'],['procesamiento','processing'],['procesado','processing'],['explorar','explore'],['biblioteca','explore'],['library','explore']];
 for(const [previous,next] of [...canonical,...aliases]){
  for(const path of ['/'+previous+'?source=bookmark','/#'+previous+'?source=bookmark']){
   await b.send('Page.navigate',{url:url+path});
   await until(()=>b.evaluate('location.hash==='+JSON.stringify('#'+next+'?source=bookmark')),'canonical English route '+path);
   const expected={add:'.add-page',processing:'.processing-layout',explore:'.explore-page',results:'sx-library'}[next];
   await until(()=>b.evaluate('!!document.querySelector('+JSON.stringify(expected)+')'),'route renders '+path);
  }
 }
 await b.send('Page.navigate',{url:url+'/#explore'});await b.waitText('Explore places');
 results.push({englishCanonicalRoutes:true,legacyAliasesPreserveQuery:true,pathAndHashBookmarks:true});
 const added=await app.inject({method:'POST',url:'/api/videos',payload:{url:'https://www.youtube.com/watch?v=AbC_123-xyz'}});assert.equal(added.statusCode,201);
 await app.inject({method:'POST',url:'/api/queue/start'});await runtime.queue.whenIdle();
 await writeFile(join(output,'synthetic-snapshot.json'),JSON.stringify(runtime.snapshot(),null,2));
 assert.equal(runtime.snapshot().runs[0]?.state,'success',JSON.stringify(runtime.snapshot().runs[0]));
 await b.send('Page.reload');await b.waitText('Lugar');
 await until(()=>b.evaluate('!!document.querySelector(".place-card")'),'populated catalog');
 assert.equal(await b.evaluate('document.querySelector(".place-card h2").textContent'),'Lugar');
 await b.click('.place-card');await until(()=>b.evaluate('!!document.querySelector(".place-detail")'),'place details');
 assert.equal(await b.evaluate('document.querySelector(".place-detail h2").textContent'),'Lugar');
 assert.equal(await b.evaluate('document.querySelector(".place-detail").getAttribute("aria-label")'),'Lugar');
 assert.ok((await b.text()).includes('Completado'),'Extracted description stays in its original language');
 await b.fill('#language-select','es');await b.waitText('Ficha del lugar');
 assert.equal(await b.evaluate('document.querySelector(".place-detail h2").textContent'),'Lugar');
 await b.fill('#language-select','en');await b.waitText('Place details');
 results.push({populatedPlacePreserved:true,descriptionPreserved:true,detailSwitchesWithoutReload:true});
 assert.deepEqual(b.errors,[]);
 await writeFile(join(output,'report.json'),JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{if(b)await b.close();await app.close();}
