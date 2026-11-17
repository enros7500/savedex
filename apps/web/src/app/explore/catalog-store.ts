import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { ApiLibraryResult } from '@savedex/contracts/api';
import { ActivityStore } from '../core/activity-store';
import { Toasts } from '../core/toasts';
import { catalog, type Place } from './place-model';
import { Router } from '@angular/router';
@Injectable({providedIn:'root'})
export class CatalogStore {
  readonly activity=inject(ActivityStore);readonly toasts=inject(Toasts);private readonly router=inject(Router);
  readonly data=signal<ApiLibraryResult|null>(null);readonly loading=signal(true);readonly error=signal('');
  readonly saved=signal<string[]>(this.read('saved'));readonly discarded=signal<string[]>(this.read('discarded'));readonly seen=signal<string[]>(this.read('seen'));
  readonly all=computed(()=>catalog(this.data()?.videos??[]));
  readonly places=computed(()=>this.all().filter(p=>!p.preferenceKeys.some(key=>this.discarded().includes(key))));
  readonly otherCount=computed(()=>this.data()?.videos.reduce((n,r)=>n+r.items.filter(i=>i.type!=='place').length,0)??0);
  private generation=0;
  constructor(){effect(()=>{const s=this.activity.snapshot();if(s)untracked(()=>void this.load(s.streamId,s.revision));});}
  private read(key:string):string[]{if(this.activity.api.demo)return [];try{const a=JSON.parse(localStorage.getItem('savedex-lab-'+key)??'[]');return Array.isArray(a)?a.filter(v=>typeof v==='string'):[];}catch{return[];}}
  private persist(key:string,value:string[]){if(this.activity.api.demo)return;try{localStorage.setItem('savedex-lab-'+key,JSON.stringify(value));}catch{this.toasts.show('No se pudo guardar la preferencia en este navegador.');}}
  async load(epoch:string,revision:number){const generation=++this.generation;this.error.set('');if(!this.data())this.loading.set(true);try{const r=await this.activity.api.library({});if(generation!==this.generation)return;if(r.streamId!==epoch||r.revision<revision)return;const previous=this.data();this.data.set(r.library);if(previous)for(const row of r.library.videos){const before=previous.videos.find(v=>v.video.id===row.video.id);if(row.run&&row.run.id!==before?.run?.id&&row.run.state!=='processing'&&row.run.state!=='error'){const n=catalog([row]).length;const title=row.video.title??row.video.url;const message=n?n+' '+(n===1?'lugar disponible':'lugares disponibles')+' de «'+title+'»':'«'+title+'» procesado · no se encontraron lugares';this.toasts.show(message,n&&!this.router.url.startsWith('/explore')?'Ver':undefined,n?()=>void this.router.navigate(['/explore'],{queryParams:{video:row.video.id}}):undefined);}}}catch(e){if(generation===this.generation)this.error.set(e instanceof Error?e.message:'No se pudo cargar el catálogo.');}finally{if(generation===this.generation)this.loading.set(false);}}
  resetDemoPreferences(){this.saved.set([]);this.discarded.set([]);this.seen.set([]);}
  refresh(){const s=this.activity.snapshot();if(s)untracked(()=>void this.load(s.streamId,s.revision));}
  isSaved(p:Place){return p.preferenceKeys.some(key=>this.saved().includes(key));}
  hasSeen(p:Place){return p.preferenceKeys.some(key=>this.seen().includes(key));}
  toggleSave(p:Place){const isSaved=this.isSaved(p);this.saved.update(a=>isSaved?a.filter(key=>!p.preferenceKeys.includes(key)):[...new Set([...a,...p.preferenceKeys])]);this.persist('saved',this.saved());this.toasts.show((isSaved?'Quitado de guardados: ':'Guardado: ')+p.name);}
  markSeen(p:Place){if(!this.hasSeen(p)){this.seen.update(a=>[...new Set([...a,...p.preferenceKeys])]);this.persist('seen',this.seen());}}
  discard(p:Place){this.discarded.update(a=>[...new Set([...a,...p.preferenceKeys])]);this.persist('discarded',this.discarded());this.toasts.show('«'+p.name+'» descartado','Deshacer',()=>{this.discarded.update(a=>a.filter(key=>!p.preferenceKeys.includes(key)));this.persist('discarded',this.discarded());});}
}
