import "server-only";

import { BackendError, type AuthContext } from "@/lib/supabase/auth";
import type { LearningEventInput } from "@/types/tutoring";
import { requireOwnedSession } from "./sessions";

export type LearningEventRecord = LearningEventInput & { id: string; createdAt: string };

const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const fields = new Set(["sessionId", "sourceRevisionId", "conceptId", "misconceptionId", "outcome", "evidence"]);
const columns = "id, session_id, source_revision_id, concept, misconception, outcome, evidence, created_at";

function invalid() {
  return new BackendError(400, "invalid-input", "Provide a supported learning observation with valid IDs and evidence of 1–500 characters.");
}

function unavailable() {
  return new BackendError(502, "database-unavailable", "Learning history could not be saved. Please retry.");
}

function validateInput(input: unknown): LearningEventInput {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !fields.has(key))) throw invalid();
  const value = input as Record<string, unknown>;
  if (typeof value.sessionId !== "string" || !uuid.test(value.sessionId)
    || typeof value.sourceRevisionId !== "string" || !uuid.test(value.sourceRevisionId)
    || value.conceptId !== "algebra.distributive-property"
    || (value.outcome !== "practiced" && value.outcome !== "misconception-observed")
    || typeof value.evidence !== "string"
    || (value.misconceptionId !== undefined && value.misconceptionId !== "distribution.missed-term")
    || (value.outcome === "misconception-observed" && value.misconceptionId === undefined)) throw invalid();
  const evidence = value.evidence.trim();
  if (!evidence || [...evidence].length > 500) throw invalid();
  return {
    sessionId: value.sessionId.toLowerCase(), sourceRevisionId: value.sourceRevisionId.toLowerCase(),
    conceptId: value.conceptId, outcome: value.outcome, evidence,
    ...(value.misconceptionId === undefined ? {} : { misconceptionId: value.misconceptionId }),
  };
}

function eventFromRow(row: unknown): LearningEventRecord {
  if (!row || typeof row !== "object") throw unavailable();
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string" || !uuid.test(value.id)
    || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) throw unavailable();
  let input: LearningEventInput;
  try {
    input = validateInput({
      sessionId: value.session_id, sourceRevisionId: value.source_revision_id, conceptId: value.concept,
      misconceptionId: value.misconception === null ? undefined : value.misconception,
      outcome: value.outcome, evidence: value.evidence,
    });
  } catch {
    throw unavailable();
  }
  // Preserve stored evidence exactly when comparing a retry; never rewrite it.
  return { ...input, evidence: value.evidence as string, id: value.id, createdAt: new Date(value.created_at).toISOString() };
}

/** A supplies eligible server observations. Shape checks do not prove AI provenance. */
export async function recordLearningEvent(auth: AuthContext, input: LearningEventInput): Promise<LearningEventRecord> {
  const event = validateInput(input);
  try {
    await requireOwnedSession(auth, event.sessionId);
    const { data, error } = await auth.supabase.from("learning_events").insert({
      session_id: event.sessionId, source_revision_id: event.sourceRevisionId, concept: event.conceptId,
      misconception: event.misconceptionId ?? null, outcome: event.outcome, evidence: event.evidence,
    }).select(columns).single();
    if (!error) return eventFromRow(data);
    if (error.code !== "23505") throw unavailable();

    // Uniqueness decides the winner atomically. A conflicting retry reads it
    // under the same authenticated context; an upsert must not overwrite it.
    const prior = await auth.supabase.from("learning_events").select(columns)
      .eq("user_id", auth.userId).eq("session_id", event.sessionId).eq("source_revision_id", event.sourceRevisionId)
      .eq("concept", event.conceptId).eq("outcome", event.outcome).maybeSingle();
    if (prior.error || !prior.data) throw unavailable();
    const saved = eventFromRow(prior.data);
    if (saved.evidence !== event.evidence || saved.misconceptionId !== event.misconceptionId) {
      throw new BackendError(409, "event-conflict", "This observation was already saved with different evidence. Existing history was preserved.");
    }
    return saved;
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw unavailable();
  }
}
