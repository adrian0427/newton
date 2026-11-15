import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),owned:vi.fn(),write:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/auth",async original=>({...await original<object>(),requireUser:mocks.user}));
vi.mock("@/lib/learning/sessions",()=>({requireOwnedSession:mocks.owned}));
vi.mock("@/lib/learning/events",()=>({recordLearningEvent:mocks.write}));
import { BackendError } from "@/lib/supabase/auth";
import { POST } from "@/app/api/work/analyze/route";
const sessionId="10000000-0000-4000-8000-000000000001", sourceRevisionId="20000000-0000-4000-8000-000000000002";
const input={sessionId,sourceRevisionId,source:"confirmed_handwriting",problem:"7(6k+2)",expression:"7(6k+2)=42k+2"};
function request(body:unknown=input,origin="http://localhost:3000",type="application/json") {return new Request("http://localhost:3000/api/work/analyze",{method:"POST",headers:{host:"localhost:3000",origin,"content-type":type},body:JSON.stringify(body)});}
beforeEach(()=>{vi.resetAllMocks();mocks.user.mockResolvedValue({userId:"verified",headers:new Headers({"Cache-Control":"private, no-store"})});mocks.owned.mockResolvedValue({id:sessionId});mocks.write.mockResolvedValue({id:"saved-event"});});
it("recomputes the confirmed expansion and derives the observation on the server",async()=>{
 const response=await POST(request()); const body=await response.json();
 expect(response.status).toBe(200);expect(body.analysis.status).toBe("incorrect");expect(body.memory).toEqual({status:"saved",eventId:"saved-event"});
 expect(mocks.owned).toHaveBeenCalledWith(await mocks.user.mock.results[0].value,sessionId);
 expect(mocks.write).toHaveBeenCalledWith(await mocks.user.mock.results[0].value,expect.objectContaining({sessionId,sourceRevisionId,outcome:"misconception-observed",misconceptionId:"distribution.missed-term"}));
 expect(mocks.write.mock.calls[0][1].evidence).not.toContain(input.expression);
 expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("records supported correct practice without claiming mastery or self correction",async()=>{
 const body=await (await POST(request({...input,source:"structured_input",expression:"42k+14"}))).json();
 expect(body.analysis.status).toBe("correct");expect(mocks.write.mock.calls[0][1].outcome).toBe("practiced");
 expect(mocks.write.mock.calls[0][1].misconceptionId).toBeUndefined();
});
it("does not persist unsupported or mismatched work",async()=>{
 const body=await (await POST(request({...input,expression:"x^2"}))).json();
 expect(body.analysis.status).toBe("unsupported");expect(body.memory.status).toBe("not-saved");expect(mocks.write).not.toHaveBeenCalled();
});
it.each(["userId","outcome","evidence","verification","image","confirmed"])("rejects client-owned result fields: %s",async field=>{
 expect((await POST(request({...input,[field]:"forged"}))).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();
});
it.each([{source:"whiteboard"},{source:"unconfirmed_handwriting"},{sourceRevisionId:"bad"},{sessionId:"bad"},{expression:"x".repeat(501)},{problem:"x".repeat(101)},{expression:undefined}])("rejects malformed/unconfirmed input (%j)",async patch=>{
 expect((await POST(request({...input,...patch}))).status).toBe(400);expect(mocks.write).not.toHaveBeenCalled();
});
it("rejects cross-origin, oversized and non-JSON requests",async()=>{
 expect((await POST(request(input,"https://evil.example"))).status).toBe(403);expect(mocks.user).not.toHaveBeenCalled();
 expect((await POST(request(input,undefined,"text/plain"))).status).toBe(400);
 expect((await POST(request({padding:"x".repeat(2049)})))).toHaveProperty("status",413);expect(mocks.write).not.toHaveBeenCalled();
});
it.each([401,404])("does not write after auth/ownership denial %s",async status=>{
 (status===401?mocks.user:mocks.owned).mockRejectedValue(new BackendError(status,"denied","Safe denial"));
 const response=await POST(request());expect(response.status).toBe(status);expect(response.headers.get("Cache-Control")).toContain("no-store");expect(mocks.write).not.toHaveBeenCalled();
});
it("returns the actual check on save failure and retries the same derived event",async()=>{
 mocks.write.mockRejectedValueOnce(new BackendError(502,"database-unavailable","private upstream details"));
 const failed=await (await POST(request())).json();expect(failed.analysis.status).toBe("incorrect");
 expect(failed.memory).toMatchObject({status:"failed",retryable:true});expect(JSON.stringify(failed)).not.toContain("private upstream details");
 await POST(request());expect(mocks.write.mock.calls[0][1]).toEqual(mocks.write.mock.calls[1][1]);
});
it("makes conflicting observations nonretryable",async()=>{
 mocks.write.mockRejectedValue(new BackendError(409,"event-conflict","Conflict"));
 const body=await (await POST(request())).json();expect(body.memory).toMatchObject({status:"failed",retryable:false});
});
it("does not mislabel a missed variable-term distribution as a constant-term error",async()=>{
 await POST(request({...input,expression:"7(6k+2)=6k+14"}));
 const event=mocks.write.mock.calls[0][1];expect(event.misconceptionId).toBe("distribution.missed-term");
 expect(event.evidence).toContain("each term");expect(event.evidence).not.toContain("constant term");
});
