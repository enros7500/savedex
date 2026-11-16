import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAudioLines, lucideScanText, lucideFileText, lucideListChecks, lucideSave, lucideLoaderCircle, lucideWifiOff, lucidePauseCircle } from '@ng-icons/lucide';
import { ActivityStore } from '../core/activity-store';
import { TranslatePipe } from '../core/locale';

const stages: Record<string,{icon:string;detail:string}> = {
  acquisition:{icon:'lucideLoaderCircle',detail:'Adquiriendo los archivos del vídeo.'},
  visual_scan:{icon:'lucideScanText',detail:'Explorando el vídeo completo y seleccionando fotogramas.'},
  local_extraction:{icon:'lucideListChecks',detail:'Relacionando descripción, audio y texto visual.'},
  assessment:{icon:'lucideListChecks',detail:'Evaluando cobertura y posibles dudas.'},
  local_repair:{icon:'lucideScanText',detail:'Revisando fotogramas adicionales para resolver dudas.'},
  external_review:{icon:'lucideListChecks',detail:'Revisión externa con OpenAI según la configuración del servidor.'},
  start:{icon:'lucideLoaderCircle',detail:'Preparando el vídeo para la extracción.'},
  description:{icon:'lucideFileText',detail:'Buscando información en la descripción del vídeo.'},
  transcription:{icon:'lucideAudioLines',detail:'Convirtiendo el audio en texto para analizarlo.'},
  ocr:{icon:'lucideScanText',detail:'Buscando texto en los fotogramas.'},
  validation:{icon:'lucideListChecks',detail:'Comprobando los elementos encontrados y sus evidencias.'},
  finish:{icon:'lucideSave',detail:'Finalizando la extracción. El resultado aún no está disponible.'},
};

@Component({selector:'sx-processing-feedback',imports:[NgIcon,TranslatePipe],
  viewProviders:[provideIcons({lucideAudioLines,lucideScanText,lucideFileText,lucideListChecks,lucideSave,lucideLoaderCircle,lucideWifiOff,lucidePauseCircle})],
  template:`<div class="processing-feedback" [class.feedback-compact]="compact()" [class.feedback-stale]="!store.connected()" [class.feedback-stopping]="stopping()">
    <div class="feedback-heading"><span class="stage-symbol" [class.is-working]="store.connected()&&!stopping()" aria-hidden="true">@if(store.connected()&&!stopping()){<ng-icon class="activity-spinner" name="lucideLoaderCircle" size="32px"/>}@else{<ng-icon [name]="!store.connected()?'lucideWifiOff':'lucidePauseCircle'" size="26px"/>}</span>
      <div class="feedback-identity">@for(run of [store.queue()?.active?.runId];track run){<strong class="feedback-title" animate.enter="state-enter">{{store.activeTitle() || ('Vídeo activo' | t)}}</strong>}
      <p class="feedback-stage" role="status" aria-live="polite">@for(key of [visualState()];track key){<span class="feedback-stage-content" animate.enter="state-enter">@if(store.connected()){<ng-icon [name]="stage().icon" size="16px" aria-hidden="true"/>}{{(!store.connected()?'Último estado conocido':stopping()?'Deteniendo al finalizar el vídeo':store.step()) | t}}@if(store.connected()&&stopping()){ · {{store.step() | t}}}</span>}</p></div>
    </div>
    @if(!compact()){<p class="stage-detail">@for(key of [visualState()];track key){<span class="stage-detail-content" animate.enter="state-enter">{{stage().detail | t}}</span>}</p>
      <div class="feedback-timing">@if(elapsed();as time){<span>{{'Tiempo transcurrido' | t}} <b>{{time}}</b></span>}@if(lastSignal();as time){<span>{{'Última señal hace' | t}} <b>{{time}}</b></span>}</div>}
    @if(!store.connected()){<p class="feedback-notice">{{'Sin conexión. La cola puede seguir trabajando.' | t}}</p>}
    @else if(stopping()){<p class="feedback-notice">{{'Este vídeo terminará. El siguiente no se iniciará.' | t}}</p>}
    <div class="video-activity"><span class="progress-label">{{'Actividad del vídeo' | t}}</span><div class="video-activity-track" role="progressbar" [attr.aria-label]="'Actividad del vídeo' | t" [attr.aria-valuetext]="(!store.connected()?'Último estado conocido':stopping()?'Deteniendo al finalizar el vídeo':'Procesando') | t"><span class="video-activity-pulse" [class.is-active]="store.connected()&&!stopping()" aria-hidden="true"></span></div></div>
    @if(progress()?.workflow?.length){<details class="stage-detail"><summary>Registro de pasos · {{progress()?.workflow?.length}}</summary><ol>@for(event of progress()?.workflow;track $index){<li>{{event.ts | t}} · {{event.step}} · {{event.phase??'registrado'}} @if(event.attempt){ · Intento {{event.attempt}}} @if(event.message){ · {{event.message}}}</li>}</ol></details>}
    @if(batchProgress();as p){<div class="batch-progress"><span class="progress-label">{{'Avance del lote' | t}}</span><div class="batch-progress-copy"><span class="batch-count">{{p.done}} {{'de' | t}} {{p.total}} {{'vídeos procesados' | t}}</span><span>{{p.pending}} {{'en espera en este lote' | t}}</span></div>
      <meter class="batch-meter" min="0" [max]="p.total" [value]="p.done" [attr.aria-label]="'Vídeos procesados del lote' | t">{{p.done}} / {{p.total}}</meter>
      @if(!compact()){<p class="batch-outcomes"><span>{{p.success}} {{'completados' | t}}</span><span [class.warning]="p.partial>0">{{p.partial}} {{'parciales' | t}}</span><span [class.error-count]="p.failed>0">{{p.failed}} {{'errores' | t}}</span><span [class.warning]="p.review>0">{{p.review}} {{'por revisar' | t}}</span></p>}
    </div>}
  </div>`})
export class ProcessingFeedbackComponent {
  readonly compact=input(false);
  readonly store=inject(ActivityStore);
  readonly now=signal(Date.now());
  readonly stopping=computed(()=>this.store.queue()?.workerStatus==='stopping');
  readonly progress=computed(()=>{const s=this.store.snapshot();return s?.progress?.runId===s?.queue.active?.runId?s?.progress:null;});
  readonly visualState=computed(()=>[this.store.queue()?.active?.runId,this.progress()?.event.step,this.store.queue()?.workerStatus,this.store.connected()].join(':'));
  readonly stage=computed(()=>stages[this.progress()?.event.step??'']??{icon:'lucideLoaderCircle',detail:'Esperando información del extractor. Algunas etapas pueden tardar varios minutos.'});
  readonly elapsed=computed(()=>{const s=this.store.snapshot();return this.duration(s?.runs.find(r=>r.id===s.queue.active?.runId)?.startedAt);});
  readonly lastSignal=computed(()=>this.duration(this.progress()?.event.ts));
  readonly batchProgress=computed(()=>{const c=this.store.batch()?.counts;if(!c)return null;const total=c.total-c.removed;if(total<=0)return null;return {total,done:c.success+c.partial+c.failed,pending:c.pending,success:c.success,partial:c.partial,failed:c.failed,review:c.review};});
  constructor(){const timer=setInterval(()=>this.now.set(Date.now()),1000);inject(DestroyRef).onDestroy(()=>clearInterval(timer));}
  private duration(value:string|undefined){if(!value)return null;const timestamp=Date.parse(value);if(!Number.isFinite(timestamp)||timestamp>this.now())return null;const seconds=Math.floor((this.now()-timestamp)/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
}
