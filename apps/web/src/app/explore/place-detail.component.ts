import { Component, input, output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { A11yModule } from '@angular/cdk/a11y';
import { CatalogStore } from './catalog-store';
import { safeUrl, type Place, type PlaceSource } from './place-model';
import { labIcons } from '../shared/lab-icons';
@Component({selector:'sx-place-detail',imports:[NgIcon,RouterLink,A11yModule],viewProviders:[labIcons()],template:`
<div class="detail-veil" (click)="close.emit()"></div><aside class="place-detail" role="dialog" aria-modal="true" [attr.aria-label]="place().name" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="close.emit();$event.stopPropagation()">
<div class="detail-art category-art" [style.--cat]="place().category.color" [style.--cat-light]="place().category.light"><span class="art-dots"></span><span class="detail-category"><ng-icon [name]="place().category.icon" size="15"/>{{place().category.label}}</span><ng-icon class="art-icon" [name]="place().category.icon" size="67"/><button class="detail-close" aria-label="Cerrar ficha" (click)="close.emit()"><ng-icon name="lucideX" size="20"/></button></div>
<div class="detail-content"><h2>{{place().name}}</h2><p class="detail-location" [class.warning]="!place().coords"><ng-icon name="lucideMapPin" size="15"/>{{place().coords?(place().location||'Ubicación extraída'):place().location?'Ubicación sin confirmar · '+(place().hint?'¿'+place().location+'?':place().location):'Solo tenemos el nombre'}}</p><div class="detail-badges"><span class="badge" [class.amber]="!place().coords">{{place().coords?'Con ubicación':'Solo nombre'}}</span><span class="badge">{{videoCount()}} {{videoCount()===1?'vídeo':'vídeos'}}</span></div>
<div class="detail-actions"><button class="btn" [class.dark]="catalog.isSaved(place())" [class.outline]="!catalog.isSaved(place())" [attr.aria-pressed]="catalog.isSaved(place())" (click)="catalog.toggleSave(place())"><ng-icon name="lucideBookmark" size="15"/>{{catalog.isSaved(place())?'Guardado':'Guardar'}}</button>@if(place().coords){<a class="btn outline" [href]="maps()" target="_blank" rel="noopener noreferrer">Google Maps<ng-icon name="lucideArrowUpRight" size="14"/></a>}<button class="btn ghost icon-only" aria-label="Descartar lugar" title="Descartar lugar" (click)="catalog.discard(place());close.emit()"><ng-icon name="lucideTrash2" size="17"/></button></div>
<section class="agent-request"><div class="side-heading"><ng-icon name="lucideSparkles" size="16"/><h3>Pídele al agente</h3><span class="badge">Próximamente</span></div><p>Localizar, investigar y hacer preguntas sobre este lugar estará disponible cuando se conecten estas acciones.</p></section>
@if(place().description&&place().description!==place().name){<section class="detail-section"><p class="eyebrow">DEL VÍDEO</p><p>{{place().description}}</p></section>}
<section class="detail-section"><h3>Ficha del lugar</h3><dl class="place-facts"><div class="full"><dt>Dirección</dt><dd [class.missing]="!place().address">{{place().address||'Sin datos'}}</dd></div><div><dt>Horario</dt><dd class="missing">Sin datos</dd></div><div><dt>Precio</dt><dd class="missing">Sin datos</dd></div><div><dt>Valoración</dt><dd class="missing">Sin datos</dd></div><div><dt>Tipo</dt><dd>{{place().category.label}}</dd></div></dl><p class="small muted">Solo se muestran datos presentes en la extracción.</p></section>
<section class="detail-section"><h3>Mencionado en {{videoCount()}} {{videoCount()===1?'vídeo':'vídeos'}}</h3>@for(source of place().sources;track $index){<article class="place-source"><a [href]="sourceUrl(source)" target="_blank" rel="noopener noreferrer"><span class="source-dot" [style.background]="sourceColor(source.video)"></span><strong>{{source.title}}</strong><ng-icon name="lucideArrowUpRight" size="13"/></a>@if(source.quote){<blockquote>“{{source.quote}}”</blockquote>}@if(source.time!==null){<a class="timestamp" [href]="sourceUrl(source)" target="_blank" rel="noopener noreferrer">{{timestamp(source.time)}}</a>}<a class="source-trace" routerLink="/procesamiento" [queryParams]="{video:source.video}">Ver procesamiento<ng-icon name="lucideChevronRight" size="12"/></a></article>}</section>
</div></aside>`})
export class PlaceDetailComponent {
 readonly place=input.required<Place>();readonly close=output<void>();readonly catalog=inject(CatalogStore);
 videoCount(){return new Set(this.place().sources.map(s=>s.video)).size;}
 maps(){const c=this.place().coords;return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(c?c.lat+','+c.lng:this.place().name);}
 sourceUrl(s:PlaceSource){const safe=safeUrl(s.url);if(!safe)return null;const u=new URL(safe);if(s.time!==null&&/^(www\.)?(youtube\.com|youtu\.be)$/.test(u.hostname))u.searchParams.set('t',String(Math.floor(s.time/1000)));return u.href;}
 timestamp(ms:number){const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
 sourceColor(id:number){return ['#4F46E5','#EA580C','#0D9488','#DB2777','#0284C7'][id%5];}
}

