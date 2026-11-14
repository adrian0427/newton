import { expect, test, type Page } from "@playwright/test";

async function showWhiteboard(page: Page) {
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
}

test("local workspace, real MathLive input, snapshot download and clear", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Student workspace" }).click();
  await expect(page.getByRole("heading", { name: "Bring something to work on." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Newton" }).click();
  await expect(page.getByRole("button", { name: "Start voice" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Newton" })).toBeFocused();
  await showWhiteboard(page);
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("radio", { name: "Structured input" }).check();
  await expect(page.locator("math-field")).toBeVisible();
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByText("Write an expression before capturing.")).toBeVisible();
  await page.locator("math-field").click();
  await expect(page.locator("math-field")).toBeFocused();
  await page.keyboard.type("2(x+3)=14");
  await expect(page.getByText("Plain expression:")).toContainText("2*(x+3)=14");
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByText("Snapshot ready.", { exact: false })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download snapshot (JSON)" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const snapshot = JSON.parse(Buffer.concat(chunks).toString());
  expect(snapshot.structuredExpression).toBe("2*(x+3)=14");
  expect(snapshot.revisionId).toMatch(/^[\da-f-]{36}$/);
  expect(snapshot.image).toBeUndefined();
  await page.getByRole("button", { name: "Clear local work" }).click();
  await expect(page.getByRole("link", { name: "Download snapshot (JSON)" })).toHaveCount(0);
  await expect(page.getByText("Plain expression:")).toContainText("Your expression will appear here");
  await expect(page.getByRole("region", { name: "Snapshot export" })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("workspace.png"), fullPage: true });
});

test("real whiteboard draw, PNG export, undo, redo and erase", async ({ page }) => {
  await page.goto("/study");
  await showWhiteboard(page);
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByText("Draw something before capturing the whiteboard.")).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + 240);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6 + 60, box.y + 270, { steps: 15 });
  await page.mouse.move(box.x + box.width * 0.6 + 30, box.y + 310, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByRole("img", { name: "Captured student whiteboard" })).toBeVisible();
  const image = page.getByRole("img", { name: "Captured student whiteboard" });
  expect(await image.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  await image.screenshot({ path: test.info().outputPath("captured-drawing.png") });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("img", { name: "Captured student whiteboard" })).toHaveCount(0);
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByText("Draw something before capturing the whiteboard.")).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByRole("img", { name: "Captured student whiteboard" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss snapshot" }).click();
  await page.getByRole("radio", { name: "Eraser", exact: true }).locator("..").click();
  await expect(page.getByRole("radio", { name: "Eraser", exact: true })).toBeChecked();
  await canvas.scrollIntoViewIfNeeded();
  const eraseBox = (await canvas.boundingBox())!;
  await page.mouse.move(eraseBox.x + eraseBox.width * 0.6 + 30, eraseBox.y + 260);
  await page.mouse.down();
  await page.mouse.move(eraseBox.x + eraseBox.width * 0.6 + 30, eraseBox.y + 305, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.getByText("Draw something before capturing the whiteboard.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("whiteboard.png"), fullPage: true });
});

test("clear during PNG encoding discards the pending snapshot", async ({ page }) => {
  await page.addInitScript(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      window.dispatchEvent(new Event("capture-encoding"));
      window.addEventListener("release-capture", () => read.call(this, blob), { once: true });
    };
  });
  await page.goto("/study");
  await showWhiteboard(page);
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + 240);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6 + 40, box.y + 280, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => { window.addEventListener("capture-encoding", () => document.documentElement.dataset.encoding = "true", { once: true }); });
  await page.getByRole("button", { name: "Capture snapshot" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-encoding", "true");
  await page.getByRole("button", { name: "Clear local work" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("release-capture")));
  await expect(page.getByText("Your work changed during capture.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download snapshot (JSON)" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Capture snapshot" })).toBeEnabled();
});
