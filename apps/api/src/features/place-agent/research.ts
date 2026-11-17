import { Ajv2020 } from 'ajv/dist/2020.js';
import type { PlaceResearch } from '@savedex/contracts/api';

const text = { type: 'string', maxLength: 4000 };
export const researchSchema = {
  type: 'object', additionalProperties: false,
  required: ['matched','name','address','latitude','longitude','description','sources','photos','reason'],
  properties: {
    matched: {type:'boolean'}, name: text, address: text,
    latitude: {type:['number','null'],minimum:-90,maximum:90},
    longitude: {type:['number','null'],minimum:-180,maximum:180}, description:text, reason:text,
    sources:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['title','url'],properties:{title:text,url:text}}},
    photos:{type:'array',maxItems:2,items:{type:'object',additionalProperties:false,required:['url','sourceUrl','attribution'],properties:{url:text,sourceUrl:text,attribution:text}}},
  },
};
const validate = new Ajv2020({strict:false}).compile<PlaceResearch>(researchSchema);
function publicUrl(value: string): boolean {
  try {
    const u=new URL(value), host=u.hostname.toLowerCase();
    return u.protocol==='https:' && !u.username && !u.password && !u.port && host.includes('.') &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) && !host.endsWith('.local') && !host.endsWith('.internal');
  } catch { return false; }
}
export function parseResearch(raw: string): PlaceResearch {
  if(Buffer.byteLength(raw)>65536)throw new Error('Resultado del agente demasiado grande');
  const value:unknown=JSON.parse(raw);
  if(!validate(value))throw new Error('Resultado del agente no válido');
  if(value.sources.some(s=>!s.title.trim()||!publicUrl(s.url))||value.photos.some(p=>!p.attribution.trim()||!publicUrl(p.url)||!publicUrl(p.sourceUrl)))throw new Error('Fuentes del agente no válidas');
  if(value.matched && (value.latitude===null||value.longitude===null||!value.name.trim()||!value.description.trim()||!value.sources.length))throw new Error('Ubicación sin verificar');
  if(!value.matched && (value.latitude!==null||value.longitude!==null||!value.reason.trim()||value.photos.length>0))throw new Error('Ubicación ambigua con coordenadas');
  return value;
}
