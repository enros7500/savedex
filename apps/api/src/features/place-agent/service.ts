import type { PlaceEnrichment } from '@savedex/contracts/api';
import type { QueueService } from '../queue/service.js';
import { HttpError } from '../../http-errors.js';
import { parseResearch } from './research.js';
import { placeAgentModel, researchWithCodex, type ResearchPort } from './codex.js';
import { getEnrichment, putEnrichment, placeKey, researchInput, type StoredPlace } from './repository.js';

export class PlaceAgentService {
  private pending:Promise<void>|null=null;private closing=false;
  constructor(private readonly queue:QueueService,private readonly research:ResearchPort=researchWithCodex){
    const interrupted=queue.db.prepare<[],{payload_json:string}>("SELECT payload_json FROM place_enrichments WHERE json_extract(payload_json,'$.status')='running'").all();
    if(interrupted.length)queue.mutate(()=>{for(const row of interrupted){const job=JSON.parse(row.payload_json) as PlaceEnrichment;putEnrichment(queue.db,{...job,status:'error',finishedAt:new Date().toISOString(),error:'La búsqueda se interrumpió. Puedes reintentar.'});}});
  }
  start(id:number):PlaceEnrichment {
    if(this.closing)throw new HttpError(503,'UNAVAILABLE','El agente se está cerrando.');
    const item=this.queue.db.prepare<[number],StoredPlace>('SELECT id,video_id,extractor_item_id,type,name,description,data_json FROM items WHERE id=?').get(id);
    if(!item)throw new HttpError(404,'NOT_FOUND','No se encontró el lugar');
    if(item.type!=='place')throw new HttpError(409,'CONFLICT','El agente solo investiga lugares');
    const key=placeKey(item),existing=getEnrichment(this.queue.db,key);
    if(existing?.status==='running'||existing?.status==='completed')return existing;
    if(this.pending)throw new HttpError(409,'CONFLICT','El agente está investigando otro lugar. Inténtalo cuando termine.');
    const job:PlaceEnrichment={key,status:'running',model:placeAgentModel,startedAt:new Date().toISOString(),finishedAt:null,result:null,error:null};
    this.queue.mutate(()=>putEnrichment(this.queue.db,job));
    this.pending=Promise.resolve().then(async()=>{
      let finished:PlaceEnrichment;
      try{const result=parseResearch(JSON.stringify(await this.research(researchInput(item))));finished={...job,status:result.matched?'completed':'needs_review',finishedAt:new Date().toISOString(),result};}
      catch{finished={...job,status:'error',finishedAt:new Date().toISOString(),error:'No se pudo localizar el lugar con Codex. Comprueba tu sesión e inténtalo de nuevo.'};}
      if(!this.closing)this.queue.mutate(()=>putEnrichment(this.queue.db,finished));
    }).catch(()=>{/* A storage failure leaves a recoverable running record. */}).finally(()=>{this.pending=null;});
    return job;
  }
  beginClose(){this.closing=true;}
  async whenIdle(){await this.pending;}
}
