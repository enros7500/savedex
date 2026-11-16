import { provideZard } from './app/shared/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { Injectable } from '@angular/core';
import { ShellComponent } from './app/shell/shell.component';
@Injectable()
class LabHashLocationStrategy extends HashLocationStrategy {
  override prepareExternalUrl(internal:string){return super.prepareExternalUrl(internal).replace('#/','#');}
}
// Preserve previous bookmarked path routes while adopting the specified hash navigation.
if(!location.hash&&location.pathname!=='/'){
  const routes:Record<string,string>={'/add':'anadir','/anadir':'anadir','/processing':'procesamiento','/procesado':'procesamiento','/library':'explorar','/biblioteca':'explorar','/results':'results'};
  const route=routes[location.pathname];if(route)history.replaceState(null,'','/#'+route+location.search);
}
bootstrapApplication(ShellComponent,{providers:[provideZard(),provideRouter([
  {path:'anadir',loadComponent:()=>import('./app/add/add.component').then(m=>m.AddComponent)},
  {path:'procesamiento',loadComponent:()=>import('./app/processing/processing.component').then(m=>m.ProcessingComponent)},
  {path:'explorar',loadComponent:()=>import('./app/explore/explore.component').then(m=>m.ExploreComponent)},
  {path:'results',loadComponent:()=>import('./app/library/library.component').then(m=>m.LibraryComponent)},
  ...['add'].map(path=>({path,pathMatch:'full' as const,redirectTo:'anadir'})),
  ...['processing','procesado'].map(path=>({path,pathMatch:'full' as const,redirectTo:'procesamiento'})),
  ...['library','biblioteca'].map(path=>({path,pathMatch:'full' as const,redirectTo:'explorar'})),
  {path:'',pathMatch:'full',redirectTo:'explorar'},
  {path:'**',redirectTo:'explorar'},
],withHashLocation(),withInMemoryScrolling({scrollPositionRestoration:'top'})),{provide:LocationStrategy,useClass:LabHashLocationStrategy}]}).catch(console.error);

