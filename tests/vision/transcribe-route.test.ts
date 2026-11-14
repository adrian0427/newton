import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", async (original) => ({ ...await original<object>(), requireUser: mocks.requireUser }));
import { BackendError } from "@/lib/supabase/auth";
import { POST } from "@/app/api/work/transcribe/route";
import { resetTranscriptionLimits, TRANSCRIPTION_LIMIT } from "@/lib/vision/limits";
import { groqReply, pngDataUrl } from "./helpers";

// The provider is a mocked global fetch; requireUser is mocked. No real model or Supabase call is made.
const provider = vi.fn<typeof fetch>();
function request(body: unknown, overrides: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/work/transcribe", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...overrides },
  });
}
const valid = { revisionId: "3f1e2d4c-0000-4000-8000-000000000001", image: pngDataUrl() };

beforeEach(() => {
  vi.resetAllMocks();
  resetTranscriptionLimits();
  vi.stubGlobal("fetch", provider);
  vi.stubEnv("GROQ_API_KEY", "test-groq-key");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("NEWTON_VISION_PROVIDER", "");
  mocks.requireUser.mockResolvedValue({ userId: "verified-user", headers: new Headers({ "Cache-Control": "private, no-store" }) });
  provider.mockImplementation(async () => groqReply('{"status":"transcribed","text":"4(x+3)=4x+3","answer":"4x+12"}'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("returns only the bounded transcription for the requested revision, uncached", async () => {
  const response = await POST(request(valid));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ transcription: { revisionId: valid.revisionId, status: "transcribed", text: "4(x+3)=4x+3" } });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(provider).toHaveBeenCalledOnce();
});
it("rejects cross-origin and unauthenticated requests before any provider call", async () => {
  expect((await POST(request(valid, { origin: "https://other.example" }))).status).toBe(403);
  mocks.requireUser.mockRejectedValue(new BackendError(401, "unauthenticated", "Please sign in."));
  const response = await POST(request(valid));
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(provider).not.toHaveBeenCalled();
});
it.each([
  ["non-JSON content type", request(valid, { "content-type": "text/plain" }), 400],
  ["malformed JSON", request("{"), 400],
  ["extra fields", request({ ...valid, userId: "forged" }), 400],
  ["invalid revision", request({ ...valid, revisionId: "../../etc" }), 400],
  ["non-PNG image", request({ ...valid, image: "data:image/jpeg;base64,/9j/4AAQ" }), 400],
  ["oversized body", request({ ...valid, image: "A".repeat(3_000_000) }), 413],
])("rejects %s without contacting the provider", async (_name, input, status) => {
  expect((await POST(input)).status).toBe(status);
  expect(provider).not.toHaveBeenCalled();
});
it("reports missing vision credentials as a configuration state", async () => {
  vi.stubEnv("GROQ_API_KEY", "");
  const response = await POST(request(valid));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "vision-not-configured", retryable: true } });
  expect(provider).not.toHaveBeenCalled();
});
it("limits repeated reads per verified user", async () => {
  for (let index = 0; index < TRANSCRIPTION_LIMIT.attempts; index++) expect((await POST(request(valid))).status).toBe(200);
  const limited = await POST(request(valid));
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(provider).toHaveBeenCalledTimes(TRANSCRIPTION_LIMIT.attempts);
  mocks.requireUser.mockResolvedValue({ userId: "another-user", headers: new Headers() });
  expect((await POST(request(valid))).status).toBe(200);
});
it("passes through provider rate limits and hides malformed model output", async () => {
  provider.mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "12" } }));
  const limited = await POST(request(valid));
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("12");
  provider.mockResolvedValueOnce(groqReply("Looks like 4x+12 to me"));
  const malformed = await POST(request(valid));
  expect(malformed.status).toBe(502);
  expect(JSON.stringify(await malformed.json())).not.toContain("4x+12");
});
it("returns ambiguous and unreadable results as distinct, non-error states", async () => {
  provider.mockResolvedValueOnce(groqReply('{"status":"transcribed","text":"4(x+?)=4x+12"}'));
  expect(await (await POST(request(valid))).json()).toEqual({ transcription: { revisionId: valid.revisionId, status: "ambiguous", text: "4(x+?)=4x+12" } });
  provider.mockResolvedValueOnce(groqReply('{"status":"unreadable"}'));
  expect(await (await POST(request(valid))).json()).toEqual({ transcription: { revisionId: valid.revisionId, status: "unreadable" } });
});
