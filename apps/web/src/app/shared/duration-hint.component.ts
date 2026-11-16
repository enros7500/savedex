import { Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClock3 } from '@ng-icons/lucide';
import { TranslatePipe } from '../core/locale';
import { ZardButtonComponent } from './components/button';
import { ZardCollapsibleImports } from './components/collapsible';
import { ZardTooltipImports } from './components/tooltip/tooltip.imports';

@Component({selector:'sx-duration-hint',imports:[NgIcon,TranslatePipe,ZardButtonComponent,ZardCollapsibleImports,ZardTooltipImports],viewProviders:[provideIcons({lucideClock3})],template:`
  <div z-collapsible class="duration-info"><button type="button" z-button zType="ghost" z-collapsible-trigger class="limit-pill" [attr.aria-label]="'Información sobre el límite de duración' | t" [zTooltip]="'Límite de duración' | t"><ng-icon name="lucideClock3" size="16px" aria-hidden="true"/><span>≤ 5 min</span></button><z-collapsible-content><p class="duration-explanation">{{'Máximo 5 minutos por vídeo, también en modo exhaustivo.' | t}}</p></z-collapsible-content></div>
`})
export class DurationHintComponent {}
