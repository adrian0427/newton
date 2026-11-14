import "server-only";

/** Process-local per-user limit for explicit reads. A development aid, not deployment-wide abuse protection. */
export const TRANSCRIPTION_LIMIT = { attempts: 12, windowMs: 10 * 60 * 1000 } as const;
const attempts = new Map<string, number[]>();

export function resetTranscriptionLimits() { attempts.clear(); }

/** Records an attempt and returns null, or returns seconds to wait when the user is over the limit. */
export function takeTranscriptionAttempt(userId: string, now = Date.now()): number | null {
  for (const [key, times] of attempts) {
    const recent = times.filter((time) => now - time < TRANSCRIPTION_LIMIT.windowMs);
    if (recent.length) attempts.set(key, recent); else attempts.delete(key);
  }
  const recent = attempts.get(userId) ?? [];
  if (recent.length >= TRANSCRIPTION_LIMIT.attempts) return Math.max(1, Math.ceil((recent[0] + TRANSCRIPTION_LIMIT.windowMs - now) / 1000));
  attempts.set(userId, [...recent, now]);
  return null;
}
