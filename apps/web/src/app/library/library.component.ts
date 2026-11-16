import { ZardDialogImports } from '../shared/components/dialog/dialog.imports';
import { ZardDropdownImports } from '../shared/components/dropdown/dropdown.imports';
import { ZardTooltipImports } from '../shared/components/tooltip/tooltip.imports';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEllipsis, lucideX, lucideCircleAlert } from '@ng-icons/lucide';
import { ZardInputComponent } from '../shared/components/input';
import { ZardSelectImports } from '../shared/components/select';
import { ZardCollapsibleImports } from '../shared/components/collapsible';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ApiLibraryResult, LibraryFilters, ManualReview, PublicRunDetails } from '@savedex/contracts/api';
import { ActivityStore } from '../core/activity-store';
import { dayLabel, itemTypes, stateLabel } from '../core/presentation';
import { ZardButtonComponent } from '../shared/components/button';
import { ItemComponent } from './item.component';
import { LocaleService, TranslatePipe } from '../core/locale';
import { translateReviewReason } from '../core/messages';
@Component({selector:'sx-library',viewProviders:[provideIcons({lucideEllipsis,lucideX,lucideCircleAlert})],imports:[ZardDialogImports,ZardDropdownImports,ZardTooltipImports,NgIcon,ZardInputComponent,ZardSelectImports,ZardCollapsibleImports,TranslatePipe,FormsModule,RouterLink,ZardButtonComponent,ItemComponent],templateUrl:'./library.component.html'})
export class LibraryComponent {
  readonly store=inject(ActivityStore);private readonly route=inject(ActivatedRoute);
  readonly locale=inject(LocaleService);readonly filtersOpen=signal(false);
  readonly types=itemTypes;readonly typeOptions=Object.entries(itemTypes);readonly label=stateLabel;readonly day=(value:string)=>this.locale.day(value);
  text='';type='';fromDay='';toDay='';readonly filters=signal<LibraryFilters>({});readonly view=signal<'video'|'type'>('video');
  readonly data=signal<ApiLibraryResult|null>(null);readonly loading=signal(true);readonly error=signal('');readonly selected=signal<number|null>(null);readonly runs=signal<PublicRunDetails[]>([]);readonly historyError=signal('');readonly historyLoading=signal(false);
  private generation=0;private historyGeneration=0;private alive=true;
  readonly dialogOpen=signal(false);readonly detailId=signal<number|null>(null);readonly detailTab=signal<'result'|'history'>('result');
  readonly detailRow=computed(()=>this.data()?.videos.find(row=>row.video.id===this.detailId())??null);
  readonly selectedVideo=signal<number|null>(null);
  readonly rows=computed(()=>this.data()?.videos.filter(r=>this.selectedVideo()===null||r.video.id===this.selectedVideo())??[]);
  readonly groups=computed(()=>Object.entries(itemTypes).map(([type,label])=>({type,label,items:this.rows().flatMap(r=>r.items.filter(i=>i.type===type).map(item=>({item,video:r.video})))})).filter(g=>g.items.length));
  constructor(){
    const subscription=this.route.queryParamMap.subscribe(p=>{this.dialogOpen.set(false);this.selectedVideo.set(p.get('video')?Number(p.get('video')):null);});
    effect(()=>{const snapshot=this.store.snapshot();const filters=this.filters();if(snapshot)void this.load(filters,snapshot.streamId,snapshot.revision);});
    effect(()=>{const snapshot=this.store.snapshot();const id=this.selected();if(snapshot&&id!==null)void this.loadHistory(id,snapshot.streamId,snapshot.revision);});
    effect(()=>{if(this.dialogOpen()&&this.data()&&!this.loading()&&!this.detailRow())this.dialogOpen.set(false);});
    inject(DestroyRef).onDestroy(()=>{this.alive=false;this.generation++;this.historyGeneration++;subscription.unsubscribe();});
  }
  async load(filters:LibraryFilters,epoch:string,revision:number){
    const generation=++this.generation;this.loading.set(true);this.error.set('');
    try{const response=await this.store.api.library(filters);if(!this.alive||generation!==this.generation)return;
      if(response.streamId!==epoch||response.revision<revision){this.error.set('Los resultados se están actualizando. Vuelve a cargar.');return;}
      this.data.set(response.library);
    }catch(e){if(this.alive&&generation===this.generation)this.error.set(e instanceof Error?e.message:'No se pudo cargar la Biblioteca');}
    finally{if(this.alive&&generation===this.generation)this.loading.set(false);}
  }
  async loadHistory(id:number,epoch:string,revision:number){const generation=++this.historyGeneration;this.historyLoading.set(true);this.historyError.set('');
    try{const response=await this.store.api.history(id);if(!this.alive||generation!==this.historyGeneration)return;if(response.streamId!==epoch||response.revision<revision)throw new Error('El historial cambió. Vuelve a abrirlo.');this.runs.set(response.runs);}
    catch(e){if(this.alive&&generation===this.historyGeneration)this.historyError.set(e instanceof Error?e.message:'No se pudo cargar el historial');}
    finally{if(this.alive&&generation===this.historyGeneration)this.historyLoading.set(false);}}
  apply(){this.filters.set({...(this.type?{type:this.type as LibraryFilters['type']}:{}),...(this.text.trim()?{text:this.text.trim()}:{}),...(this.fromDay?{fromDay:this.fromDay}:{}),...(this.toDay?{toDay:this.toDay}:{})} as LibraryFilters);}
  submitFilters(){
    this.apply();
    const wasOpen=this.filtersOpen();this.filtersOpen.set(false);
    if(wasOpen)document.querySelector<HTMLButtonElement>('.filter-toggle')?.focus();
  }
  reasonText(reason:{code:string;message:string}){return translateReviewReason(reason,this.locale.language());}
  warningMessages(row:ApiLibraryResult['videos'][number]){return [...new Set([
    ...(row.run?.review.reasons.map(reason=>this.reasonText(reason))??[]),
    ...(row.result?.issues.map(issue=>issue.message)??[]),
    ...(row.result?.follow_up?.extraction_gaps?.map(gap=>gap.reason)??[]),
    ...(row.result?.coverage?.limitations??[]),
  ].map(message=>message.trim()).filter(Boolean))];}
  refresh(){const s=this.store.snapshot();if(s)void this.load(this.filters(),s.streamId,s.revision);}
  hasTask(id:number){return this.store.queue()?.entries.some(e=>e.videoId===id&&['pending','processing'].includes(e.state))??false;}
  review(id:number,review:ManualReview){return this.store.act('/runs/'+id+'/review','PATCH',{review});}
  async enqueue(id:number,mode='retry'){if(await this.store.act('/videos/'+id+'/'+mode))this.store.notice.set('Vídeo pendiente al final de la cola. Inicia la cola en Procesado.');}
  openVideo(id:number,event?:Event){(event?.currentTarget as HTMLElement|null)?.focus();this.detailId.set(id);this.detailTab.set('result');this.dialogOpen.set(true);}
  openHistory(id:number){if(this.selected()!==id){this.runs.set([]);this.selected.set(id);}this.detailTab.set('history');}
  closeHistory(){this.detailTab.set('result');}
  afterCloseVideo(){const id=this.detailId();this.dialogOpen.set(false);this.selected.set(null);this.historyGeneration++;this.detailId.set(null);if(!document.querySelector('[data-video="'+id+'"] [data-details]'))document.querySelector<HTMLElement>('.library-results')?.focus();}
  formatTime(value:string){return new Intl.DateTimeFormat(this.locale.language(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
  downloadOriginal(id:number){const link=document.createElement('a');link.href='/api/runs/'+id+'/result';link.download='';link.click();}
  openSource(url:string){window.open(url,'_blank','noopener,noreferrer');}
}
