import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from './http-errors.js';

const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'};
export function webRoutes(app:FastifyInstance,directory:string):void {
  let root:string;
  try{root=realpathSync(directory);if(!statSync(path.join(root,'index.html')).isFile())throw new Error();}
  catch{throw new Error('Falta el build de Angular. Ejecuta scripts/start.ps1 o compila con pnpm build.');}
  const pages=new Set(['/','/add','/processing','/explore','/results','/library']);
  const previousPages:Record<string,string>={'/anadir':'/add','/procesado':'/processing','/procesamiento':'/processing','/explorar':'/explore','/biblioteca':'/explore'};
  app.get('/*',async(request,reply)=>{
    let pathname:string;
    try{pathname=decodeURIComponent(request.originalUrl.split('?')[0]!);}catch{throw new HttpError(404,'NOT_FOUND','No se encontró el recurso');}
    if(previousPages[pathname]&&!request.originalUrl.startsWith('/api/')){
      const query=request.url.includes('?')?request.url.slice(request.url.indexOf('?')):'';
      return reply.redirect(previousPages[pathname]+query,308);
    }
    const name=pages.has(pathname)?'index.html':pathname.slice(1);
    const extension=path.extname(name);
    const missing=()=>new HttpError(404,'NOT_FOUND','No se encontró el recurso');
    if(!types[extension]||name.includes('\\')||name.split('/').some(part=>part.startsWith('.'))||request.originalUrl.startsWith('/api/'))throw missing();
    let file:string;
    try{file=realpathSync(path.resolve(root,name));if(!file.startsWith(root+path.sep)||!statSync(file).isFile())throw missing();}
    catch{throw missing();}
    reply.header('x-content-type-options','nosniff').header('referrer-policy','no-referrer');
    reply.header('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
    return reply.type(types[extension]!).send(readFileSync(file));
  });
}
