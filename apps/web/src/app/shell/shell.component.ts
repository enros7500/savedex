import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { NgIcon } from '@ng-icons/core';
import { ActivityStore } from '../core/activity-store';
import { CatalogStore } from '../explore/catalog-store';
import { Toasts } from '../core/toasts';
import { labIcons } from '../shared/lab-icons';
import { LocaleService } from '../core/locale';
@Component({selector:'app-root',imports:[RouterLink,RouterLinkActive,RouterOutlet,NgIcon],viewProviders:[labIcons()],template:`
<a class="skip-link" href="#content" (click)="$event.preventDefault(); focusContent()">Saltar al contenido</a>
<div class="lab-app">
  <header class="lab-header">
    <a routerLink="/explorar" class="lab-brand" aria-label="Video Lab, explorar lugares"><span class="brand-mark"><ng-icon name="lucideFilm" size="19"/></span><span>Video Lab<span class="brand-beta">BETA</span></span></a>
    <nav class="lab-nav" aria-label="Navegación principal">
      <a routerLink="/anadir" routerLinkActive="active" ariaCurrentWhenActive="page" aria-label="Añadir vídeos"><ng-icon name="lucidePlus" size="17"/><span class="nav-label">Añadir vídeos</span></a>
      <a routerLink="/procesamiento" routerLinkActive="active" ariaCurrentWhenActive="page" aria-label="Procesamiento"><ng-icon name="lucideLayers" size="17"/><span class="nav-label">Procesamiento</span>@if(activeCount()){<span class="live-count"><i></i>{{activeCount()}}</span>}@else if(errors()){<span class="error-count" aria-label="Hay vídeos con errores">!</span>}</a>
      <a routerLink="/explorar" routerLinkActive="active" ariaCurrentWhenActive="page" aria-label="Explorar lugares"><ng-icon name="lucideMapPin" size="17"/><span class="nav-label">Explorar lugares</span><span class="quiet-count">{{catalog.places().length}}</span></a>
    </nav>
    <div class="header-end"><span class="connection-dot" [class.offline]="!store.connected()" role="status" [attr.aria-label]="store.connected()?'Conectado':'Sin conexión'" [title]="store.connected()?'Conectado al servidor local':'Sin conexión · Mostrando el último estado conocido'"></span><span class="avatar" aria-label="Espacio local">Tú</span></div>
  </header>
  @if(store.state().connection==='disconnected'){<div class="connection-banner" role="status">Sin conexión. Mostrando el último estado conocido; la cola puede seguir trabajando.</div>}
  <main id="content" tabindex="-1" class="lab-main" [class.legacy-main]="route().includes('/results')"><router-outlet/></main>
  <div class="toast-stack" aria-live="polite" aria-relevant="additions text">@for(t of toasts.items();track t.id){<div class="lab-toast"><ng-icon name="lucideCheck" size="17"/><span>{{t.message}}</span>@if(t.label){<button (click)="toasts.run(t)">{{t.label}}<ng-icon name="lucideArrowRight" size="14"/></button>}<button class="toast-close" (click)="toasts.close(t.id)" aria-label="Cerrar aviso"><ng-icon name="lucideX" size="15"/></button></div>}</div>
</div>`})
export class ShellComponent {
  readonly store=inject(ActivityStore);readonly catalog=inject(CatalogStore);readonly toasts=inject(Toasts);readonly router=inject(Router);readonly title=inject(Title);readonly locale=inject(LocaleService);
  readonly route=toSignal(this.router.events.pipe(filter(e=>e instanceof NavigationEnd),map(e=>e.urlAfterRedirects)),{initialValue:this.router.url});
  readonly activeCount=computed(()=>this.store.queue()?.entries.filter(e=>e.state==='pending'||e.state==='processing').length??0);
  readonly errors=computed(()=>this.store.snapshot()?.videos.filter(v=>v.state==='error').length??0);
  constructor(){this.locale.language.set('es');document.documentElement.lang='es';document.documentElement.style.colorScheme='light';effect(()=>{const r=this.route();this.title.setTitle((r.includes('anadir')?'Añadir vídeos':r.includes('procesamiento')?'Procesamiento':r.includes('results')?'Todos los resultados':'Explorar lugares')+' · Video Lab');});effect(()=>{const s=this.store.notice();if(s){this.toasts.show(s);this.store.notice.set('');}});effect(()=>{const s=this.store.error();if(s){this.toasts.show(s);this.store.error.set('');}});}
  focusContent(){document.getElementById('content')?.focus();}
}

