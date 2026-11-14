import { BackendError, requireUser } from "@/lib/supabase/auth";
import { isSameOrigin } from "@/lib/supabase/origin";
import { readBoundedText, RequestBodyTooLargeError } from "@/lib/http/body";
import { decodePngDataUrl, transcribeHandwriting, VisionError, MAX_IMAGE_BYTES } from "@/lib/vision/handwriting";
import { takeTranscriptionAttempt } from "@/lib/vision/limits";

export const runtime = "nodejs";
export const maxDuration = 30;

// Base64 PNG of at most 2 MiB plus the small JSON envelope.
const MAX_BODY_CHARACTERS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 512;
function respond(status: number, body: unknown, headers?: Headers, retryAfter?: number) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.get("Cache-Control")?.includes("no-store")) responseHeaders.set("Cache-Control", "private, no-store");
  if (retryAfter) responseHeaders.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers: responseHeaders });
}

function failure(status: number, code: string, message: string, headers?: Headers, retryAfter?: number) {
  return respond(status, { error: { code, message, retryable: status === 429 || status >= 500 } }, headers, retryAfter);
}

const visionStatus = { "not-configured": 503, "rate-limited": 429, timeout: 504, cancelled: 499, "upstream-unavailable": 502, "invalid-response": 502 } as const;

/** Transcribes an explicitly requested whiteboard PNG. Nothing is stored or logged; the model never grades. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return failure(403, "forbidden", "This request must come from Newton.");
  let headers: Headers | undefined;
  try {
    const auth = await requireUser();
    headers = auth.headers;
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return failure(400, "invalid-input", "Send the whiteboard image as JSON.", headers);
    }
    let input: unknown;
    try { input = JSON.parse(await readBoundedText(request, MAX_BODY_CHARACTERS)); } catch (error) {
      return error instanceof RequestBodyTooLargeError
        ? failure(413, "image-too-large", "This drawing is too large to read. Capture a smaller area.", headers)
        : failure(400, "invalid-input", "The handwriting request could not be read.", headers);
    }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "revisionId" && key !== "image")) {
      return failure(400, "invalid-input", "Send only the revision and whiteboard image.", headers);
    }
    const { revisionId, image } = input as Record<string, unknown>;
    if (typeof revisionId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(revisionId)) return failure(400, "invalid-input", "A valid work revision is required.", headers);
    const png = decodePngDataUrl(image);
    if (!png) return failure(400, "invalid-image", "Send a PNG whiteboard export of at most 2 MiB and 2048 pixels per side.", headers);
    const wait = takeTranscriptionAttempt(auth.userId);
    if (wait) return failure(429, "rate-limited", "You've asked Newton to read handwriting many times recently. Wait a few minutes, or use Structured input.", headers, wait);
    const transcription = await transcribeHandwriting(png, { signal: request.signal });
    return respond(200, { transcription: { revisionId, ...transcription } }, headers);
  } catch (error) {
    if (error instanceof BackendError) return failure(error.status, error.code, error.message, headers ?? error.headers);
    if (error instanceof VisionError) {
      return failure(visionStatus[error.code], error.code === "not-configured" ? "vision-not-configured" : error.code, error.message, headers, error.retryAfterSeconds);
    }
    return failure(502, "upstream-unavailable", "The handwriting service is unavailable. Try again, or use Structured input.", headers);
  }
}
