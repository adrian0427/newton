import type { SubmittedWork } from "./analyze";
export type HistoryState={status:"idle"|"loading"|"ready"|"failed";summary:string;count:number};
export type SaveState={key:string;status:"idle"|"saving"|"saved"|"not-saved"|"failed";message?:string;retryable?:boolean};
export type TutoringMemorySnapshot={sessionId:string|null;history:HistoryState;save:SaveState};
export function emptyTutoringMemory(sessionId:string|null=null):TutoringMemorySnapshot{
  return {sessionId,history:{status:"idle",summary:"",count:0},save:{key:"",status:"idle"}};
}
/** Account-scoped browser state; cookies and server ownership checks remain authoritative. */
export function createTutoringMemory(request:typeof fetch=fetch){
  let state=emptyTutoringMemory(),readGeneration=0,writeGeneration=0;
  let read:AbortController|undefined,write:AbortController|undefined;
  const listeners=new Set<()=>void>();
  function publish(patch:Partial<TutoringMemorySnapshot>){state={...state,...patch};listeners.forEach(fn=>fn());}
  async function load(){
    read?.abort();const generation=++readGeneration;
    if(!state.sessionId)return;
    const controller=new AbortController();read=controller;
    publish({history:{status:"loading",summary:"",count:0}});
    try{
      const response=await request("/api/learning-context?conceptId=algebra.distributive-property",{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw Error();
      const body=await response.json();
      if(!Array.isArray(body.events)||body.events.length>10||typeof body.summary!=="string"||body.summary.length>2000)throw Error();
      if(generation===readGeneration)publish({history:{status:"ready",summary:body.summary,count:body.events.length}});
    }catch{if(generation===readGeneration)publish({history:{status:"failed",summary:"",count:0}});}
  }
  return {
    getSnapshot:()=>state,
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    async open(sessionId:string|null){
      if(state.sessionId===sessionId)return;
      read?.abort();write?.abort();readGeneration++;writeGeneration++;
      publish(emptyTutoringMemory(sessionId));await load();
    },
    reload:load,
    setWork(key:string){
      if(state.save.key===key)return;
      write?.abort();writeGeneration++;publish({save:{key,status:"idle"}});
    },
    skip(key:string){if(state.save.key===key)publish({save:{key,status:"not-saved"}});},
    async save(input:SubmittedWork,key:string){
      if(input.sessionId!==state.sessionId||state.save.key!==key||["saving","saved","not-saved"].includes(state.save.status))return;
      write?.abort();const generation=++writeGeneration,controller=new AbortController();write=controller;
      publish({save:{key,status:"saving"}});
      try{
        const response=await request("/api/work/analyze",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:controller.signal});
        const body=await response.json();
        if(generation!==writeGeneration)return;
        if(!response.ok){
          publish({save:{key,status:"failed",retryable:response.status>=500,message:response.status===401?"Sign in again before saving learning history.":"The observation could not be saved. Please retry after checking your study session."}});return;
        }
        const saved=body.memory;
        if(saved?.status==="saved"&&typeof saved.eventId==="string")publish({save:{key,status:"saved"}});
        else if(saved?.status==="not-saved"&&body.analysis?.status==="unsupported")publish({save:{key,status:"not-saved"}});
        else if(saved?.status==="failed"&&typeof saved.retryable==="boolean")publish({save:{key,status:"failed",retryable:saved.retryable,message:"Your check is ready, but its learning observation could not be saved."}});
        else throw Error();
      }catch{if(generation===writeGeneration)publish({save:{key,status:"failed",retryable:true,message:"Your check is ready, but its learning observation could not be saved. Please retry."}});}
    },
    dispose(){readGeneration++;writeGeneration++;read?.abort();write?.abort();state=emptyTutoringMemory();},
  };
}
