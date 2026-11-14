import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupabaseConfigurationError } from "@/lib/supabase/config";
import { bytes, streamedRequest } from "./helpers/requests";

const mocks = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
import { GET, POST, DELETE } from "@/app/auth/session/route";

function request(method: string, body?: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/auth/session", {
    method, headers: { origin, host: "localhost:3000", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEWTON_SITE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  mocks.create.mockResolvedValue({
    supabase: { auth: { getUser: mocks.getUser, signInWithOAuth: mocks.signIn, signOut: mocks.signOut } },
    headers: new Headers({ "Cache-Control": "private, no-store" }),
  });
});

afterEach(() => vi.unstubAllEnvs());

it("rejects cross-origin login and logout before accessing auth", async () => {
  expect((await POST(request("POST", {}, "https://other.example"))).status).toBe(403);
  expect((await DELETE(request("DELETE", undefined, "https://other.example"))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("accepts the public request host when Next.js normalizes its URL to localhost", async () => {
  const headers = { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "content-type": "application/json" };
  const result = await POST(new Request("http://localhost:3000/auth/session", {
    method: "POST", headers, body: "{}",
  }));
  // Invalid input is rejected after passing the origin gate, without calling Supabase.
  expect(result.status).toBe(400);
  mocks.signOut.mockResolvedValue({ error: null });
  expect((await DELETE(new Request("http://localhost:3000/auth/session", { method: "DELETE", headers }))).status).toBe(200);
});

it.each([undefined, "null", "not-a-url", "http://other.example", "http://localhost:3001", "https://localhost:3000"])(
  "rejects missing, malformed, or mismatched origin %s", async (origin) => {
    const headers: Record<string, string> = { host: "localhost:3000", "x-forwarded-host": "other.example" };
    if (origin !== undefined) headers.origin = origin;
    const result = await DELETE(new Request("http://localhost:3000/auth/session", { method: "DELETE", headers }));
    expect(result.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  },
);

it.each([null, {}, { email: 1, password: "x" }, { email: "bad", password: "x" }, { email: "test@example.com", password: "" }, { email: "test@example.com", password: "valid-test-password" }])(
  "rejects password or other posted payload %j", async (body) => {
    expect((await POST(request("POST", body))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  },
);

it("starts only Google OAuth with a fixed PKCE callback and no tokens", async () => {
  const url = "https://example.supabase.co/auth/v1/authorize?provider=google";
  mocks.signIn.mockResolvedValue({ data: { url }, error: null });
  const result = await POST(request("POST"));
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toContain("no-store");
  expect(await result.json()).toEqual({ url });
  expect(mocks.signIn).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "http://localhost:3000/auth/callback", skipBrowserRedirect: true } });
});

it.each(["https://evil.example/", "https://example.supabase.co/auth/v1/authorize?provider=github", null])("rejects an unexpected provider URL %s", async (url) => {
  mocks.signIn.mockResolvedValue({ data: { url }, error: null });
  const result = await POST(request("POST"));
  expect(result.status).toBe(502);
});

it("sanitizes OAuth failures", async () => {
  mocks.signIn.mockResolvedValue({ data: { url: null }, error: { message: "private provider details" } });
  const result = await POST(request("POST"));
  expect(result.status).toBe(502);
  expect(await result.text()).not.toContain("private provider details");
});

it("requires configured site origin and rejects mismatched request origin", async () => {
  vi.stubEnv("NEWTON_SITE_URL", "https://newton.example");
  expect((await POST(request("POST"))).status).toBe(403);
  expect(mocks.signIn).not.toHaveBeenCalled();
  vi.stubEnv("NEWTON_SITE_URL", "");
  expect((await POST(request("POST"))).status).toBe(503);
});

it("distinguishes missing identity from unavailable auth", async () => {
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  expect((await GET()).status).toBe(401);
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 503 } });
  expect((await GET()).status).toBe(502);
});

it.each(["refresh_token_not_found", "refresh_token_already_used", "session_expired"])(
  "returns a non-retryable 401 for terminal refresh failure %s", async (code) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 400, code } });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthenticated", message: "Please sign in.", retryable: false } });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  },
);

it("does not classify unexpected Auth 400 responses as missing sessions", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 400, code: "validation_failed" } });
  expect((await GET()).status).toBe(502);
});

it("uses server verification for identity", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "internal-id", email: "test@example.com" } }, error: null });
  const result = await GET();
  expect(await result.json()).toEqual({ user: { email: "test@example.com" } });
  expect(mocks.getUser).toHaveBeenCalledOnce();
});

it("does not claim successful logout if it fails", async () => {
  mocks.signOut.mockResolvedValueOnce({ error: { status: 503 } });
  expect((await DELETE(request("DELETE"))).status).toBe(502);
  mocks.signOut.mockResolvedValueOnce({ error: null });
  const result = await DELETE(request("DELETE"));
  expect(await result.json()).toEqual({ signedOut: true });
  expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: "local" });
});

it("handles missing configuration and network failure", async () => {
  mocks.create.mockRejectedValueOnce(new SupabaseConfigurationError());
  expect((await GET()).status).toBe(503);
  mocks.create.mockRejectedValueOnce(new Error("private network details"));
  const result = await GET();
  expect(result.status).toBe(502);
  expect(await result.text()).not.toContain("private network details");
});

it("rejects streamed sign-in overflow early without reaching Auth", async () => {
  const stream = streamedRequest("/auth/session", [bytes(" ".repeat(8192)), bytes(" "), bytes("unread")]);
  const result = await POST(stream.request);
  expect(result.status).toBe(413);
  expect(stream.delivered()).toBe(2);
  expect(stream.cancel).toHaveBeenCalledOnce();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(result.headers.get("Cache-Control")).toContain("no-store");
});
