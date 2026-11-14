import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { CookieMethodsServer } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({
  browser: vi.fn(),
  server: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: mocks.browser, createServerClient: mocks.server }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { getSupabaseConfig, SupabaseConfigurationError } from "@/lib/supabase/config";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { createClient as createServerClient } from "@/lib/supabase/server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("Supabase configuration", () => {
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "rejects missing or blank %s before constructing a client",
    async (name) => {
      for (const value of [undefined, "", "   "]) {
        vi.stubEnv(name, value);
        expect(getSupabaseConfig).toThrow(SupabaseConfigurationError);
        expect(createBrowserClient).toThrow(SupabaseConfigurationError);
        await expect(createServerClient()).rejects.toMatchObject({ status: 503 });
      }
      expect(mocks.browser).not.toHaveBeenCalled();
      expect(mocks.server).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    },
  );

  it("passes public configuration to the browser SDK", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://example.supabase.co ");
    createBrowserClient();
    expect(mocks.browser).toHaveBeenCalledWith("https://example.supabase.co", "sb_publishable_test");
  });
});

describe("server request boundary", () => {
  it("keeps request cookies, clients, and response headers separate", async () => {
    const firstStore = { getAll: () => [{ name: "session", value: "first" }], set: vi.fn() };
    const secondStore = { getAll: () => [{ name: "session", value: "second" }], set: vi.fn() };
    mocks.cookies.mockResolvedValueOnce(firstStore).mockResolvedValueOnce(secondStore);
    mocks.server.mockImplementation(() => ({}));

    const first = await createServerClient();
    const second = await createServerClient();
    expect(first.supabase).not.toBe(second.supabase);
    expect(first.headers).not.toBe(second.headers);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");

    const firstCookies: CookieMethodsServer = mocks.server.mock.calls[0][2].cookies;
    const secondCookies: CookieMethodsServer = mocks.server.mock.calls[1][2].cookies;
    expect(firstCookies.getAll()).toEqual([{ name: "session", value: "first" }]);
    expect(secondCookies.getAll()).toEqual([{ name: "session", value: "second" }]);

    firstCookies.setAll!([{ name: "session", value: "refreshed", options: { path: "/", sameSite: "lax" } }], {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
    });
    expect(firstStore.set).toHaveBeenCalledWith("session", "refreshed", { path: "/", sameSite: "lax" });
    expect(secondStore.set).not.toHaveBeenCalled();
    expect(first.headers.get("Pragma")).toBe("no-cache");
    expect(first.headers.get("Expires")).toBe("0");
    expect(first.headers.get("Cache-Control")).toContain("must-revalidate");
    expect(second.headers.get("Pragma")).toBeNull();
  });

  it("surfaces cookie-write failures rather than pretending a session was saved", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [], set: () => { throw new Error("Cookies are read-only"); } });
    await createServerClient();
    const adapter: CookieMethodsServer = mocks.server.mock.calls[0][2].cookies;
    expect(() => adapter.setAll!([{ name: "session", value: "new", options: {} }], {})).toThrow("Cookies are read-only");
  });
});
