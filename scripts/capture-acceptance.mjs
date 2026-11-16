import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { browser,until } from '../tests/e2e/browser.mjs';
const base=process.argv[2];if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base??''))throw new Error('Pass the loopback URL of the real acceptance server');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/evidence/delivery-7');await mkdir(out,{recursive:true});
const b=await browser();
try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});await b.send('Page.navigate',{url:base+'/library?video=1'});await b.waitText('Conectado');await until(()=>b.evaluate('document.querySelectorAll("sx-item").length>0'),'real library items');
  const before=await fetch(base+'/api/queue').then(r=>r.json());const timeOrigin=await b.evaluate('performance.timeOrigin');
  await b.send('Page.reload');await until(()=>b.evaluate(`performance.timeOrigin!==${timeOrigin} && document.querySelectorAll('sx-item').length===3`),'new real document reload and result');await b.waitText('Conectado');
  await b.fill('#theme','dark');await b.evaluate('document.querySelector("[data-video]").scrollIntoView({block:"start"})');
  const shot=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'real-library.png'),Buffer.from(shot.data,'base64'));
  const queue=await fetch(base+'/api/queue').then(r=>r.json());
  assert.ok(queue.revision>=before.revision);assert.ok(queue.runs.filter(r=>r.finishedAt).length>=before.runs.filter(r=>r.finishedAt).length);
  const report={verified_at:new Date().toISOString(),data:'real-media acceptance database, no fixture injection',read_only:true,displayed_video_id:1,displayed_items:await b.evaluate('document.querySelectorAll("sx-item").length'),new_document_reload_verified:true,result_survived_reload:true,snapshot_revision:queue.revision,worker_status_before_reload:before.queue.workerStatus,worker_status_at_capture:queue.queue.workerStatus,exceptions:b.errors};assert.deepEqual(b.errors,[]);
  await writeFile(path.join(root,'docs/delivery-7-real-ui.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await b.close();}
