import type { ApiLibraryResult, PlaceEnrichment, PublicRunDetails, QueueEntry, Video } from '@savedex/contracts/api';
import type { ApplicationSnapshot, StreamFrame } from '@savedex/contracts/events';
import type { ProgressEvent, ProgressStep } from '@savedex/contracts/extractor';
import { DEMO_SOURCE, DEMO_TITLE, demoItems, demoResearch, demoResult } from './demo-fixture.js';
export { DEMO_SOURCE } from './demo-fixture.js';

/** Browser-local transport: this module has no network or backend dependencies. */
export class DemoSession {
  private revision=0;
  private video:Video|null=null;
  private entry:QueueEntry|null=null;
  private runs:PublicRunDetails[]=[];
  private completed:PublicRunDetails|null=null;
  private jobs=new Map<number,PlaceEnrichment>();
  private listeners=new Set<(frame:StreamFrame)=>void>();
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private workflow:ProgressEvent[]=[];
  constructor(private readonly delay=700){}
  private stamp(){return {streamId:'savedex-browser-demo',revision:this.revision};}
  private later(callback:()=>void,delay=this.delay){const timer=setTimeout(()=>{this.timers.delete(timer);callback();},delay);this.timers.add(timer);}
  private changed(){this.revision++;for(const listener of this.listeners)listener({type:'change',snapshot:this.snapshot()});}
  snapshot():ApplicationSnapshot {
    const run=this.runs[0],running=run?.state==='processing';
    return structuredClone({...this.stamp(),videos:this.video?[this.video]:[],runs:this.runs,
      queue:{workerStatus:running?'running':'idle',fault:null,batch:null,entries:this.entry?[this.entry]:[],active:running?{entryId:1,videoId:1,runId:run.id}:null},
      progress:running&&this.workflow.length?{runId:run.id,event:this.workflow.at(-1)!,workflow:this.workflow}:null});
  }
  subscribe(listener:(frame:StreamFrame)=>void){this.listeners.add(listener);queueMicrotask(()=>{if(this.listeners.has(listener))listener({type:'ready',...this.stamp()});});return()=>{this.listeners.delete(listener);};}
  enrichment(id:number){return this.jobs.get(id);}
  reset(){for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.video=null;this.entry=null;this.runs=[];this.completed=null;this.jobs.clear();this.workflow=[];this.changed();}
  private start(){
    if(!this.video||this.entry?.state!=='pending'||this.runs[0]?.state==='processing')return;
    const at=new Date().toISOString(),id=this.runs.length+1;
    const run:PublicRunDetails={id,videoId:1,queueEntryId:1,mode:'normal',state:'processing',completionKind:null,startedAt:at,finishedAt:null,exitCode:null,errorMessage:null,review:{required:false,manual:'none',reasons:[]},workflow:[],externalInference:'local',reviewedAt:null,resultAvailable:false,result:null};
    this.runs.unshift(run);this.entry={...this.entry,state:'processing',runId:id};this.video.state='processing';this.workflow=[];
    const steps:[ProgressStep,string][]=[['start','Preparing the simulated video'],['acquisition','Simulating video acquisition'],['description','Reading the sample description'],['visual_scan','Simulating visual analysis'],['ocr','Simulating on-screen text recognition'],['transcription','Simulating transcription'],['local_extraction','Loading five predefined museums'],['assessment','Checking the sample collection'],['validation','Validating the demo results'],['finish','Simulation complete — five museums ready']];
    const advance=(index:number)=>{
      const [step,message]=steps[index]!;
      const previous=this.workflow.at(-1);if(previous)previous.phase='completed';
      const event:ProgressEvent=step==='finish'?{event:'step',step,ts:new Date().toISOString(),phase:'completed',message,status:'success',exit_code:0}:{event:'step',step,ts:new Date().toISOString(),phase:'started',message};
      this.workflow.push(event);run.workflow=[...this.workflow];
      if(step==='finish'){
        Object.assign(run,{state:'success',completionKind:'result',finishedAt:new Date().toISOString(),exitCode:0,resultAvailable:true,result:structuredClone(demoResult)});
        this.completed=run;this.video!.state='completed';this.entry!.state='completed';
      }else this.later(()=>advance(index+1));
      this.changed();
    };
    advance(0);
  }
  async request(path:string,method='GET',body?:unknown):Promise<unknown>{
    const route=path.split('?')[0];
    if(method==='GET'&&route==='/queue')return this.snapshot();
    if(method==='GET'&&route==='/library'){
      const library:ApiLibraryResult={videos:this.video?[{video:this.video,run:this.completed,latestAttempt:this.runs[0]??null,result:this.completed?.result??null,items:this.completed?demoItems.map(item=>({...item,runId:this.completed!.id,enrichment:this.jobs.get(item.id)??null})):[]}]:[],totalVideos:this.video?1:0,totalItems:this.completed?5:0};
      return structuredClone({...this.stamp(),library});
    }
    if(method==='GET'&&route==='/videos/1/runs')return structuredClone({...this.stamp(),runs:this.runs});
    if(method==='POST'&&route==='/videos'){
      if((body as {url?:string})?.url!==DEMO_SOURCE)throw new Error('This demo only accepts its fixed sample video.');
      const created=!this.video;
      if(created){const now=new Date().toISOString();this.video={id:1,url:DEMO_SOURCE,platform:'youtube',title:DEMO_TITLE,addedAt:now,addedDay:now.slice(0,10),state:'pending'};this.entry={id:1,videoId:1,mode:'normal',order:1,enqueuedAt:now,batchId:null,state:'pending',runId:null};this.changed();}
      return structuredClone({...this.stamp(),created,video:this.video,entry:this.entry});
    }
    if(method==='POST'&&route==='/queue/start'){this.start();return this.stamp();}
    // The only video is allowed to finish; no real queue exists.
    if(method==='POST'&&route==='/queue/stop')return this.stamp();
    if(method==='POST'&&route==='/videos/1/retry'&&this.video){if(this.video.state!=='processing'){this.video.state='pending';this.entry!.state='pending';this.changed();}return this.stamp();}
    const enrich=/^\/items\/(\d+)\/enrich$/.exec(route??'');
    if(method==='POST'&&enrich){
      const id=Number(enrich[1]),research=demoResearch(id);
      if(!research||!this.completed)throw new Error('This place is not available in the demo.');
      const prior=this.jobs.get(id);if(prior)return structuredClone({...this.stamp(),enrichment:prior});
      const job:PlaceEnrichment={key:'demo-'+id,status:'running',model:'Simulation · no AI model',startedAt:new Date().toISOString(),finishedAt:null,result:null,error:null};
      this.jobs.set(id,job);this.changed();
      this.later(()=>{Object.assign(job,{status:'completed',finishedAt:new Date().toISOString(),result:research});this.changed();},this.delay*2);
      return structuredClone({...this.stamp(),enrichment:job});
    }
    throw new Error('This action is unavailable in the demo. No real request was sent.');
  }
}
