import "server-only";

export type RealtimeCredential = {
  clientSecret: string;
  expiresAt: string;
};

export class CredentialError extends Error {
  readonly code: "missing-api-key" | "upstream-unavailable" | "invalid-credential";

  constructor(
    code: "missing-api-key" | "upstream-unavailable" | "invalid-credential",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "CredentialError";
  }
}

/** Server only. Call only after the credential route has verified access. */
export async function issueRealtimeCredential(options: {
  apiKey: string | undefined;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<RealtimeCredential> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new CredentialError("missing-api-key", "Set DEEPGRAM_API_KEY in your local server environment.");
  }

  const requestedAt = Date.now();
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      body: JSON.stringify({ ttl_seconds: 30 }),
    });
  } catch {
    throw new CredentialError("upstream-unavailable", "Could not reach the voice provider. Try again.");
  }
  if (!response.ok) {
    // Provider bodies may contain sensitive details; do not log or forward them.
    throw new CredentialError("upstream-unavailable", "Deepgram could not issue a credential. Check key permissions, project access, and credits.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CredentialError("invalid-credential", "The voice provider returned an invalid credential response.");
  }
  if (
    typeof payload !== "object" || payload === null ||
    !("access_token" in payload) || typeof payload.access_token !== "string" ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(payload.access_token) || payload.access_token.length > 8192 ||
    !("expires_in" in payload) || typeof payload.expires_in !== "number" ||
    !Number.isFinite(payload.expires_in) || payload.expires_in <= 0 || payload.expires_in > 30 ||
    requestedAt + payload.expires_in * 1000 <= Date.now()
  ) {
    throw new CredentialError("invalid-credential", "The voice provider returned an invalid or expired credential.");
  }
  return { clientSecret: payload.access_token, expiresAt: new Date(requestedAt + payload.expires_in * 1000).toISOString() };
}
