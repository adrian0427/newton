import { expect, test } from "@playwright/test";

test("landing sign-in background is decorative, respects reduced motion, and leaves navigation usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/auth/session", route => route.fulfill({ status: 401, json: { error: { message: "Not signed in" } } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("input[type=email], input[type=password]")).toHaveCount(0);
  await expect(page.getByText("Space to think.")).toBeVisible();
  const decoration = page.locator(".sign-in-ink");
  await expect(decoration).toHaveAttribute("aria-hidden", "true");
  await expect(decoration).toHaveCSS("pointer-events", "none");
  const stroke = decoration.locator(".ink-drawing").first();
  await expect(decoration.locator(".ink-drawing")).toHaveCount(24);
  await expect(stroke).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(stroke).toHaveCSS("animation-name", "ink-mark-0");
  await expect(stroke).toHaveCSS("animation-duration", "36s");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: test.info().outputPath("landing-paper.png"), fullPage: true });
  await page.getByRole("link", { name: "Try the workspace" }).click();
  await expect(page).toHaveURL(/\/study$/);
});

test("handwriting overlaps, changes motifs on the second pass, and loops", async ({ page }) => {
  await page.route("**/auth/session", route => route.fulfill({ status: 401, json: { error: { message: "Not signed in" } } }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const drawings = page.locator(".ink-drawing");
  expect(new Set(await drawings.evaluateAll(nodes => nodes.map(n => n.getAttribute("data-motif")))).size).toBe(24);
  async function sample(time: number) {
    await page.locator(".sign-in-ink").evaluate((root, time) => {
      for (const animation of root.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
    }, time);
    return drawings.evaluateAll(nodes => nodes.filter(n => getComputedStyle(n).display !== "none" && Number(getComputedStyle(n).opacity) > .2).map(n => n.getAttribute("data-motif")));
  }
  const first = await sample(5000);
  const second = await sample(23000);
  expect(first.length).toBeGreaterThan(1);
  expect(second.length).toBeGreaterThan(1);
  expect(second.every(name => !first.includes(name))).toBe(true);
  expect(await sample(41000)).toEqual(first);
  await sample(7500);
  await page.screenshot({ path: test.info().outputPath("landing-animated.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".sign-in-ink").evaluate(root => root.getAnimations({ subtree: true }).length)).toBe(0);
});
