import "server-only";
import { selectVisionAdapter, type VisionEnvironment } from "./providers";
import { VisionError, type VisionFailureReason } from "./errors";

export { VisionError } from "./errors";

/** Same bounds as the workspace PNG export: 2 MiB, at most 2048 px per side. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;
export const MAX_TRANSCRIPTION_LENGTH = 200;
const MAX_MODEL_OUTPUT = 4000;
const DEFAULT_TIMEOUT_MS = 20_000;

/** No confidence score: providers do not supply a calibrated one. "?" marks a symbol the model could not read. */
export type HandwritingTranscription =
  | { status: "transcribed"; text: string }
  | { status: "ambiguous"; text: string }
  | { status: "unreadable" };

export { TRANSCRIPTION_INSTRUCTIONS, TRANSCRIPTION_REQUEST } from "./prompt";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Accept only a bounded PNG data URL with a valid header; nothing is decoded beyond the header. */
export function decodePngDataUrl(value: unknown): Uint8Array | null {
  const prefix = "data:image/png;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const base64 = value.slice(prefix.length);
  if (!base64 || base64.length % 4 || base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 33 || bytes.length > MAX_IMAGE_BYTES || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) return null;
  return new Uint8Array(bytes);
}

function invalidOutput(reason: VisionFailureReason): VisionError {
  return new VisionError("invalid-response", "Newton couldn't produce a plain transcription. Try again, or use Structured input.", undefined, reason);
}

/** Presentation-only normalization. Never extract a math substring from prose,
 * insert an operator, join split numbers, or repair an incomplete expression. */
function plainMath(text: string): string {
  let math = text.trim();
  const fence = /^```(?:math|latex|text)?\s*\n([\s\S]*?)\n```$/i.exec(math);
  if (fence) math = fence[1].trim();
  for (const [open, close] of [["$$", "$$"], ["$", "$"], ["\\[", "\\]"], ["\\(", "\\)"]]) {
    if (math.startsWith(open) && math.endsWith(close) && math.length >= open.length + close.length) {
      math = math.slice(open.length, -close.length).trim();
      break;
    }
  }
  // Accept only this equation-alignment environment, never general LaTeX/prose.
  if (math.startsWith("\\begin{aligned}") && math.endsWith("\\end{aligned}")) {
    math = math.slice("\\begin{aligned}".length, -"\\end{aligned}".length).replaceAll(/&(?=\s*=)/g, "");
  }
  math = math.replaceAll(/\\left(?=\s*\()/g, "").replaceAll(/\\right(?=\s*\))/g, "")
    .replaceAll(/\\(?:times|cdot)(?![A-Za-z])/g, "*").replaceAll(/\\div(?![A-Za-z])/g, "/")
    .replaceAll(/\\\\/g, "\n")
    .replaceAll(/[\u2212\u2013\u2014]/g, "-").replaceAll(/[\u00d7\u00b7\u22c5]/g, "*").replaceAll("\u00f7", "/")
    .replaceAll("\u00b2", "^2").replaceAll("\u00b3", "^3");
  const lines = math.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  let joined = lines.shift() ?? "";
  for (const line of lines) {
    // A continuation needs an explicit existing operator at its boundary.
    // In particular, `4` then `2k` must never become 42k or 4*2k.
    if (!/[=+*/^-]$/.test(joined) && !/^[=+*/^-]/.test(line)) throw invalidOutput("model-math-format");
    joined += line;
  }
  return joined.replaceAll(/\s+/g, " ").trim();
}

/** Model output is untrusted. Only a bounded status/text pair survives; any other field or prose is discarded. */
export function parseTranscription(raw: unknown): HandwritingTranscription {
  if (typeof raw !== "string" || raw.length > MAX_MODEL_OUTPUT) throw invalidOutput("model-size");
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try { value = JSON.parse(body); } catch {
    const start = body.indexOf("{"), end = body.lastIndexOf("}");
    if (start < 0 || end <= start) throw invalidOutput("model-json");
    try { value = JSON.parse(body.slice(start, end + 1)); } catch { throw invalidOutput("model-json"); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidOutput("model-shape");
  const { status, text } = value as Record<string, unknown>;
  if (status === "unreadable") return { status: "unreadable" };
  if (status !== "transcribed" || typeof text !== "string") throw invalidOutput("model-shape");
  const normalized = plainMath(text);
  if (!normalized) return { status: "unreadable" };
  // Words (for example "should be 4x+12") indicate commentary rather than a transcription.
  if (normalized.length > MAX_TRANSCRIPTION_LENGTH || /[^0-9A-Za-z .+\-*/^()=?]/.test(normalized) || /[A-Za-z]{3,}/.test(normalized)
    || (normalized.match(/=/g)?.length ?? 0) > 1) throw invalidOutput("model-math-format");
  return normalized.includes("?") ? { status: "ambiguous", text: normalized } : { status: "transcribed", text: normalized };
}

export async function transcribeHandwriting(png: Uint8Array, options: {
  env?: VisionEnvironment; fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number;
} = {}): Promise<HandwritingTranscription> {
  const adapter = selectVisionAdapter(options.env ?? process.env, options.fetch ?? fetch);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let raw: string;
  try {
    raw = await adapter.transcribe({ mimeType: "image/png", base64: Buffer.from(png).toString("base64") }, signal);
  } catch (error) {
    if (error instanceof VisionError) throw error;
    if (timeout.aborted) throw new VisionError("timeout", "Reading your handwriting took too long. Try again, or use Structured input.");
    if (options.signal?.aborted) throw new VisionError("cancelled", "The request was cancelled.");
    throw new VisionError("upstream-unavailable", "The handwriting service is unavailable. Try again, or use Structured input.");
  }
  return parseTranscription(raw);
}
