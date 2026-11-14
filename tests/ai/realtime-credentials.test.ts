import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { issueRealtimeCredential } from "@/lib/ai/realtime-credentials";

const options = { apiKey: "test-server-key" };

describe("server credential issuance", () => {
  it("does not call the provider without a configured key", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(issueRealtimeCredential({ ...options, apiKey: " ", fetch: request })).rejects.toThrow("DEEPGRAM_API_KEY");
    expect(request).not.toHaveBeenCalled();
  });

  it("requests a short-lived credential and returns only its normalized secret and expiry", async () => {
    const before = Date.now();
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: "header.payload.signature", expires_in: 30, private: "not forwarded" }));
    const result = await issueRealtimeCredential({ ...options, fetch: request });
    expect(Object.keys(result)).toEqual(["clientSecret", "expiresAt"]);
    expect(result.clientSecret).toBe("header.payload.signature");
    expect(Date.parse(result.expiresAt)).toBeGreaterThanOrEqual(before + 30_000);
    expect(Date.parse(result.expiresAt)).toBeLessThanOrEqual(Date.now() + 30_000);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.deepgram.com/v1/auth/grant");
    expect(init?.headers).toEqual({ Authorization: "Token test-server-key", "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({ ttl_seconds: 30 });
    expect(init?.cache).toBe("no-store");
  });

  it.each([
    {},
    { access_token: "raw-permanent-key", expires_in: 30 },
    { access_token: "header.payload.signature", expires_in: 0 },
    { access_token: "header.payload.signature", expires_in: "tomorrow" },
    { access_token: "header.payload.signature", expires_in: 3600 },
  ])("rejects malformed, expired, or unexpectedly long-lived responses", async (payload) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(issueRealtimeCredential({ ...options, fetch: request })).rejects.toThrow("invalid or expired");
  });

  it.each(["network", "upstream", "json"])("sanitizes %s failure", async (kind) => {
    const request = vi.fn<typeof fetch>();
    if (kind === "network") request.mockRejectedValue(new Error("secret provider detail"));
    if (kind === "upstream") request.mockResolvedValue(new Response("secret provider detail", { status: 401 }));
    if (kind === "json") request.mockResolvedValue(new Response("secret provider detail"));
    await expect(issueRealtimeCredential({ ...options, fetch: request })).rejects.not.toThrow("secret provider detail");
  });
});
