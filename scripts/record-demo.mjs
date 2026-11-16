import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../apps/api/dist/runtime.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { browser,until } from '../tests/e2e/browser.mjs';
const root=path.resolve(import.meta.dirname,'..');const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-demo-'));const frames=path.join(root,'.cache/delivery-7/demo');mkdirSync(frames,{recursive:true});
let pending;
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'db.sqlite')}),webRoot:path.join(root,'apps/web/dist/browser'),extractor:{run(request){return new Promise(resolve=>pending={request,resolve});}}});
const base=await app.listen({host:'127.0.0.1',port:0});let b;
try{
  b=await browser();await b.send('Emulation.setDeviceMetricsOverride',{width:1080,height:760,deviceScaleFactor:1,mobile:false});await b.send('Page.navigate',{url:base});await b.waitText('Conectado');await b.waitText('De guardado a útil.');await b.fill('#theme','dark');
  await b.evaluate(`(()=>{const e=document.createElement('div');e.textContent='Demostración · datos y extracción simulados';e.style.cssText='position:fixed;top:8px;right:15px;z-index:99;background:#121821;color:#e0ebfa;border:1px solid #70859f;padding:6px 10px;font:12px system-ui;border-radius:5px';document.body.append(e)})()`);
  for(let i=0;i<30;i++){
    if(i===3)await b.fill('#url','https://youtu.be/DEMO1234567');
    if(i===5){await b.click('#add-submit');await b.waitText('Vídeo añadido');}
    if(i===8){await b.click('[data-action=start]');await until(()=>!!pending,'demo active');runtime.observeProgress(pending.request.request_id,{event:'step',step:'description',ts:new Date().toISOString()});}
    if(i===11){await b.click('nav a[href="/processing"]');await b.waitText('Leyendo descripción');}
    if(i===14)runtime.observeProgress(pending.request.request_id,{event:'step',step:'ocr',ts:new Date().toISOString()});
    if(i===17){await b.click('nav a[href="/library"]');await b.waitText('Biblioteca');}
    if(i===20){const result=JSON.parse(readFileSync(path.join(root,'tests/fixtures/extractor/partial.json'),'utf8'));result.request_id=pending.request.request_id;result.source.input_url=pending.request.url;result.source.canonical_url=pending.request.url;result.source.platform='youtube';result.request_context.output_language='es';result.topic.label='Tres recomendaciones para tu próximo proyecto';pending.resolve({kind:'result',exitCode:2,resultJson:JSON.stringify(result)});await b.waitText('Prepare your CV.');await b.evaluate('document.querySelector("[data-video]").scrollIntoView({block:"start"})');}
    if(i===24){await b.click('[data-evidence]');await b.evaluate('document.querySelector("sx-item").scrollIntoView({block:"center"})');}
    const screenshot=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(frames,`${String(i).padStart(3,'0')}.png`),Buffer.from(screenshot.data,'base64'));
  }
  assert.deepEqual(b.errors,[]);writeFileSync(path.join(frames,'manifest.json'),JSON.stringify({frames:30,duration_per_frame_ms:500,total_duration_ms:15000,source:'actual compiled UI, real API/temp SQLite, simulated extractor, labelled synthetic'},null,2)+'\n');
  console.log('Recorded 30 synthetic demonstration frames');
}finally{if(b)await b.close();pending?.resolve({kind:'process_error',message:'Demo cleanup',exitCode:null});await app.close();rmSync(directory,{recursive:true,force:true});}
