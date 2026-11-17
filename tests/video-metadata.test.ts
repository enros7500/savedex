import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchVideoTitle } from '../apps/api/src/features/videos/metadata.js';
import { createApplication } from '../apps/api/src/runtime.js';
import { loadConfig } from '../apps/api/src/config.js';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { until } from './helpers/api.js';

test('title lookup uses official YouTube endpoint and preserves original title text', async () => {
  const title = await fetchVideoTitle('https://youtu.be/AbC_123-xyz', async url => {
    assert.equal(new URL(String(url)).origin, 'https://www.youtube.com');
    assert.equal(new URL(String(url)).searchParams.get('url'), 'https://www.youtube.com/watch?v=AbC_123-xyz');
    return new Response(JSON.stringify({title:' Vídeo & título <real> '}));
  });
  assert.equal(title, 'Vídeo & título <real>');
});
test('Instagram metadata updates are persisted and published without starting an extraction', async () => {
  const directory=mkdtempSync(path.join(os.tmpdir(),'savedex-metadata-'));
  const config=loadConfig({SAVEDEX_DATABASE:path.join(directory,'db.sqlite')});
  const extractor={async run():Promise<never>{throw new Error('must not extract');}};
  let release: ((title:string)=>void) | undefined;
  const {app,runtime}=await createApplication({config,extractor,titleResolver:()=>new Promise(resolve=>{release=resolve;})});
  try {
    const response=await app.inject({method:'POST',url:'/videos',payload:{url:'https://www.instagram.com/p/EXAMPLE1234/'}});
    assert.equal(response.statusCode,201);
    await until(()=>!!release);
    const before=runtime.snapshot();release!('A real title');
    await until(()=>runtime.snapshot().videos[0]?.title==='A real title');
    const after=runtime.snapshot();
    assert.ok(after.revision>before.revision);
    assert.equal(after.runs.length,0);assert.equal(after.queue.workerStatus,'idle');
    assert.equal(after.queue.entries[0]?.state,'pending');
    await app.close();
    const reopened=await createApplication({config,extractor});
    assert.equal(reopened.runtime.snapshot().videos[0]?.title,'A real title');
    await reopened.app.close();
  } finally {await app.close();rmSync(directory,{recursive:true,force:true});}
});

test('Instagram title uses public post metadata, decodes entities and ignores generic login pages', async () => {
  const url = 'https://www.instagram.com/p/EXAMPLE1234/';
  assert.equal(await fetchVideoTitle(url, async endpoint => {
    assert.equal(String(endpoint), url);
    return new Response('<meta content="Kyoto &amp; Osaka &#x1f363;" property="og:title">');
  }), 'Kyoto & Osaka 🍣');
  assert.equal(await fetchVideoTitle(url, async () => new Response('<meta property="og:title" content="Instagram"><meta name="description" content="Log in to Instagram">')), null);
  assert.equal(await fetchVideoTitle(url, async () => new Response('<meta property="og:description" content="12 likes - author: &quot;Tres sitios en Kioto&quot;">')), '12 likes - author: "Tres sitios en Kioto"');
});

test('Instagram reads title from the head without downloading a large page body', async()=>{
  let cancelled=false;
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('<head><meta property="og:title" content="Lugares de Kioto"></head>'));},cancel(){cancelled=true;}}),{headers:{'content-length':'3000000'}});
  assert.equal(await fetchVideoTitle('https://www.instagram.com/p/EXAMPLE1234/',async()=>response),'Lugares de Kioto');
  assert.equal(cancelled,true);
});
test('unavailable, malformed, oversized and unsupported metadata keep the URL fallback', async () => {
  for (const response of [new Response('{}'), new Response('broken'), new Response('x'.repeat(70000)), new Response('', {status:403})]) {
    assert.equal(await fetchVideoTitle('https://youtu.be/AbC_123-xyz', async () => response), null);
  }
  let called = false;
  assert.equal(await fetchVideoTitle('https://evil.test/video', async () => {called=true;throw new Error();}), null);
  assert.equal(called, false);
  assert.equal(await fetchVideoTitle('https://youtu.be/AbC_123-xyz', async () => {throw new Error('offline');}), null);
});
