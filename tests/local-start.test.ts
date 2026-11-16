import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildServer } from '../apps/api/src/app.js';
import { readEnvironment } from '../apps/api/src/config.js';
import { setupApi } from './helpers/api.js';

test('local .env resolves independently of cwd and existing environment wins',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'savedex-env-'));
  try{writeFileSync(path.join(root,'.env'),'PORT=3456\nSAVEDEX_DATABASE="./data/custom.sqlite"\n');
    const env=readEnvironment({PORT:'4567'},root);
    assert.equal(env.PORT,'4567');assert.equal(env.SAVEDEX_DATABASE,'./data/custom.sqlite');
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('missing .env is optional',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'savedex-env-'));
  try{assert.deepEqual(readEnvironment({PORT:'3456'},root),{PORT:'3456'});}finally{rmSync(root,{recursive:true,force:true});}
});
test('one server provides Angular routes, assets, prefixed API, and correct 404 boundaries',async()=>{
  const fixture=await setupApi();const webRoot=path.join(fixture.directory,'web');mkdirSync(webRoot);
  writeFileSync(path.join(webRoot,'index.html'),'<!doctype html><title>Savedex Test UI</title>');
  writeFileSync(path.join(webRoot,'main-ABC.js'),'console.log("web")');
  writeFileSync(path.join(webRoot,'.env'),'SECRET=never-expose');
  const app=buildServer(fixture.runtime,undefined,webRoot);
  try{
    for(const route of ['/','/add','/processing','/library?video=1']){const response=await app.inject(route);assert.equal(response.statusCode,200,route);assert.match(response.headers['content-type']!,/text\/html/);assert.match(response.body,/Savedex Test UI/);}
    for(const [previous,next] of [['anadir','add'],['procesado','processing'],['biblioteca','library']]){const response=await app.inject('/'+previous+'?video=1');assert.equal(response.statusCode,308);assert.equal(response.headers.location,'/'+next+'?video=1');}
    const asset=await app.inject('/main-ABC.js');assert.equal(asset.statusCode,200);assert.match(asset.headers['content-type']!,/javascript/);assert.equal(asset.headers['x-content-type-options'],'nosniff');
    const response=await app.inject('/api/queue');assert.equal(response.statusCode,200);assert.equal(response.json().queue.workerStatus,'idle');
    const library=await app.inject('/api/library');assert.equal(library.statusCode,200);assert.match(library.headers['content-type']!,/application\/json/);
    assert.equal((await app.inject('/__savedex_page/library')).statusCode,404);
    const add=await app.inject({method:'POST',url:'/api/videos',payload:{url:'https://youtu.be/ABCDEFGHIJK'}});assert.equal(add.statusCode,201);
    for(const route of ['/api/not-real','/api/anadir','/api/add','/api/processing','/api/main-ABC.js','/missing.js','/.env','/../config.ts','/%2e%2e/config.ts','/random-path']){const response=await app.inject(route);assert.equal(response.statusCode,404,route);assert.doesNotMatch(response.body,/SECRET|Savedex Test UI/);}
    assert.equal((await app.inject('/api/health')).json().status,'ok');
    assert.equal((await app.inject({method:'POST',url:'/biblioteca'})).statusCode,404);
  }finally{await app.close();await fixture.cleanup();}
});
test('missing Angular build gives an actionable startup error',()=>{
  assert.throws(()=>buildServer(undefined,undefined,path.join(os.tmpdir(),'savedex-no-build-unique')),/compila|build/i);
});
