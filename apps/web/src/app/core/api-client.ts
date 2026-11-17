import { Injectable } from '@angular/core';
import { DEMO_MODE } from './demo-config';
import { DemoSession } from './demo-session';
import type { AddVideoResult, ApiLibraryResult, LibraryFilters, PublicRunDetails } from '@savedex/contracts/api';
import type { ApplicationSnapshot, RevisionStamp, StreamFrame, SyncTransport } from '@savedex/contracts/events';
type Stamped<T> = RevisionStamp & T;
@Injectable({providedIn:'root'})
export class ApiClient implements SyncTransport {
  readonly demo = DEMO_MODE;
  private readonly demoSession = DEMO_MODE ? new DemoSession() : null;
  resetDemo(){this.demoSession?.reset();}
  async request<T>(path:string, method='GET', body?:unknown):Promise<T> {
    if(this.demoSession)return await this.demoSession.request(path,method,body) as T;
    let response:Response;
    try { response=await fetch('/api'+path,{method,cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}); }
    catch { throw new Error('No se pudo conectar. Comprueba que SaveDex sigue abierto.'); }
    const data=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.error?.message ?? 'No se pudo completar la acción. Vuelve a intentarlo.');
    return data as T;
  }
  loadSnapshot(){return this.request<ApplicationSnapshot>('/queue');}
  subscribe(event:(frame:StreamFrame)=>void,disconnect:()=>void):()=>void {
    if(this.demoSession)return this.demoSession.subscribe(event);
    const source=new EventSource('/api/events');
    for(const name of ['ready','change','reset'])source.addEventListener(name,e=>{
      try { event(JSON.parse((e as MessageEvent<string>).data) as StreamFrame); } catch { disconnect(); }
    });
    source.onerror=()=>disconnect();
    return ()=>source.close();
  }
  add(url:string){return this.request<Stamped<AddVideoResult>>('/videos','POST',{url});}
  library(filters:LibraryFilters){const query=new URLSearchParams(Object.entries(filters).filter(([,v])=>!!v));return this.request<Stamped<{library:ApiLibraryResult}>>('/library?'+query);}
  history(id:number){return this.request<Stamped<{runs:PublicRunDetails[]}>>(`/videos/${id}/runs`);}
}
