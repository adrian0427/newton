import { beforeEach, expect, it, vi } from "vitest";
import { SupabaseConfigurationError } from "@/lib/supabase/config";

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
  mocks.create.mockResolvedValue({
    supabase: { auth: { getUser: mocks.getUser, signInWithPassword: mocks.signIn, signOut: mocks.signOut } },
    headers: new Headers({ "Cache-Control": "private, no-store" }),
  });
});

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

it.each([null, {}, { email: 1, password: "x" }, { email: "bad", password: "x" }, { email: "test@example.com", password: "" }])(
  "rejects invalid credentials input %j", async (body) => {
    expect((await POST(request("POST", body))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  },
);

it("signs in without returning tokens and preserves the password exactly", async () => {
  mocks.signIn.mockResolvedValue({ data: { user: { email: "test@example.com" }, session: { access_token: "secret" } }, error: null });
  const result = await POST(request("POST", { email: " test@example.com ", password: " spaced password " }));
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toContain("no-store");
  expect(await result.json()).toEqual({ user: { email: "test@example.com" } });
  expect(mocks.signIn).toHaveBeenCalledWith({ email: "test@example.com", password: " spaced password " });
});

it("sanitizes provider credential failures", async () => {
  mocks.signIn.mockResolvedValue({ data: { user: null }, error: { status: 400, message: "private provider details" } });
  const result = await POST(request("POST", { email: "test@example.com", password: "wrong" }));
  expect(result.status).toBe(401);
  expect(await result.text()).not.toContain("private provider details");
});

it("distinguishes missing identity from unavailable auth", async () => {
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { name: "AuthSessionMissingError" } });
  expect((await GET()).status).toBe(401);
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 503 } });
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
