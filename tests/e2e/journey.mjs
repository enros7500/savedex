import assert from 'node:assert/strict';
import {createServer,request as proxyRequest} from 'node:http';
import {readFileSync,existsSync,mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApplication} from '../../apps/api/dist/runtime.js';
import {loadConfig} from '../../apps/api/dist/config.js';
import {browser,until} from './browser.mjs';
import {visualChecks} from './visual.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const delivery=process.env.SAVEDEX_E2E_DELIVERY??'journey';
const cache=path.join(root,'.cache',delivery);mkdirSync(cache,{recursive:true});
const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-journey-'));
const calls=[],originalDownloads=[],checks=[];
const unified=process.env.SAVEDEX_E2E_UNIFIED==='1';
const webRoot=path.join(root,'apps/web/dist/browser');
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'db.sqlite')}),...(unified?{webRoot}:{}),extractor:{run(request,mode){return new Promise(resolve=>calls.push({request,mode,resolve}));}}});
app.addHook('onRequest',(request,_reply,done)=>{const match=request.url.match(/\/runs\/(\d+)\/result/);if(match)originalDownloads.push(Number(match[1]));done();});
const api=await app.listen({host:'127.0.0.1',port:0});
let offline=false,delayLibrary=false,heldLibrary=null;const streams=new Set();
const gateway=createServer((req,res)=>{
  if(req.url.startsWith('/api/')||unified){
    if(req.url==='/api/events'){streams.add(res);res.on('close',()=>streams.delete(res));}
    if(offline){res.writeHead(503);res.end();return;}
    const upstream=proxyRequest(api+(unified?req.url:req.url.slice(4)),{method:req.method,headers:{...req.headers,host:new URL(api).host,origin:api}},r=>{
      if(delayLibrary&&req.url.startsWith('/api/library')){delayLibrary=false;const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{heldLibrary=()=>{res.writeHead(r.statusCode,r.headers);res.end(Buffer.concat(chunks));};});return;}
      res.writeHead(r.statusCode,r.headers);r.pipe(res);
    });upstream.on('error',()=>res.destroy());req.pipe(upstream);res.on('close',()=>upstream.destroy());return;
  }
  const relative=decodeURIComponent(req.url.split('?')[0]);let file=path.resolve(webRoot,'.'+relative);
  if(!file.startsWith(webRoot+path.sep)||!existsSync(file)||!path.extname(file))file=path.join(webRoot,'index.html');
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${gateway.address().port}`;let b;
const check=name=>{checks.push(name);console.log('PASS '+name);};
async function nav(route){await b.send('Page.navigate',{url:origin+'/#'+route});await until(()=>b.evaluate('!!document.querySelector(".lab-nav")'),'shell');await until(()=>b.evaluate('!document.querySelector(".connection-dot").classList.contains("offline")'),'connected');}
async function finish(index,name='partial'){
  const c=calls[index],result=JSON.parse(readFileSync(path.join(root,`tests/fixtures/extractor/${name}.json`),'utf8'));
  result.request_id=c.request.request_id;result.source.input_url=c.request.url;result.source.canonical_url=c.request.url;result.source.platform='youtube';result.request_context.output_language='es';
  c.resolve({kind:'result',resultJson:JSON.stringify(result),exitCode:name==='partial'?2:name==='error'?65:0});
  await until(()=>runtime.history(runtime.snapshot().queue.entries.find(e=>e.runId&&`savedex_run_${e.runId}`===c.request.request_id).videoId).runs[0]?.state!=='processing','run completed');
}
async function openVideo(){await b.click('[data-video="1"] [data-details]');await until(()=>b.evaluate('!!document.querySelector("z-dialog-panel[role=dialog]")'),'result dialog');}
async function closeVideo(){await b.click('[data-close-video]');await until(()=>b.evaluate('!document.querySelector("z-dialog-panel")'),'dialog closed');}
async function action(name){await b.click('[data-video-actions]');await b.click('[role=menu] [data-action="'+name+'"]');await until(()=>b.evaluate('!document.querySelector("[role=menu]")'),'menu closed');}
async function addPending(id){return(await app.inject({method:'POST',url:'/videos',payload:{url:'https://youtu.be/'+id}})).json().video;}
try{
  b=await browser();await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  await nav('add');await b.waitText('Add videos');assert.equal(await b.evaluate('document.documentElement.lang'),'en');
  assert.equal(await b.evaluate('document.querySelector(".lab-brand").textContent.replace("BETA","").trim()'),'SaveDex');
  assert.ok((await b.evaluate('document.title')).endsWith(' · SaveDex'));
  assert.equal(await b.evaluate('new URL(document.querySelector("link[rel=icon]").href).pathname'),'/savedex-icon.svg');
  assert.ok(await b.evaluate('document.querySelector(".brand-mark").complete&&document.querySelector(".brand-mark").naturalWidth>0'));
  const manifestResponse=await fetch(api+'/manifest.webmanifest');
  if(unified){assert.match(manifestResponse.headers.get('content-type'),/application\/manifest\+json/);const manifest=await manifestResponse.json();assert.equal(manifest.name,'SaveDex');for(const icon of manifest.icons){const r=await fetch(new URL(icon.src,api+'/manifest.webmanifest'));assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\//);}}
  const manifest=await fetch(origin+'/manifest.webmanifest').then(r=>r.json());assert.equal(manifest.name,'SaveDex');
  for(const icon of manifest.icons){const r=await fetch(new URL(icon.src,origin+'/manifest.webmanifest'));assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\//);assert.ok((await r.arrayBuffer()).byteLength>100);}
  check('SaveDex brand, document title, favicon, install manifest and all icon sizes are served');
  for(const [previous,current] of [['anadir','add'],['procesado','processing'],['biblioteca','explore']]){
    await b.send('Page.navigate',{url:origin+'/'+previous+'?video=1'});await until(()=>b.evaluate(`location.hash==="#${current}?video=1"`),'canonical bookmarked route');
  }
  await nav('add');await b.fill('#language-select','es');await b.waitText('Añadir vídeos');await b.send('Page.reload');await b.waitText('Añadir vídeos');
  assert.equal(await b.evaluate('document.documentElement.lang'),'es');check('canonical routes and aliases preserve video filters; language persists');
  await b.fill('#url','https://example.com/video');await b.waitText('Aún no disponible');assert.equal(await b.evaluate('document.querySelector("#add-submit").disabled'),true);assert.equal(runtime.snapshot().videos.length,0);
  await b.fill('#url','https://youtu.be/ABCDEFGHIJK');await b.evaluate('document.querySelector("#url").focus()');
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2,windowsVirtualKeyCode:13});
  await until(()=>calls.length===1,'keyboard starts accepted extraction');
  await b.fill('#url','https://youtube.com/shorts/ABCDEFGHIJK');await b.waitText('Ya añadido');assert.equal(await b.evaluate('document.querySelector("#add-submit").disabled'),true);assert.equal(runtime.snapshot().queue.entries.length,1);
  check('unsupported links cannot submit; Ctrl+Enter processes valid links; aliases cannot duplicate a video');
  await b.click('.lab-nav a[href="#processing"]');await b.waitText('AGENT TRAIL');await until(()=>b.evaluate('!!document.querySelector(".node-card")'),'trace');
  await b.evaluate('window.firstNode=document.querySelector(".node-card")');runtime.observeProgress(calls[0].request.request_id,{event:'step',step:'ocr',ts:new Date().toISOString()});
  await until(()=>b.evaluate('document.querySelector(".timeline-node.running")?.textContent.includes("Texto en pantalla")'),'observed OCR');assert.ok(await b.evaluate('window.firstNode===document.querySelector(".node-card")'));
  await b.click('.lab-nav a[href="#explore"]');await b.waitText('Explorar lugares');assert.ok(await b.evaluate('!!document.querySelector(".live-count")'));
  await b.click('.lab-nav a[href="#processing"]');await until(()=>b.evaluate('!!document.querySelector(".timeline-node.running")'),'trace survives navigation');await until(()=>runtime.events.subscriberCount===1,'one SSE stream');
  await finish(0);await b.waitText('No se encontraron lugares');assert.equal(await b.evaluate('!!document.querySelector(".trail-complete a,.attempt-tab .badge")'),false);
  check('real progress survives navigation, keeps stable nodes and does not label non-place results as Explore');
  await nav('results');await b.waitText('Todos los resultados');await openVideo();await b.waitText('Prepare your CV.');await b.click('[data-evidence]');await b.waitText('Five recommendations.');
  assert.equal(await b.evaluate('document.querySelector("[data-evidence]").parentElement.getAttribute("data-state")'),'open');
  await action('accept');await until(()=>runtime.history(1).runs[0].review.manual==='accepted','accepted run');
  await action('exhaustive');await closeVideo();await nav('processing');await b.click('[data-action=start]');await until(()=>calls.length===2,'exhaustive run');assert.equal(calls[1].mode,'exhaustive');await finish(1,'error');await b.waitText('La extracción no terminó correctamente');
  await until(()=>b.evaluate('document.querySelectorAll(".attempt-tab").length===2'),'two attempts grouped');assert.equal(await b.evaluate('document.querySelectorAll(".video-row").length'),1);
  await b.click('.attempt-tab:last-child');await b.waitText('Estás viendo un intento anterior');assert.equal(await b.evaluate('document.querySelectorAll(".trail-actions button").length'),0);
  check('evidence and acceptance persist; exhaustive retry records failure; history stays read-only');
  await nav('results');await openVideo();await b.waitText('Prepare your CV.');await b.waitText('Se conserva el resultado válido anterior.');
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(cache,'downloads')});await action('download-original');await until(()=>originalDownloads.length>0,'download original');assert.equal(originalDownloads.at(-1),1);
  await b.click('[data-action=history]');await until(()=>b.evaluate('document.querySelectorAll("[data-run]").length===2'),'result history');await closeVideo();await until(()=>b.evaluate('document.activeElement.matches("[data-details]")'),'focus restored');
  await openVideo();await action('mark-review');await until(()=>runtime.history(1).runs.find(r=>r.id===1).review.manual==='review','mark displayed valid run');await action('accept');await closeVideo();
  check('failed retries preserve valid result; original download and review actions target the displayed run');
  await b.click('[data-view=type]');await b.waitText('Recomendación');await b.fill('#filter-text','impossible-no-match');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');
  await b.fill('#filter-text','');await b.fill('#filter-type','place');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');await b.fill('#filter-type','');await b.fill('#filter-from','2099-01-01');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');await b.fill('#filter-from','');await b.click('#filter-submit');await b.waitText('Prepare your CV.');
  delayLibrary=true;await b.fill('#filter-text','Prepare');await b.click('#filter-submit');await until(()=>heldLibrary!==null,'held library response');await b.fill('#filter-text','impossible-no-match');await b.click('#filter-submit');await b.waitText('No hay resultados con estos filtros');heldLibrary();heldLibrary=null;
  await b.evaluate('new Promise(resolve=>setTimeout(resolve,150))');assert.equal(await b.evaluate('document.querySelectorAll("sx-item").length'),0);
  await b.fill('#filter-text','');await b.click('#filter-submit');await b.click('[data-view=video]');await until(()=>b.evaluate('!!document.querySelector("[data-details]")'),'result restored');
  check('type, text and date filters work; stale responses cannot replace newer results');
  const second=await addPending('LMNOPQRSTUV');await addPending('WXYZ1234567');await nav('processing?video='+second.id);await b.click('[data-action=start]');await until(()=>calls.length===3,'next batch starts');await b.click('[data-action=stop]');await until(()=>runtime.snapshot().queue.workerStatus==='stopping','stop acknowledged');await finish(2,'success');await until(()=>runtime.snapshot().queue.workerStatus==='idle','stopped queue');assert.equal(calls.length,3);assert.equal(runtime.snapshot().queue.entries.filter(e=>e.state==='pending').length,1);
  await b.click('[data-action=start]');await until(()=>calls.length===4,'resume pending task');await until(()=>b.evaluate('!!document.querySelector("[data-action=stop]")'),'resumed worker visible');
  offline=true;for(const stream of streams)stream.destroy();await b.waitText('Sin conexión. Mostrando el último estado conocido');assert.equal(runtime.snapshot().queue.workerStatus,'running');assert.equal(await b.evaluate('document.querySelector("[data-action=stop]").disabled'),true);
  offline=false;await until(()=>b.evaluate('!document.querySelector(".connection-dot").classList.contains("offline")'),'SSE reconnect',15000);await finish(3,'success');await runtime.queue.whenIdle();
  check('stop finishes only the active task; resume keeps pending order; SSE reconnect restores the real worker state');
  const fourth=await addPending('REMOVELAST1');const fifth=await addPending('REMOVELAST2');await nav('processing?video='+fourth.id);await b.click('[data-action=start]');await until(()=>calls.length===5,'remove test starts');await b.click('[data-action=stop]');await until(()=>runtime.snapshot().queue.workerStatus==='stopping','stop before removal');await finish(4,'success');await runtime.queue.whenIdle();
  await nav('processing?video='+fifth.id);await b.waitText('Quitar de la cola');await b.click('.agent-trail .empty-state button');await until(()=>runtime.snapshot().queue.entries.every(e=>e.state!=='pending'),'pending removed');await b.waitText('Finalizar lote');await b.click('[data-action=start]');await until(()=>runtime.snapshot().queue.batch.state==='completed','empty stopped batch finalizes');
  check('removing the last pending task still lets the stopped batch finish');
  runtime.queue.mutate(()=>runtime.queue.videos.setTitle(1,'Lugar'));await b.fill('#language-select','en');await nav('processing?video=1');await until(()=>b.evaluate('document.querySelector(".trail-header h2")?.textContent==="Lugar"'),'literal source title');await b.fill('#language-select','es');
  check('original titles are never translated as UI labels');
  await visualChecks(b,root,delivery);check('current screens fit desktop and mobile, support reduced motion and keyboard focus');
  assert.deepEqual(b.errors,[]);writeFileSync(path.join(cache,'report.json'),JSON.stringify({checks,exceptions:b.errors,unified},null,2));
}catch(error){if(b){writeFileSync(path.join(cache,'failure.txt'),await b.text());console.error('BROWSER ERRORS',b.errors);}throw error;}
finally{heldLibrary?.();if(b)await b.close();for(const c of calls)c.resolve({kind:'process_error',message:'Test teardown',exitCode:1});await app.close();await new Promise(resolve=>gateway.close(resolve));rmSync(directory,{recursive:true,force:true});}
