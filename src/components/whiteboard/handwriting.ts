import type { WorkSnapshot } from "@/types/tutoring";
import { normalizeExpression } from "./expressions";

export const MAX_TRANSCRIPTION_LENGTH = 200;
export type Transcription =
  | { revisionId: string; status: "transcribed" | "ambiguous"; text: string }
  | { revisionId: string; status: "unreadable" };

export class TranscriptionError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "TranscriptionError"; }
}

const fallback = "Newton couldn't read your handwriting right now. Try again, or use Structured input.";

/** Sends one explicitly requested whiteboard PNG. The server validates and bounds the transcription. */
export async function requestTranscription(snapshot: WorkSnapshot, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Transcription> {
  if (snapshot.image?.kind !== "data-url") throw new TranscriptionError("Draw your work on the whiteboard before reading it.", "invalid-image");
  let response: Response;
  try {
    response = await fetchImpl("/api/work/transcribe", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin", signal,
      body: JSON.stringify({ revisionId: snapshot.revisionId, image: snapshot.image.value }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new TranscriptionError("Newton couldn't reach the handwriting service. Check your connection and try again.", "network");
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* Handled below. */ }
  if (!response.ok) {
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof error?.code === "string" ? error.code : "unavailable";
    if (response.status === 401) throw new TranscriptionError("Sign in to use handwriting recognition. Structured input works without signing in.", "unauthenticated");
    const message = typeof error?.message === "string" && error.message.length <= 300 ? error.message : fallback;
    throw new TranscriptionError(message, code);
  }
  const transcription = (payload as { transcription?: Record<string, unknown> } | null)?.transcription;
  if (!transcription || transcription.revisionId !== snapshot.revisionId) throw new TranscriptionError(fallback, "invalid-response");
  if (transcription.status === "unreadable") return { revisionId: snapshot.revisionId, status: "unreadable" };
  const { status, text } = transcription;
  if ((status !== "transcribed" && status !== "ambiguous") || typeof text !== "string" || !text.trim() || text.length > MAX_TRANSCRIPTION_LENGTH
    || /[^0-9A-Za-z .+\-*/^()=?]/.test(text) || (status === "ambiguous") !== text.includes("?")) {
    throw new TranscriptionError(fallback, "invalid-response");
  }
  return { revisionId: snapshot.revisionId, status, text };
}

/** Returns the normalized expression for a reviewed draft, or a student-facing problem with it. */
export function reviewDraft(draft: string): { expression: string; error: string } {
  if (!draft.trim()) return { expression: "", error: "Type what you wrote, or read the whiteboard again." };
  if (draft.includes("?")) return { expression: "", error: "Replace each ? with the symbol you wrote." };
  if (draft.length > MAX_TRANSCRIPTION_LENGTH) return { expression: "", error: "Use 200 characters or fewer." };
  try { return { expression: normalizeExpression(draft), error: "" }; }
  catch (error) { return { expression: "", error: error instanceof Error ? error.message : "Check the symbols in your transcription." }; }
}
