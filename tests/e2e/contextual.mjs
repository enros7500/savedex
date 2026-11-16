import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {createApplication} from '../../apps/api/dist/runtime.js';
import {loadConfig} from '../../apps/api/dist/config.js';
import {browser,until} from './browser.mjs';
const root=path.resolve(import.meta.dirname,'../..');const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-context-ui-'));
const {app,runtime}=await createApplication({config:loadConfig({SAVEDEX_DATABASE:path.join(directory,'fixture.sqlite')}),webRoot:path.join(root,'apps/web/dist/browser'),extractor:{async run(){throw new Error('No real extraction');}}});
let b;try{
 const added=runtime.queue.mutate(()=>runtime.queue.videos.addVideo('https://youtu.be/AbC_123-xyz'));
 const run=runtime.queue.mutate(()=>runtime.queue.runs.startRun(added.entry.id));
 const base={event:'step',ts:'2026-11-14T12:00:00Z'};
 const steps=[{...base,step:'visual_scan',phase:'completed',sequence:1,message:'Visual scan complete'},{...base,step:'local_repair',phase:'started',sequence:2,attempt:1},{...base,step:'local_repair',phase:'failed',sequence:3,attempt:1},{...base,step:'external_review',phase:'skipped',sequence:4,message:'External review disabled'}];
 runtime.queue.mutate(()=>steps.forEach(e=>runtime.queue.runs.appendStep(run.id,e)));
 const fixture=JSON.parse(readFileSync(path.join(root,'tests/fixtures/extractor/success.json'),'utf8'));fixture.schema_version='3.1.0';fixture.processing.profile='contextual_local_v2';fixture.source.input_url=added.video.url;fixture.source.canonical_url=added.video.url;fixture.source.platform='youtube';fixture.extensions={'workflow:steps':steps};
 runtime.queue.mutate(()=>runtime.queue.runs.completeRun(run.id,{kind:'result',resultJson:JSON.stringify(fixture),exitCode:0}));
 const origin=await app.listen({host:'127.0.0.1',port:0});b=await browser();await b.send('Page.navigate',{url:origin+'/processing?video='+added.video.id});
 await until(async()=> (await b.text()).includes('REGISTRO DE LA EJECUCIÓN'),'persistent workflow timeline');
 const text=await b.text();assert.ok(text.includes('4 EVENTOS'));assert.ok(text.includes('External review disabled'));assert.ok(text.includes('Intento 1'));assert.ok(text.includes('Error'));assert.ok(text.includes('Omitido'));
 await b.send('Page.reload');await until(async()=> (await b.text()).includes('4 EVENTOS'),'timeline survives browser reload');assert.deepEqual(b.errors,[]);
 await b.evaluate('document.querySelector("[aria-label*=completo]").scrollIntoView()');
 mkdirSync(path.join(root,'.cache/contextual'),{recursive:true});const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(path.join(root,'.cache/contextual/timeline.png'),Buffer.from(shot.data,'base64'));
 console.log('PASS contextual3.1 fixture browser timeline:4 events,failed repair,skipped external,reload,no browser errors');
}finally{if(b)await b.close();await app.close();rmSync(directory,{recursive:true,force:true});}

