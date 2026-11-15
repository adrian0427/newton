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

it.each([
  ["provider-json", () => new Response("not-json", { status: 200 })],
  ["provider-shape", () => Response.json({ choices: [] })],
  ["provider-truncated", () => Response.json({ choices: [{ finish_reason: "length", message: { content: "PRIVATE" } }] })],
  ["model-json", () => groqReply("PRIVATE explanatory prose")],
  ["model-shape", () => groqReply('{"status":"transcribed","text":42}')],
  ["model-math-format", () => groqReply('{"status":"transcribed","text":"PRIVATE commentary"}')],
])("distinguishes HTTP-200 %s rejection with a fixed development-only diagnostic", async (diagnostic, reply) => {
  vi.stubEnv("NODE_ENV", "development");
  provider.mockImplementationOnce(async () => reply());
  const response = await POST(request(valid));
  expect(response.status).toBe(502);
  const payload = await response.json();
  expect(payload).toMatchObject({ error: { code: "invalid-response", diagnostic } });
  expect(JSON.stringify(payload)).not.toContain("PRIVATE");
  vi.stubEnv("NODE_ENV", "production");
  provider.mockImplementationOnce(async () => reply());
  const production = await (await POST(request(valid))).json();
  expect(production.error).not.toHaveProperty("diagnostic");
});

it("distinguishes failed upstream HTTP from a rejected successful response", async () => {
  vi.stubEnv("NODE_ENV", "development");
  provider.mockResolvedValueOnce(new Response("PRIVATE", { status: 500 }));
  const response = await POST(request(valid));
  expect(response.status).toBe(502);
  const payload = await response.json();
  expect(payload.error.code).toBe("upstream-unavailable");
  expect(payload.error).not.toHaveProperty("diagnostic");
  expect(JSON.stringify(payload)).not.toContain("PRIVATE");
});

it("returns a faithful multiline equation from a successful provider response without grading or correcting it", async () => {
  provider.mockResolvedValueOnce(groqReply(JSON.stringify({ status: "transcribed", text: "7(6k+2)\n=42k+2" })));
  const response = await POST(request(valid));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ transcription: { revisionId: valid.revisionId, status: "transcribed", text: "7(6k+2)=42k+2" } });
  expect(provider).toHaveBeenCalledOnce();
});
