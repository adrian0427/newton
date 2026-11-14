import { expect, test } from "@playwright/test";

test("landing sign-in background is decorative, respects reduced motion, and leaves navigation usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/auth/session", route => route.fulfill({ status: 401, json: { error: { message: "Not signed in" } } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("input[type=email], input[type=password]")).toHaveCount(0);
  await expect(page.getByText("Space to think.")).toBeVisible();
  const decoration = page.locator(".sign-in-comets");
  await expect(decoration).toHaveAttribute("aria-hidden", "true");
  await expect(decoration).toHaveCSS("pointer-events", "none");
  const stroke = decoration.locator("span").first();
  await expect(stroke).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(stroke).toHaveCSS("animation-name", "comet-drift");
  await expect(stroke).toHaveCSS("animation-duration", "16s");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: test.info().outputPath("landing-paper.png"), fullPage: true });
  await page.getByRole("link", { name: "Try the workspace" }).click();
  await expect(page).toHaveURL(/\/study$/);
});
