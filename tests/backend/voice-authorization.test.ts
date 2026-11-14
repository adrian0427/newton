import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), user: vi.fn(), select: vi.fn(), eq: vi.fn(), row: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
let POST: typeof import("@/app/api/realtime/token/route").POST;
const grant = vi.fn<typeof fetch>();
const sessionId = "00000000-0000-4000-8000-000000000001";
function request(body: unknown = { sessionId }, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/realtime/token", {
    method: "POST", headers: { host: "localhost:3000", origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  for (const key of ["VERCEL", "VERCEL_ENV", "CI", "NEWTON_VOICE_DEV_SECRET"]) vi.stubEnv(key, "");
  vi.stubEnv("DEEPGRAM_API_KEY", "private-test-server-key");
  mocks.user.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.row.mockResolvedValue({ data: { id: sessionId, started_at: "2026-11-14T00:00:00Z", ended_at: null }, error: null });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.row };
  mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.create.mockResolvedValue({ supabase: { auth: { getUser: mocks.user }, from: () => query }, headers: new Headers({ "Cache-Control": "private, no-store", Pragma: "no-cache" }) });
  grant.mockImplementation(async () => Response.json({ access_token: "header.payload.signature", expires_in: 30 }));
  vi.stubGlobal("fetch", grant);
  POST = (await import("@/app/api/realtime/token/route")).POST;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("requires verified login without a harness capability before contacting Deepgram", async () => {
  mocks.user.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(mocks.row).not.toHaveBeenCalled(); expect(grant).not.toHaveBeenCalled();
});
it.each(["foreign", "missing"])("returns the same 404 for a %s session without contacting Deepgram", async () => {
  mocks.row.mockResolvedValue({ data: null, error: null });
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(grant).not.toHaveBeenCalled();
});
it("issues only after verifying identity and ownership, preserving refresh headers", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.user).toHaveBeenCalledOnce();
  expect(mocks.eq).toHaveBeenCalledWith("id", sessionId);
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(mocks.row.mock.invocationCallOrder[0]).toBeLessThan(grant.mock.invocationCallOrder[0]);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(await response.json()).toEqual({ clientSecret: "header.payload.signature", expiresAt: expect.any(String) });
});
it.each([{ sessionId: "local-study-test" }, { sessionId, userId: "other" }, { sessionId, user_id: "other" }])("rejects invalid identity fields %j", async body => {
  expect((await POST(request(body))).status).toBe(400); expect(grant).not.toHaveBeenCalled();
});
it("sanitizes ownership/database failures and preserves refreshed headers", async () => {
  mocks.row.mockResolvedValue({ data: null, error: { message: "private database details" } });
  const response = await POST(request());
  expect(response.status).toBe(502); expect(response.headers.get("pragma")).toBe("no-cache");
  expect(await response.text()).not.toContain("private database details"); expect(grant).not.toHaveBeenCalled();
});
it("sanitizes Auth outages without contacting Deepgram", async () => {
  mocks.user.mockResolvedValue({ data: { user: null }, error: { status: 503, message: "private Auth details" } });
  expect((await POST(request())).status).toBe(502); expect(grant).not.toHaveBeenCalled();
});
it("rejects cross-origin requests before identity and provider calls", async () => {
  expect((await POST(request({ sessionId }, "https://evil.example"))).status).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled(); expect(grant).not.toHaveBeenCalled();
});
it.each(["production", "test"])("still disables issuance in %s even for an owned session", async env => {
  vi.stubEnv("NODE_ENV", env);
  expect((await POST(request())).status).toBe(503); expect(mocks.user).not.toHaveBeenCalled(); expect(grant).not.toHaveBeenCalled();
});
it.each(["", "b".repeat(64)])("does not fall back to logged-in access for an invalid dev capability", async supplied => {
  vi.stubEnv("NEWTON_VOICE_DEV_SECRET", "a".repeat(64));
  const original = request(); original.headers.set("x-newton-voice-dev", supplied);
  expect((await POST(original)).status).toBe(403);
  expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(grant).not.toHaveBeenCalled();
});

it("retains the existing shared local five-attempt limit after authorization", async () => {
  for (let i = 0; i < 5; i++) expect((await POST(request())).status).toBe(200);
  const response = await POST(request());
  expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("600");
  expect(response.headers.get("pragma")).toBe("no-cache"); expect(grant).toHaveBeenCalledTimes(5);
});

it("keeps refreshed headers on missing provider configuration and upstream failures", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "");
  const missing = await POST(request());
  expect(missing.status).toBe(503); expect(missing.headers.get("pragma")).toBe("no-cache");
  expect(grant).not.toHaveBeenCalled();
  vi.stubEnv("DEEPGRAM_API_KEY", "private-test-server-key");
  grant.mockRejectedValueOnce(new Error("private provider details"));
  const failure = await POST(request());
  expect(failure.status).toBe(502); expect(failure.headers.get("pragma")).toBe("no-cache");
  expect(await failure.text()).not.toContain("private provider details");
});
it("does not spend the issuance allowance on unauthorized requests", async () => {
  mocks.user.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  for (let i = 0; i < 6; i++) expect((await POST(request())).status).toBe(401);
  mocks.user.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  expect((await POST(request())).status).toBe(200); expect(grant).toHaveBeenCalledOnce();
});
