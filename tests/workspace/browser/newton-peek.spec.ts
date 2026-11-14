import { expect, test } from "@playwright/test";

test("peeking Newton blinks, respects reduced motion, and opens guidance", async ({ page }) => {
  await page.goto("/study");
  const launcher = page.getByRole("button", { name: "Open Newton" });
  await expect(launcher).toBeVisible();
  const bounds = (await launcher.boundingBox())!;
  expect(bounds.width).toBe(56);
  expect(bounds.height).toBe(88);
  expect(Math.round(bounds.x + bounds.width)).toBe(page.viewportSize()!.width);
  await expect(launcher.locator(".newton-peek")).toHaveAttribute("data-indicator", "idle");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(launcher.locator(".newton-frame-open")).toHaveCSS("animation-duration", "4.02s");
  // Freeze the authored blink at its closed-eye interval, without a timing-based sleep.
  await launcher.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 3900; }
  });
  await expect(launcher.locator(".newton-frame-closed")).toHaveCSS("opacity", "1");
  await expect(launcher.locator(".newton-frame-open")).toHaveCSS("opacity", "0");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(launcher.locator(".newton-frame-open")).toHaveCSS("animation-name", "none");
  await expect(launcher.locator(".newton-frame-open")).toHaveCSS("opacity", "1");
  await expect(launcher.locator(".newton-frame-closed")).toHaveCSS("opacity", "0");
  await launcher.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("newton-peek.png") });
});
