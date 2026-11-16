import { Injectable, signal } from '@angular/core';
export interface Toast {id:number;message:string;label?:string|undefined;action?:(()=>void)|undefined}
@Injectable({providedIn:'root'})
export class Toasts {
  readonly items=signal<Toast[]>([]);private next=0;
  show(message:string,label?:string,action?:()=>void){const id=++this.next;this.items.update(a=>[...a,{id,message,label,action}]);setTimeout(()=>this.close(id),action?5000:2600);}
  close(id:number){this.items.update(a=>a.filter(t=>t.id!==id));}
  run(t:Toast){t.action?.();this.close(t.id);}
}

