import { spawn } from 'node:child_process';
import path from 'node:path';
// Test utility: contains only our temporary child tree; closing the owner kills the job.
export function ownedProcess(executable,args,{cwd,env=process.env,deadlineMs=120000}={}){
  const root=path.resolve(import.meta.dirname,'../..');
  const spec=Buffer.from(JSON.stringify({executable,arguments:args,deadlineMs})).toString('base64');
  const child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(root,'apps/api/dist/extractor/windows-job.ps1'),'-Spec',spec,'-OwnerPid',String(process.pid)],{cwd:cwd??root,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.stdin.end();
  const ended=new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
  return {output:()=>output,ended,async stop(){if(child.exitCode===null){child.kill('SIGKILL');await ended;}}};
}
