import { describe, expect, it, vi } from "vitest";
import { createWorkspaceAccount } from "@/lib/learning/workspace-account";
const id = "ccaf9362-14b1-4b89-8fb2-c911c9ff1d70";
const user = () => Response.json({ user: { email: "synthetic@example.com" } });
const saved = () => Response.json({ session: { id, startedAt: new Date().toISOString(), endedAt: null } }, { status: 201 });
const deferred = () => { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; };
describe("workspace account lifecycle", () => {
  it("checks login without creating sessions; coalesces creation and reuses it", async () => {
    const pending = deferred();
    const request = vi.fn().mockResolvedValueOnce(user()).mockReturnValueOnce(pending.promise);
    const account = createWorkspaceAccount(request);
    await account.check();
    expect(request).toHaveBeenCalledTimes(1);
    const first = account.start(); const second = account.start();
    expect(request).toHaveBeenCalledTimes(2);
    pending.resolve(saved()); await Promise.all([first, second]); await account.start();
    expect(account.getSnapshot().sessionId).toBe(id);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]).toEqual(["/api/study-sessions", { method: "POST", cache: "no-store" }]);
  });
  it("rejects anonymous start and lets a failed creation retry", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(user())
      .mockResolvedValueOnce(new Response(null, { status: 502 })).mockResolvedValueOnce(saved());
    const account = createWorkspaceAccount(request);
    await account.check(); await account.start(); expect(request).toHaveBeenCalledTimes(1);
    await account.check(); await account.start(); expect(account.getSnapshot().error).toContain("retry");
    expect(account.getSnapshot().sessionId).toBeNull();
    await account.start(); expect(account.getSnapshot().sessionId).toBe(id);
  });
  it("stops voice before logout, retains work on failure, clears only on success", async () => {
    const order: string[] = [];
    const request = vi.fn().mockResolvedValueOnce(user()).mockResolvedValueOnce(saved())
      .mockImplementationOnce(async () => { order.push("delete"); return new Response(null,{status:502}); })
      .mockResolvedValueOnce(Response.json({ signedOut: true }));
    const account = createWorkspaceAccount(request); account.registerStop(async () => { order.push("stop"); });
    await account.check(); await account.start(); const epoch=account.getSnapshot().epoch;
    await account.logout(); expect(order).toEqual(["stop","delete"]);
    expect(account.getSnapshot().sessionId).toBe(id); expect(account.getSnapshot().epoch).toBe(epoch);
    await account.logout(); expect(account.getSnapshot().status).toBe("signed-out");
    expect(account.getSnapshot().sessionId).toBeNull(); expect(account.getSnapshot().epoch).toBe(epoch+1);
  });
  it("discards late creation after logout", async () => {
    const pending=deferred(); const request=vi.fn().mockResolvedValueOnce(user()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json({signedOut:true}));
    const account=createWorkspaceAccount(request); await account.check(); const start=account.start();
    await account.logout(); pending.resolve(saved()); await start;
    expect(account.getSnapshot().sessionId).toBeNull(); expect(account.getSnapshot().status).toBe("signed-out");
  });
  it("clears an expired login and stops voice; ignores late identity checks", async () => {
    const pending=deferred(); const request=vi.fn().mockResolvedValueOnce(user()).mockResolvedValueOnce(saved()).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(Response.json({signedOut:true}));
    const account=createWorkspaceAccount(request); const stop=vi.fn(); account.registerStop(stop);
    await account.check(); await account.start(); const check=account.check(); await account.logout(); pending.resolve(user()); await check;
    expect(account.getSnapshot().status).toBe("signed-out"); expect(stop).toHaveBeenCalled();
  });
  it("preserves guest work on repeated anonymous checks and clears on account change", async () => {
    const request=vi.fn().mockResolvedValueOnce(new Response(null,{status:401})).mockResolvedValueOnce(new Response(null,{status:401}))
      .mockResolvedValueOnce(user()).mockResolvedValueOnce(saved()).mockResolvedValueOnce(Response.json({user:{email:"other@example.com"}}));
    const account=createWorkspaceAccount(request); await account.check(); const epoch=account.getSnapshot().epoch;
    await account.check(); expect(account.getSnapshot().epoch).toBe(epoch);
    await account.check(); await account.start(); await account.check();
    expect(account.getSnapshot().sessionId).toBeNull(); expect(account.getSnapshot().email).toBe("other@example.com");
    expect(account.getSnapshot().epoch).toBe(epoch+1);
  });
  it("rejects malformed success and handles expired sign-in during session creation", async () => {
    const request=vi.fn().mockResolvedValueOnce(user()).mockResolvedValueOnce(Response.json({session:{id:"fake"}},{status:201}))
      .mockResolvedValueOnce(new Response(null,{status:401}));
    const account=createWorkspaceAccount(request); await account.check(); await account.start();
    expect(account.getSnapshot().sessionId).toBeNull(); expect(account.getSnapshot().error).not.toBe("");
    await account.start(); expect(account.getSnapshot().status).toBe("signed-out");
  });
});
