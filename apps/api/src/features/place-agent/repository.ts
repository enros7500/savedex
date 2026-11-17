import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { PlaceEnrichment } from '@savedex/contracts/api';

export interface ResearchInput { name:string; address:string; location:string; type:string; coordinates?:string }
export interface StoredPlace { id:number; video_id:number; extractor_item_id:string; type:string; name:string; description:string; data_json:string }
export function researchInput(item:StoredPlace):ResearchInput {
  const data=JSON.parse(item.data_json) as Record<string,{value?:unknown;certainty?:string}>;
  const fact=(key:string)=>typeof data[key]?.value==='string' && data[key]?.certainty!=='unknown'?data[key]!.value as string:'';
  return {name:item.name,address:fact('address_mentioned'),location:fact('location_mentioned'),type:fact('place_type')||item.description.slice(0,500),coordinates:fact('coordinates_mentioned')};
}
export function placeKey(item:StoredPlace):string {
  const data=JSON.parse(item.data_json) as Record<string,{value?:unknown;certainty?:string}>;
  const coordinates=data['coordinates_mentioned'];
  return createHash('sha256').update(JSON.stringify([item.video_id,item.extractor_item_id,researchInput(item),coordinates?.value??null,coordinates?.certainty??'unknown'])).digest('hex');
}
export function getEnrichment(db:Database.Database,key:string):PlaceEnrichment|null {
  const row=db.prepare<[string],{payload_json:string}>('SELECT payload_json FROM place_enrichments WHERE place_key=?').get(key);
  return row?JSON.parse(row.payload_json) as PlaceEnrichment:null;
}
export function putEnrichment(db:Database.Database,job:PlaceEnrichment):void {
  db.prepare('INSERT INTO place_enrichments(place_key,payload_json) VALUES(?,?) ON CONFLICT(place_key) DO UPDATE SET payload_json=excluded.payload_json').run(job.key,JSON.stringify(job));
}
