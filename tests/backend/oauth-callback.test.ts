import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), exchange: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEWTON_SITE_URL", "http://localhost:3000");
  mocks.create.mockResolvedValue({ supabase: { auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.user } }, headers: new Headers({ "Cache-Control": "private, no-store", Pragma: "no-cache" }) });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.user.mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("exchanges the code and retains refresh headers on a fixed redirect", async () => {
  const result = await GET(new Request("http://internal/auth/callback?code=one-use-code&next=https://evil.example"));
  expect(mocks.exchange).toHaveBeenCalledWith("one-use-code");
  expect(mocks.user).toHaveBeenCalledOnce();
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe("http://localhost:3000/auth/sign-in");
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(result.headers.get("pragma")).toBe("no-cache");
});
it.each(["", "?error=access_denied&error_description=private", "?code=", "?code=a&code=b"])("fails safely without exchange for %s", async (query) => {
  const result = await GET(new Request("http://localhost/auth/callback" + query));
  expect(result.headers.get("location")).toBe("http://localhost:3000/auth/sign-in?oauth=failed");
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it("handles expired codes without leaking provider details", async () => {
  mocks.exchange.mockResolvedValue({ error: { message: "private code" } });
  const response = await GET(new Request("http://localhost/auth/callback?code=expired"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/auth/sign-in?oauth=failed");
  expect(mocks.user).not.toHaveBeenCalled();
});
it("requires a verified identity after exchange", async () => {
  mocks.user.mockResolvedValue({ data: { user: null }, error: null });
  expect((await GET(new Request("http://localhost/auth/callback?code=x"))).headers.get("location")).toContain("oauth=failed");
});
it("fails closed when the configured redirect is missing or unsafe", async () => {
  for (const origin of ["", "http://evil.example", "https://user:pass@newton.example", "https://newton.example/path", "https://newton.example?x=1"]) {
    vi.stubEnv("NEWTON_SITE_URL", origin);
    expect((await GET(new Request("http://localhost/auth/callback?code=x"))).status).toBe(503);
  }
  expect(mocks.exchange).not.toHaveBeenCalled();
});
