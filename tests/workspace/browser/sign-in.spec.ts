import { expect, test } from "@playwright/test";

test("minimal sign-in preserves Google authentication and retry feedback", async ({ page }) => {
  let attempts = 0;
  await page.route("**/auth/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 401, json: { error: { message: "Not signed in" } } });
      return;
    }
    expect(route.request().postData()).toBeNull();
    attempts++;
    await route.fulfill(attempts === 1
      ? { status: 502, json: { error: { message: "Google sign-in is unavailable. Please retry." } } }
      : { json: { url: "https://example.supabase.co/auth/v1/authorize?provider=google" } });
  });
  await page.route("https://example.supabase.co/**", route => route.fulfill({ contentType: "text/html", body: "Google authorization handoff" }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("link", { name: "Newton home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to Newton" })).toHaveClass("sr-only");
  const background = page.locator(".sign-in-comets");
  await expect(background).toHaveAttribute("aria-hidden", "true");
  await expect(background).toHaveCSS("pointer-events", "none");
  await expect(background.locator("span").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator("input[type=email], input[type=password]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("sign-in.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Google sign-in is unavailable. Please retry.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(background.locator("span").first()).toHaveCSS("animation-name", "comet-drift");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await page.waitForURL("https://example.supabase.co/**");
});
