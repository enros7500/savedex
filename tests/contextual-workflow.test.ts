import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../apps/api/src/db/connection.js';
import { VideoRepository } from '../apps/api/src/features/videos/repository.js';
import { RunRepository } from '../apps/api/src/features/runs/repository.js';
import { ProgressScanner } from '../apps/api/src/extractor/protocol.js';
import { publicRun } from '../apps/api/src/http-dto.js';

test('contextual lifecycle persists across reopen and final reconciliation deduplicates without losing retries', () => {
 const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-steps-'));const file=path.join(directory,'test.sqlite');let db=openDatabase(file);
 try { let runs=new RunRepository(db);const added=new VideoRepository(db).addVideo('https://www.instagram.com/p/EXAMPLE1234/');const run=runs.startRun(added.entry!.id);
 const events=[{event:'step',step:'local_repair',ts:'2026-11-14T12:00:00Z',phase:'started',sequence:1,attempt:1,message:'Repair selected',details:{frames:16,prompt:'secret',api_key:'secret'}},{event:'step',step:'local_repair',ts:'2026-11-14T12:00:01Z',phase:'failed',sequence:2,attempt:1},{event:'step',step:'external_review',ts:'2026-11-14T12:00:02Z',phase:'skipped',sequence:3,attempt:1}];
 for(const event of events)runs.appendStep(run.id,event);
 db.close();db=openDatabase(file);runs=new RunRepository(db);
 assert.equal(runs.getRun(run.id).workflow.length,3);
 const result=JSON.parse(readFileSync(new URL('./fixtures/extractor/success.json',import.meta.url),'utf8'));result.extensions={'workflow:steps':[...events,{event:'step',step:'validation',ts:'2026-11-14T12:00:03Z',phase:'completed',sequence:4}]};
 const finished=runs.completeRun(run.id,{kind:'result',resultJson:JSON.stringify(result),exitCode:0});
 assert.equal(finished.workflow.length,4);assert.equal(publicRun(finished).workflow.length,4);assert.equal(JSON.stringify(publicRun(finished)).includes('secret'),false);
 } finally {db.close();rmSync(directory,{recursive:true,force:true});}
});
test('progress scanner forwards contextual lifecycle safely and rejects arbitrary sensitive details',()=>{
 const events:unknown[]=[];const scanner=new ProgressScanner(4096,e=>events.push(e));scanner.push(Buffer.from(JSON.stringify({event:'step',step:'assessment',ts:'2026-11-14T12:00:00Z',phase:'completed',sequence:7,attempt:2,message:'Local assessment complete',details:{frames:4,prompt:'private',api_key:'secret'},raw:'private'})+'\n'));scanner.end();
 assert.equal(events.length,1);assert.equal((events[0] as {phase:string}).phase,'completed');assert.equal(JSON.stringify(events).includes('private'),false);assert.equal(JSON.stringify(events).includes('secret'),false);
});


test('accepts historic3.0 and contextual3.1 while enforcing external provenance', async()=>{
 const {parseResult}=await import('../apps/api/src/features/runs/validate-result.js');
 const old=JSON.parse(readFileSync(new URL('./fixtures/extractor/success.json',import.meta.url),'utf8'));
 assert.equal(parseResult(JSON.stringify(old),0).schema_version,'3.0.0');
 const result=structuredClone(old);result.schema_version='3.1.0';result.processing.profile='contextual_local_v2';
 assert.equal(parseResult(JSON.stringify(result),0).schema_version,'3.1.0');
 const operation=result.processing.operations[0];operation.deployment='external';operation.recipient='OpenAI';operation.compute_target='not_applicable';
 assert.throws(()=>parseResult(JSON.stringify(result),0));result.processing.privacy.external_inference_used=true;
 assert.equal(parseResult(JSON.stringify(result),0).processing.privacy.external_inference_used,true);
 operation.recipient=null;assert.throws(()=>parseResult(JSON.stringify(result),0));
});


test('server external opt-in is explicit and invalid values are rejected', async()=>{
 const {loadConfig}=await import('../apps/api/src/config.js');assert.equal(loadConfig({}).externalInference,'disabled');assert.equal(loadConfig({SAVEDEX_EXTERNAL_INFERENCE:'openai'}).externalInference,'openai');assert.throws(()=>loadConfig({SAVEDEX_EXTERNAL_INFERENCE:'yes'}));
});
test('active snapshot carries durable full workflow for reconnect and public history keeps it after finish', async()=>{
 const {setupApi,until}=await import('./helpers/api.js');const fixture=await setupApi();try{
 const added=(await fixture.app.inject({method:'POST',url:'/videos',payload:{url:'https://youtu.be/AbC_123-xyz'}})).json();
 await fixture.app.inject({method:'POST',url:'/queue/start'});await until(()=>fixture.port.calls.length===1);const active=fixture.runtime.snapshot().queue.active!;
 fixture.runtime.observeProgress(`savedex_run_${active.runId}`,{event:'step',step:'assessment',ts:'2026-11-14T12:00:00Z',phase:'completed',sequence:1});
 fixture.runtime.observeProgress(`savedex_run_${active.runId}`,{event:'step',step:'external_review',ts:'2026-11-14T12:00:01Z',phase:'skipped',sequence:2});
 assert.equal(fixture.runtime.snapshot().progress?.workflow?.length,2);
 fixture.port.finish(0);await fixture.runtime.queue.whenIdle();const history=(await fixture.app.inject(`/videos/${added.video.id}/runs`)).json();assert.equal(history.runs[0].workflow.length,2);assert.equal(history.runs[0].externalInference,'local');
 }finally{await fixture.cleanup();}
});
