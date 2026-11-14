import { expect, test } from "@playwright/test";

test("Google-only sign-in shows cancellation and recovers from start failure", async ({ page }) => {
  await page.route("**/auth/session", async (route) => {
    await route.fulfill({ status: route.request().method() === "GET" ? 401 : 502, json: { error: { message: "Google sign-in is unavailable. Please try again." } } });
  });
  await page.goto("/auth/sign-in?oauth=failed");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
  await expect(page.locator("form").getByRole("alert")).toContainText("cancelled");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("unavailable");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
});

test("verified identity supports failed logout recovery and successful logout", async ({ page }) => {
  let fail = true;
  await page.route("**/auth/session", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { user: { email: "synthetic@example.com" } } });
    if (fail) return route.fulfill({ status: 502, json: { error: { message: "Sign-out failed. Please retry." } } });
    return route.fulfill({ json: { signedOut: true } });
  });
  await page.goto("/auth/sign-in");
  await expect(page.getByText("synthetic@example.com")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open study workspace" })).toHaveAttribute("href", "/study");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Sign-out failed");
  await expect(page.getByText("synthetic@example.com")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("synthetic@example.com")).toHaveCount(0);
});
