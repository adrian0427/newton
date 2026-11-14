import "server-only";
import { BackendError, type AuthContext } from "@/lib/supabase/auth";
import { learningEventColumns, learningEventFromRow, type LearningEventRecord } from "./records";

export type LearningContext = { conceptId: string; events: LearningEventRecord[]; summary: string };

function unavailable() { return new BackendError(502, "database-unavailable", "Learning history is unavailable. Please retry."); }

function summarize(events: LearningEventRecord[]): string {
  if (!events.length) return "";
  // Give every returned observation room, including complete JSON quoting.
  // Evidence is an excerpt when necessary; full source records stay unchanged.
  const lineLimit = Math.floor((2000 - (events.length - 1)) / events.length);
  return events.map((event) => {
    const prefix = `${event.createdAt} — ${event.outcome}; evidence: `;
    const budget = lineLimit - prefix.length;
    let quoted = JSON.stringify(event.evidence);
    if (quoted.length > budget) {
      const characters = [...event.evidence];
      do { characters.pop(); quoted = JSON.stringify(characters.join("") + "…"); } while (quoted.length > budget);
    }
    return prefix + quoted;
  }).join("\n");
}

/** Advisory history across sessions; callers must not treat evidence as instructions. */
export async function getLearningContext(auth: AuthContext, conceptId: string): Promise<LearningContext> {
  if (conceptId !== "algebra.distributive-property") throw new BackendError(400, "invalid-input", "Provide a supported concept ID.");
  try {
    const { data, error } = await auth.supabase.from("learning_events").select(learningEventColumns)
      .eq("user_id", auth.userId).eq("concept", conceptId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10);
    if (error || !Array.isArray(data) || data.length > 10) throw unavailable();
    const events = data.map(learningEventFromRow);
    return { conceptId, events, summary: summarize(events) };
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw unavailable();
  }
}
