import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {createApplication} from '../../apps/api/dist/runtime.js';
import {loadConfig} from '../../apps/api/dist/config.js';
import {browser,until} from './browser.mjs';
const root=path.resolve(import.meta.dirname,'../..');const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-context-ui-'));
const calls=[];
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'fixture.sqlite')}),webRoot:path.join(root,'apps/web/dist/browser'),titleResolver:async()=>null,extractor:{run(request){return new Promise(resolve=>calls.push({request,resolve}));}}});
let b;try{
 const added=runtime.queue.mutate(()=>runtime.queue.videos.addVideo('https://youtu.be/AbC_123-xyz'));
 const run=runtime.queue.mutate(()=>runtime.queue.runs.startRun(added.entry.id));
 const base={event:'step',ts:'2026-11-14T12:00:00Z'};
 const steps=[{...base,step:'visual_scan',phase:'completed',sequence:1,message:'Visual scan complete'},{...base,step:'local_repair',phase:'started',sequence:2,attempt:1},{...base,step:'local_repair',phase:'failed',sequence:3,attempt:1},{...base,step:'external_review',phase:'skipped',sequence:4,message:'External review disabled'}];
 runtime.queue.mutate(()=>steps.forEach(e=>runtime.queue.runs.appendStep(run.id,e)));
 const fixture=JSON.parse(readFileSync(path.join(root,'tests/fixtures/extractor/success.json'),'utf8'));fixture.schema_version='3.1.0';fixture.processing.profile='contextual_local_v2';fixture.source.input_url=added.video.url;fixture.source.canonical_url=added.video.url;fixture.source.platform='youtube';fixture.extensions={'workflow:steps':steps};
 runtime.queue.mutate(()=>runtime.queue.runs.completeRun(run.id,{kind:'result',resultJson:JSON.stringify(fixture),exitCode:0}));
 const origin=await app.listen({host:'127.0.0.1',port:0});b=await browser();await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await b.send('Page.navigate',{url:origin+'/processing?video='+added.video.id});
 await until(()=>b.evaluate('!!document.querySelector("#language-select")'),'shell');await b.fill('#language-select','es');await until(()=>b.evaluate('document.querySelectorAll(".step-toggle").length===12'),'timeline ready');
 assert.equal(await b.evaluate('document.querySelectorAll(".node-timeline").length'),1,'one timeline per selected attempt');
 assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),0,'finished steps collapse by default');
 await b.click('[data-step=local_repair] .step-toggle');await b.waitText('Intento 1');
 await b.click('[data-step=external_review] .step-toggle');await b.waitText('External review disabled');
 assert.equal(await b.evaluate('document.querySelector("[data-step=external_review]").classList.contains("skipped")'),true);
 await b.click('[data-timeline-action=expand]');assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),12);
 await b.click('[data-timeline-action=collapse]');assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),0);
 await b.send('Page.reload');await until(()=>b.evaluate('document.querySelectorAll(".step-toggle").length===12'),'timeline ready');assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),0);assert.deepEqual(b.errors,[]);
 await b.evaluate('document.querySelector(".timeline-toolbar").scrollIntoView()');
 mkdirSync(path.join(root,'.cache/contextual'),{recursive:true});const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(path.join(root,'.cache/contextual/timeline.png'),Buffer.from(shot.data,'base64'));
 console.log('PASS compact contextual timeline: one selected run, collapsed completed steps, manual details, expand/collapse all, reload, no browser errors');
 await app.inject({method:'POST',url:'/videos/'+added.video.id+'/retry'});await app.inject({method:'POST',url:'/queue/start'});await until(()=>calls.length===1,'simulated reprocessing');
 const event=(step,phase,sequence)=>runtime.observeProgress(calls[0].request.request_id,{event:'step',ts:new Date().toISOString(),step,phase,sequence});
 event('description','started',1);event('ocr','started',2);
 await until(()=>b.evaluate('document.querySelectorAll(".timeline-node.running .step-toggle[aria-expanded=true]").length===2'),'only the two active steps expand');
 assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),2);
 event('description','completed',3);await until(()=>b.evaluate('document.querySelector("[data-step=description] .step-toggle").getAttribute("aria-expanded")==="false"'),'completion collapses its detail');
 await b.click('[data-step=description] .step-toggle');event('ocr','completed',4);
 await until(()=>b.evaluate('document.querySelector("[data-step=ocr] .step-toggle").getAttribute("aria-expanded")==="false"'),'second completion collapses');
 assert.equal(await b.evaluate('document.querySelector("[data-step=description] .step-toggle").getAttribute("aria-expanded")'),'true','manual completed detail survives SSE refresh');
 await b.click('.attempt-tab:last-child');await b.waitText('Estás viendo un intento anterior');
 assert.equal(await b.evaluate('document.querySelectorAll(".timeline-node.running").length'),0,'historic attempt never borrows current activity');
 await b.click('.attempt-tab:first-of-type');await until(()=>b.evaluate('!document.querySelector(".banner.amber")'),'return to latest attempt');
 assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),0);
 event('transcription','started',5);await until(()=>b.evaluate('document.querySelector("[data-step=transcription] .step-toggle").getAttribute("aria-expanded")==="true"'),'activity following resumes for the selected attempt');
 calls[0].resolve({kind:'process_error',message:'Simulated end',exitCode:1});await runtime.queue.whenIdle();
 await until(()=>b.evaluate('document.querySelectorAll(".timeline-node.running").length===0'),'finished run has no active steps');
 assert.equal(await b.evaluate('document.querySelectorAll(".step-toggle[aria-expanded=true]").length'),0,'unfinished lifecycle event is not active after run ends');
 for(const width of [1440,390,320]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await b.evaluate('document.querySelector(".agent-trail").scrollTop=300');
  await until(()=>b.evaluate('document.querySelector(".trail-header").classList.contains("compact")'),'compact sticky header');
  assert.ok(await b.evaluate('Math.abs(document.querySelector(".trail-header").getBoundingClientRect().top-document.querySelector(".agent-trail").getBoundingClientRect().top)<2'),'video header stays at the top of its scroller');
  assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'timeline fits viewport');
  const shot=await b.send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(root,'.cache/contextual','compact-'+width+'.png'),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(b.errors,[]);console.log('PASS live compact timeline: concurrent steps, automatic completion collapse, manual override survives SSE, latest/history isolation, sticky header at 1440/390/320px');
}finally{calls.forEach(c=>c.resolve({kind:'process_error',message:'Test teardown',exitCode:1}));if(b)await b.close();await app.close();rmSync(directory,{recursive:true,force:true});}

