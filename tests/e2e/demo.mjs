import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {browser,until} from './browser.mjs';

const root=path.resolve(import.meta.dirname,'../../apps/web/dist-demo/browser');
const basePath=process.env.SAVEDEX_DEMO_BASE_PATH??'/';
const evidence=path.resolve(import.meta.dirname,'../../.cache/demo-ui');mkdirSync(evidence,{recursive:true});
const apiRequests=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api'))apiRequests.push(req.url);
  try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(basePath))throw Error('Outside demo base');const relative=url.pathname.slice(basePath.length)||'index.html';const file=path.resolve(root,decodeURIComponent(relative));if(!file.startsWith(root+path.sep))throw Error('Invalid path');if(!(await stat(file)).isFile())throw Error('Not a file');res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port+basePath.replace(/\/$/,'');
let b;
const shot=async name=>{const r=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));};
const nav=async route=>{await b.send('Page.navigate',{url:origin+'/#'+route});};
try{
  b=await browser();await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  // Hosted Windows runners can disable animations at OS level. Exercise both
  // preferences explicitly instead of inheriting the runner's desktop setting.
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('savedex-language','es');window.demoNetworkAttempts=[];window.fetch=(...a)=>{window.demoNetworkAttempts.push('fetch:'+a[0]);return Promise.reject(Error('Unexpected network call'));};window.EventSource=class{constructor(url){window.demoNetworkAttempts.push('SSE:'+url);throw Error('Unexpected SSE');}};`});
  await nav('add');await b.waitText('DEMO ONLY');await b.waitText('Try the demo');
  assert.equal(await b.evaluate('document.documentElement.lang'),'en');
  assert.equal(await b.evaluate('!!document.querySelector("#language-select")'),false);
  assert.equal(await b.evaluate('document.querySelector(".brand-mark").naturalWidth>0'),true);
  assert.equal(await b.evaluate('document.querySelector("#url").readOnly'),true);
  assert.ok((await b.evaluate('document.querySelector("#url").value')).includes('••••'));
  await shot('add-desktop');await b.click('#add-submit');await b.waitText('Start queue');
  assert.equal(await b.evaluate('document.querySelectorAll(".queue-chips button")[0].textContent.trim()'),'All 1');
  assert.equal(await b.evaluate('location.hash'),'#processing');
  await b.click('[data-action=start]');await until(()=>b.evaluate('!!document.querySelector("[data-queue-group=active]")'),'active simulated processing');
  await until(()=>b.evaluate('!!document.querySelector(".trail-complete")'),'completed demo',15000);
  await shot('processing-desktop');await nav('explore');await until(()=>b.evaluate('document.querySelectorAll("[data-place]").length===5'),'five places');
  await nav('results');await until(()=>b.evaluate('location.hash==="#explore"'),'legacy results route stays inside the demo');
  await shot('explore-desktop');
  const names=await b.evaluate('[...document.querySelectorAll("[data-place]")].map(e=>e.dataset.place)');
  for(const id of names){
    await b.evaluate(`[...document.querySelectorAll('[data-place]')].find(e=>e.dataset.place===${JSON.stringify(id)}).click()`);
    await b.waitText('Ask the Agent');await b.click('[data-agent-enrich]');
    await b.waitText('Simulation · no AI model');
    assert.ok(await b.evaluate(`!!document.querySelector('.detail-actions a[href*="google.com/maps"]')`));
    if(id===names[0])await shot('agent-desktop');
    await b.click('.detail-close');
  }
  await b.send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await shot('explore-mobile');
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".connection-dot")).animationName'),'connection-breathe');
  await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".connection-dot")).animationName'),'none');
  await b.click('[data-demo-reset]');await b.waitText('Try the demo');await shot('add-mobile');
  await nav('explore');await until(()=>b.evaluate('document.querySelectorAll("[data-place]").length===0'),'reset catalog');
  await nav('add');await b.waitText('Try the demo');await b.send('Page.reload');await b.waitText('Try the demo');
  assert.equal(await b.evaluate('document.documentElement.lang'),'en');
  assert.deepEqual(await b.evaluate('window.demoNetworkAttempts'),[]);
  assert.deepEqual(apiRequests,[]);assert.deepEqual(b.errors,[]);
  const external=await b.evaluate('performance.getEntriesByType("resource").filter(r=>new URL(r.name).origin!==location.origin).map(r=>r.name)');assert.deepEqual(external,[]);
  console.log('PASS demo: English lock, warning, masked input, local processing, five museums, all five agent results, mobile layout, reduced motion, reset/reload, zero API/SSE/fetch/external calls');
}finally{if(b)await b.close();await new Promise(r=>server.close(r));}
