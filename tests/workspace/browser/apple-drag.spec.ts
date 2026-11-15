import { expect, test, type Page } from "@playwright/test";

async function center(page: Page) {
  const box = (await page.locator(".tutor-launcher").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("Newton can be picked up, placed, reopened beside himself, and docked again", async ({ page }) => {
  await page.goto("/study");
  const launcher = page.locator(".tutor-launcher");
  await expect(launcher).toHaveAttribute("data-mode", "dock");
  const { width, height } = page.viewportSize()!;

  // A small wobble under the threshold is still a click.
  let start = await center(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 2, start.y + 1);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Picked up: held pose and dock zone while dragging; dropping does not open guidance.
  start = await center(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(width / 2, height / 2, { steps: 8 });
  await expect(launcher).toHaveAttribute("data-mode", "held");
  await expect(page.locator(".newton-apple")).toHaveAttribute("data-held", "true");
  await expect(page.locator(".newton-dock-zone")).toHaveAttribute("data-active", "false");
  await page.mouse.up();
  await expect(launcher).toHaveAttribute("data-mode", "free");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const placed = await center(page);
  expect(Math.abs(placed.x - width / 2)).toBeLessThan(2);
  expect(Math.abs(placed.y - height / 2)).toBeLessThan(2);

  // Placed, his eyes point at the whiteboard pane, wherever it is.
  const facing = () => page.evaluate(() => {
    const pupils = document.querySelector(".newton-apple .newton-frame-open .newton-gaze")!.getBoundingClientRect();
    const eyes = document.querySelector(".newton-apple .newton-frame-open")!.getBoundingClientRect();
    const pane = document.querySelector(".work-area")!.getBoundingClientRect();
    return { look: pupils.left + pupils.width / 2 - (eyes.left + eyes.width / 2), toPane: pane.left + pane.width / 2 - (eyes.left + eyes.width / 2), paneWidth: pane.width };
  });
  await expect.poll(async () => { const f = await facing(); return f.paneWidth === 0 || Math.sign(f.look) === Math.sign(f.toPane); }).toBe(true);

  // Remembered on this device.
  await page.reload();
  await expect(launcher).toHaveAttribute("data-mode", "free");

  // Guidance opens beside him and stays on screen.
  await page.getByRole("button", { name: "Open Newton" }).click();
  const panel = (await page.getByRole("dialog").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(width);
  await page.keyboard.press("Escape");

  // Dropping near the right edge tucks him back into the peek.
  start = await center(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(width - 10, height / 3, { steps: 8 });
  await expect(page.locator(".newton-dock-zone")).toHaveAttribute("data-active", "true");
  await page.mouse.up();
  await expect(launcher).toHaveAttribute("data-mode", "dock");
  const docked = (await launcher.boundingBox())!;
  expect(Math.round(docked.x + docked.width)).toBe(width);

  // Keyboard: Left pulls him out, Home returns him.
  await launcher.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(launcher).toHaveAttribute("data-mode", "free");
  await page.keyboard.press("Home");
  await expect(launcher).toHaveAttribute("data-mode", "dock");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});
