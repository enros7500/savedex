import {spawnSync} from 'node:child_process';
import path from 'node:path';

// Keep one command for the complete browser battery, including production hosting.
const cases=[['journey.mjs',false],['journey.mjs',true],['video-lab.mjs',false],['language.mjs',false],['place-agent.mjs',false],['contextual.mjs',false]];
let failures=0;
for(const [file,unified] of cases){
  const label=file+(unified?' (unified hosting)':'');
  console.log('\nRunning '+label);
  const result=spawnSync(process.execPath,[path.join(import.meta.dirname,file)],{stdio:'inherit',shell:false,windowsHide:true,timeout:180000,env:{...process.env,SAVEDEX_E2E_UNIFIED:unified?'1':'0',SAVEDEX_E2E_DELIVERY:unified?'journey-unified':'journey'}});
  if(result.status!==0){failures++;console.error('FAIL '+label+(result.error?': '+result.error.message:''));}
}
console.log(`\nBrowser battery: ${cases.length-failures}/${cases.length} passed`);
process.exitCode=failures?1:0;
