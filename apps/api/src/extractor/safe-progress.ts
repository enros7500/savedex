import type { ProgressEvent, ProgressStep } from '@savedex/contracts/extractor';
const steps = new Set(['start','description','acquisition','visual_scan','ocr','transcription','local_extraction','assessment','local_repair','external_review','validation','finish']);
const detailKeys = new Set(['assets','failures','blocks','repair_rounds','max_calls','readings','frames','frame_count','observations','candidates','items','doubts','count','budget','captures','duration_ms','repair_count','external_calls','enabled','used','recipient','reason','outcome','status','code','source_count','asset_count','image_count','attempt','remaining']);
// Progress is a public channel: no arbitrary nested values, prompts or diagnostics.
export function safeProgress(value: unknown): ProgressEvent | null {
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(v['event']!=='step'||typeof v['step']!=='string'||!steps.has(v['step'])||typeof v['ts']!=='string'||v['ts'].length>64||!Number.isFinite(Date.parse(v['ts'])))return null;
 const event:Record<string,unknown>={event:'step',step:v['step'] as ProgressStep,ts:v['ts']};
 if(v['step']==='finish') {if(!['success','partial','error'].includes(String(v['status']))||!Number.isInteger(v['exit_code']))return null;event['status']=v['status'];event['exit_code']=v['exit_code'];}
 if(v['phase']!==undefined){if(!['started','completed','skipped','failed'].includes(String(v['phase'])))return null;event['phase']=v['phase'];}
 for(const key of ['sequence','attempt'])if(Number.isSafeInteger(v[key])&&(v[key] as number)>0)event[key]=v[key];
 if(typeof v['message']==='string'&&v['message'].length<=240&&!/sk-[a-z0-9]|bearer\s|api[_ -]?key|data:|https?:|[\r\n]/i.test(v['message']))event['message']=v['message'];
 if(v['details']&&typeof v['details']==='object'&&!Array.isArray(v['details'])){const details:Record<string,string|number|boolean>={};for(const [key,x] of Object.entries(v['details']).slice(0,24))if(detailKeys.has(key)&&((typeof x==='number'&&Number.isFinite(x))||typeof x==='boolean'||(typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,48}$/.test(x))))details[key]=x;if(Object.keys(details).length)event['details']=details;}
 return event as ProgressEvent;
}
