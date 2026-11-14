/** A-owned adapter types; proposed additive integration API, not new tutoring contracts. */
export type VoiceState = "unavailable" | "idle" | "connecting" | "listening" | "speaking" | "interrupted" | "stopping" | "error";
export type VoiceSnapshot = Readonly<{ state: VoiceState; error?: string }>;
export type VoiceCredential = Readonly<{ clientSecret: string; expiresAt: string }>;
export type CredentialProvider = (request: { sessionId: string; signal: AbortSignal }) => Promise<VoiceCredential>;

export type VoiceConnectionEvent =
  | { type: "listening" | "speaking" | "interrupted" | "disconnected" }
  | { type: "error"; error: unknown };

/** Provider-neutral seam for real SDK connections and mocked lifecycle tests. */
export interface VoiceConnection {
  connect(clientSecret: string): Promise<void>;
  close(): void;
  interrupt(): void;
  subscribe(listener: (event: VoiceConnectionEvent) => void): () => void;
}

export interface VoiceSession {
  start(input: { sessionId: string }): Promise<void>;
  stop(): Promise<void>;
  interrupt(): void;
  getState(): VoiceState;
  getSnapshot(): VoiceSnapshot;
  subscribe(listener: () => void): () => void;
}

function safeError(error: unknown): string {
  if (error instanceof CredentialRequestError) return error.message;
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "Microphone permission was denied. Allow microphone access, then start again.";
  }
  if (error instanceof Error && error.name === "NotFoundError") {
    return "No microphone was found. Connect one, then start again.";
  }
  if (error instanceof Error && error.name === "NotReadableError") {
    return "The microphone is unavailable. Check other apps and your device settings.";
  }
  return "The voice connection failed. Check your network and use a fresh short-lived credential to retry.";
}

/** Replace the provider after C's authenticated endpoint is integrated; lifecycle stays the same. */
export function createCredentialProvider(headers: Record<string, string> = {}): CredentialProvider {
  return async ({ sessionId, signal }) => {
    const response = await fetch("/api/realtime/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ sessionId }),
      signal,
    });
    if (!response.ok) {
      const code = response.status === 429 ? "rate-limited" : response.status === 503 ? "unavailable" : response.status === 403 ? "denied" : "failed";
      throw new CredentialRequestError(code);
    }
    return await response.json();
  };
}

class CredentialRequestError extends Error {
  constructor(code: "rate-limited" | "unavailable" | "denied" | "failed") {
    super({
      "rate-limited": "Voice start limit reached. Wait ten minutes before trying again.",
      unavailable: "Voice credentials are unavailable. Check local server configuration and the voice setup guide.",
      denied: "This voice test session is not authorized. Restart the local harness and reload the page.",
      failed: "The voice provider could not issue a credential. Check server configuration and credits.",
    }[code]);
  }
}

export const fetchVoiceCredential = createCredentialProvider();

export function createVoiceSession(options: {
  credentialProvider?: CredentialProvider;
  createConnection: () => VoiceConnection | Promise<VoiceConnection>;
  connectTimeoutMs?: number;
}): VoiceSession {
  let snapshot: VoiceSnapshot = { state: "idle" };
  const listeners = new Set<() => void>();
  type Attempt = { controller: AbortController; connection?: VoiceConnection; unsubscribe?: () => void; task?: Promise<void>; failure?: string; activity?: "listening" | "speaking" | "interrupted" };
  let active: Attempt | undefined;

  function publish(next: VoiceSnapshot) {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  function cleanup(attempt: Attempt) {
    attempt.controller.abort();
    attempt.unsubscribe?.();
    attempt.unsubscribe = undefined;
    const connection = attempt.connection;
    attempt.connection = undefined;
    try { connection?.close(); } catch { /* SDK cleanup errors must not prevent UI teardown. */ }
  }

  function fail(attempt: Attempt, message: string) {
    if (active !== attempt) return;
    attempt.failure = message;
    active = undefined;
    cleanup(attempt);
    publish({ state: "error", error: message });
  }

  // Cancel waiting immediately, even when a mocked provider/SDK ignores cancellation.
  function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const aborted = () => reject(new Error("cancelled"));
      if (signal.aborted) { aborted(); return; }
      signal.addEventListener("abort", aborted, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    });
  }

  function start({ sessionId }: { sessionId: string }): Promise<void> {
    if (active) return active.task ?? Promise.resolve();
    const attempt: Attempt = { controller: new AbortController() };
    active = attempt;
    publish({ state: "connecting" });
    attempt.task = (async () => {
      const timer = setTimeout(() => fail(attempt, "Voice connection timed out. End the attempt and try again."), options.connectTimeoutMs ?? 30_000);
      try {
        if (!sessionId.trim()) throw new Error("Missing session");
        const credential = await wait((options.credentialProvider ?? fetchVoiceCredential)({ sessionId, signal: attempt.controller.signal }), attempt.controller.signal);
        if (active !== attempt) return;
        if (
          !credential || typeof credential.clientSecret !== "string" || !credential.clientSecret.trim() || /\s/.test(credential.clientSecret) || credential.clientSecret.length > 8192 ||
          typeof credential.expiresAt !== "string" || !Number.isFinite(Date.parse(credential.expiresAt)) || Date.parse(credential.expiresAt) <= Date.now()
        ) {
          fail(attempt, "A valid, unexpired short-lived credential is required. Generate a fresh credential and retry.");
          throw new Error("Invalid credential");
        }
        const creating = Promise.resolve(options.createConnection()).then((connection) => {
          if (active !== attempt) connection.close();
          return connection;
        });
        const connection = await wait(creating, attempt.controller.signal);
        if (active !== attempt) return;
        attempt.connection = connection;
        attempt.unsubscribe = connection.subscribe((event) => {
          if (active !== attempt) return;
          if (event.type === "error") fail(attempt, safeError(event.error));
          else if (event.type === "disconnected") fail(attempt, "Voice disconnected. Start again with a fresh credential.");
          else {
            attempt.activity = event.type;
            if (snapshot.state !== "connecting") publish({ state: event.type });
          }
        });
        await wait(connection.connect(credential.clientSecret), attempt.controller.signal);
        if (active === attempt) publish({ state: attempt.activity ?? "listening" });
      } catch (error) {
        if (active === attempt) fail(attempt, safeError(error));
        if (attempt.failure) throw new Error(attempt.failure);
        // An intentional stop cancels this attempt without turning the UI into an error.
      } finally {
        clearTimeout(timer);
      }
    })();
    return attempt.task;
  }

  return {
    start,
    async stop() {
      const attempt = active;
      active = undefined;
      if (attempt) {
        publish({ state: "stopping" });
        cleanup(attempt);
      }
      publish({ state: "idle" });
    },
    interrupt() {
      if (!active?.connection || snapshot.state === "connecting") return;
      const attempt = active;
      try {
        attempt.connection?.interrupt();
        if (active === attempt) publish({ state: "interrupted" });
      } catch (error) { fail(attempt, safeError(error)); }
    },
    getState: () => snapshot.state,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
