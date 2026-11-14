export type VisionErrorCode = "not-configured" | "rate-limited" | "timeout" | "cancelled" | "upstream-unavailable" | "invalid-response";

/** Student-safe messages only. Provider response bodies are never copied into these errors. */
export class VisionError extends Error {
  constructor(readonly code: VisionErrorCode, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "VisionError";
  }
}
