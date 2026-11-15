import type { Page } from "@playwright/test";

// Synthetic pointer paths, not font rendering or a private student's drawing.
// Every segment is drawn with Excalidraw's real freedraw tool before export.
const glyphs: Record<string, number[][][]> = {
  "7": [[[0, 0], [22, 0], [6, 42]]],
  "(": [[[14, -3], [6, 4], [1, 17], [2, 32], [14, 46]]],
  ")": [[[2, -3], [10, 4], [15, 17], [14, 32], [2, 46]]],
  "6": [[[20, 1], [10, 4], [2, 18], [0, 32], [4, 41], [14, 42], [22, 36], [22, 27], [16, 22], [5, 24], [1, 32]]],
  "k": [[[3, -2], [3, 42]], [[22, 12], [3, 28], [23, 42]]],
  "+": [[[0, 23], [24, 23]], [[12, 11], [12, 35]]],
  "2": [[[1, 8], [7, 1], [17, 1], [23, 7], [23, 14], [0, 42], [24, 42]]],
  "=": [[[0, 17], [24, 17]], [[0, 29], [24, 29]]],
  "4": [[[18, 0], [0, 28], [25, 28]], [[18, 0], [18, 42]]],
};

export async function drawMultilineExample(page: Page) {
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await canvas.waitFor({ state: "visible" });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.getByRole("radio", { name: "Draw", exact: true }).check();
  const scale = Math.min(1, (box.width - 50) / 260);
  for (const [row, line] of ["7(6k+2)", "=42k+2"].entries()) {
    for (const [index, char] of [...line].entries()) {
      for (const stroke of glyphs[char]) {
        const points = stroke.map(([x, y]) => ({ x: box.x + 25 + (index * 35 + x) * scale, y: box.y + 140 + (row * 85 + y) * scale }));
        await page.mouse.move(points[0].x, points[0].y);
        await page.mouse.down();
        for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 3 });
        await page.mouse.up();
      }
    }
  }
}
