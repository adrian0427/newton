import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decodePngDataUrl, parseTranscription, transcribeHandwriting, TRANSCRIPTION_INSTRUCTIONS, VisionError } from "@/lib/vision/handwriting";
import { DEFAULT_GEMINI_MODEL, DEFAULT_GROQ_MODEL, selectVisionAdapter } from "@/lib/vision/providers";
import { geminiReply, groqReply, pngDataUrl } from "./helpers";

// All tests in this file use mocked provider responses; none call a real model.
const png = decodePngDataUrl(pngDataUrl())!;
const groqEnv = { GROQ_API_KEY: "test-groq-key" };
const geminiEnv = { GEMINI_API_KEY: "test-gemini-key" };
const visionCode = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error instanceof VisionError ? error.code : "other"; } return "resolved"; };

describe("transcription output validation", () => {
  it.each(["4(x+3)=4x+12", "-4(x+3)=-4x+-12", "4x+12"])("accepts an accurate plain transcription: %s", (text) => {
    expect(parseTranscription(JSON.stringify({ status: "transcribed", text }))).toEqual({ status: "transcribed", text });
  });
  it("preserves incorrect mathematics exactly as written", () => {
    expect(parseTranscription('{"status":"transcribed","text":"4(x+3)=4x+3"}')).toEqual({ status: "transcribed", text: "4(x+3)=4x+3" });
  });
  it("drops volunteered answers, extra fields and surrounding prose", () => {
    const leaked = 'The correct answer is 4x+12.\n```json\n{"status":"transcribed","text":"4(x+3)=4x+3","correct_answer":"4x+12","explanation":"multiply 4 by 3"}\n```';
    const result = parseTranscription(leaked);
    expect(result).toEqual({ status: "transcribed", text: "4(x+3)=4x+3" });
    expect(JSON.stringify(result)).not.toContain("12");
  });
  it("marks unclear symbols as ambiguous instead of guessing", () => {
    expect(parseTranscription('{"status":"transcribed","text":"4(x+?)=4x+12"}')).toEqual({ status: "ambiguous", text: "4(x+?)=4x+12" });
  });
  it("reports unreadable work without a fabricated confidence", () => {
    expect(parseTranscription('{"status":"unreadable","confidence":0.2}')).toEqual({ status: "unreadable" });
    expect(parseTranscription('{"status":"transcribed","text":"   "}')).toEqual({ status: "unreadable" });
  });
  it("normalizes typographic math symbols without changing the work", () => {
    expect(parseTranscription('{"status":"transcribed","text":"−4(x + 3) = −4x × 1 + −12"}')).toEqual({ status: "transcribed", text: "-4(x + 3) = -4x * 1 + -12" });
    expect(parseTranscription('{"status":"transcribed","text":"x²+1"}')).toEqual({ status: "transcribed", text: "x^2+1" });
  });
  it.each([
    "4(x+3)=4x+12", "", "null", "[]", '{"status":"maybe","text":"4x"}', '{"status":"transcribed"}', '{"status":"transcribed","text":42}',
    '{"status":"transcribed","text":"4(x+3)=4x+3, should be 4x+12"}', '{"status":"transcribed","text":"\\\\frac{4}{x}"}',
    `{"status":"transcribed","text":"${"1".repeat(201)}"}`, "x".repeat(4001), '{"status":"transcribed","text":"<script>"}',
  ])("rejects malformed or non-transcription output: %s", (raw) => {
    expect(() => parseTranscription(raw)).toThrow(VisionError);
  });
  it("instructs the model to copy errors and never grade or answer", () => {
    for (const phrase of ["including any mistakes", "Do not correct", "grade", "Never add an answer", "write ? in its place"]) expect(TRANSCRIPTION_INSTRUCTIONS).toContain(phrase);
  });
});

describe("image validation", () => {
  it("accepts a bounded PNG data URL", () => {
    expect(decodePngDataUrl(pngDataUrl(2048, 400))).toBeInstanceOf(Uint8Array);
  });
  it.each([
    ["JPEG", "data:image/jpeg;base64,/9j/4AAQ"], ["remote URL", "https://example.com/work.png"], ["invalid base64", "data:image/png;base64,***"],
    ["oversized dimensions", pngDataUrl(4096, 10)], ["zero dimensions", pngDataUrl(0, 10)], ["over 2 MiB", pngDataUrl(10, 10, 2 * 1024 * 1024)],
    ["non-string", 42], ["wrong signature", `data:image/png;base64,${Buffer.alloc(40).toString("base64")}`],
  ])("rejects %s", (_name, value) => {
    expect(decodePngDataUrl(value)).toBeNull();
  });
});

describe("provider selection", () => {
  it("reports missing credentials as not configured", () => {
    expect(() => selectVisionAdapter({}, fetch)).toThrow(expect.objectContaining({ code: "not-configured" }));
    expect(() => selectVisionAdapter({ GROQ_API_KEY: "  " }, fetch)).toThrow(expect.objectContaining({ code: "not-configured" }));
    expect(() => selectVisionAdapter({ NEWTON_VISION_PROVIDER: "gemini", ...groqEnv }, fetch)).toThrow(expect.objectContaining({ code: "not-configured" }));
    expect(() => selectVisionAdapter({ NEWTON_VISION_PROVIDER: "openai", ...groqEnv }, fetch)).toThrow(expect.objectContaining({ code: "not-configured" }));
    expect(() => selectVisionAdapter({ ...groqEnv, GROQ_VISION_MODEL: "bad model!" }, fetch)).toThrow(expect.objectContaining({ code: "not-configured" }));
  });
  it("prefers Groq Qwen vision, falls back to Gemma 4, and honours an explicit choice", () => {
    expect(selectVisionAdapter({ ...groqEnv, ...geminiEnv }, fetch)).toMatchObject({ provider: "groq", model: DEFAULT_GROQ_MODEL });
    expect(selectVisionAdapter({ ...geminiEnv, NEWTON_VISION_PROVIDER: "" }, fetch)).toMatchObject({ provider: "gemini", model: DEFAULT_GEMINI_MODEL });
    expect(selectVisionAdapter({ ...groqEnv, ...geminiEnv, NEWTON_VISION_PROVIDER: "gemini" }, fetch)).toMatchObject({ provider: "gemini" });
  });
});

describe("provider adapters (mocked HTTP)", () => {
  it("sends Groq only the instructions and inline PNG, with reasoning disabled and the key in a header", async () => {
    const fetchMock = vi.fn(async () => groqReply('{"status":"transcribed","text":"4(x+3)=4x+3"}'));
    await expect(transcribeHandwriting(png, { env: groqEnv, fetch: fetchMock })).resolves.toEqual({ status: "transcribed", text: "4(x+3)=4x+3" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-groq-key");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: DEFAULT_GROQ_MODEL, temperature: 0, reasoning_effort: "none", stream: false });
    expect(body.messages[0]).toEqual({ role: "system", content: TRANSCRIPTION_INSTRUCTIONS });
    expect(body.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
    expect(String(init.body)).not.toContain("test-groq-key");
  });
  it("calls Gemma 4 through the Gemini API with a header key and ignores thought parts", async () => {
    const fetchMock = vi.fn(async () => geminiReply([{ text: "4(x+3) is 4x+12", thought: true }, { text: '{"status":"transcribed","text":"-4(x+3)=-4x+-12"}' }]));
    await expect(transcribeHandwriting(png, { env: geminiEnv, fetch: fetchMock })).resolves.toEqual({ status: "transcribed", text: "-4(x+3)=-4x+-12" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain("key=");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("test-gemini-key");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: Buffer.from(png).toString("base64") } });
    expect(body.generationConfig).toMatchObject({ temperature: 0, thinkingConfig: { thinkingLevel: "minimal" } });
  });
  it("maps provider rate limits with a bounded Retry-After", async () => {
    const limited = vi.fn(async () => new Response("quota details", { status: 429, headers: { "Retry-After": "7200" } }));
    await expect(transcribeHandwriting(png, { env: groqEnv, fetch: limited })).rejects.toMatchObject({ code: "rate-limited", retryAfterSeconds: 600 });
  });
  it("never reads or forwards provider error bodies", async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("secret request echo")); } });
    const failed = vi.fn(async () => new Response(body, { status: 400 }));
    const error = await transcribeHandwriting(png, { env: groqEnv, fetch: failed }).then(() => null, (reason: unknown) => reason as VisionError);
    expect(error).toMatchObject({ code: "upstream-unavailable" });
    expect(error?.message).not.toContain("secret");
  });
  it("times out a slow provider", async () => {
    const slow = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    }));
    expect(await visionCode(transcribeHandwriting(png, { env: groqEnv, fetch: slow as typeof fetch, timeoutMs: 20 }))).toBe("timeout");
  });
  it("treats network failures, oversized replies and malformed payloads as service errors", async () => {
    expect(await visionCode(transcribeHandwriting(png, { env: groqEnv, fetch: vi.fn(async () => { throw new TypeError("network"); }) }))).toBe("upstream-unavailable");
    expect(await visionCode(transcribeHandwriting(png, { env: groqEnv, fetch: vi.fn(async () => new Response("x".repeat(70_000))) }))).toBe("invalid-response");
    expect(await visionCode(transcribeHandwriting(png, { env: groqEnv, fetch: vi.fn(async () => new Response("not json")) }))).toBe("invalid-response");
    expect(await visionCode(transcribeHandwriting(png, { env: groqEnv, fetch: vi.fn(async () => Response.json({ choices: [] })) }))).toBe("invalid-response");
    expect(await visionCode(transcribeHandwriting(png, { env: geminiEnv, fetch: vi.fn(async () => geminiReply([{ text: "hidden", thought: true }])) }))).toBe("invalid-response");
    expect(await visionCode(transcribeHandwriting(png, { env: groqEnv, fetch: vi.fn(async () => groqReply("I think it says 4x+12")) }))).toBe("invalid-response");
  });
  it("fails before any network call when credentials are missing", async () => {
    const fetchMock = vi.fn();
    expect(await visionCode(transcribeHandwriting(png, { env: {}, fetch: fetchMock }))).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
