import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseConfigurationError } from "@/lib/supabase/config";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), getUser: vi.fn(), from: vi.fn(), select: vi.fn(), insert: vi.fn(), eq: vi.fn(),
  single: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
import { requireUser } from "@/lib/supabase/auth";
import { createStudySession, requireOwnedSession } from "@/lib/learning/sessions";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000001";
const row = { id: sessionId, started_at: "2026-11-14T06:00:00+00:00", ended_at: null };
const chain = { select: mocks.select, insert: mocks.insert, eq: mocks.eq, single: mocks.single, maybeSingle: mocks.maybeSingle };
const client = { auth: { getUser: mocks.getUser }, from: mocks.from };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockImplementation(async () => ({ supabase: client, headers: new Headers({ "Cache-Control": "private, no-store", Pragma: "no-cache" }) }));
  mocks.getUser.mockResolvedValue({ data: { user: { id: userA } }, error: null });
  for (const mock of [mocks.from, mocks.select, mocks.insert, mocks.eq]) mock.mockReturnValue(chain);
  mocks.single.mockResolvedValue({ data: row, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
});

describe("verified request identity", () => {
  it("verifies with Auth on every request and isolates response headers", async () => {
    const a = await requireUser();
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: userB } }, error: null });
    const b = await requireUser();
    expect(a.userId).toBe(userA);
    expect(b.userId).toBe(userB);
    expect(a.headers).not.toBe(b.headers);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it.each([null, { name: "AuthSessionMissingError" }, { status: 401 }, { status: 403 }])(
    "rejects missing or invalid identity (%j)", async (error) => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error });
      await expect(requireUser()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("does not treat an unverified user alongside an error as signed in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userA } }, error: { status: 503, message: "private details" } });
    await expect(requireUser()).rejects.toMatchObject({ status: 502, code: "auth-unavailable", headers: expect.any(Headers) });
  });

  it.each(["refresh_token_not_found", "refresh_token_already_used", "session_expired"])(
    "treats terminal refresh failure %s as signed out and retains refresh headers", async (code) => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 400, code } });
      try {
        await requireUser();
        expect.fail("Expected expired identity to be rejected");
      } catch (error) {
        expect(error).toMatchObject({ status: 401, code: "unauthenticated" });
        expect((error as { headers: Headers }).headers.get("Pragma")).toBe("no-cache");
      }
    },
  );

  it("keeps unexpected Auth 400 responses distinct from terminal sessions", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 400, code: "validation_failed" } });
    await expect(requireUser()).rejects.toMatchObject({ status: 502, code: "auth-unavailable" });
  });

  it("distinguishes missing config and network errors without leaking details", async () => {
    mocks.create.mockRejectedValueOnce(new SupabaseConfigurationError());
    await expect(requireUser()).rejects.toMatchObject({ status: 503, code: "not-configured" });
    mocks.getUser.mockRejectedValueOnce(new Error("private network details"));
    await expect(requireUser()).rejects.toMatchObject({ status: 502, message: "Unable to verify your sign-in. Please retry.", headers: expect.any(Headers) });
  });
});

describe("study session helpers", () => {
  it("generates a UUID but leaves ownership and timestamps to authenticated database defaults", async () => {
    const result = await createStudySession(await requireUser());
    expect(mocks.from).toHaveBeenCalledWith("study_sessions");
    expect(mocks.insert).toHaveBeenCalledWith({ id: expect.stringMatching(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i) });
    expect(result).toEqual({ id: sessionId, startedAt: "2026-11-14T06:00:00.000Z", endedAt: null });
  });

  it("checks both the session ID and verified owner using the request client", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...row, ended_at: "2026-11-14T06:05:00Z" }, error: null });
    expect(await requireOwnedSession(await requireUser(), sessionId)).toEqual({
      id: sessionId, startedAt: "2026-11-14T06:00:00.000Z", endedAt: "2026-11-14T06:05:00.000Z",
    });
    expect(mocks.eq.mock.calls).toEqual([["id", sessionId], ["user_id", userA]]);
  });

  it("uses the next account's identity rather than caching ownership", async () => {
    await requireOwnedSession(await requireUser(), sessionId);
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: userB } }, error: null });
    await requireOwnedSession(await requireUser(), sessionId);
    expect(mocks.eq).toHaveBeenLastCalledWith("user_id", userB);
  });

  it.each(["", "not-a-uuid", "10000000-0000-4000-8000-000000000001' or true"]) (
    "rejects malformed session identifiers before querying (%s)", async (id) => {
      await expect(requireOwnedSession(await requireUser(), id)).rejects.toMatchObject({ status: 400, code: "invalid-input" });
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("returns the same 404 for missing and RLS-hidden foreign sessions", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(requireOwnedSession(await requireUser(), sessionId)).rejects.toMatchObject({ status: 404, code: "session-not-found" });
  });

  it("sanitizes database errors from reads and inserts", async () => {
    const error = { code: "42P01", message: "private database details" };
    mocks.maybeSingle.mockResolvedValue({ data: null, error });
    mocks.single.mockResolvedValue({ data: null, error });
    const auth = await requireUser();
    await expect(requireOwnedSession(auth, sessionId)).rejects.toMatchObject({ status: 502, code: "database-unavailable" });
    await expect(createStudySession(auth)).rejects.toMatchObject({ status: 502, code: "database-unavailable" });
  });

  it("does not report success for empty, malformed, or rejected database results", async () => {
    const auth = await requireUser();
    for (const data of [null, {}, { ...row, started_at: "invalid" }]) {
      mocks.single.mockResolvedValueOnce({ data, error: null });
      await expect(createStudySession(auth)).rejects.toMatchObject({ status: 502 });
    }
    mocks.single.mockRejectedValueOnce(new Error("private connection details"));
    await expect(createStudySession(auth)).rejects.toMatchObject({ status: 502, code: "database-unavailable" });
  });
});
