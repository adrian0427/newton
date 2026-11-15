export type VisionErrorCode = "not-configured" | "rate-limited" | "timeout" | "cancelled" | "upstream-unavailable" | "invalid-response";
/** Fixed format categories only; never provider messages, work or response bodies. */
export type VisionFailureReason = "provider-json" | "provider-shape" | "provider-truncated" | "provider-size" |
  "model-json" | "model-shape" | "model-size" | "model-math-format";

/** Student-safe messages only. Provider response bodies are never copied into these errors. */
export class VisionError extends Error {
  constructor(readonly code: VisionErrorCode, message: string, readonly retryAfterSeconds?: number, readonly reason?: VisionFailureReason) {
    super(message);
    this.name = "VisionError";
  }
}
