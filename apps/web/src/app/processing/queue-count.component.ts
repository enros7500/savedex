import { Component, ElementRef, inject, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

@Component({selector:'sx-queue-count',template:'{{value}}',host:{class:'queue-group-count','aria-live':'polite','aria-atomic':'true'}})
export class QueueCountComponent implements OnChanges, OnDestroy {
  @Input() value=0;
  @Input() animateOnMount=false;
  private readonly element=inject(ElementRef<HTMLElement>);
  private animation:Animation|undefined;
  ngOnChanges(changes:SimpleChanges){
    const change=changes['value'];
    if(!change||(change.firstChange&&!this.animateOnMount)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    this.animation?.cancel();
    this.animation=this.element.nativeElement.animate([
      {transform:'translateY(0) scale(1)'},
      {transform:'translateY(-4px) scale(1.18)',offset:.35},
      {transform:'translateY(1px) scale(.98)',offset:.7},
      {transform:'translateY(0) scale(1)'}
    ],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  ngOnDestroy(){this.animation?.cancel();}
}
