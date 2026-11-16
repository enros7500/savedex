import { TranslatePipe } from '../core/locale';
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
@Component({selector:'app-root',imports:[TranslatePipe,RouterLink,RouterLinkActive,RouterOutlet,NgIcon],viewProviders:[labIcons()],template:`
<a class="skip-link" href="#content" (click)="$event.preventDefault(); focusContent()">{{"Saltar al contenido" | t}}</a>
<div class="lab-app">
  <header class="lab-header">
    <a routerLink="/explore" class="lab-brand" [attr.aria-label]="'Video Lab, explorar lugares' | t"><span class="brand-mark"><ng-icon name="lucideFilm" size="19"/></span><span>{{"Video Lab" | t}}<span class="brand-beta">{{"BETA" | t}}</span></span></a>
    <nav class="lab-nav" [attr.aria-label]="'Navegación principal' | t">
      <a routerLink="/add" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.aria-label]="'Añadir vídeos' | t"><ng-icon name="lucidePlus" size="17"/><span class="nav-label">{{"Añadir vídeos" | t}}</span></a>
      <a routerLink="/processing" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.aria-label]="'Procesamiento' | t"><ng-icon name="lucideLayers" size="17"/><span class="nav-label">{{"Procesamiento" | t}}</span>@if(activeCount()){<span class="live-count"><i></i>{{(activeCount()) | t}}</span>}@else if(errors()){<span class="error-count" [attr.aria-label]="'Hay vídeos con errores' | t">!</span>}</a>
      <a routerLink="/explore" routerLinkActive="active" ariaCurrentWhenActive="page" [attr.aria-label]="'Explorar lugares' | t"><ng-icon name="lucideMapPin" size="17"/><span class="nav-label">{{"Explorar lugares" | t}}</span><span class="quiet-count">{{(catalog.places().length) | t}}</span></a>
    </nav>
    <label class="language-picker"><span class="sr-only">{{'Idioma' | t}}</span><select id="language-select" [value]="locale.language()" (change)="locale.set($any($event.target).value)"><option value="en">English</option><option value="es">Español</option></select></label>
    <div class="header-end"><span class="connection-dot" [class.offline]="!store.connected()" role="status" [attr.aria-label]="(store.connected()?'Conectado':'Sin conexión') | t" [title]="(store.connected()?'Conectado al servidor local':'Sin conexión · Mostrando el último estado conocido') | t"></span><span class="avatar" [attr.aria-label]="'Espacio local' | t">{{"Tú" | t}}</span></div>
  </header>
  @if(store.state().connection==='disconnected'){<div class="connection-banner" role="status">{{"Sin conexión. Mostrando el último estado conocido; la cola puede seguir trabajando." | t}}</div>}
  <main id="content" tabindex="-1" class="lab-main" [class.legacy-main]="route().includes('/results')"><router-outlet/></main>
  <div class="toast-stack" aria-live="polite" aria-relevant="additions text">@for(t of toasts.items();track t.id){<div class="lab-toast"><ng-icon name="lucideCheck" size="17"/><span>{{(t.message) | t}}</span>@if(t.label){<button (click)="toasts.run(t)">{{(t.label) | t}}<ng-icon name="lucideArrowRight" size="14"/></button>}<button class="toast-close" (click)="toasts.close(t.id)" [attr.aria-label]="'Cerrar aviso' | t"><ng-icon name="lucideX" size="15"/></button></div>}</div>
</div>`})
export class ShellComponent {
  readonly store=inject(ActivityStore);readonly catalog=inject(CatalogStore);readonly toasts=inject(Toasts);readonly router=inject(Router);readonly title=inject(Title);readonly locale=inject(LocaleService);
  readonly route=toSignal(this.router.events.pipe(filter(e=>e instanceof NavigationEnd),map(e=>e.urlAfterRedirects)),{initialValue:this.router.url});
  readonly activeCount=computed(()=>this.store.queue()?.entries.filter(e=>e.state==='pending'||e.state==='processing').length??0);
  readonly errors=computed(()=>this.store.snapshot()?.videos.filter(v=>v.state==='error').length??0);
  constructor(){document.documentElement.style.colorScheme='light';effect(()=>{const r=this.route();this.title.setTitle(this.locale.text(r.includes('/add')?'Añadir vídeos':r.includes('/processing')?'Procesamiento':r.includes('results')?'Todos los resultados':'Explorar lugares')+' · Video Lab');});effect(()=>{const s=this.store.notice();if(s){this.toasts.show(s);this.store.notice.set('');}});effect(()=>{const s=this.store.error();if(s){this.toasts.show(s);this.store.error.set('');}});}
  focusContent(){document.getElementById('content')?.focus();}
}

