import { expect, test } from "@playwright/test";

test("guests can adjust settings and dismiss with keyboard or outside click", async ({ page }) => {
  await page.route("**/auth/session", route => route.fulfill({ status: 401, json: { error: { message: "Please sign in." } } }));
  await page.goto("/study");
  const trigger = page.getByRole("button", { name: "Settings", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Settings" });
  await expect(panel.getByText("Guest workspace")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
  await expect(panel.getByRole("button", { name: "Close settings" })).toBeFocused();
  await panel.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bounds = (await panel.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  await page.screenshot({ path: test.info().outputPath("settings-dark.png") });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(4, 70);
  await expect(panel).toHaveCount(0);
});

test("sign-out failure can be retried without losing local work", async ({ page }) => {
  let attempts = 0;
  await page.route("**/auth/session", async route => {
    if (route.request().method() === "DELETE") {
      attempts++;
      await route.fulfill(attempts === 1
        ? { status: 502, json: { error: { message: "Unavailable" } } }
        : { json: { signedOut: true } });
    } else {
      await route.fulfill({ json: { user: { email: "student@example.com" } } });
    }
  });
  await page.goto("/study");
  await expect(page.locator(".workspace-split")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await page.locator("math-field").click();
  await expect(page.locator("math-field")).toBeFocused();
  await page.keyboard.type("2(x+3)=14");
  await expect(page.getByText("Plain expression:")).toContainText("2*(x+3)=14");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Settings" });
  await expect(panel.getByText("student@example.com")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("settings-account.png") });
  await panel.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("Sign-out failed. Your workspace is preserved; please retry.");
  await panel.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(panel.getByText("Guest workspace")).toBeVisible();
  await expect(panel.getByRole("status")).toHaveText("Signed out. Your account’s local work is hidden until you sign back in.");
  await expect(panel.getByText("student@example.com")).toHaveCount(0);
  await expect(page.locator(".workspace-split")).toBeAttached();
  const workTab = page.getByRole("button", { name: "Whiteboard", exact: true });
  await page.getByRole("button", { name: "Close settings" }).click();
  if (await workTab.isVisible()) await workTab.click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await expect(page.getByText("Plain expression:")).not.toContainText("2*(x+3)=14");
  await expect(page).toHaveURL(/\/study$/);
});

test("account check failures offer retry while appearance stays usable", async ({ page }) => {
  let unavailable = true;
  await page.route("**/auth/session", route => {
    return route.fulfill(unavailable
      ? { status: 503, json: { error: { message: "Unavailable" } } }
      : { status: 401, json: { error: { message: "Please sign in." } } });
  });
  await page.goto("/study");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Settings" });
  await expect(panel.getByRole("alert")).toHaveText("Unable to verify your sign-in. Please retry.");
  // Auth failure leaves a usable local guest board, without authorizing voice.
  await expect(panel.getByText("Guest workspace")).toBeVisible();
  await expect(page.locator(".workspace-split")).toBeAttached();
  await panel.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  unavailable = false;
  await panel.getByRole("button", { name: "Retry" }).click();
  await expect(panel.getByText("Guest workspace")).toBeVisible();
});
