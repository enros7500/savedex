import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SnapshotSynchronizer, type SyncState } from '@savedex/contracts/events';
import { ApiClient } from './api-client';
const steps:Record<string,string>={acquisition:'Adquiriendo vídeo',visual_scan:'Explorando contenido visual',local_extraction:'Extrayendo con contexto',assessment:'Evaluando cobertura',local_repair:'Revisando fotogramas adicionales',external_review:'Revisión externa · OpenAI',start:'Preparando extracción',description:'Leyendo descripción',transcription:'Transcribiendo audio',ocr:'Texto en pantalla',validation:'Validando resultados',finish:'Guardando resultado'};
@Injectable({providedIn:'root'})
export class ActivityStore {
  readonly api=inject(ApiClient);
  readonly state=signal<SyncState>({snapshot:null,connection:'connecting',syncing:true});
  readonly busy=signal(false);readonly error=signal('');readonly notice=signal('');
  readonly snapshot=computed(()=>this.state().snapshot);
  readonly queue=computed(()=>this.snapshot()?.queue??null);
  readonly connected=computed(()=>this.state().connection==='connected'&&!this.state().syncing);
  readonly pending=computed(()=>this.queue()?.entries.filter(e=>e.state==='pending').length??0);
  readonly running=computed(()=>['running','stopping'].includes(this.queue()?.workerStatus??''));
  readonly canStart=computed(()=>this.connected()&&!this.busy()&&!this.running()&&this.queue()?.workerStatus!=='faulted'&&(this.pending()>0||this.queue()?.batch?.state==='stopped'));
  readonly startLabel=computed(()=>this.queue()?.batch?.state==='stopped'?(this.queue()?.batch?.counts.pending?'Reanudar cola':'Finalizar lote'):'Iniciar cola');
  readonly step=computed(()=>{const p=this.snapshot()?.progress;return p?steps[p.event.step]??p.event.step:'Esperando el primer paso del extractor';});
  readonly batch=computed(()=>this.queue()?.batch??null);
  readonly summary=computed(()=>{const b=this.batch();return b?.state==='completed'&&!b.summaryDismissedAt?b:null;});
  readonly activeUrl=computed(()=>{const s=this.snapshot();return s?.videos.find(v=>v.id===s.queue.active?.videoId)?.url??'';});
  readonly activeTitle=computed(()=>{const s=this.snapshot();return s?.videos.find(v=>v.id===s.queue.active?.videoId)?.title??s?.videos.find(v=>v.id===s.queue.active?.videoId)?.url??'';});
  private readonly sync=new SnapshotSynchronizer(this.api,s=>this.state.set(s));
  constructor(){this.sync.start();inject(DestroyRef).onDestroy(()=>this.sync.stop());}
  async act(path:string,method='POST',body?:unknown):Promise<boolean>{
    if(this.busy()||!this.connected())return false;
    this.busy.set(true);this.error.set('');
    try{await this.api.request(path,method,body);return true;}
    catch(e){this.error.set(e instanceof Error?e.message:'No se pudo completar la acción');return false;}
    finally{this.busy.set(false);}
  }
}
