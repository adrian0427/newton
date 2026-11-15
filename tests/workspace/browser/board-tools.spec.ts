import { expect, test } from "@playwright/test";

test("the full tool bar sits right of Focus mode, the menu sits in the board's corner, and styles can be hidden", async ({ page }) => {
  await page.goto("/study");
  await expect(page.locator(".workspace-split")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  const tools = page.getByRole("toolbar", { name: "Drawing tools" });
  await expect(tools).toBeVisible();

  const focus = (await page.getByRole("button", { name: "Focus mode", exact: true }).boundingBox())!;
  // The slot is the visible area; the tool bar inside it scrolls sideways when the pane is narrow.
  const toolsBox = (await page.locator(".board-tools-slot").boundingBox())!;
  const picker = (await page.locator(".source-picker").boundingBox())!;
  // Narrow screens give the tools their own row below; on the same row they sit between Focus mode and the picker.
  if (Math.abs(picker.y - toolsBox.y) < 20) {
    expect(toolsBox.x).toBeGreaterThan(focus.x + focus.width);
    expect(toolsBox.x + toolsBox.width).toBeLessThan(picker.x);
  }
  await expect(page.getByRole("button", { name: "More tools" })).toHaveCount(0);
  // Excalidraw's own shape tools are hidden; undo/redo stay.
  await expect(page.locator(".excalidraw .shapes-section, .excalidraw .App-toolbar--mobile")).toBeHidden();

  for (const name of ["Hand (panning tool)", "Selection", "Rectangle", "Diamond", "Ellipse", "Arrow", "Line", "Draw", "Text", "Insert image", "Eraser"]) {
    await expect(tools.getByRole("button", { name, exact: true })).toBeAttached();
  }
  const draw = tools.getByRole("button", { name: "Draw", exact: true }), eraser = tools.getByRole("button", { name: "Eraser" });
  await expect(draw).toHaveAttribute("aria-pressed", "true");
  await eraser.click();
  await expect(eraser).toHaveAttribute("aria-pressed", "true");
  await expect(draw).toHaveAttribute("aria-pressed", "false");
  const lock = tools.getByRole("button", { name: "Keep selected tool active after drawing" });
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await lock.click();

  const board = (await page.locator(".board-canvas").boundingBox())!;
  const menu = page.getByRole("button", { name: "Whiteboard menu" });
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x - board.x).toBeLessThan(20);
  expect(menuBox.y - board.y).toBeLessThan(20);
  await menu.click();
  await expect(page.getByText("Reset the canvas")).toBeVisible();
  await page.keyboard.press("Escape");

  // Tools stay available while focusing on the whiteboard, and hide for structured input.
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(tools).toBeVisible();
  await page.getByRole("button", { name: "Exit focus" }).click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await expect(tools).toBeHidden();
  await page.getByRole("radio", { name: "Whiteboard", exact: true }).check();
});

test("Hide styles removes the Stroke and Background card and is remembered", async ({ page, isMobile }) => {
  test.skip(isMobile, "Excalidraw's phone layout opens styles from its own bottom bar.");
  // The card only exists in Excalidraw's wide layout, which needs a wide whiteboard pane.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/study");
  await expect(page.locator(".workspace-split")).toBeAttached();
  await page.getByRole("toolbar", { name: "Drawing tools" }).getByRole("button", { name: "Rectangle" }).click();
  // The section wrapper is 0px tall; its inner panel holds the visible card.
  const card = page.locator(".excalidraw .selected-shape-actions .App-menu__left");
  await expect(card).toContainText("Stroke");
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Hide styles" }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show styles" })).toBeVisible();
  await page.getByRole("button", { name: "Show styles" }).click();
  await expect(page.getByRole("button", { name: "Hide styles" })).toBeVisible();
});
