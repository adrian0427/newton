import { expect, test } from "@playwright/test";

test("workspace expression, source and worksheet survive reload and clear removes saved work", async ({ page }) => {
  await page.goto("/study");
  await page.getByLabel("Upload worksheet file").setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await expect(page.getByRole("img", { name: "Worksheet: sheet.png" })).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await page.locator("math-field").click();
  await expect(page.locator("math-field")).toBeFocused();
  await page.keyboard.type("2(x+3)");
  await expect(page.getByText("Plain expression:")).toContainText("2*(x+3)");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole("img", { name: "Worksheet: sheet.png" })).toBeAttached();
  if (await tab.isVisible()) await tab.click();
  await expect(page.getByRole("radio", { name: "Structured input" })).toBeChecked();
  await expect(page.getByText("Plain expression:")).toContainText("2*(x+3)");
  await page.getByRole("button", { name: "Clear local work" }).click();
  await page.waitForTimeout(600);
  await page.reload();
  if (await tab.isVisible()) await tab.click();
  await expect(page.getByText("Plain expression:")).toContainText("Your expression will appear here");
});
