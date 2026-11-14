import { timingSafeEqual } from "node:crypto";
import { isLocalVoiceHarnessAllowed } from "@/lib/ai/local-voice-guard";
import { CredentialError, issueRealtimeCredential } from "@/lib/ai/realtime-credentials";

export const runtime = "nodejs";
let recentIssuances: number[] = [];

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, retryable: status === 429 || status === 502 } }, {
    status,
    headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "600" } : {}) },
  });
}

/** Local development capability only. C must supply auth/ownership/abuse controls before deployment. */
export async function POST(request: Request) {
  const allowed = isLocalVoiceHarnessAllowed({
    nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV,
    ci: process.env.CI, host: request.headers.get("host"),
  });
  const capability = process.env.NEWTON_VOICE_DEV_SECRET;
  if (!allowed || !capability || capability.length < 32) {
    return failure(503, "voice-unavailable", "Voice issuance is unavailable outside the local development harness.");
  }
  const origin = request.headers.get("origin");
  const supplied = request.headers.get("x-newton-voice-dev") ?? "";
  const expectedBytes = Buffer.from(capability);
  const suppliedBytes = Buffer.from(supplied);
  const localOrigin = `http://${request.headers.get("host")}`;
  if (
    // Next.js may normalize request.url to its internal hostname. Validate the browser's
    // Origin against the already allowlisted HTTP Host instead of that internal URL.
    origin !== localOrigin ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") ||
    suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return failure(403, "voice-denied", "Local voice session is not authorized. Restart the harness.");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return failure(400, "invalid-request", "Expected a JSON session request.");
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure(400, "invalid-request", "A session request is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024) { await reader.cancel(); return failure(413, "invalid-request", "Session request is too large."); }
      chunks.push(next.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body !== "object" || body === null || !("sessionId" in body) || typeof body.sessionId !== "string" || !body.sessionId.trim() || body.sessionId.length > 128 || Object.keys(body).some((key) => key !== "sessionId")) {
      return failure(400, "invalid-request", "A valid session identifier is required.");
    }
  } catch { return failure(400, "invalid-request", "Invalid session request."); }

  if (!process.env.DEEPGRAM_API_KEY?.trim()) return failure(503, "missing-api-key", "Voice server credentials are not configured.");
  const now = Date.now();
  recentIssuances = recentIssuances.filter((time) => time > now - 600_000);
  if (recentIssuances.length >= 5) return failure(429, "voice-rate-limited", "Local voice start limit reached.");
  recentIssuances.push(now);
  try {
    const credential = await issueRealtimeCredential({ apiKey: process.env.DEEPGRAM_API_KEY, signal: request.signal });
    return Response.json(credential, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof CredentialError ? error.code : "upstream-unavailable";
    return failure(502, code, "Voice credentials could not be issued. Check server configuration and credits.");
  }
}
