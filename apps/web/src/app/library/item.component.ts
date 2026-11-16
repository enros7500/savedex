import { ZardCollapsibleImports } from '../shared/components/collapsible';
import { TranslatePipe } from '../core/locale';
import { Component, input } from '@angular/core';
import type { LibraryItem } from '@savedex/contracts/api';
import { itemTypes } from '../core/presentation';
@Component({selector:'sx-item',imports:[ZardCollapsibleImports,TranslatePipe],template:`<article class="item"><p class="meta">{{(types[item().type]) | t}}</p><h3>{{item().name}}</h3>@if(item().description!==item().name){<p>{{item().description}}</p>}<div z-collapsible><button type="button" z-collapsible-trigger data-evidence>{{'Ver evidencia ·' | t}} {{(item().evidence.length) | t}}</button><z-collapsible-content>@for(e of item().evidence;track e.id){<figure><figcaption>{{(source(e.source_type)) | t}}</figcaption><blockquote>{{e.excerpt}}</blockquote></figure>}@empty{<p>{{'Este ítem no tiene evidencia asociada.' | t}}</p>}</z-collapsible-content></div><div z-collapsible><button type="button" z-collapsible-trigger>{{'Ver campos extraídos' | t}}</button><z-collapsible-content><pre>{{fields()}}</pre></z-collapsible-content></div></article>`})
export class ItemComponent {
  readonly item=input.required<LibraryItem>();readonly types=itemTypes;
  fields(){return JSON.stringify(this.item().data,null,2);}
  source(type:string){return ({author_description:'Descripción del autor',transcript:'Transcripción',ocr:'Texto en pantalla',image_text:'Texto en pantalla',platform_metadata:'Metadatos de la plataforma',visual_observation:'Observación visual'} as Record<string,string>)[type]??type;}
}
