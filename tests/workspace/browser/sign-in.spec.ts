import { expect, test } from "@playwright/test";

test("minimal sign-in preserves email authentication and retry feedback", async ({ page }) => {
  let attempts = 0;
  await page.route("**/auth/session", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 401, json: { error: { message: "Not signed in" } } });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({ email: "student@example.com", password: "test-password" });
    attempts++;
    await route.fulfill(attempts === 1
      ? { status: 401, json: { error: { message: "Check your email and password." } } }
      : { json: { user: { email: "student@example.com" } } });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("link", { name: "Newton home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to Newton" })).toHaveClass("sr-only");
  const background = page.locator(".sign-in-comets");
  await expect(background).toHaveAttribute("aria-hidden", "true");
  await expect(background).toHaveCSS("pointer-events", "none");
  await expect(background.locator("span").first()).toHaveCSS("animation-name", "none");
  await page.getByLabel("Username").fill("student@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("sign-in.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Check your email and password.");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("You’re signed in.");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(background.locator("span").first()).toHaveCSS("animation-name", "comet-drift");
});
