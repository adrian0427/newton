import { BackendError, requireUser } from "@/lib/supabase/auth";
import { requireOwnedSession } from "@/lib/learning/sessions";
import { timingSafeEqual } from "node:crypto";
import { isLocalVoiceHarnessAllowed } from "@/lib/ai/local-voice-guard";
import { CredentialError, issueRealtimeCredential } from "@/lib/ai/realtime-credentials";

export const runtime = "nodejs";
let recentIssuances: number[] = [];

function failure(status: number, code: string, message: string, headers?: Headers) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.get("Cache-Control")?.includes("no-store")) responseHeaders.set("Cache-Control", "no-store");
  if (status === 429) responseHeaders.set("Retry-After", "600");
  return Response.json({ error: { code, message, retryable: status === 429 || status === 502 } }, {
    status,
    headers: responseHeaders,
  });
}

/** Local only: isolated harness capability or verified student/session. Deployment stays closed. */
export async function POST(request: Request) {
  const allowed = isLocalVoiceHarnessAllowed({
    nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV,
    ci: process.env.CI, host: request.headers.get("host"),
  });
  if (!allowed) {
    return failure(503, "voice-unavailable", "Voice issuance is unavailable outside local development.");
  }
  const localOrigin = `http://${request.headers.get("host")}`;
  if (request.headers.get("origin") !== localOrigin ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
    return failure(403, "voice-denied", "This request must come from Newton.");
  }
  // Only the explicitly guarded local harness can use a capability instead of login.
  // A bad capability must never silently fall back to the authenticated path.
  const harness = request.headers.has("x-newton-voice-dev");
  if (harness) {
    const capability = process.env.NEWTON_VOICE_DEV_SECRET;
    if (!capability || capability.length < 32) return failure(503, "voice-unavailable", "Local voice harness is not configured.");
    const expected = Buffer.from(capability);
    const supplied = Buffer.from(request.headers.get("x-newton-voice-dev") ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return failure(403, "voice-denied", "Local voice session is not authorized. Restart the harness.");
    }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return failure(400, "invalid-request", "Expected a JSON session request.");
  }
  let sessionId: string;
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
    sessionId = body.sessionId;
  } catch { return failure(400, "invalid-request", "Invalid session request."); }

  let headers: Headers | undefined;
  if (!harness) {
    try {
      const auth = await requireUser();
      headers = auth.headers;
      await requireOwnedSession(auth, sessionId);
    } catch (error) {
      if (error instanceof BackendError) return failure(error.status, error.code, error.message, headers ?? error.headers);
      return failure(502, "auth-unavailable", "Unable to authorize voice. Please retry.", headers);
    }
  }

  if (!process.env.DEEPGRAM_API_KEY?.trim()) return failure(503, "missing-api-key", "Voice server credentials are not configured.", headers);
  const now = Date.now();
  recentIssuances = recentIssuances.filter((time) => time > now - 600_000);
  if (recentIssuances.length >= 5) return failure(429, "voice-rate-limited", "Local voice start limit reached.", headers);
  recentIssuances.push(now);
  try {
    const credential = await issueRealtimeCredential({ apiKey: process.env.DEEPGRAM_API_KEY, signal: request.signal });
    return Response.json(credential, { headers: headers ?? { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof CredentialError ? error.code : "upstream-unavailable";
    return failure(502, code, "Voice credentials could not be issued. Check server configuration and credits.", headers);
  }
}
