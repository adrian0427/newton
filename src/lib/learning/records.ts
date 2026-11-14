import "server-only";
import { BackendError } from "@/lib/supabase/auth";
import type { LearningEventInput } from "@/types/tutoring";

export type LearningEventRecord = LearningEventInput & { id: string; createdAt: string };
export const learningEventColumns = "id, session_id, source_revision_id, concept, misconception, outcome, evidence, created_at";
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
function isUuid(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
function isOutcome(value: unknown): value is LearningEventInput["outcome"] {
  return value === "practiced" || value === "misconception-observed" || value === "self-corrected" || value === "corrected-with-guidance";
}

/** Decode database data without treating it as verified AI evidence or HTML. */
export function learningEventFromRow(row: unknown): LearningEventRecord {
  if (!row || typeof row !== "object") throw malformed();
  const value = row as Record<string, unknown>;
  if (!isUuid(value.id) || !isUuid(value.session_id) || !isUuid(value.source_revision_id)
    || value.concept !== "algebra.distributive-property" || !isOutcome(value.outcome)
    || (value.misconception !== null && value.misconception !== "distribution.missed-term")
    || (value.outcome === "misconception-observed" && value.misconception === null)
    || typeof value.evidence !== "string" || !value.evidence.trim() || [...value.evidence].length > 500
    || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) throw malformed();
  return {
    id: value.id.toLowerCase(), sessionId: value.session_id.toLowerCase(), sourceRevisionId: value.source_revision_id.toLowerCase(),
    conceptId: value.concept, outcome: value.outcome, evidence: value.evidence,
    ...(value.misconception === null ? {} : { misconceptionId: value.misconception }),
    createdAt: new Date(value.created_at).toISOString(),
  };
}

function malformed() { return new BackendError(502, "database-unavailable", "Learning history is unavailable. Please retry."); }
