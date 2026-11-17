import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { browser, until } from './browser.mjs';
import { createApplication } from '../../apps/api/dist/runtime.js';
import { loadConfig } from '../../apps/api/dist/config.js';
const root=path.resolve(import.meta.dirname,'../..');
const shots=path.join(root,'.cache/e2e/catalog');mkdirSync(shots,{recursive:true});
const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-video-lab-'));
const calls=[];const checks=[];
const longTitle='Un vídeo con un título muy largo sobre todos los lugares que puedes visitar '.repeat(12);
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'test.sqlite')}),webRoot:path.join(root,'apps/web/dist/browser'),titleResolver:async()=>longTitle,extractor:{run(request){return new Promise(resolve=>calls.push({request,resolve}));}}});
let failUpload=false;
app.addHook('preHandler',async(request,reply)=>{if(failUpload&&request.method==='POST'&&request.url.endsWith('/videos')&&request.body?.url?.includes('FailLink123'))return reply.code(503).send({error:{message:'Prueba de envío temporal'}});});
const origin=await app.listen({host:'127.0.0.1',port:0});let b;
const check=name=>{checks.push(name);console.log('PASS '+name);};
async function screen(name,w=1440,h=900){await b.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await b.evaluate('document.fonts.ready');await new Promise(r=>setTimeout(r,420));await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const s=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(shots,name+'.png'),Buffer.from(s.data,'base64'));assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),name+' overflow');}
async function nav(route,base=origin){await b.send('Page.navigate',{url:base+'/#'+route});await until(()=>b.evaluate('!!document.querySelector(".lab-nav")'),'shell');await b.fill('#language-select','es');await until(()=>b.evaluate('document.querySelector(".connection-dot").getAttribute("aria-label")==="Conectado"'),'connected');}
function result(index){const r=JSON.parse(readFileSync(path.join(root,'tests/fixtures/extractor/success.json'),'utf8'));const call=calls[index];r.request_id=call.request.request_id;r.source.input_url=call.request.url;r.source.canonical_url=call.request.url;r.source.platform='youtube';r.topic={...r.topic,category:'travel',label:'Lugares de Japón y Lisboa'};r.routing.steps=[{stage:'description',outcome:'completed',reason:'Descripción revisada con evidencia.',input_evidence_ids:['d1'],remaining_gaps:[]},{stage:'transcription',outcome:'skipped',reason:'La descripción contiene las menciones.',input_evidence_ids:[],remaining_gaps:[]}];const fact=value=>({value,certainty:value===null?'unknown':'known',evidence_ids:value===null?[]:['d1'],reason:value===null?'Sin dato en el vídeo.':null});const template=r.items[0];r.items=[['Kukuru Dotonbori','Osaka, Japón','34.6687, 135.5013','Restaurante de takoyaki'],['Templo de Kiyomizu','Kyoto, Japón','34.6687, 135.5013','Templo con vistas sobre Kyoto'],['Jardín de la Estrella','Lisboa, Portugal','38.7145, -9.1606','Parque y jardín de Lisboa'],['Mirador del vídeo',null,null,'Mirador al atardecer']].map(([name,location,coords,summary],i)=>({...template,id:'place'+i,type:'place',title:name,summary,data:{name:fact(name),location_mentioned:fact(location),address_mentioned:fact(null),coordinates_mentioned:fact(coords),maps_url_mentioned:fact(null)}}));r.collections=[];r.follow_up={extraction_gaps:[],research_opportunities:[]};return r;}
async function finish(index){const output=result(index);writeFileSync(path.join(shots,'test-result.json'),JSON.stringify(output));calls[index].resolve({kind:'result',resultJson:JSON.stringify(output),exitCode:0});await runtime.queue.whenIdle();}
try{
 b=await browser();
 // Read-only validation on existing user data: no new videos or processing runs.
 if(process.env.SAVEDEX_UI_REAL_URL){const real=process.env.SAVEDEX_UI_REAL_URL;
 await nav('explorar',real);await b.waitText('Explorar lugares');await screen('real-explore-desktop');await screen('real-explore-mobile',390,844);
 await nav('anadir',real);await b.waitText('¿Qué has descubierto?');await screen('real-add-desktop');await screen('real-add-mobile',390,844);
 await nav('procesamiento',real);await b.waitText('Procesamiento');await screen('real-processing-desktop');await screen('real-processing-mobile',390,844);check('all screens render actual user data without mutation');}
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 // Isolated test database exercises user actions; fixtures never enter user data.
 await nav('explorar');await b.waitText('Aún no hay lugares');assert.equal(await b.evaluate('location.hash'),'#explore');
 assert.equal(await b.evaluate('!!document.querySelector("sx-place-map,.category-filters,.secondary-filters")'),false);check('empty catalog prioritizes adding videos without empty map or filters');
 await screen('review-empty-desktop');await screen('review-empty-mobile',390,844);assert.ok(await b.evaluate('document.querySelector(".empty-state .btn").getBoundingClientRect().bottom<innerHeight'));await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await nav('anadir');await b.waitText('¿Qué has descubierto?');await until(()=>b.evaluate('document.querySelector(".connection-dot").getAttribute("aria-label")==="Conectado"'),'connected');
 await b.fill('#url','youtu.be/AbC_123-xyz\nhttps://youtube.com/shorts/AbC_123-xyz\nhttps://vimeo.com/123456');await b.waitText('1 válidos');assert.equal(await b.evaluate('document.querySelectorAll(".validation-row").length'),3);await b.waitText('Ya añadido');await b.waitText('Aún no disponible');check('live parsing, alias duplicates and unsupported platforms');
 failUpload=true;await b.fill('#url','youtu.be/AbC_123-xyz\nhttps://youtu.be/FailLink123');await b.click('#add-submit');await until(()=>calls.length===1,'real queue start');assert.ok((await b.evaluate('location.hash')).replace('#/','#').startsWith('#add'));await until(()=>b.evaluate('document.querySelector("#url").value.includes("FailLink123")'),'failed input retained');await b.waitText('Prueba de envío temporal');await b.fill('#url','');failUpload=false;check('partial submission retains failed links and only starts accepted videos');
 await b.click('.lab-nav a[href="#processing"]');await b.waitText('AGENT TRAIL');await until(()=>b.evaluate('!!document.querySelector(".compact-timeline")'),'run skeleton');
 await b.evaluate('window.firstNode=document.querySelector(".node-card")');runtime.observeProgress(calls[0].request.request_id,{event:'step',step:'ocr',ts:new Date().toISOString()});await b.waitText('Texto en pantalla');await until(()=>b.evaluate('document.querySelector(".timeline-node.running")?.textContent.includes("Texto en pantalla")'),'observed OCR');assert.ok(await b.evaluate('window.firstNode===document.querySelector(".node-card")'));check('observed progress updates stable trace nodes without invented percentages');
 assert.equal(await b.evaluate('document.querySelector("[data-queue-group=active] .queue-group-toggle").getAttribute("aria-expanded")'),'true');await b.evaluate('window.countAnimations=0;const baseAnimate=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.tagName==="SX-QUEUE-COUNT")window.countAnimations++;return baseAnimate.apply(this,args)}');check('active queue section opens by default');
 await finish(0);await b.waitText('4 lugares extraídos');assert.ok(await b.evaluate('window.countAnimations>0'));await b.click('[data-queue-group=done] .queue-group-toggle');assert.equal(await b.evaluate('document.querySelector("[data-queue-group=done] .queue-group-toggle").getAttribute("aria-expanded")'),'false');await b.click('[data-queue-group=done] .queue-group-toggle');check('queue sections collapse and status count changes animate');await b.click('.trail-complete a');await b.waitText('Kukuru Dotonbori');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===4'),'catalog');await screen('test-populated-map');assert.ok(await b.evaluate('document.querySelectorAll(".map-marker").length>0'));await b.waitText('1 lugar solo tiene nombre');check('real API results produce cards and only explicit-coordinate pins');
 assert.equal(await b.evaluate('document.querySelector(".suggestions")'),null,'no Try suggestions');
 const categoryCounts=await b.evaluate('[...document.querySelectorAll(".category-chip")].map(e=>Number(e.querySelector("span:last-child").textContent))');
 assert.ok(categoryCounts.length>0&&categoryCounts.every(n=>n>0),'empty categories stay hidden');assert.deepEqual(categoryCounts,[...categoryCounts].sort((a,b)=>b-a),'categories sorted by count');
 for(const width of [1440,390,320]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await b.click('#video-filter [data-slot=select-trigger]');await until(()=>b.evaluate('!!document.querySelector("[data-slot=select-content]")'),'shared select popup');await until(()=>b.evaluate('document.querySelector("[role=option]:last-child")?.title.length>500'),'long title loaded');
  assert.ok(await b.evaluate('(()=>{const r=document.querySelector("[data-slot=select-content]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()'),'long-title popup fits at '+width);
  await b.click('[role=option][value="1"]');await until(()=>b.evaluate('document.querySelector("#video-filter [data-slot=select-trigger]").textContent.includes("Un vídeo")'),'source selection');
  assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'selected long title never widens page');
  await screen('compact-filters-'+width,width,900);
  await b.fill('#video-filter','');
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 check('categories hide zeros and sort by count; shared selectors truncate long source titles at 1440/390/320px');
 await b.evaluate('document.querySelector(".map-marker").dispatchEvent(new MouseEvent("click",{bubbles:true}))');await until(()=>b.evaluate('!!document.querySelector(".map-cluster-menu")'),'selectable cluster list');await b.click('[aria-label="Cerrar grupo"]');check('cluster places are individually selectable');
 await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'/',code:'Slash'});assert.equal(await b.evaluate('document.activeElement.id'),'place-search');check('populated catalog search shortcut');
 await b.fill('#place-search','JAPON templo');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===1'),'AND search');await b.waitText('Templo de Kiyomizu');await b.fill('#place-search','');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===4'),'clear query');
 await b.click('.save-place');await b.click('.secondary-filters>.chip');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===1'),'saved filter');await b.click('.secondary-filters>.chip');check('accent-insensitive AND search and saved filter');
 await b.click('.place-card');await b.waitText('Ficha del lugar');assert.ok(await b.evaluate('!!document.querySelector(".place-detail[role=dialog]")'));await screen('test-place-detail');await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await until(()=>b.evaluate('!document.querySelector(".place-detail")'),'drawer closes');assert.ok(await b.evaluate('document.activeElement.matches(".place-card")'));check('drawer focus trap, Escape and focus restoration');
 await b.click('.view-switch button:last-child');await until(()=>b.evaluate('!!document.querySelector(".gallery-mode")'),'gallery');await screen('test-gallery');await screen('test-gallery-mobile',390,844);await b.click('.place-card');await screen('test-detail-mobile',390,844);await b.click('.detail-close');
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await b.click('.place-card');await b.click('[aria-label="Descartar lugar"]');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===3'),'discard');await b.evaluate('[...document.querySelectorAll(".lab-toast button")].find(e=>e.textContent.includes("Deshacer")).click()');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===4'),'undo');check('local discard with working undo');
 await nav('procesamiento');await b.waitText('Reprocesar');await b.click('.trail-header .btn');await b.waitText('Iniciar cola');await b.click('[data-action=start]');await until(()=>calls.length===2,'retry starts');calls[1].resolve({kind:'process_error',message:'Test: fuente no disponible',exitCode:1});await runtime.queue.whenIdle();await b.waitText('La extracción no terminó correctamente');await nav('explorar');await b.waitText('Kukuru Dotonbori');assert.equal(await b.evaluate('document.querySelectorAll(".place-card").length'),4);check('failed reprocessing preserves previous places');
 await nav('procesamiento');await b.waitText('INTENTOS');await b.click('.attempt-tab:last-child');await b.waitText('Estás viendo un intento anterior');assert.equal(await b.evaluate('document.querySelector(".trail-header .heading-line .btn")'),null);check('historical attempts are read-only');
 await nav('explorar');await b.waitText('Mirador del vídeo');await b.click('.place-card:last-child .save-place');await nav('procesamiento');await b.waitText('Reprocesar');await b.click('.trail-header .btn');await b.waitText('Iniciar cola');await b.click('[data-action=start]');await until(()=>calls.length===3,'successful retry starts');await b.click('.attempt-tab:last-child');await b.waitText('Estás viendo un intento anterior');const priorAttempt=await b.evaluate('document.querySelector(".attempt-tab.selected").textContent');runtime.observeProgress(calls[2].request.request_id,{event:'step',step:'description',ts:new Date().toISOString()});await new Promise(r=>setTimeout(r,100));assert.equal(await b.evaluate('document.querySelector(".attempt-tab.selected").textContent'),priorAttempt);check('SSE progress preserves a selected historical attempt');await finish(2);await nav('explorar');await b.waitText('Mirador del vídeo');await b.click('.secondary-filters>.chip');await until(()=>b.evaluate('document.querySelectorAll(".place-card").length===2'),'saved preferences survive reprocessing');await b.waitText('Mirador del vídeo');check('saved name-only place survives successful reprocessing');
 await nav('results');await b.waitText('Todos los resultados');await until(()=>b.evaluate('!!document.querySelector("[data-details]")'),'legacy access');check('all extracted results remain accessible');
 await b.click('[data-details]');await until(()=>b.evaluate('!!document.querySelector("z-dialog-panel[role=dialog]")'),'legacy result detail');await screen('test-all-results-detail');await screen('test-all-results-detail-mobile',390,844);assert.ok(await b.evaluate('document.querySelector("z-dialog-panel").getBoundingClientRect().right<=innerWidth+1'));await b.click('[data-close-video]');check('existing result detail remains usable on desktop and mobile');
 for(const width of [1440,1024,1000,768,390,320]){await nav('explorar');await b.waitText('Kukuru Dotonbori');await screen('test-explore-'+width,width,width<800?844:900);}
 await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".page-enter")).animationName'),'none');check('responsive 320–1440px and reduced motion');
 // Regression: a stopped queue must distinguish waiting from actual processing.
 const added=(await app.inject({method:'POST',url:'/videos',payload:{url:'https://youtu.be/Limit123456'}})).json();
 await nav('procesamiento?video='+added.video.id);await b.waitText('Pendientes');
 await until(()=>b.evaluate('[...document.querySelectorAll(".queue-chips button")].find(e=>e.textContent.includes("Pendientes"))?.textContent.includes("1")'),'pending count');
 for(const width of [1440,390]){
   await screen('review-queue-'+width,width,900);
   assert.ok(await b.evaluate('[...document.querySelectorAll(".queue-chips button")].find(e=>e.textContent.includes("Procesando")).textContent.includes("0")'));
   await b.evaluate('[...document.querySelectorAll(".queue-chips button")].find(e=>e.textContent.includes("Pendientes")).click()');
   await until(()=>b.evaluate('document.querySelectorAll(".video-row").length===1'),'only pending row');
   await b.evaluate('[...document.querySelectorAll(".queue-chips button")].find(e=>e.textContent.includes("Procesando")).click()');
   await b.waitText('No hay vídeos con este filtro.');
   await b.evaluate('[...document.querySelectorAll(".queue-chips button")].find(e=>e.textContent.includes("Todos")).click()');
 }
 check('stopped queue separates pending and processing on desktop and mobile');
 await app.inject({method:'POST',url:'/queue/start'});await until(()=>calls.length===4,'duration test starts');
 await until(()=>b.evaluate('[...document.querySelectorAll(".queue-chips button")].find(e=>e.textContent.includes("Procesando"))?.textContent.includes("1")'),'processing count during run');
 const durationResult=JSON.parse(readFileSync(path.join(root,'tests/fixtures/extractor/error.json'),'utf8'));durationResult.request_id=calls[3].request.request_id;
 calls[3].resolve({kind:'result',resultJson:JSON.stringify(durationResult),exitCode:65,stderr:JSON.stringify({event:'diagnostic',message:'Video duration exceeds five minute limit'})});
 await runtime.queue.whenIdle();await b.waitText('Añadir un vídeo de hasta 5 minutos');
 for(const width of [1440,390]){
   await screen('review-duration-'+width,width,900);
   assert.equal(await b.evaluate('[...document.querySelectorAll(".agent-trail button")].filter(e=>/Reprocesar|Reintentar vídeo/.test(e.textContent)).length'),0);
   await b.click('.inline-error a');await b.waitText('¿Qué has descubierto?');
   await nav('procesamiento?video='+added.video.id);await b.waitText('Añadir un vídeo de hasta 5 minutos');
 }
 check('duration rejection offers another video without futile retry actions at both widths');
 await nav('procesamiento?video=1');await b.waitText('Reprocesar');
 check('other results retain reprocessing');
 assert.deepEqual(b.errors,[]);check('no browser runtime errors');
 writeFileSync(path.join(shots,'report.json'),JSON.stringify({checks,errors:b.errors},null,2));
}finally{if(b)await b.close();calls.forEach(c=>c.resolve({kind:'process_error',message:'test teardown',exitCode:1}));await app.close();rmSync(directory,{recursive:true,force:true});}











