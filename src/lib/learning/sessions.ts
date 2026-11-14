import "server-only";

import { randomUUID } from "node:crypto";
import { BackendError, type AuthContext } from "@/lib/supabase/auth";

// Local export until the team coordinates this additive shared contract.
export type StudySession = { id: string; startedAt: string; endedAt: string | null };
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const columns = "id, started_at, ended_at";

function unavailable() {
  return new BackendError(502, "database-unavailable", "Study sessions are unavailable. Please retry.");
}

function sessionFromRow(row: unknown): StudySession {
  if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string" || !uuid.test(row.id)
    || !("started_at" in row) || typeof row.started_at !== "string" || !Number.isFinite(Date.parse(row.started_at))
    || !("ended_at" in row) || (row.ended_at !== null && (typeof row.ended_at !== "string" || !Number.isFinite(Date.parse(row.ended_at))))) {
    throw unavailable();
  }
  return {
    id: row.id,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at === null ? null : new Date(row.ended_at).toISOString(),
  };
}

/** Use the verified request client so database defaults and RLS use its owner. */
export async function createStudySession(auth: AuthContext): Promise<StudySession> {
  try {
    const { data, error } = await auth.supabase.from("study_sessions")
      .insert({ id: randomUUID() }).select(columns).single();
    if (error) throw unavailable();
    return sessionFromRow(data);
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw unavailable();
  }
}

export async function requireOwnedSession(auth: AuthContext, sessionId: string): Promise<StudySession> {
  if (typeof sessionId !== "string" || !uuid.test(sessionId)) {
    throw new BackendError(400, "invalid-input", "Provide a valid study session ID.");
  }
  try {
    const { data, error } = await auth.supabase.from("study_sessions").select(columns)
      .eq("id", sessionId).eq("user_id", auth.userId).maybeSingle();
    if (error) throw unavailable();
    if (!data) throw new BackendError(404, "session-not-found", "Study session not found.");
    return sessionFromRow(data);
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw unavailable();
  }
}
