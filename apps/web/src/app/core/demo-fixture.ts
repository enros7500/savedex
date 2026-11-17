import type { LibraryItem, PlaceResearch, PublicExtractResult } from '@savedex/contracts/api';

export const DEMO_SOURCE = 'https://www.youtube.com/watch?v=•••••••••••';
export const DEMO_TITLE = 'Top 5 museums in Madrid';
const museums = [
  ['Museo Nacional del Prado','A museum of European painting, featuring works by Velázquez and Goya.','Paseo del Prado, s/n, Madrid',40.4138,-3.6921],
  ['Museo Reina Sofía','A museum of modern and contemporary art, including Picasso’s Guernica.','Calle de Santa Isabel, 52, Madrid',40.4079,-3.6946],
  ['Museo Thyssen-Bornemisza','A collection spanning European painting from early masters to modern art.','Paseo del Prado, 8, Madrid',40.416,-3.6949],
  ['Museo Arqueológico Nacional','A museum exploring archaeology and the history of the Iberian Peninsula.','Calle de Serrano, 13, Madrid',40.4239,-3.6885],
  ['Museo Sorolla','The former home and studio of painter Joaquín Sorolla, with paintings and original interiors.','Paseo del General Martínez Campos, 37, Madrid',40.4355,-3.6925],
] as const;
const fact = (value:string|null) => ({value,certainty:value===null?'unknown' as const:'known' as const,evidence_ids:value===null?[]:['demo-evidence'],reason:value===null?'Not supplied by the simulated video.':null});
const placeData=(name:string)=>({name:fact(name),location_mentioned:fact('Madrid, Spain'),address_mentioned:fact(null),coordinates_mentioned:fact(null),maps_url_mentioned:fact(null)});
export const demoItems:LibraryItem[] = museums.map(([name,description],i)=>({
  id:i+1,videoId:1,runId:1,extractorItemId:'demo-museum-'+(i+1),type:'place',name,description,
  data:{name:fact(name),location_mentioned:fact('Madrid, Spain'),address_mentioned:fact(null),coordinates_mentioned:fact(null),maps_url_mentioned:fact(null)},
  evidenceIds:['demo-evidence'],evidence:[],
}));
export function demoResearch(id:number):PlaceResearch|null {
  const museum=museums[id-1];if(!museum)return null;
  const [name,description,address,latitude,longitude]=museum;
  return {matched:true,name,address,latitude,longitude,description,sources:[],photos:[],reason:'Predefined demo data. No live research was performed.'};
}
export const demoResult:PublicExtractResult = {
  schema_version:'3.0.0',task:'extract',request_id:'demo-madrid',status:'success',generated_at:'2026-11-17T12:00:00Z',
  source:{input_url:DEMO_SOURCE,canonical_url:DEMO_SOURCE,platform:'youtube',post_id:'demo',publisher_author:'SaveDex Demo',media_kind:'video',asset_count:1,inventory_complete:true,assets:[]},
  request_context:{instructions:'Simulated demo only',output_language:'en',visual_processing:'auto'},
  topic:{category:'travel',label:'Museums in Madrid',basis:'inferred',certainty:'known',evidence_ids:[],reason:'Fixed illustrative demo data.'},
  routing:{initial_choice:'description_only',signals:[],steps:[]},
  coverage:{scope:'reviewed_sources_only',sufficiency:'sufficient',examined_asset_ids:[],unexamined_asset_ids:[],transcript_ranges:[],visual_positions:[],missing_information:[],limitations:['Simulation only. No video was processed.']},
  items:demoItems.map(item=>({id:item.extractorItemId,type:'place',title:item.name,summary:item.description,attribution:{publisher_author:'SaveDex Demo',speaker:null,basis:'publisher_only',evidence_ids:[]},evidence_ids:['demo-evidence'],uncertainties:[],data:placeData(item.name)})),
  collections:[],evidence:[{id:'demo-evidence',source_type:'author_description',method:'adapter',excerpt:'Fixed illustrative demo: five museums in Madrid. This is not an actual video transcript.',language:'en',locator:{kind:'post',asset_id:null,time:null},region:null,asset_sha256:null,operation_id:'demo'}],issues:[],follow_up:{extraction_gaps:[],research_opportunities:[]},
};
