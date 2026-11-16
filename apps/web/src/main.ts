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
  const routes:Record<string,string>={'/add':'add','/anadir':'add','/processing':'processing','/procesado':'processing','/procesamiento':'processing','/explore':'explore','/explorar':'explore','/library':'explore','/biblioteca':'explore','/results':'results'};
  const route=routes[location.pathname];if(route)history.replaceState(null,'','/#'+route+location.search);
}
bootstrapApplication(ShellComponent,{providers:[provideZard(),provideRouter([
  {path:'add',loadComponent:()=>import('./app/add/add.component').then(m=>m.AddComponent)},
  {path:'processing',loadComponent:()=>import('./app/processing/processing.component').then(m=>m.ProcessingComponent)},
  {path:'explore',loadComponent:()=>import('./app/explore/explore.component').then(m=>m.ExploreComponent)},
  {path:'results',loadComponent:()=>import('./app/library/library.component').then(m=>m.LibraryComponent)},
  ...['anadir'].map(path=>({path,pathMatch:'full' as const,redirectTo:'add'})),
  ...['procesamiento','procesado'].map(path=>({path,pathMatch:'full' as const,redirectTo:'processing'})),
  ...['explorar','library','biblioteca'].map(path=>({path,pathMatch:'full' as const,redirectTo:'explore'})),
  {path:'',pathMatch:'full',redirectTo:'explore'},
  {path:'**',redirectTo:'explore'},
],withHashLocation(),withInMemoryScrolling({scrollPositionRestoration:'top'})),{provide:LocationStrategy,useClass:LabHashLocationStrategy}]}).catch(console.error);

