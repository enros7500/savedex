import type { ItemType } from '@savedex/contracts/api';
export const itemTypes:Record<ItemType,string>={place:'Lugar',tool:'Herramienta',recommendation:'Recomendación',step:'Paso',travel_option:'Opción de viaje',product:'Producto',custom:'Otro'};
export const states:Record<string,string>={idle:'Sin tarea',pending:'Pendiente',processing:'En curso',completed:'Completado',review:'Por revisar',error:'Error',failed:'Error',removed:'Retirado',success:'Completado',partial:'Parcial',stopped:'Cola detenida',running:'Procesando',stopping:'Deteniendo…'};
export function stateLabel(value:string){return states[value]??value;}
export function dayLabel(day:string){return new Intl.DateTimeFormat('es',{dateStyle:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));}
