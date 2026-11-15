import { expect, test, type Page } from "@playwright/test";
import { drawMultilineExample } from "./freehand-example";

// Real Excalidraw strokes, export and review UI; the transcription and sign-in boundaries are mocked.
// Worst case for height: a two-line drawing plus the ambiguity notice.
type Box = { top: number; bottom: number; left: number; right: number };

async function openReview(page: Page) {
  await page.route("**/auth/session", (route) => route.fulfill({ status: 401, json: { error: { message: "Please sign in." } } }));
  await page.route("**/api/work/transcribe", (route) => route.fulfill({ json: { transcription: {
    revisionId: (route.request().postDataJSON() as { revisionId: string }).revisionId, status: "ambiguous", text: "7(6k+2)=42k+?",
  } } }));
  await page.goto("/study");
  await drawMultilineExample(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toBeFocused();
  await expect(page.getByRole("img", { name: "The drawing Newton read" })).toBeVisible();
}

/** Rectangles relative to the viewport, plus the popover's own scroll offset. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null | undefined): Box => {
      const { top, bottom, left, right } = element!.getBoundingClientRect();
      return { top, bottom, left, right };
    };
    const popover = document.querySelector(".handwriting-review")!;
    const button = (name: string) => [...popover.querySelectorAll("button")].find((element) => element.textContent === name);
    return {
      popover: box(popover), scrollTop: popover.scrollTop, viewport: window.innerHeight,
      image: box(popover.querySelector(".transcription-image img")), input: box(popover.querySelector("#transcription-input")),
      confirm: box(button("Confirm transcription")), readAgain: box(button("Read again")),
    };
  });
}

function visibleIn(inner: Box, outer: Box) {
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 1);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 1);
}

const viewports = [
  { name: "laptop", width: 1280, height: 720 },
  { name: "small laptop", width: 1024, height: 640 },
  { name: "iPad portrait", width: 820, height: 1180 },
  { name: "short phone", width: 390, height: 664 },
];

for (const viewport of viewports) {
  test(`${viewport.name}: drawing, transcription and actions are visible together without scrolling`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Explicit viewport; the mobile project covers 360px below");
    await page.setViewportSize(viewport);
    await openReview(page);
    const view = await layout(page);
    expect(view.scrollTop).toBe(0);
    for (const part of [view.image, view.input, view.confirm, view.readAgain]) visibleIn(part, view.popover);
    expect(view.popover.bottom).toBeLessThanOrEqual(view.viewport);
    // Side by side: the image is beside, not above, the field.
    expect(view.image.right).toBeLessThanOrEqual(view.input.left);
    expect(view.input.top).toBeLessThan(view.image.bottom);
    // Confirm follows the field directly.
    expect(view.confirm.top).toBeGreaterThanOrEqual(view.input.bottom);
    expect(view.confirm.top - view.input.bottom).toBeLessThan(40);
  });
}

test("phone: the same review fits and the keyboard path still confirms", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Uses the 360px touch project");
  await openReview(page);
  const view = await layout(page);
  expect(view.scrollTop).toBe(0);
  for (const part of [view.image, view.input, view.confirm, view.readAgain]) visibleIn(part, view.popover);
  expect(view.popover.bottom).toBeLessThanOrEqual(view.viewport);
  const confirm = page.getByRole("button", { name: "Confirm transcription", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("textbox", { name: "What you wrote" }).fill("7(6k+2)=42k+2");
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Confirmed:", { exact: false })).toContainText("7*(6*k+2)=42*k+2");
});

test("very small screens scroll only the review so Confirm stays reachable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Explicit viewport");
  await page.setViewportSize({ width: 320, height: 568 });
  await openReview(page);
  const view = await layout(page);
  visibleIn(view.input, view.popover);
  visibleIn(view.confirm, view.popover);
  visibleIn(view.readAgain, view.popover);
  // The page itself is never scrolled to reach the action.
  expect(await page.evaluate(() => [document.scrollingElement!.scrollTop, document.querySelector(".study-shell")!.scrollTop])).toEqual([0, 0]);
  await page.getByRole("button", { name: "Read again", exact: true }).focus();
  await expect(page.getByRole("button", { name: "Read again", exact: true })).toBeFocused();
});
