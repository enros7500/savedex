import { TranslatePipe } from '../core/locale';
import { Component, ElementRef, computed, effect, inject, input, output, signal, untracked, AfterViewInit, DestroyRef } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { labIcons } from '../shared/lab-icons';
import { worldPaths } from './world-paths';
import type { Place } from './place-model';
export function project(lat:number,lng:number){return{x:500+lng*1000/360,y:500-Math.log(Math.tan(Math.PI/4+Math.max(-84,Math.min(84,lat))*Math.PI/360))*1000/(2*Math.PI)};}
@Component({selector:'sx-place-map',imports:[TranslatePipe,NgIcon],viewProviders:[labIcons()],template:`
<div class="place-map" [class.is-dragging]="dragging()">
<svg class="world-map" role="group" [attr.aria-label]="'Mapa de los lugares con coordenadas extraídas' | t" [attr.viewBox]="box()" (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="stop($event)" (pointercancel)="stop($event)" (wheel)="wheel($event)">
<rect x="-10000" y="-10000" width="20000" height="20000" fill="#DFE8EC"/>
<g class="map-land">@for(country of countries;track country.name){<path [attr.d]="country.path" vector-effect="non-scaling-stroke"/>}</g>
@for(group of clusters();track group.id){<g class="map-marker" role="button" tabindex="0" [attr.aria-label]="(group.items.length>1?group.items.length+' lugares':group.items[0]!.name) | t" [attr.transform]="'translate('+group.x+' '+group.y+')'" (pointerdown)="$event.stopPropagation()" (click)="choose(group);$event.stopPropagation()" (keydown.enter)="choose(group)" (mouseenter)="highlight.emit(group.items[0]!.id)" (mouseleave)="highlight.emit(null)">
@if(group.items.length>1){<circle [attr.r]="(14+Math.min(group.items.length,20)/4)*unit()" [attr.fill]="group.active?'#4F46E5':'#18181B'" stroke="white" [attr.stroke-width]="2*unit()"/><text text-anchor="middle" dominant-baseline="central" fill="white" [attr.font-size]="11*unit()" font-weight="600">{{(group.items.length) | t}}</text>}
@else{ @if(group.active){<circle [attr.r]="15*unit()" [attr.fill]="group.items[0]!.category.color" opacity=".18"/>}<circle [attr.r]="(group.active?9:7)*unit()" [attr.fill]="group.items[0]!.category.color" stroke="white" [attr.stroke-width]="2*unit()"/>@if(clusters().length<=14){<text [attr.x]="12*unit()" [attr.y]="4*unit()" [attr.font-size]="11*unit()" class="pin-label" [attr.stroke-width]="3*unit()">{{group.items[0]!.name}}</text>}}
<title>{{group.items.slice(0,3).map(nameOf).join(' · ')}}</title></g>}
</svg>
@if(clusterItems().length){<div class="map-cluster-menu" [attr.aria-label]="'Lugares agrupados' | t"><div><strong>{{(clusterItems().length) | t}}{{" lugares en esta zona" | t}}</strong><button [attr.aria-label]="'Cerrar grupo' | t" (click)="clusterItems.set([])"><ng-icon name="lucideX" size="15"/></button></div>@for(p of clusterItems();track p.id){<button (click)="open.emit(p);clusterItems.set([])"><span class="category-dot" [style.background]="p.category.color"></span>{{p.name}}<ng-icon name="lucideChevronRight" size="13"/></button>}</div>}
<div class="map-label"><ng-icon name="lucideMap" size="14"/> {{"TUS DESCUBRIMIENTOS" | t}}</div>
<div class="map-controls"><button [attr.aria-label]="'Acercar mapa' | t" [attr.title]="'Acercar' | t" (click)="zoom(.5)"><ng-icon name="lucidePlus" size="18"/></button><button [attr.aria-label]="'Alejar mapa' | t" [attr.title]="'Alejar' | t" (click)="zoom(2)"><ng-icon name="lucideMinus" size="18"/></button><button [attr.aria-label]="'Ajustar a resultados' | t" [attr.title]="'Ajustar a resultados' | t" (click)="fit()"><ng-icon name="lucideMaximize" size="16"/></button></div>
@if(!points().length){<div class="map-empty"><span class="map-empty-icon"><ng-icon name="lucideMapPin" size="23"/></span><strong>{{(places().length?'Sin coordenadas disponibles':'El mundo está por descubrir') | t}}</strong><p>{{(places().length?'Los lugares aparecerán aquí cuando su resultado incluya coordenadas.':'Añade un vídeo y empieza a guardar lugares.') | t}}</p></div>}
<div class="map-bottom"><span>@if(missing()){<ng-icon name="lucideCircleAlert" size="12"/> {{(missing()) | t}}{{" sin ubicación no se muestran en el mapa" | t}}}@else{{{"Solo ubicaciones extraídas del vídeo" | t}}}</span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">{{"Natural Earth" | t}}</a></div></div>`})
export class PlaceMapComponent implements AfterViewInit {
 readonly clusterItems=signal<Place[]>([]);
 readonly places=input<Place[]>([]);readonly hovered=input<string|null>(null);readonly focused=input<Place|null>(null);readonly open=output<Place>();readonly highlight=output<string|null>();
 readonly Math=Math;readonly countries=worldPaths;readonly nameOf=(p:Place)=>p.name;
 readonly view=signal({x:0,y:90,w:1000,h:640});readonly width=signal(700);readonly height=signal(600);readonly dragging=signal(false);private pointer:{x:number;y:number;view:ReturnType<PlaceMapComponent['view']>}|null=null;
 readonly points=computed(()=>this.places().filter(p=>p.coords));readonly missing=computed(()=>this.places().length-this.points().length);
 readonly unit=computed(()=>Math.max(this.view().w/this.width(),this.view().h/this.height()));
 readonly box=computed(()=>{const v=this.view();return `${v.x} ${v.y} ${v.w} ${v.h}`;});
 readonly clusters=computed(()=>{const groups:{id:string;x:number;y:number;items:Place[];active:boolean}[]=[];for(const p of this.points()){const pos=project(p.coords!.lat,p.coords!.lng);const g=groups.find(g=>Math.hypot(g.x-pos.x,g.y-pos.y)<26*this.unit());if(g){g.items.push(p);g.active=g.active||p.id===this.hovered()||p.id===this.focused()?.id;}else groups.push({id:p.id,...pos,items:[p],active:p.id===this.hovered()||p.id===this.focused()?.id});}return groups;});
 private readonly host:ElementRef<HTMLElement>=inject(ElementRef);private readonly destroy=inject(DestroyRef);private signature='';private frame=0;
 constructor(){effect(()=>{const signature=this.points().map(p=>p.id+':'+p.coords?.lat+':'+p.coords?.lng).join('|');if(signature!==this.signature){this.signature=signature;untracked(()=>{this.clusterItems.set([]);this.fit();});}});effect(()=>{const p=this.focused();if(p?.coords)untracked(()=>this.fly(p));});this.destroy.onDestroy(()=>cancelAnimationFrame(this.frame));}
 ngAfterViewInit(){const observer=new ResizeObserver(entries=>{const r=entries[0]!.contentRect;this.width.set(r.width||700);this.height.set(r.height||600);untracked(()=>{const p=this.focused();if(p?.coords)this.fly(p);else this.fit();});});observer.observe(this.host.nativeElement);this.destroy.onDestroy(()=>observer.disconnect());}
 private fly(p:Place){const pos=project(p.coords!.lat,p.coords!.lng);const covered=innerWidth>1000?Math.min(480,this.width()):0;this.setBox(pos.x+covered/2*12/this.width(),pos.y,12);}
 setBox(cx:number,cy:number,w:number,duration=800){const h=w*this.height()/this.width();const target={x:cx-w/2,y:cy-h/2,w,h};cancelAnimationFrame(this.frame);if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.view.set(target);return;}const from=this.view(),started=performance.now();const tick=(now:number)=>{const t=Math.min(1,(now-started)/duration),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;this.view.set({x:from.x+(target.x-from.x)*ease,y:from.y+(target.y-from.y)*ease,w:from.w+(target.w-from.w)*ease,h:from.h+(target.h-from.h)*ease});if(t<1)this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
 fit(items=this.points()){if(!items.length){this.view.set({x:0,y:90,w:1000,h:640});return;}const points=items.map(p=>project(p.coords!.lat,p.coords!.lng));const xs=points.map(p=>p.x),ys=points.map(p=>p.y);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);this.setBox((minX+maxX)/2,(minY+maxY)/2,Math.min(1100,Math.max(8,(maxX-minX)*1.45,(maxY-minY)*this.width()/this.height()*1.45)));}
 zoom(factor:number){const v=this.view();const w=Math.max(.05,Math.min(2000,v.w*factor));this.setBox(v.x+v.w/2,v.y+v.h/2,w,300);}
 choose(group:ReturnType<PlaceMapComponent['clusters']>[number]){if(group.items.length>1){this.fit(group.items);this.clusterItems.set(group.items);}else{this.clusterItems.set([]);this.open.emit(group.items[0]!);}}
 start(e:PointerEvent){if(e.button!==0)return;cancelAnimationFrame(this.frame);this.clusterItems.set([]);const target=e.currentTarget as SVGSVGElement;target.setPointerCapture(e.pointerId);this.pointer={x:e.clientX,y:e.clientY,view:this.view()};this.dragging.set(true);}
 move(e:PointerEvent){if(!this.pointer)return;const p=this.pointer;const v=p.view;this.view.set({...v,x:v.x-(e.clientX-p.x)*this.unit(),y:v.y-(e.clientY-p.y)*this.unit()});}
 stop(e:PointerEvent){this.pointer=null;this.dragging.set(false);const target=e.currentTarget as SVGSVGElement;if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);}
 wheel(e:WheelEvent){e.preventDefault();this.zoom(e.deltaY>0?1.15:1/1.15);}
}


