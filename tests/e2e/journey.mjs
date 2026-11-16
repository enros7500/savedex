import assert from 'node:assert/strict';
import { createServer, request as proxyRequest } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApplication } from '../../apps/api/dist/runtime.js';
import { loadConfig } from '../../apps/api/dist/config.js';
import { browser, until } from './browser.mjs';
import { visualChecks } from './visual.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const delivery=process.env.SAVEDEX_E2E_DELIVERY??'delivery-6';
const cache = path.join(root,'.cache',delivery); mkdirSync(cache,{recursive:true});
const directory = mkdtempSync(path.join(os.tmpdir(),'savedex-ui-api-'));
const calls = [];
const originalDownloads=[];
const unified=process.env.SAVEDEX_E2E_UNIFIED==='1';
const {app,runtime} = await createApplication({ config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'data.sqlite')}),...(unified?{webRoot:path.join(root,'apps/web/dist/browser')}:{}),
  extractor:{run(request,mode){ return new Promise(resolve=>calls.push({request,mode,resolve})); }} });
app.addHook('onRequest',(request,_reply,done)=>{const match=request.url.match(/\/runs\/(\d+)\/result/);if(match)originalDownloads.push(Number(match[1]));done();});
const api = await app.listen({host:'127.0.0.1',port:0});
let offline = false; const streams=new Set();let delayLibrary=false;let heldLibrary=null;
const webRoot = path.join(root,'apps/web/dist/browser');
const gateway = createServer((req,res)=>{
  if(req.url.startsWith('/api/')||unified) {
    if(req.url==='/api/events'){streams.add(res);res.on('close',()=>streams.delete(res));}
    if(offline){res.writeHead(503);res.end();return;}
    const upstream=proxyRequest(api+(unified?req.url:req.url.slice(4)),{method:req.method,headers:{...req.headers,host:new URL(api).host,origin:api}},r=>{
      if(delayLibrary&&req.url.startsWith('/api/library')){delayLibrary=false;const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{heldLibrary=()=>{res.writeHead(r.statusCode,r.headers);res.end(Buffer.concat(chunks));};});return;}
      res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    upstream.on('error',()=>res.destroy()); req.pipe(upstream); res.on('close',()=>upstream.destroy());return;
  }
  const relative=decodeURIComponent(req.url.split('?')[0]);
  let file=path.resolve(webRoot,'.'+relative);
  if(!file.startsWith(webRoot+path.sep)||!existsSync(file)||!path.extname(file))file=path.join(webRoot,'index.html');
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${gateway.address().port}`;
let b; const checks=[];
async function openActivityTray(){if(await b.evaluate('document.querySelector("[data-tray-toggle]")?.getAttribute("aria-expanded")==="false"')){await b.click('[data-tray-toggle]');await until(()=>b.evaluate('document.querySelector("[data-tray-toggle]")?.getAttribute("aria-expanded")==="true"'),'activity tray expanded');}}
async function openFinished(){await until(()=>b.evaluate('!!document.querySelector("[data-finished-toggle]")'),'finished group');if(await b.evaluate('document.querySelector("[data-finished-toggle]").getAttribute("aria-expanded")==="false"'))await b.click('[data-finished-toggle]');await until(()=>b.evaluate('document.querySelector("[data-finished-toggle]").getAttribute("aria-expanded")==="true"'),'finished group expanded');}
async function expandFirst(){await until(()=>b.evaluate('!!document.querySelector("[data-details]")'),'video summary');if(!await b.evaluate('!!document.querySelector("z-dialog-panel")'))await b.click('[data-details]');await until(()=>b.evaluate('!!document.querySelector("z-dialog-panel[role=dialog]")'),'video dialog');}
async function closeVideo(){if(await b.evaluate('!!document.querySelector("[data-close-video]")'))await b.click('[data-close-video]');await until(()=>b.evaluate('!document.querySelector("z-dialog-panel")'),'video dialog closed');}
async function videoAction(action){await b.click('[data-video-actions]');await until(()=>b.evaluate('!!document.querySelector("[role=menu]")'),'video actions menu');await b.click('[data-action="'+action+'"]');await until(()=>b.evaluate('!document.querySelector("[role=menu]")'),'action menu closed');}
function check(name){checks.push(name);console.log('PASS '+name);}
async function finish(index,name='partial'){
  const c=calls[index]; const result=JSON.parse(readFileSync(path.join(root,`tests/fixtures/extractor/${name}.json`),'utf8'));
  result.request_id=c.request.request_id;result.source.input_url=c.request.url;result.source.canonical_url=c.request.url;result.source.platform='youtube';result.request_context.output_language='es';
  if(name==='partial')result.topic.label='Cinco recomendaciones para preparar tu siguiente paso profesional, conservar lo que has aprendido y volver a consultar cada detalle con su fuente original';
  if(name==='partial'&&result.collections.length){const unknown=structuredClone(result.collections[0]);unknown.id='unknown_coverage';unknown.label='Additional collection';unknown.expected_count=null;unknown.expected_count_evidence_ids=[];unknown.missing_count=null;result.collections.push(unknown);}
  c.resolve({kind:'result',resultJson:JSON.stringify(result),exitCode:name==='partial'?2:name==='error'?65:0});
}
try {
  b=await browser();await b.send('Page.navigate',{url:origin});
  await b.waitText('From saved to useful.');assert.equal(await b.evaluate('document.documentElement.lang'),'en');
  for(const [previous,next] of [['anadir','add'],['procesado','processing'],['biblioteca','library']]){
    await b.send('Page.navigate',{url:origin+'/'+previous+'?video=1'});
    await until(()=>b.evaluate('location.pathname==='+JSON.stringify('/'+next)),'legacy route redirects to English');
    assert.equal(await b.evaluate('location.search'),'?video=1');
  }
  await b.send('Page.navigate',{url:origin+'/add'});await b.waitText('From saved to useful.');
  check('English page routes and legacy redirects preserve query parameters');
  assert.ok(await b.evaluate('!!document.querySelector(".topbar #language") && !!document.querySelector(".topbar #theme") && !document.querySelector(".sidebar select")'),'preferences live in the topbar');
  assert.ok(await b.evaluate('document.querySelector("#language").matches("z-select") && document.querySelector("#url").getAttribute("data-slot")==="input"'),'ZardUI select and input are used');
  const key=async value=>{await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:{ArrowDown:40,Home:36,Enter:13,Escape:27,Tab:9}[value]});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value});};
  await b.evaluate('document.querySelector("#theme [role=combobox]").focus()');await key('ArrowDown');
  await until(()=>b.evaluate('!!document.querySelector("[role=listbox]")'),'keyboard opens select');
  await until(()=>b.evaluate('!!document.activeElement.closest("[role=listbox]")'),'keyboard focus enters the option list');
  assert.ok(await b.evaluate('document.querySelector("#theme [role=combobox]").getAttribute("aria-label").includes("Appearance")'));
  await key('Home');await key('Enter');await until(()=>b.evaluate('!document.querySelector("[role=listbox]")'),'keyboard selection closes menu');
  await key('ArrowDown');await until(()=>b.evaluate('!!document.activeElement.closest("[role=listbox]")'),'Escape test list focus');await key('Escape');assert.ok(await b.evaluate('document.activeElement.closest("#theme")!==null'),'Escape returns focus');
  await key('ArrowDown');await until(()=>b.evaluate('!!document.activeElement.closest("[role=listbox]")'),'Tab test list focus');await key('Tab');await until(()=>b.evaluate('document.activeElement.id==="url"'),'Tab leaves select for the next field');
  check('ZardUI select supports keyboard selection, Escape, Tab and accessible labels');
  await b.fill('#language','es');
  await until(()=>b.evaluate('document.querySelector("#theme [data-slot=select-value]").textContent.includes("Sistema")'),'selected option label follows the interface language');
  await b.waitText('De guardado a útil.');await b.send('Page.navigate',{url:origin});
  await b.waitText('De guardado a útil.');assert.equal(await b.evaluate('document.documentElement.lang'),'es');
  check('English default, Spanish switch and persisted preference after reload');
  await until(()=>b.evaluate('document.querySelector(".connection").classList.contains("is-connected")'),'idle connected state');
  assert.equal(await b.evaluate('!!document.querySelector(".activity")'),false);
  assert.equal(await b.evaluate('document.querySelector(".connection").textContent.trim()'),'Conectado');
  check('idle footer is hidden and connection label stays concise');
  assert.equal(await b.evaluate('document.querySelector(".limit-pill").getAttribute("aria-expanded")'),'false');
  await b.click('.limit-pill');await b.waitText('Máximo 5 minutos por vídeo, también en modo exhaustivo.');await b.click('.limit-pill');
  check('duration limit stays compact with its full explanation available on demand');
  await b.evaluate('window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await b.evaluate('document.querySelector(".connection").focus({preventScroll:true})');await until(()=>b.evaluate('!!document.querySelector("[role=tooltip]")'),'connection tooltip opens on focus');await b.waitText('Conexión con el servidor local de Savedex y sincronización de la cola.');
  await b.evaluate('document.querySelector("#url").focus()');
  check('connection indicator explains its real local synchronization signal on keyboard focus');
  await b.waitText('De guardado a útil.');
  await until(()=>b.evaluate("!!document.querySelector('#url') && !document.querySelector('#add-submit').disabled"),'connected form');
  await b.fill('#url','https://example.com/video');await b.click('#add-submit');await b.waitText('URL no admitida');assert.equal(runtime.snapshot().queue.entries.length,0);check('unsupported URL gives visible validation without creating task');
  await b.fill('#url','https://youtu.be/ABCDEFGHIJK');await b.click('#add-submit');await b.waitText('Vídeo añadido');
  await b.fill('#url','https://www.youtube.com/watch?v=ABCDEFGHIJK&utm_source=test');await b.click('#add-submit');await b.waitText('Este vídeo ya está guardado');
  assert.equal(runtime.snapshot().queue.entries.length,1);check('add and duplicate without a second entry');
  await b.click('[data-action="start"]');await until(()=>calls.length===1,'worker starts');
  runtime.observeProgress(calls[0].request.request_id,{event:'step',step:'ocr',ts:new Date().toISOString()});
  await b.click('nav a[href="/library"]');await b.waitText('Texto en pantalla');
  await until(()=>b.evaluate('!!document.querySelector(".activity .processing-feedback")'),'shared active feedback');
  assert.match(await b.evaluate('document.querySelector(".activity .feedback-title").textContent'),/ABCDEFGHIJK/);
  assert.match(await b.evaluate('document.querySelector(".activity .batch-count").textContent'),/0.*1/);
  assert.equal(await b.evaluate('document.querySelector(".activity .processing-feedback").textContent.includes("%")'),false);
  await b.click('nav a[href="/add"]');await b.waitText('De guardado a útil.');
  assert.equal(await b.evaluate('document.querySelectorAll(".global-activity-tray").length'),1,'same global tray is present on Add');
  await b.click('nav a[href="/processing"]');
  await until(()=>b.evaluate('!!document.querySelector("[data-tray-toggle]")'),'active tray');
  assert.equal(await b.evaluate('document.querySelector("[data-tray-toggle]").getAttribute("aria-expanded")'),'false');
  await b.click('[data-tray-toggle]');await b.waitText('Buscando texto en los fotogramas.');
  assert.equal(await b.evaluate('document.querySelectorAll(".global-activity-tray").length'),1);
  assert.equal(await b.evaluate('document.querySelectorAll(".queue-row.is-active").length'),1);
  assert.equal(await b.evaluate('document.querySelector(".queue-section").getAttribute("data-queue-section")'),'active','active video comes before pending and finished videos');
  assert.equal(await b.evaluate('document.querySelector(".queue-summary").getAttribute("aria-expanded")'),'false');
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".queue-details").closest("z-collapsible-content")).display'),'none');
  assert.ok(await b.evaluate('document.querySelector(".queue-summary h3").textContent.trim().length>0'));
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".stage-symbol.is-working")).borderRadius'),'50%');
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".activity-spinner")).width'),'32px');
  assert.equal(await b.evaluate('document.querySelector(".video-activity-track").getAttribute("aria-valuenow")'),null);
  assert.equal(await b.evaluate('document.querySelector(".batch-meter").value'),0);
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".video-activity-pulse.is-active")).animationName'),'video-activity');
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".stage-symbol.is-working")).transform'),'none');
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".activity-spinner")).animationName'),'none');
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".video-activity-pulse")).animationName'),'none');
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  runtime.observeProgress(calls[0].request.request_id,{event:'step',step:'validation',ts:new Date().toISOString()});
  await b.waitText('Validando resultados');
  assert.equal(await b.evaluate('document.querySelector(".batch-meter").value'),0,'stage changes do not advance the batch meter');
  runtime.observeProgress(calls[0].request.request_id,{event:'step',step:'ocr',ts:new Date().toISOString()});
  await b.waitText('Buscando texto en los fotogramas.');
  await b.click('.queue-summary');await b.waitText('Normal');
  await b.click('.attempt-summary');await b.waitText('YouTube · Normal');
  assert.equal(await b.evaluate('document.querySelector(".queue-summary").getAttribute("aria-expanded")'),'true');
  await b.click('.queue-summary');
  check('processing rows collapse details while preserving title and state; activity uses a circular indicator');
  const processingShots=path.join(root,'docs/evidence',delivery);mkdirSync(processingShots,{recursive:true});
  for(const width of [1280,390]){await b.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});const shot=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(processingShots,`active-processing-${width}.png`),Buffer.from(shot.data,'base64'));}
  await b.evaluate('document.querySelector("[data-tray-toggle]").focus()');await key('Escape');
  await until(()=>b.evaluate('document.querySelector("[data-tray-toggle]").getAttribute("aria-expanded")==="false"'),'Escape collapses the activity tray');
  assert.equal(await b.evaluate('document.activeElement.hasAttribute("data-tray-toggle")'),true);
  const collapsedTray=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(processingShots,'tray-collapsed-390.png'),Buffer.from(collapsedTray.data,'base64'));
  await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  await b.click('nav a[href="/library"]');
  check('processing feedback shows active identity, observed stage and real batch counts without percentages');
  await until(()=>runtime.events.subscriberCount===1,'one stream after navigation');check('global activity and real step survive navigation');
  const shots=path.join(root,'docs/evidence',delivery);mkdirSync(shots,{recursive:true});
  for(const width of [1280,320]){await b.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});const shot=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(shots,`activity-${width}.png`),Buffer.from(shot.data,'base64'));}
  await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  await finish(0);await b.waitText('Parcial');await openActivityTray();
  assert.equal(await b.evaluate('document.querySelector(".disclosure-label").classList.contains("sr-only")'),true);
  assert.equal(await b.evaluate('!!document.querySelector(".review-indicator ng-icon")'),true);
  assert.equal(await b.evaluate('!!document.querySelector(".activity a[data-slot=button] ng-icon")'),true);
  assert.equal(await b.evaluate('document.querySelector("[data-action=dismiss]").getAttribute("aria-label")'),'Cerrar resumen');
  assert.equal(await b.evaluate('document.querySelector("[data-action=dismiss]").textContent.trim()'),'');
  check('compact icon actions retain review text and accessible dismiss label');
  assert.equal(await b.evaluate('document.querySelector(".video-disclosure").getAttribute("data-state")'),'closed');
  assert.ok(await b.evaluate('document.querySelector(".result-summary").innerText.includes("2 pendientes de recuperar")'),'missing count stays visible while collapsed');
  assert.ok(await b.evaluate('document.querySelector(".result-summary").innerText.includes("Faltantes sin cuantificar")'),'mixed collections preserve unknown coverage in summary');
  assert.ok(await b.evaluate('document.querySelector(".result-summary h2").textContent.trim().length>0'));
  check('compact summary keeps title, state and missing count visible with details collapsed');
  await expandFirst();if(await b.evaluate('!!document.querySelector("[data-view=video][aria-pressed=true]")'))await expandFirst();await b.waitText('Prepare your CV.');check('library updates while worker finishes in another section');
  assert.equal(await b.evaluate('document.querySelector("[data-evidence]").parentElement.getAttribute("data-state")'),'closed');
  await b.click('[data-evidence]');await b.waitText('Five recommendations.');
  assert.equal(await b.evaluate('document.querySelector("[data-evidence]").parentElement.getAttribute("data-state")'),'open');check('evidence opens on demand');
  await b.click('[data-video-actions]');await until(()=>b.evaluate('!!document.querySelector("[role=menu]")'),'actions opens');await key('Escape');
  await until(()=>b.evaluate('!document.querySelector("[role=menu]")'),'Escape closes only the menu');assert.equal(await b.evaluate('document.querySelectorAll("z-dialog-panel").length'),1);
  await videoAction('accept');await b.waitText('Aceptado');check('manual acceptance belongs to displayed run');
  await videoAction('exhaustive');await closeVideo();await b.click('nav a[href="/processing"]');await b.click('[data-action="start"]');
  await until(()=>calls.length===2,'exhaustive started');assert.equal(calls[1].mode,'exhaustive');await finish(1,'error');
  await until(()=>b.evaluate('!!document.querySelector("[data-finished-toggle]")'),'completed video moves to finished group');
  assert.equal(await b.evaluate('document.querySelector("[data-finished-toggle]").getAttribute("aria-expanded")'),'false');
  await openFinished();await b.waitText('Error');
  assert.equal(await b.evaluate('document.querySelectorAll(".queue-row").length'),1,'all attempts of one video share a single outer row');
  await b.click('.queue-summary');
  assert.equal(await b.evaluate('document.querySelectorAll(".attempt-summary").length'),2);
  await b.click('.attempt-summary');await b.waitText('The publication is unavailable without authentication.');
  for(const width of [1280,390]){await b.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});const shot=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(processingShots,`grouped-attempts-${width}.png`),Buffer.from(shot.data,'base64'));}
  await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  check('attempts are grouped by video with independently expandable run details');
  await b.click('nav a[href="/library"]');if(await b.evaluate('!!document.querySelector("[data-view=video][aria-pressed=true]")'))await expandFirst();await b.waitText('Prepare your CV.');await b.waitText('El último intento falló');await b.waitText('Aceptado');check('failed attempt preserves prior result and acceptance');
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(cache,'downloads')});
  await videoAction('download-original');await until(()=>originalDownloads.length>0,'original result download requested');assert.equal(originalDownloads.at(-1),1,'download targets the displayed valid result, not the later failed attempt');
  check('original download from the unified actions menu targets the displayed extraction');
  await b.click('[data-action="history"]');await b.waitText('Historial de extracciones');
  await until(()=>b.evaluate('document.querySelectorAll("[data-run]").length===2'),'history response rendered');check('history contains valid and failed attempts');
  await closeVideo();
  await until(()=>b.evaluate('document.activeElement.matches("[data-details]")'),'closing history restores focus to a collapsed video summary');
  await expandFirst();
  assert.equal(await b.evaluate('document.querySelectorAll("z-dialog-panel[role=dialog]").length'),1,'video details open in one centered Zard dialog');
  await videoAction('mark-review');await b.waitText('Por revisar');
  await until(()=>runtime.history(1).runs.find(r=>r.id===1)?.review.manual==='review','manual review updated');
  await videoAction('accept');await until(()=>runtime.history(1).runs.find(r=>r.id===1)?.review.manual==='accepted','acceptance restored');check('mark for review acts on valid run despite newer failure');
  await closeVideo();await b.click('[data-view="type"]');await b.waitText('Recomendación');await b.fill('#filter-text','impossible-no-match');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');
  await b.fill('#filter-text','');await b.click('#filter-submit');if(await b.evaluate('!!document.querySelector("[data-view=video][aria-pressed=true]")'))await expandFirst();await b.waitText('Prepare your CV.');check('type view and filters use real library endpoint');
  await b.fill('#filter-type','place');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');
  await b.fill('#filter-type','');await b.fill('#filter-from','2099-01-01');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');
  await b.fill('#filter-from','');await b.click('#filter-submit');if(await b.evaluate('!!document.querySelector("[data-view=video][aria-pressed=true]")'))await expandFirst();await b.waitText('Prepare your CV.');check('type and incorporation date filters');
  delayLibrary=true;await b.fill('#filter-text','Prepare');await b.click('#filter-submit');await until(()=>heldLibrary!==null,'held library response');
  await b.fill('#filter-text','impossible-no-match');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');heldLibrary();heldLibrary=null;
  await new Promise(r=>setTimeout(r,150));assert.equal(await b.evaluate('document.querySelectorAll("sx-item").length'),0);check('late older filter response cannot overwrite newer results');
  await b.fill('#filter-text','');await b.click('#filter-submit');if(await b.evaluate('!!document.querySelector("[data-view=video][aria-pressed=true]")'))await expandFirst();await b.waitText('Prepare your CV.');
  await b.click('nav a[href="/add"]');
  for(const id of ['LMNOPQRSTUV','WXYZ1234567']){await b.fill('#url','https://youtu.be/'+id);await b.click('#add-submit');await until(()=>runtime.snapshot().videos.some(v=>v.url.includes(id)),'added');}
  await b.click('nav a[href="/processing"]');
  await until(()=>b.evaluate('!!document.querySelector("[data-queue-section=pending]")'),'pending group');
  assert.deepEqual(await b.evaluate('[...document.querySelectorAll(".queue-section")].map(e=>e.dataset.queueSection)'),['pending','finished']);
  assert.equal(await b.evaluate('document.querySelector("[data-finished-toggle]").getAttribute("aria-expanded")'),'false');
  assert.deepEqual(await b.evaluate('[...document.querySelectorAll("[data-queue-section=pending] .queue-row")].map(e=>Number(e.dataset.videoId))'),[2,3]);
  check('pending videos follow queue order above a collapsed finished group');
  await b.click('[data-action="start"]');await until(()=>calls.length===3,'third active');await openActivityTray();await b.click('[data-action="stop"]');await b.waitText('Deteniendo');
  await b.waitText('Este vídeo terminará. El siguiente no se iniciará.');
  assert.equal(await b.evaluate('document.querySelectorAll(".stage-symbol.is-working").length'),0);
  await finish(2,'success');await b.waitText('Cola detenida');assert.equal(calls.length,3);
  await b.click('[data-action="start"]');await until(()=>calls.length===4,'resume next');check('stop completes active and resume retains pending batch');
  await until(()=>b.evaluate('!!document.querySelector(".processing-feedback:not(.feedback-stopping)")'),'resumed active state reaches browser before disconnect');
  offline=true;for(const stream of streams)stream.destroy();await b.waitText('Sin conexión');
  await b.waitText('Último estado conocido');
  assert.equal(await b.evaluate('document.querySelectorAll(".stage-symbol.is-working").length'),0);
  assert.equal(runtime.snapshot().queue.workerStatus,'running');assert.match(await b.text(),/último estado|Último estado/);check('connection failure visible without pretending worker stopped');
  offline=false;await b.waitText('Conectado');await finish(3,'success');await b.waitText('Lote terminado');check('native EventSource reconnect converges');
  await b.click('[data-action="dismiss"]');await until(()=>b.evaluate('!document.querySelector("[data-action=dismiss]")'),'summary dismissed');
  assert.equal(await b.evaluate('!!document.querySelector(".activity")'),false,'dismissing the summary restores an idle layout without footer');
  check('finished batch summary dismisses');
  await b.click('nav a[href="/add"]');
  for(const id of ['REMOVELAST1','REMOVELAST2']){await b.fill('#url','https://youtu.be/'+id);await b.click('#add-submit');await until(()=>runtime.snapshot().videos.some(v=>v.url.includes(id)),'remove test added');}
  await b.click('[data-action="start"]');await until(()=>calls.length===5,'remove case active');await openActivityTray();await b.click('[data-action="stop"]');await until(()=>runtime.snapshot().queue.workerStatus==='stopping','stop acknowledged');await finish(4,'success');await b.waitText('Cola detenida');
  await b.click('nav a[href="/processing"]');
  await b.evaluate('document.querySelector(".queue-row button[aria-label^=Quitar]").closest(".queue-row").querySelector(".queue-summary").click()');
  await b.evaluate('document.querySelector(".queue-row button[aria-label^=Quitar]").closest(".attempt-row").querySelector(".attempt-summary").click()');
  await b.click('.queue-row button[aria-label^="Quitar"]');await until(()=>runtime.snapshot().queue.entries.every(e=>e.state!=='pending'),'last pending removed');
  await b.waitText('Finalizar lote');await b.click('[data-action="start"]');await until(()=>runtime.snapshot().queue.batch.state==='completed','stopped batch completed');await openFinished();await b.waitText('Completado · Lote');assert.equal(await b.evaluate('document.querySelectorAll(".global-activity-tray").length'),1);check('removing last stopped task still permits finishing batch with one shared global tray');
  runtime.queue.mutate(()=>runtime.queue.videos.setTitle(1,'Lugar'));
  await b.fill('#language','en');await b.waitText('Processing');
  await until(()=>b.evaluate('[...document.querySelectorAll(".queue-row h3")].some(e=>e.textContent.trim()==="Lugar")'),'original video title stays unchanged in English');
  runtime.queue.mutate(()=>runtime.queue.db.prepare('UPDATE videos SET title=NULL WHERE id=1').run());await b.fill('#language','es');
  check('real title matching a UI translation key remains unchanged');
  await visualChecks(b,root,delivery);check('visual matrix, contrast, reduced motion and keyboard');
  assert.deepEqual(b.errors,[],'no browser exceptions');
  writeFileSync(path.join(root,`docs/${delivery}-browser.json`),JSON.stringify({verified_at:new Date().toISOString(),checks,exceptions:b.errors},null,2)+'\n');
} catch(error){if(b){writeFileSync(path.join(cache,'failure.txt'),await b.text());console.error('BROWSER ERRORS',b.errors);console.error('OVERLAY DIAGNOSTICS',await b.evaluate('({focus:document.activeElement?.className,tooltips:[...document.querySelectorAll("[role=tooltip]")].map(e=>({text:e.textContent,html:e.innerHTML}))})'));}throw error;} finally {
  heldLibrary?.();if(b) await b.close();
  calls.forEach((c,i)=>finish(i));await app.close();await new Promise(r=>gateway.close(r));rmSync(directory,{recursive:true,force:true});
}
