import { expect, test, type Page } from "@playwright/test";

async function enterStep(page: Page, value: string) {
  await expect(page.locator(".workspace-split")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await expect(page.locator("math-field")).toBeVisible();
  await page.locator("math-field").evaluate((field, expression) => {
    (field as HTMLElement & { setValue(value: string, options: { format: string }): void }).setValue(expression, { format: "ascii-math" });
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("Newton celebrates a correct checked step once, and never an incorrect one", async ({ page }) => {
  await page.goto("/study");
  const burst = page.locator(".newton-celebration");
  const launcher = page.locator(".tutor-launcher");
  // Retrying assertions would eventually pass after any burst ends, so sample once instead.
  const noBurst = async () => { await page.waitForTimeout(150); expect(await burst.count()).toBe(0); };

  await enterStep(page, "7(6k+2)=42k+2");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your expansion" })).toBeVisible();
  await noBurst();
  await page.keyboard.press("Escape");

  await enterStep(page, "7(6k+2)=42k+14");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await noBurst();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Correct step" })).toBeVisible();
  await expect(burst).toHaveCount(1);
  await expect(burst).toHaveAttribute("aria-hidden", "true");
  await expect(burst).toHaveCSS("pointer-events", "none");
  await expect(launcher).toHaveAttribute("data-celebrating", "true");
  // He regenerates and the decoration is removed after 1.9 s.
  await expect(burst).toHaveCount(0, { timeout: 4000 });
  await expect(launcher).toHaveAttribute("data-celebrating", "false");

  // Rechecking the same revision does not replay it.
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await noBurst();
});

test("reduced motion shows still sparkles instead of a burst", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/study");
  await enterStep(page, "7(6k+2)=42k+14");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.locator(".newton-sparkle").first()).toBeVisible();
  await expect(page.locator(".newton-confetti").first()).toBeHidden();
});
