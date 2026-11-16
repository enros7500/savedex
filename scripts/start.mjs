import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
const root=path.resolve(import.meta.dirname,'..');
if(process.version!=='v22.23.4')throw new Error('Usa scripts/start.ps1 con el entorno preparado por scripts/setup.ps1.');
const pnpm=path.join(root,'.tools/pnpm/node_modules/pnpm/bin/pnpm.cjs');
if(!existsSync(pnpm))throw new Error('Falta pnpm local. Ejecuta scripts/setup.ps1.');
process.env.PATH=[path.dirname(process.execPath),path.join(root,'.tools/pnpm/node_modules/.bin'),process.env.PATH].join(path.delimiter);
console.log('Preparando Savedex…');
const child=spawn(process.execPath,[pnpm,'build'],{cwd:root,shell:false,windowsHide:true,stdio:'inherit'});
const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
if(code!==0)process.exit(Number(code)||1);
// Import in this process so Ctrl+C reaches the backend's graceful shutdown handler.
await import('../apps/api/dist/server.js');
