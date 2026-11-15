import "server-only";
import { VisionError } from "./errors";
import { TRANSCRIPTION_INSTRUCTIONS, TRANSCRIPTION_REQUEST } from "./prompt";

export type VisionEnvironment = Record<string, string | undefined>;
export type VisionImage = { mimeType: "image/png"; base64: string };

/** Replaceable server-side boundary. Returns raw model text; callers validate it. */
export type VisionAdapter = {
  readonly provider: "groq" | "gemini";
  readonly model: string;
  transcribe(image: VisionImage, signal: AbortSignal): Promise<string>;
};

export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
export const DEFAULT_GEMINI_MODEL = "gemma-4-31b-it";
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;
const MAX_OUTPUT_TOKENS = 200;

function notConfigured() {
  return new VisionError("not-configured", "Handwriting recognition is not configured on this server. Use Structured input instead.");
}

/** Prefer Groq (Qwen vision) when its key exists; otherwise use Gemma 4 through the Gemini API. */
export function selectVisionAdapter(env: VisionEnvironment, fetchImpl: typeof fetch): VisionAdapter {
  const choice = env.NEWTON_VISION_PROVIDER?.trim().toLowerCase() || undefined;
  const groqKey = env.GROQ_API_KEY?.trim();
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (choice && choice !== "groq" && choice !== "gemini") throw notConfigured();
  const provider = choice ?? (groqKey ? "groq" : geminiKey ? "gemini" : undefined);
  if (provider === "groq" && groqKey) return groqAdapter(groqKey, model(env.GROQ_VISION_MODEL, DEFAULT_GROQ_MODEL, /^[a-z0-9][a-z0-9._/-]{0,99}$/i), fetchImpl);
  if (provider === "gemini" && geminiKey) return geminiAdapter(geminiKey, model(env.GEMINI_VISION_MODEL, DEFAULT_GEMINI_MODEL, /^[a-z0-9][a-z0-9.-]{0,99}$/i), fetchImpl);
  throw notConfigured();
}

function model(value: string | undefined, fallback: string, pattern: RegExp) {
  const chosen = value?.trim() || fallback;
  if (!pattern.test(chosen)) throw notConfigured();
  return chosen;
}

async function post(fetchImpl: typeof fetch, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal,
  });
  if (response.status === 429) {
    void response.body?.cancel().catch(() => undefined);
    const retry = Number(response.headers.get("retry-after"));
    throw new VisionError("rate-limited", "Handwriting recognition is busy. Wait a moment and try again, or use Structured input.",
      Number.isFinite(retry) && retry > 0 ? Math.min(Math.ceil(retry), 600) : 30);
  }
  if (!response.ok) {
    // Provider error bodies can echo request details; they are never read or forwarded.
    void response.body?.cancel().catch(() => undefined);
    throw new VisionError("upstream-unavailable", "The handwriting service is unavailable. Try again, or use Structured input.");
  }
  const text = await boundedText(response);
  try { return JSON.parse(text); } catch { throw new VisionError("invalid-response", "Newton couldn't produce a plain transcription. Try again, or use Structured input.", undefined, "provider-json"); }
}

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_RESPONSE_BYTES) throw tooLarge(response);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_PROVIDER_RESPONSE_BYTES) { void reader.cancel().catch(() => undefined); throw tooLarge(); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

function tooLarge(response?: Response) {
  void response?.body?.cancel().catch(() => undefined);
  return new VisionError("invalid-response", "Newton couldn't produce a plain transcription. Try again, or use Structured input.", undefined, "provider-size");
}

function invalidShape() {
  return new VisionError("invalid-response", "Newton couldn't produce a plain transcription. Try again, or use Structured input.", undefined, "provider-shape");
}

/** Groq's OpenAI-compatible chat completions with image input. Reasoning is disabled to keep output to the transcription. */
function groqAdapter(apiKey: string, modelId: string, fetchImpl: typeof fetch): VisionAdapter {
  return {
    provider: "groq", model: modelId,
    async transcribe(image, signal) {
      const payload = await post(fetchImpl, "https://api.groq.com/openai/v1/chat/completions", { Authorization: `Bearer ${apiKey}` }, {
        model: modelId,
        messages: [
          { role: "system", content: TRANSCRIPTION_INSTRUCTIONS },
          { role: "user", content: [
            { type: "text", text: TRANSCRIPTION_REQUEST },
            { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
          ] },
        ],
        temperature: 0, max_completion_tokens: MAX_OUTPUT_TOKENS, reasoning_effort: "none", stream: false,
      }, signal);
      const finish = (payload as { choices?: { finish_reason?: unknown }[] })?.choices?.[0]?.finish_reason;
      if (finish === "length") throw new VisionError("invalid-response", "Newton couldn't produce a plain transcription. Try again, or use Structured input.", undefined, "provider-truncated");
      const content = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw invalidShape();
      return content;
    },
  };
}

/** Gemma 4 through the Gemini API generateContent endpoint with an inline image. Thinking is minimized. */
function geminiAdapter(apiKey: string, modelId: string, fetchImpl: typeof fetch): VisionAdapter {
  return {
    provider: "gemini", model: modelId,
    async transcribe(image, signal) {
      const payload = await post(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`, { "x-goog-api-key": apiKey }, {
        systemInstruction: { parts: [{ text: TRANSCRIPTION_INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }, { text: TRANSCRIPTION_REQUEST }] }],
        generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: "minimal" } },
      }, signal);
      const parts = (payload as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) throw invalidShape();
      // Thought summaries are never transcription output.
      const text = parts.filter((part) => part && part.thought !== true && typeof part.text === "string").map((part) => part.text as string).join("");
      if (!text) throw invalidShape();
      return text;
    },
  };
}
