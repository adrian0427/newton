import { expect, test, type Page } from "@playwright/test";

export async function enterStep(page: Page, value: string) {
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

test("real structured work drives local checks and targeted hints without persistence or microphone calls", async ({ page }) => {
  const serviceRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) serviceRequests.push(request.method()); });
  await page.goto("/study");
  await enterStep(page, "7(6k+2)=42k+2");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await expect(page.getByRole("button", { name: "Start voice", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByText("Your submitted expressions are not equivalent", { exact: false })).toBeVisible();
  await expect(page.getByText("Submitted:", { exact: false })).toContainText("7*(6*k+2)=42*k+2");
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect(page.getByText("Recheck 7 × (2).", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await enterStep(page, "7(6k+2)=14+42k");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await expect(page.getByText("Your submitted expressions are not equivalent", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Correct step", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await enterStep(page, "3(2x+5)=6x+5");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  // A different written problem is never trusted silently; the student must adopt it.
  await expect(page.getByText("which is not the active problem 7(6k + 2)", { exact: false })).toBeVisible();
  await expect(page.getByText("Recheck 3 × (5).", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Use 3*(2*x+5) as the active problem" }).click();
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect(page.getByText("Recheck 3 × (5).", { exact: false })).toBeVisible();
  expect(serviceRequests).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "Open Newton" }).click();
  await expect(page.getByText("Submitted:", { exact: false })).toHaveCount(0);
});

test("unread whiteboard work is never reported as recognized or verified", async ({ page }) => {
  await page.goto("/study");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Not checked", exact: true })).toBeVisible();
  await expect(page.getByText("Your whiteboard hasn't been read yet.", { exact: false })).toBeVisible();
});
