import { expect,it,vi } from "vitest";
import { createTutoringMemory } from "@/lib/learning/tutoring-memory";
const sessionId="10000000-0000-4000-8000-000000000001";
const input={sessionId,sourceRevisionId:"20000000-0000-4000-8000-000000000002",source:"structured_input" as const,problem:"7(6k+2)",expression:"42k+2"};
function deferred(){let resolve!:(r:Response)=>void;const promise=new Promise<Response>(r=>{resolve=r;});return{promise,resolve};}
it("loads bounded history once per session and clears it when scope changes",async()=>{
 const request=vi.fn().mockResolvedValue(Response.json({events:[{id:"event"}],summary:"Earlier practice."}));
 const memory=createTutoringMemory(request); await memory.open(sessionId);await memory.open(sessionId);
 expect(request).toHaveBeenCalledTimes(1); expect(memory.getSnapshot().history).toMatchObject({status:"ready",count:1,summary:"Earlier practice."});
 await memory.open(null);expect(memory.getSnapshot().history.summary).toBe("");
});
it("discards a previous account's late history",async()=>{
 const pending=deferred(),request=vi.fn().mockReturnValue(pending.promise);const memory=createTutoringMemory(request);
 const first=memory.open(sessionId);await memory.open(null);pending.resolve(Response.json({events:[],summary:"private stale history"}));await first;
 expect(memory.getSnapshot().history.summary).toBe("");
});
it("coalesces repeated checks, preserves the exact retry identity, and ignores stale writes",async()=>{
 const pending=deferred();const request=vi.fn().mockResolvedValueOnce(Response.json({events:[],summary:""})).mockReturnValueOnce(pending.promise)
  .mockResolvedValueOnce(Response.json({analysis:{status:"incorrect"},memory:{status:"saved",eventId:"event"}}));
 const memory=createTutoringMemory(request);await memory.open(sessionId);memory.setWork("revision");
 const first=memory.save(input,"revision");await memory.save(input,"revision");expect(request).toHaveBeenCalledTimes(2);
 pending.resolve(new Response(null,{status:502}));await first;expect(memory.getSnapshot().save.status).toBe("failed");
 await memory.save(input,"revision");expect(request.mock.calls[1][1].body).toBe(request.mock.calls[2][1].body);
 await memory.save(input,"revision");expect(request).toHaveBeenCalledTimes(3);
 memory.setWork("new-revision");expect(memory.getSnapshot().save.status).toBe("idle");
});
it("never shows a late saved response after logout or editing",async()=>{
 const pending=deferred();const request=vi.fn().mockResolvedValueOnce(Response.json({events:[],summary:""})).mockReturnValueOnce(pending.promise);
 const memory=createTutoringMemory(request);await memory.open(sessionId);memory.setWork("old");const save=memory.save(input,"old");
 memory.setWork("new");pending.resolve(Response.json({analysis:{},memory:{status:"saved",eventId:"event"}}));await save;
 expect(memory.getSnapshot().save.status).toBe("idle");
});
it("distinguishes unavailable history from empty history and rejects oversized summaries",async()=>{
 const request=vi.fn().mockResolvedValueOnce(Response.json({events:[],summary:"x".repeat(2001)})).mockResolvedValueOnce(Response.json({events:[],summary:""}));
 const memory=createTutoringMemory(request);await memory.open(sessionId);expect(memory.getSnapshot().history.status).toBe("failed");
 await memory.reload();expect(memory.getSnapshot().history).toMatchObject({status:"ready",count:0,summary:""});
});
it("reopens cleanly after effect cleanup and does not reuse an old account's state",async()=>{
 const request=vi.fn().mockImplementation(async()=>Response.json({events:[],summary:""}));const memory=createTutoringMemory(request);
 await memory.open(sessionId);memory.dispose();await memory.open(sessionId);expect(request).toHaveBeenCalledTimes(2);
 expect(memory.getSnapshot().history.status).toBe("ready");
});
