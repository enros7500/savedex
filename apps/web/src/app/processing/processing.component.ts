import { TranslatePipe, LocaleService } from '../core/locale';
import { Component, computed, effect, inject, signal, DestroyRef, untracked } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import type { ProgressEvent } from '@savedex/contracts/extractor';
import type { PublicRunDetails } from '@savedex/contracts/api';
import { ActivityStore } from '../core/activity-store';
import { CatalogStore } from '../explore/catalog-store';
import { labIcons } from '../shared/lab-icons';
import { stateLabel } from '../core/presentation';
import { QueueCountComponent } from './queue-count.component';
import { exceedsVideoLimit, needsAttention } from './recovery';
@Component({selector:'sx-processing',imports:[TranslatePipe,RouterLink,NgIcon,QueueCountComponent],viewProviders:[labIcons()],templateUrl:'./processing.component.html'})
export class ProcessingComponent {
 readonly locale=inject(LocaleService);readonly store=inject(ActivityStore);readonly catalog=inject(CatalogStore);readonly route=inject(ActivatedRoute);readonly label=stateLabel;
 readonly selected=signal<number|null>(null);readonly attempt=signal<number|null>(null);readonly history=signal<PublicRunDetails[]>([]);readonly historyLoading=signal(false);readonly historyError=signal('');readonly filter=signal('all');
 readonly expandedGroup=signal<string|null>(null);
 readonly timelineMode=signal<'auto'|'all'|'none'>('auto');
 readonly stepOverrides=signal<Record<string,boolean>>({});
 readonly compactHeader=signal(false);
 readonly countsAreLive=signal(false);
 readonly hidden=signal<string[]>(this.readHidden());readonly showHidden=signal(false);
 readonly hiddenCount=computed(()=>this.videos().filter(v=>this.hidden().includes(this.hiddenKey(v))&&!this.hasPending(v.video.id)).length);
 private countsInitialized=false;
 readonly openGroup=computed(()=>this.expandedGroup()??(this.groups().find(g=>g.id==='active')??this.groups()[0])?.id??'');
 toggleGroup(id:string){this.expandedGroup.set(this.openGroup()===id?'':id);}
 readonly filters=[{id:'all',label:'Todos'},{id:'pending',label:'Pendientes'},{id:'active',label:'Procesando'},{id:'places',label:'Con lugares'},{id:'errors',label:'Errores'}];
 readonly durationBlocked=computed(()=>exceedsVideoLimit(this.run()?.errorMessage));
 readonly nodes=[{id:'start',label:'Preparar',stage:''},{id:'acquisition',label:'Adquirir',stage:'acquisition'},{id:'description',label:'Descripción',stage:'description'},{id:'visual_scan',label:'Exploración visual',stage:'visual_scan'},{id:'ocr',label:'Texto en pantalla',stage:'ocr'},{id:'transcription',label:'Transcripción',stage:'transcription'},{id:'local_extraction',label:'Extracción local',stage:'local_extraction'},{id:'assessment',label:'Evaluación',stage:'assessment'},{id:'local_repair',label:'Reparación local',stage:'local_repair'},{id:'external_review',label:'Revisión OpenAI',stage:'external_review'},{id:'validation',label:'Validar',stage:'review'},{id:'finish',label:'Resultado',stage:''}];
 readonly observed=signal<Record<number,Record<string,string>>>({});private generation=0;
 readonly videos=computed(()=>{const s=this.store.snapshot();return(s?.videos??[]).map(video=>{const entries=s!.queue.entries.filter(e=>e.videoId===video.id).sort((a,b)=>b.id-a.id);const entry=entries.find(e=>e.state==='processing')??entries.find(e=>e.state==='pending')??entries[0];const runs=s!.runs.filter(r=>r.videoId===video.id).sort((a,b)=>b.id-a.id);return{video,entry,runs,run:runs[0],places:this.catalog.data()?.videos.find(r=>r.video.id===video.id)?.items.filter(i=>i.type==='place').length??0};});});
 readonly current=computed(()=>this.videos().find(v=>v.video.id===this.selected())??null);
 readonly run=computed(()=>this.history().find(r=>r.id===this.attempt())??this.history()[0]??null);
 readonly selectedRunId=computed(()=>this.run()?.id);
 readonly runStamp=computed(()=>{const id=this.selected();const runs=this.store.snapshot()?.runs.filter(r=>r.videoId===id);return id===null?null:id+':'+runs?.map(r=>r.id+':'+r.state+':'+r.review.manual).join(',')+':'+(this.store.snapshot()?.revision??0);});
 readonly isHistoric=computed(()=>!!this.run()&&this.run()!.id!==this.current()?.run?.id);
 readonly groups=computed(()=>{const videos=this.videos().filter(v=>this.accept(v,this.filter())&&(this.showHidden()||this.hasPending(v.video.id)||!this.hidden().includes(this.hiddenKey(v))));return[{id:'errors',title:'Necesitan atención',rows:videos.filter(v=>this.attention(v))},{id:'active',title:'Procesando ahora',rows:videos.filter(v=>v.entry?.state==='processing')},{id:'pending',title:'En cola',rows:videos.filter(v=>v.entry?.state==='pending').sort((a,b)=>(a.entry?.order??0)-(b.entry?.order??0))},{id:'done',title:'Terminados',rows:videos.filter(v=>!['failed','processing','pending'].includes(v.entry?.state??'')&&!this.attention(v)).sort((a,b)=>(b.entry?.id??0)-(a.entry?.id??0))}].filter(g=>g.rows.length);});
 constructor(){effect(()=>{this.selectedRunId();untracked(()=>this.setTimelineMode('auto'));});effect(()=>{if(this.store.snapshot()){if(this.countsInitialized)this.countsAreLive.set(true);this.countsInitialized=true;}});const sub=this.route.queryParamMap.subscribe(p=>{const id=Number(p.get('video'));if(id>0)this.select(id);});effect(()=>{const videos=this.groups().flatMap(g=>g.rows);if(this.selected()===null&&videos.length)this.select(videos.find(v=>v.entry?.state==='processing')?.video.id??videos[0]!.video.id);});effect(()=>{const p=this.store.snapshot()?.progress;if(p)this.observed.update(all=>({...all,[p.runId]:{...all[p.runId],[p.event.step]:p.event.ts}}));});effect(()=>{const id=this.selected();const stamp=this.runStamp();if(id!==null&&stamp!==null)untracked(()=>void this.load(id));});inject(DestroyRef).onDestroy(()=>{this.generation++;sub.unsubscribe();});}
 attention(v:ReturnType<ProcessingComponent['videos']>[number]){const latest=this.catalog.data()?.videos.find(row=>row.video.id===v.video.id);const count=latest?.run?.id===v.run?.id?v.places:0;return needsAttention(v.entry?.state,v.run?.state,count,v.run?.review.required??false);}
 accept(v:ReturnType<ProcessingComponent['videos']>[number],filter:string){return filter==='all'||filter==='active'&&v.entry?.state==='processing'||filter==='pending'&&v.entry?.state==='pending'||filter==='places'&&v.places>0||filter==='errors'&&this.attention(v);}
 count(filter:string){return this.videos().filter(v=>this.accept(v,filter)).length;}
 select(id:number){if(this.selected()!==id){this.history.set([]);this.historyError.set('');this.attempt.set(null);this.selected.set(id);}}
 async load(id:number){const generation=++this.generation;if(!this.history().length)this.historyLoading.set(true);this.historyError.set('');try{const r=await this.store.api.history(id);if(generation===this.generation){this.history.set([...r.runs].sort((a,b)=>b.id-a.id));}}catch(e){if(generation===this.generation)this.historyError.set(e instanceof Error?e.message:'No se pudo cargar el historial.');}finally{if(generation===this.generation)this.historyLoading.set(false);}}
 nodeEvent(node:typeof this.nodes[number]){const run=this.run();if(!run)return undefined;const events=this.store.snapshot()?.progress;const workflow=events?.runId===run.id?events.workflow??run.workflow:run.workflow;return workflow?.filter(e=>e.step===node.id).at(-1);}
 nodeState(node:typeof this.nodes[number]){const run=this.run();if(!run)return 'pending';const event=this.nodeEvent(node);if(event?.phase)return event.phase==='started'?(run.state==='processing'?'running':'observed'):event.phase==='completed'?'done':event.phase==='failed'?'error':'skipped';if(node.id==='start')return 'done';const route=run.result?.routing.steps.find(s=>s.stage===node.stage);if(route)return route.outcome==='completed'?'done':route.outcome==='failed'?'error':route.outcome==='skipped'?'skipped':'pending';if(node.id==='finish'&&run.finishedAt)return run.state==='error'?'error':'done';const progress=this.store.snapshot()?.progress;if(run.state==='processing'&&progress?.runId===run.id&&progress.event.step===node.id)return 'running';return event||this.observed()[run.id]?.[node.id]?'observed':'pending';}
 nodeText(node:typeof this.nodes[number]){const run=this.run();const event=this.nodeEvent(node);if(event)return (event.message??this.eventPhase(event))+' · '+this.date(event.ts);const route=run?.result?.routing.steps.find(s=>s.stage===node.stage);if(route)return route.reason;if(node.id==='start'&&run)return 'Ejecución iniciada · '+this.date(run.startedAt);if(node.id==='finish'&&run?.finishedAt)return run.errorMessage??'Resultado guardado · '+this.date(run.finishedAt);const at=run?this.observed()[run.id]?.[node.id]:null;return at?'Evento recibido · '+this.date(at):'Este paso todavía no tiene un evento registrado.';}
 private stepKey(node:typeof this.nodes[number]){return this.run()?.id+':'+node.id+':'+this.nodeState(node);}
 stepOpen(node:typeof this.nodes[number]){return this.stepOverrides()[this.stepKey(node)]??(this.timelineMode()==='all'||this.timelineMode()==='auto'&&this.nodeState(node)==='running');}
 toggleStep(node:typeof this.nodes[number]){const open=!this.stepOpen(node);this.stepOverrides.update(v=>({...v,[this.stepKey(node)]:open}));}
 setTimelineMode(mode:'auto'|'all'|'none'){this.timelineMode.set(mode);this.stepOverrides.set({});}
 onTrailScroll(event:Event){this.compactHeader.set((event.target as HTMLElement).scrollTop>80);}
 eventPhase(event:ProgressEvent){return event.phase?({started:'En curso',completed:'Completado',skipped:'Omitido',failed:'Error'}[event.phase]):'Evento registrado';}
 statusText(state:string){return({done:'Completado',running:'En curso',error:'Error',skipped:'Omitido',pending:'Sin evento registrado',observed:'Evento registrado'} as Record<string,string>)[state];}
 duration(run:PublicRunDetails){return run.finishedAt?((new Date(run.finishedAt).getTime()-new Date(run.startedAt).getTime())/1000).toLocaleString(this.locale.language(),{maximumFractionDigits:1})+' s':'En curso';}
 date(at:string){return new Date(at).toLocaleString(this.locale.language(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
 resultCount(run:PublicRunDetails){return run.result?.items.filter(i=>i.type==='place').length??0;}
 visibleRun(video:number){const row=this.catalog.data()?.videos.find(v=>v.video.id===video);return row?.items.some(item=>item.type==='place')?row.run?.id:undefined;}
 hasPending(id:number){return this.store.queue()?.entries.some(e=>e.videoId===id&&['pending','processing'].includes(e.state))??false;}
 private readHidden():string[]{if(this.store.api.demo)return [];try{const v:unknown=JSON.parse(localStorage.getItem('savedex-hidden-attempts')??'[]');return Array.isArray(v)?v.filter((s):s is string=>typeof s==='string'):[];}catch{return [];}}
 hiddenKey(v:ReturnType<ProcessingComponent['videos']>[number]){return v.video.id+':'+(v.run?.id??'entry-'+v.entry?.id);}
 isHidden(v:ReturnType<ProcessingComponent['videos']>[number]){return this.hidden().includes(this.hiddenKey(v));}
 private persistHidden(){try{localStorage.setItem('savedex-hidden-attempts',JSON.stringify(this.hidden()));}catch{this.catalog.toasts.show('No se pudo guardar la preferencia en este navegador.');}}
 restore(key:string){this.hidden.update(v=>v.filter(k=>k!==key));this.persistHidden();}
 hide(v:ReturnType<ProcessingComponent['videos']>[number]){if(this.hasPending(v.video.id))return;const key=this.hiddenKey(v);this.hidden.update(a=>[...new Set([...a,key])]);this.persistHidden();this.selected.set(null);this.history.set([]);this.catalog.toasts.show('Quitado de Procesamiento. El historial se conserva.','Deshacer',()=>this.restore(key));}
 async retry(id:number){if(this.durationBlocked())return;if(await this.store.act('/videos/'+id+'/retry')){this.attempt.set(null);this.store.notice.set('Vídeo añadido a la cola.');}}
}
