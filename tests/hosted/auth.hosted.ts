import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { it } from "vitest";
import { hostedConfig } from "./config";

it("keeps a real session across reload/navigation and clears it after UI logout", async () => {
  const config = hostedConfig(process.env);
  const jar = new Map<string, string>();
  const client = createServerClient(config.projectUrl, config.publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: config.appUrl });
  const page = await context.newPage();
  // Real SDK fixture login tests the same session boundary, not Google consent.
  async function establishFixtureSession() {
    const signed = await client.auth.signInWithPassword(config.accounts[0]);
    assert.ok(!signed.error, "Test fixture SDK login failed");
    await context.clearCookies();
    await context.addCookies([...jar].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: config.appUrl, sameSite: "Lax" as const })));
  }
  async function signedIn() {
    await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    const identity = await context.request.get("/auth/session");
    assert.equal(identity.status(), 200, "Verified identity must persist");
    assert.ok((await identity.json()).user.email === config.accounts[0].email, "Unexpected account identity");
    assert.match(identity.headers()["cache-control"] ?? "", /no-store/);
  }
  try {
    await establishFixtureSession();
    await page.goto("/auth/sign-in");
    await signedIn();
    await page.reload();
    await signedIn();
    await page.getByRole("link", { name: "Open study workspace" }).click();
    await page.waitForURL("**/study");
    await page.goto("/auth/sign-in");
    await signedIn();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
    for (const path of ["/auth/session", "/api/learning-context?conceptId=algebra.distributive-property"]) {
      const response = await context.request.get(path);
      assert.equal(response.status(), 401, "Signed-out request must be denied");
      assert.match(response.headers()["cache-control"] ?? "", /no-store/);
    }
    await establishFixtureSession();
    await page.reload();
    await signedIn();
    console.log("PASS: real Auth cookie reload/navigation persistence, UI logout, signed-out reload/API denial, SDK reauthentication and restored UI.");
  } finally {
    await context.request.delete("/auth/session", { headers: { Origin: config.appUrl } }).catch(() => undefined);
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    await browser.close();
  }
});
