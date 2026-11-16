import type { ApiLibraryResult, LibraryItem } from '@savedex/contracts/api';

export const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const matchesSearch=(haystack:string,query:string)=>fold(query).trim().split(/\s+/).every(w=>fold(haystack).includes(w));
export interface LinkRow {raw:string;url:string;platform:string;status:'valid'|'duplicate'|'invalid'|'unsupported'}
function canonical(raw:string):{url:string;platform:string}|null {
  try {
    const u=new URL(/^[a-z]+:\/\//i.test(raw)?raw:'https://'+raw);
    if(u.protocol!=='https:'||u.username||u.password||u.port||raw.length>2048||/[\\\u0000-\u001f]/.test(raw))return null;
    const h=u.hostname.replace(/^(www\.|m\.)/,'');
    if(h==='youtube.com'||h==='youtu.be'){
      const ids=u.searchParams.getAll('v');
      const id=h==='youtu.be'?/^\/([\w-]{11})\/?$/.exec(u.pathname)?.[1]:u.pathname==='/watch'&&ids.length===1?ids[0]:/^\/shorts\/([\w-]{11})\/?$/.exec(u.pathname)?.[1];
      return id&&/^[\w-]{11}$/.test(id)?{url:'https://www.youtube.com/watch?v='+id,platform:'YouTube'}:null;
    }
    if(h==='instagram.com'){
      const id=/^\/(?:p|reel|reels)\/([\w-]{11})\/?$/.exec(u.pathname)?.[1];
      return id?{url:'https://www.instagram.com/p/'+id+'/',platform:'Instagram'}:null;
    }
    if(!h.includes('.'))return null;
    return {url:u.href,platform:h.endsWith('tiktok.com')?'TikTok':h==='vimeo.com'?'Vimeo':h==='loom.com'?'Loom':h==='drive.google.com'?'Google Drive':/\.(mp4|mov|webm|m4v|mkv)$/i.test(u.pathname)?'Archivo':'Web'};
  }catch{return null;}
}
export function parseLinks(text:string,existing:string[]):LinkRow[]{
  const seen=new Set(existing.map(u=>canonical(u)?.url??u));
  const tokens=text.trim().split(/[\s,]+/).filter(Boolean);
  const hasLinks=tokens.some(t=>t.includes('.')||t.includes('://'));
  const rows:LinkRow[]=[];
  for(const token of tokens){
    const raw=token.replace(/^[([<"']+/,'').replace(/[)\].,;>"']+$/,'');
    // Ignore ordinary prose around links, but report isolated invalid input.
    if(hasLinks&&!raw.includes('.')&&!raw.includes('://'))continue;
    const c=canonical(raw);
    if(!c){rows.push({raw,url:raw,platform:'',status:'invalid'});continue;}
    const supported=['YouTube','Instagram'].includes(c.platform);
    const status=seen.has(c.url)?'duplicate':supported?'valid':'unsupported';
    seen.add(c.url);rows.push({raw,...c,status});
  }
  return rows;
}
export function coordinates(value:string|null):{lat:number;lng:number}|null {
  if(!value)return null;
  const m=/^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/.exec(value);
  if(!m)return null;
  const lat=Number(m[1]),lng=Number(m[2]);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
export const categories=[
  {id:'food',label:'Comer',color:'#EA580C',light:'#FDBA74',icon:'lucideUtensils',terms:'restaurante comida street food ramen takoyaki sushi cafe restaurant dining'},
  {id:'night',label:'Bares y noche',color:'#DB2777',light:'#F9A8D4',icon:'lucideWine',terms:'bar copas cocteles fado noche pub'},
  {id:'temple',label:'Templos',color:'#DC2626',light:'#FCA5A5',icon:'lucideLandmark',terms:'templo santuario iglesia temple shrine church'},
  {id:'monument',label:'Monumentos',color:'#7C3AED',light:'#C4B5FD',icon:'lucideLandmark',terms:'monumento que ver castillo palace castle'},
  {id:'nature',label:'Naturaleza',color:'#16A34A',light:'#86EFAC',icon:'lucideTrees',terms:'parque bosque jardin naturaleza park garden beach playa'},
  {id:'view',label:'Miradores',color:'#0284C7',light:'#7DD3FC',icon:'lucideMountain',terms:'mirador vistas atardecer viewpoint sunset'},
  {id:'district',label:'Barrios',color:'#0D9488',light:'#5EEAD4',icon:'lucideMapPin',terms:'barrio zona calles callejon district neighborhood'},
  {id:'museum',label:'Museos y arte',color:'#4F46E5',light:'#A5B4FC',icon:'lucidePalette',terms:'museo galeria arte museum gallery'},
  {id:'market',label:'Mercados',color:'#CA8A04',light:'#FDE047',icon:'lucideShoppingBasket',terms:'mercado compras puestos market shopping'},
  {id:'place',label:'Lugares',color:'#64748B',light:'#CBD5E1',icon:'lucideMapPin',terms:'lugar sitio place'}
];
export type PlaceCategory=typeof categories[number];
export interface PlaceSource {video:number;title:string;url:string;quote:string;time:number|null;run:number}
export interface Place {id:string;preferenceKeys:string[];name:string;description:string;location:string;hint:boolean;coords:{lat:number;lng:number}|null;category:PlaceCategory;address:string;mapsUrl:string|null;sources:PlaceSource[];items:LibraryItem[];addedAt:string}
export function fact(item:LibraryItem,key:string):string {
  const f=(item.data as Record<string,{value?:unknown;certainty?:string}>)[key];
  return f&&typeof f.value==='string'&&f.certainty!=='unknown'?f.value:'';
}
export function safeUrl(value:string):string|null {try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function catalog(rows:ApiLibraryResult['videos']):Place[]{
  const result=new Map<string,Place>();
  for(const row of rows)for(const item of row.items){
    if(item.type!=='place')continue;
    const location=fact(item,'location_mentioned'),address=fact(item,'address_mentioned');
    const f=(item.data as Record<string,{certainty?:string}>)['location_mentioned'];
    const coordinateFact=(item.data as Record<string,{certainty?:string}>)['coordinates_mentioned'];
    const coords=coordinateFact?.certainty==='known'?coordinates(fact(item,'coordinates_mentioned')):null;
    const text=fold(item.name+' '+item.description);
    const category=categories.find(c=>c.id!=='place'&&c.terms.split(' ').some(t=>t.length>2&&new RegExp('(?:^|\\W)'+t+'(?:$|\\W)').test(text)))??(row.result?.topic.category==='dining'?categories[0]!:categories[categories.length-1]!);
    const identity=coords?`${coords.lat},${coords.lng}`:location&&f?.certainty==='known'?fold(location+' '+address):'';
    const id=identity?fold(item.name)+'|'+identity:'item:'+item.id;
    const sources:PlaceSource[]=item.evidence.length?item.evidence.map(e=>({video:row.video.id,title:row.video.title??row.video.url,url:row.video.url,quote:e.excerpt,time:e.locator.time?.start_ms??null,run:item.runId})):[{video:row.video.id,title:row.video.title??row.video.url,url:row.video.url,quote:'',time:null,run:item.runId}];
    const preferenceKey='video:'+row.video.id+'|'+fold(item.name.trim())+'|'+fold(location.trim())+'|'+fold(address.trim());
    const prior=result.get(id);
    if(prior){prior.sources.push(...sources.filter(s=>!prior.sources.some(p=>p.video===s.video&&p.quote===s.quote&&p.time===s.time)));prior.items.push(item);prior.preferenceKeys.push(preferenceKey);}
    else result.set(id,{id,preferenceKeys:[preferenceKey],name:item.name,description:item.description,location,hint:f?.certainty!=='known',coords,category,address,mapsUrl:safeUrl(fact(item,'maps_url_mentioned')),sources,items:[item],addedAt:row.video.addedAt});
  }
  return [...result.values()];
}
export function placeSearch(p:Place):string {
  return [p.name,p.description,p.location,p.address,p.category.label,p.category.terms,...p.sources.flatMap(s=>[s.title,s.quote])].join(' ').replace(/Jap[oó]n|Japan/gi,'Japón Japan').replace(/Ciudad de M[eé]xico|CDMX/gi,'Ciudad de México CDMX');
}


