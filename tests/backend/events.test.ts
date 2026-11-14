import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningEventInput } from "@/types/tutoring";
import type { AuthContext } from "@/lib/supabase/auth";

const mocks = vi.hoisted(() => ({
  owned: vi.fn(), from: vi.fn(), insert: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/learning/sessions", () => ({ requireOwnedSession: mocks.owned }));
import { BackendError } from "@/lib/supabase/auth";
import { recordLearningEvent } from "@/lib/learning/events";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "10abcdef-0000-4000-8000-000000000001";
const revisionId = "20abcdef-0000-4000-8000-000000000001";
const input: LearningEventInput = {
  sessionId, sourceRevisionId: revisionId, conceptId: "algebra.distributive-property",
  outcome: "practiced", evidence: "Expanded both terms.",
};
const row = {
  id: "30abcdef-0000-4000-8000-000000000001", session_id: sessionId, source_revision_id: revisionId,
  concept: input.conceptId, misconception: null, outcome: input.outcome, evidence: input.evidence,
  created_at: "2026-11-14T06:00:00+00:00",
};
const chain = { insert: mocks.insert, select: mocks.select, eq: mocks.eq, single: mocks.single, maybeSingle: mocks.maybeSingle };
const auth: AuthContext = { userId, supabase: { from: mocks.from } as unknown as AuthContext["supabase"], headers: new Headers() };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.owned.mockResolvedValue({ id: sessionId, startedAt: "2026-11-14T05:00:00Z", endedAt: null });
  for (const mock of [mocks.from, mocks.insert, mocks.select, mocks.eq]) mock.mockReturnValue(chain);
  mocks.single.mockResolvedValue({ data: row, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
});

describe("learning event writer", () => {
  it("inserts validated evidence after checking ownership, leaving ID/owner/time to the database", async () => {
    expect(await recordLearningEvent(auth, { ...input, evidence: "  Expanded both terms.\n" })).toEqual({
      ...input, id: row.id, createdAt: "2026-11-14T06:00:00.000Z",
    });
    expect(mocks.owned).toHaveBeenCalledWith(auth, sessionId);
    expect(mocks.owned.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
    expect(mocks.from).toHaveBeenCalledWith("learning_events");
    expect(mocks.insert).toHaveBeenCalledWith({
      session_id: sessionId, source_revision_id: revisionId, concept: input.conceptId,
      misconception: null, outcome: "practiced", evidence: input.evidence,
    });
    expect(mocks.maybeSingle).not.toHaveBeenCalled(); // Insert first, not a racy precheck.
  });

  it("accepts the supported misconception with factual evidence", async () => {
    const observed = { ...input, outcome: "misconception-observed" as const, misconceptionId: "distribution.missed-term" };
    mocks.single.mockResolvedValue({ data: { ...row, outcome: observed.outcome, misconception: observed.misconceptionId }, error: null });
    expect(await recordLearningEvent(auth, observed)).toMatchObject(observed);
  });

  it("canonicalizes UUID case so equivalent retries use one identity", async () => {
    await recordLearningEvent(auth, { ...input, sessionId: sessionId.toUpperCase(), sourceRevisionId: revisionId.toUpperCase() });
    expect(mocks.owned).toHaveBeenCalledWith(auth, sessionId);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ session_id: sessionId, source_revision_id: revisionId });
  });

  it.each([1, 500])("accepts %s Unicode characters, including astral characters", async (length) => {
    const evidence = "🧮".repeat(length);
    mocks.single.mockResolvedValue({ data: { ...row, evidence }, error: null });
    expect((await recordLearningEvent(auth, { ...input, evidence })).evidence).toBe(evidence);
  });

  it.each([
    null, [], "event", {},
    { ...input, sessionId: "not-a-uuid" }, { ...input, sourceRevisionId: "not-a-uuid" },
    { ...input, conceptId: "unsupported" }, { ...input, outcome: "unknown" },
    { ...input, evidence: " \n\t" }, { ...input, evidence: "x".repeat(501) }, { ...input, evidence: "🧮".repeat(501) },
    { ...input, evidence: null }, { ...input, evidence: 1 },
    { ...input, misconceptionId: null }, { ...input, misconceptionId: "unsupported" },
    { ...input, outcome: "misconception-observed" },
    { ...input, outcome: "self-corrected" }, { ...input, outcome: "corrected-with-guidance" },
    { ...input, userId }, { ...input, user_id: userId }, { ...input, id: row.id },
    { ...input, createdAt: row.created_at }, { ...input, image: "data:image/png;..." },
  ])("rejects invalid/unsupported input before querying (%#)", async (invalid) => {
    await expect(recordLearningEvent(auth, invalid as LearningEventInput)).rejects.toMatchObject({ status: 400, code: "invalid-input" });
    expect(mocks.owned).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("propagates the same missing/foreign-session 404 without inserting", async () => {
    mocks.owned.mockRejectedValue(new BackendError(404, "session-not-found", "Study session not found."));
    await expect(recordLearningEvent(auth, input)).rejects.toMatchObject({ status: 404, code: "session-not-found" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns the original ID/time after a unique conflict and scopes its lookup by the full identity", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23505", message: "private duplicate details" } });
    const saved = await recordLearningEvent(auth, input);
    expect(saved).toEqual({ ...input, id: row.id, createdAt: "2026-11-14T06:00:00.000Z" });
    expect(mocks.eq.mock.calls).toEqual([
      ["user_id", userId], ["session_id", sessionId], ["source_revision_id", revisionId],
      ["concept", input.conceptId], ["outcome", input.outcome],
    ]);
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it.each([{ evidence: "Changed evidence." }, { misconception: "distribution.missed-term" }])(
    "rejects changed immutable payload on conflict (%j)", async (changed) => {
      mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
      mocks.maybeSingle.mockResolvedValue({ data: { ...row, ...changed }, error: null });
      await expect(recordLearningEvent(auth, input)).rejects.toMatchObject({ status: 409, code: "event-conflict" });
    },
  );

  it.each([
    { data: null, error: null }, { data: {}, error: null },
    { data: { ...row, created_at: "invalid" }, error: null },
    { data: null, error: { code: "42P01", message: "private schema details" } },
  ])("does not claim a successful insert for malformed results or failures (%#)", async (result) => {
    mocks.single.mockResolvedValue(result);
    await expect(recordLearningEvent(auth, input)).rejects.toMatchObject({ status: 502, code: "database-unavailable" });
  });

  it.each([{ data: null, error: null }, { data: null, error: { code: "42501" } }])(
    "returns a bounded failure if the conflicting identity cannot be read (%#)", async (result) => {
      mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
      mocks.maybeSingle.mockResolvedValue(result);
      await expect(recordLearningEvent(auth, input)).rejects.toMatchObject({ status: 502, code: "database-unavailable" });
    },
  );

  it("sanitizes thrown network errors without exposing evidence or provider details", async () => {
    mocks.single.mockRejectedValue(new Error("private connection details"));
    await expect(recordLearningEvent(auth, input)).rejects.toMatchObject({
      status: 502, code: "database-unavailable", message: "Learning history could not be saved. Please retry.",
    });
  });
});
