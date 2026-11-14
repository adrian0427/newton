import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalVoiceHarnessAllowed } from "@/lib/ai/local-voice-guard";
vi.mock("server-only", () => ({}));

let POST: typeof import("@/app/api/realtime/token/route").POST;
const grant = vi.fn<typeof fetch>();
const capability = "a".repeat(64);
function request(headers: Record<string, string> = {}, body: unknown = { sessionId: "local-test" }) {
  return new Request("http://127.0.0.1:3000/api/realtime/token", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json", "x-newton-voice-dev": capability, ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "development");
  for (const name of ["VERCEL", "VERCEL_ENV", "CI"]) vi.stubEnv(name, "");
  vi.stubEnv("NEWTON_VOICE_DEV_SECRET", capability);
  vi.stubEnv("DEEPGRAM_API_KEY", "server-key");
  grant.mockReset().mockResolvedValue(Response.json({ access_token: "header.payload.signature", expires_in: 30 }));
  vi.stubGlobal("fetch", grant);
  POST = (await import("@/app/api/realtime/token/route")).POST;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("development-only credential endpoint", () => {
  it.each(["production", "test"])("fails closed in %s even with a key and local capability", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    expect((await POST(request())).status).toBe(503);
    expect(grant).not.toHaveBeenCalled();
  });
  it.each(["VERCEL", "VERCEL_ENV", "CI"])("fails closed in deployed/CI environment %s", async (name) => {
    vi.stubEnv(name, "preview");
    expect((await POST(request())).status).toBe(503);
    expect(grant).not.toHaveBeenCalled();
  });
  it("does not enable issuance for ordinary dev servers without the generated capability", async () => {
    vi.stubEnv("NEWTON_VOICE_DEV_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    expect(grant).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { origin: "http://evil.example" },
    { host: "evil.example" },
    { "x-newton-voice-dev": "" },
    { "x-newton-voice-dev": "b".repeat(64) },
    { "x-newton-voice-dev": "ä".repeat(64) },
    { "sec-fetch-site": "cross-site" },
  ])("rejects unsafe request origins/capabilities before contacting Deepgram", async (headers) => {
    const response = await POST(request(headers));
    expect([403, 503]).toContain(response.status);
    expect(grant).not.toHaveBeenCalled();
  });
  it("issues only normalized short-lived JWTs with no-store", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ clientSecret: "header.payload.signature" });
    expect(grant).toHaveBeenCalledOnce();
    expect(grant.mock.calls[0][0]).toBe("https://api.deepgram.com/v1/auth/grant");
  });
  it("accepts a framework-normalized internal URL while still checking browser Origin and Host", async () => {
    const original = request();
    const normalized = new Request("http://localhost:3000/api/realtime/token", { method: "POST", headers: original.headers, body: await original.text() });
    expect((await POST(normalized)).status).toBe(200);
  });
  it("handles missing credentials and upstream errors without leaking details", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(grant).not.toHaveBeenCalled();
    vi.stubEnv("DEEPGRAM_API_KEY", "private-key");
    grant.mockRejectedValueOnce(new Error("secret upstream details"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("private-key");
    expect(text).not.toContain("secret upstream details");
  });
  it("limits the local server to five issuance attempts per ten minutes", async () => {
    grant.mockImplementation(async () => Response.json({ access_token: "header.payload.signature", expires_in: 30 }));
    for (let count = 0; count < 5; count++) expect((await POST(request())).status).toBe(200);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(grant).toHaveBeenCalledTimes(5);
  });
  it("rejects invalid/oversized bodies and untrusted owner fields", async () => {
    expect((await POST(request({}, {}))).status).toBe(400);
    expect((await POST(request({}, { sessionId: "test", userId: "other" }))).status).toBe(400);
    expect((await POST(request({}, { sessionId: "x".repeat(2048) }))).status).toBe(413);
    expect(grant).not.toHaveBeenCalled();
  });
});

describe("local harness access", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("permits loopback host %s in local development", (host) => {
    expect(isLocalVoiceHarnessAllowed({ nodeEnv: "development", host })).toBe(true);
  });
  it.each([
    { nodeEnv: "production", host: "localhost:3000" },
    { nodeEnv: "development", vercelEnv: "preview", host: "localhost:3000" },
    { nodeEnv: "development", host: "localhost.evil.example" },
    { nodeEnv: "development", host: null },
  ])("denies nonlocal/deployed contexts", (environment) => {
    expect(isLocalVoiceHarnessAllowed(environment)).toBe(false);
  });
});
