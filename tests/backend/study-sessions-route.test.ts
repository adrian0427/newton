import { beforeEach, expect, it, vi } from "vitest";
import { bytes, streamedRequest } from "./helpers/requests";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createSession: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", async (original) => ({ ...await original<object>(), requireUser: mocks.requireUser }));
vi.mock("@/lib/learning/sessions", () => ({ createStudySession: mocks.createSession }));
import { BackendError } from "@/lib/supabase/auth";
import { POST } from "@/app/api/study-sessions/route";

const session = { id: "10000000-0000-4000-8000-000000000001", startedAt: "2026-11-14T06:00:00.000Z", endedAt: null };
function request(body?: string, overrides: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/study-sessions", {
    method: "POST", body, headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...overrides },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "verified-owner", headers: new Headers({ "Cache-Control": "private, no-store", Pragma: "no-cache" }) });
  mocks.createSession.mockResolvedValue(session);
});

it.each([undefined, "{}"])("creates a session from verified identity with empty input (%s)", async (body) => {
  const response = await POST(request(body));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ session });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(mocks.createSession).toHaveBeenCalledWith(await mocks.requireUser.mock.results[0].value);
});

it.each(["https://other.example", "null", "http://localhost:3001", "https://localhost:3000", "http://localhost:3000/"])(
  "rejects cross-origin or malformed origins (%s) before auth/database", async (origin) => {
    expect((await POST(request("{}", { origin, "x-forwarded-host": "other.example" }))).status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  },
);

it("rejects missing Origin and accepts the actual Host despite Next's localhost normalization", async () => {
  const missing = request(); missing.headers.delete("origin");
  expect((await POST(missing)).status).toBe(403);
  expect((await POST(request(undefined, { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).status).toBe(201);
});

it.each(["{", "null", "[]", "1", '{"user_id":"forged"}', '{"userId":"forged"}', '{"id":"forged"}', '{"startedAt":"forged"}'])(
  "rejects invalid bodies and client-owned fields (%s)", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.createSession).not.toHaveBeenCalled();
  },
);

it("rejects oversized and non-JSON bodies without a database write", async () => {
  expect((await POST(request(" ".repeat(1025)))).status).toBe(413);
  expect((await POST(request("{}", { "content-type": "text/plain" }))).status).toBe(400);
  expect(mocks.createSession).not.toHaveBeenCalled();
});

it.each([
  [401, "unauthenticated"], [503, "not-configured"], [502, "auth-unavailable"],
])("returns bounded auth errors (%s)", async (status, code) => {
  mocks.requireUser.mockRejectedValue(new BackendError(status, code, "Safe error."));
  const response = await POST(request("{}"));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: "Safe error.", retryable: status >= 500 } });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.createSession).not.toHaveBeenCalled();
});

it("retains refresh headers on auth and database failures without leaking raw details", async () => {
  mocks.requireUser.mockRejectedValueOnce(new BackendError(401, "unauthenticated", "Please sign in.", new Headers({ Pragma: "no-cache" })));
  expect((await POST(request())).headers.get("Pragma")).toBe("no-cache");
  mocks.createSession.mockRejectedValueOnce(new Error("private upstream details"));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(await response.text()).not.toContain("private upstream details");
});

it("stops a streamed session body early and preserves refresh headers on 413", async () => {
  const stream = streamedRequest("/api/study-sessions", [bytes(" ".repeat(1024)), bytes(" "), bytes("unread")]);
  const response = await POST(stream.request);
  expect(response.status).toBe(413);
  expect(response.headers.get("Pragma")).toBe("no-cache");
  expect(stream.delivered()).toBe(2);
  expect(stream.cancel).toHaveBeenCalledOnce();
  expect(mocks.createSession).not.toHaveBeenCalled();
});

it("does not read bodies on cross-origin or unauthenticated session requests", async () => {
  const cross = streamedRequest("/api/study-sessions", [bytes("unread")], { origin: "https://other.example" });
  expect((await POST(cross.request)).status).toBe(403);
  expect(cross.delivered()).toBe(0);
  mocks.requireUser.mockRejectedValueOnce(new BackendError(401, "unauthenticated", "Please sign in."));
  const anonymous = streamedRequest("/api/study-sessions", [bytes("unread")]);
  expect((await POST(anonymous.request)).status).toBe(401);
  expect(anonymous.delivered()).toBe(0);
});
