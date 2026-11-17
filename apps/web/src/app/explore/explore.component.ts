import { TranslatePipe } from '../core/locale';
import { Component, computed, inject, signal, HostListener, ElementRef, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { CatalogStore } from './catalog-store';
import { categories, matchesSearch, placeSearch, type Place } from './place-model';
import { labIcons } from '../shared/lab-icons';
import { PlaceMapComponent } from './map.component';
import { PlaceDetailComponent } from './place-detail.component';
import { ZardSelectImports } from '../shared/components/select';
@Component({selector:'sx-explore',imports:[TranslatePipe,FormsModule,RouterLink,NgIcon,PlaceMapComponent,PlaceDetailComponent,ZardSelectImports],viewProviders:[labIcons()],templateUrl:'./explore.component.html'})
export class ExploreComponent {
 readonly catalog=inject(CatalogStore);private readonly route=inject(ActivatedRoute);private readonly host:ElementRef<HTMLElement>=inject(ElementRef);
 readonly categories=categories;readonly search=signal('');readonly query=signal('');readonly category=signal('');readonly location=signal('');readonly status=signal('');readonly video=signal('');readonly onlySaved=signal(false);readonly sort=signal('relevance');readonly view=signal<'map'|'gallery'>('map');readonly selectedId=signal<string|null>(null);readonly hovered=signal<string|null>(null);
 private timer:ReturnType<typeof setTimeout>|undefined;
 readonly selected=computed(()=>this.catalog.places().find(p=>p.id===this.selectedId())??null);
 readonly locations=computed(()=>[...new Set(this.catalog.places().map(p=>p.location).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')));
 readonly videos=computed(()=>this.catalog.data()?.videos.filter(r=>r.items.some(i=>i.type==='place')).map(r=>r.video)??[]);
 readonly base=computed(()=>this.catalog.places().filter(p=>matchesSearch(placeSearch(p),this.query())&&(!this.location()||p.location===this.location())&&(!this.video()||p.sources.some(s=>String(s.video)===this.video()))&&(!this.status()||(this.status()==='located'?!!p.coords:!p.coords))&&(!this.onlySaved()||this.catalog.isSaved(p))));
 readonly showMoreCategories=signal(false);
 readonly availableCategories=computed(()=>this.categories.filter(c=>this.count(c.id)>0||this.category()===c.id).sort((a,b)=>this.count(b.id)-this.count(a.id)));
 readonly visibleCategories=computed(()=>{const all=this.availableCategories();if(this.showMoreCategories())return all;const top=all.slice(0,6);const selected=all.find(c=>c.id===this.category());return selected&&!top.includes(selected)?[...top.slice(0,5),selected]:top;});
 readonly filtered=computed(()=>{const all=this.base().filter(p=>!this.category()||p.category.id===this.category());return [...all].sort((a,b)=>this.sort()==='az'?a.name.localeCompare(b.name,'es'):this.sort()==='recent'?b.addedAt.localeCompare(a.addedAt):this.sort()==='mentions'?this.mentions(b)-this.mentions(a):this.relevance(b)-this.relevance(a));});
 readonly missing=computed(()=>this.filtered().filter(p=>!p.coords).length);readonly locationCount=computed(()=>new Set(this.filtered().map(p=>p.location).filter(Boolean)).size);
 readonly hasFilters=computed(()=>!!(this.search()||this.category()||this.location()||this.status()||this.video()||this.onlySaved()));
 constructor(){const sub=this.route.queryParamMap.subscribe(p=>{this.video.set(p.get('video')??'');this.selectedId.set(null);});inject(DestroyRef).onDestroy(()=>{sub.unsubscribe();clearTimeout(this.timer);});}
 setSearch(value:string){this.search.set(value);clearTimeout(this.timer);this.timer=setTimeout(()=>this.query.set(value),120);}
 clear(){this.search.set('');this.query.set('');clearTimeout(this.timer);this.category.set('');this.location.set('');this.status.set('');this.video.set('');this.onlySaved.set(false);}
 count(cat:string){return this.base().filter(p=>p.category.id===cat).length;}
 mentions(p:Place){return new Set(p.sources.map(s=>s.video)).size;}
 relevance(p:Place){const q=this.query().trim();return q?(matchesSearch(p.name,q)?100:0)+(matchesSearch(p.location,q)?50:0)+this.mentions(p):this.mentions(p);}
 open(p:Place){this.selectedId.set(p.id);this.catalog.markSeen(p);}
 close(){const id=this.selectedId();this.selectedId.set(null);requestAnimationFrame(()=>Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-place]')).find(e=>e.dataset['place']===id)?.focus());}
 sourceColor(id:number){return ['#4F46E5','#EA580C','#0D9488','#DB2777','#0284C7'][id%5];}
 sourceVideos(p:Place){return [...new Set(p.sources.map(s=>s.video))];}
 @HostListener('document:keydown',['$event']) key(e:KeyboardEvent){const target=e.target as HTMLElement;const editing=target.matches('input,textarea,select')||target.isContentEditable;if(e.key==='/'&&!editing&&!this.selected()){e.preventDefault();this.host.nativeElement.querySelector<HTMLInputElement>('#place-search')?.focus();}if(e.key==='Escape'){if(this.selected())this.close();else{this.setSearch('');this.query.set('');}}}
}


