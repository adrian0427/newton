import { expect, test, type Page } from "@playwright/test";
import { drawMultilineExample } from "./freehand-example";

// Real Excalidraw drawing, export, review UI and deterministic checker. The transcription endpoint is mocked:
// these tests never call a vision model, Supabase or the network.
type Reply = { status?: number; json: object };

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

async function draw(page: Page, offset = 0) {
  await expect(page.locator(".workspace-split")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.35 + offset, y = box.y + box.height * 0.62 + offset / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 25, { steps: 10 });
  await page.mouse.move(x + 20, y + 45, { steps: 8 });
  await page.mouse.up();
}

async function setProblem(page: Page, problem: string) {
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByLabel("Change problem").fill(problem);
  await page.getByRole("button", { name: "Set problem", exact: true }).click();
  await expect(page.locator(".workspace-panel p").filter({ hasText: "Active problem:" })).toContainText(problem);
  await page.keyboard.press("Escape");
}

/** Records each request body and answers with the next scripted reply, echoing the requested revision. */
function mockTranscription(page: Page, replies: ((revisionId: string) => Reply)[], gate?: Promise<void>) {
  const bodies: Record<string, unknown>[] = [];
  return page.route("**/api/work/transcribe", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    const reply = replies[Math.min(bodies.length, replies.length) - 1](String(body.revisionId));
    if (gate && bodies.length === 1) await gate;
    await route.fulfill({ status: reply.status ?? 200, json: reply.json }).catch(() => { /* The browser may already have aborted a stale request. */ });
  }).then(() => bodies);
}
const transcribed = (text: string, status = "transcribed") => (revisionId: string) => ({ json: { transcription: { revisionId, status, text } } });

test("two-line Excalidraw pen strokes export completely and confirmed text retains the incorrect constant", async ({ page }) => {
  const bodies = await mockTranscription(page, [transcribed("7(6k+2)=42k+2")]);
  await page.goto("/study");
  await drawMultilineExample(page);
  await page.getByRole("button", { name: "Capture snapshot", exact: true }).click();
  const download = page.getByRole("link", { name: "Download snapshot (JSON)" });
  await expect(download).toBeVisible();
  const original = await download.evaluate(async (link) => {
    const snapshot = await (await fetch((link as HTMLAnchorElement).href)).json();
    const bitmap = await createImageBitmap(await (await fetch(snapshot.image.value)).blob());
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  });
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveValue("7(6k+2)=42k+2");
  const png = Buffer.from(String(bodies[0].image).split(",")[1], "base64");
  expect(png.readUInt32BE(16)).toBeGreaterThan(150);
  expect(png.readUInt32BE(20)).toBeGreaterThan(100); // includes both rows plus export padding
  expect(Math.abs(png.readUInt32BE(16) - original.width * 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(png.readUInt32BE(20) - original.height * 2)).toBeLessThanOrEqual(1);
  expect(Math.max(png.readUInt32BE(16), png.readUInt32BE(20))).toBeLessThanOrEqual(2048);
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await checkInPanel(page, "Ask for a hint");
  await expect(page.getByText("Submitted:", { exact: false })).toContainText("7*(6*k+2)=42*k+2");
  await expect(page.getByText("Recheck 7 × (2).", { exact: false })).toBeVisible();
  await expect(page.locator(".tutor-feedback")).not.toContainText("14");
  expect(bodies).toHaveLength(1);
});

test("a digit-letter misread remains editable and is never silently repaired from the active problem", async ({ page }) => {
  await mockTranscription(page, [transcribed("7(b+2)=4b+2")]);
  await page.goto("/study");
  await draw(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  const field = page.getByRole("textbox", { name: "What you wrote" });
  await expect(field).toHaveValue("7(b+2)=4b+2");
  await field.fill("7(6k+2)=42k+2"); // explicit student correction of transcription, not of mathematics
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await checkInPanel(page, "Ask for a hint");
  await expect(page.getByText("Submitted:", { exact: false })).toContainText("7*(6*k+2)=42*k+2");
  await expect(page.getByText("Recheck 7 × (2).", { exact: false })).toBeVisible();
  await expect(page.locator(".tutor-feedback")).not.toContainText("14");
});

async function checkInPanel(page: Page, button: "Check work" | "Ask for a hint") {
  const open = page.getByRole("button", { name: "Open Newton" });
  if (await open.isVisible()) await open.click();
  await page.getByRole("button", { name: button, exact: true }).click();
}

test("confirmed handwriting reaches the deterministic checker and hint without revealing the answer", async ({ page }) => {
  const bodies = await mockTranscription(page, [transcribed("4(x+3)=4x+3")]);
  await page.goto("/study");
  await setProblem(page, "4(x+3)");
  await draw(page);
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(0); // Drawing alone never transmits work.
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  const field = page.getByRole("textbox", { name: "What you wrote" });
  await expect(field).toHaveValue("4(x+3)=4x+3");
  expect(Object.keys(bodies[0]).sort()).toEqual(["image", "revisionId"]);
  expect(String(bodies[0].image)).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByText("without correcting or grading it", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await expect(page.getByText("Confirmed:", { exact: false })).toContainText("4*(x+3)=4*x+3");
  await checkInPanel(page, "Check work");
  await expect(page.getByRole("heading", { name: "Check your expansion", exact: true })).toBeVisible();
  await expect(page.getByText("Submitted:", { exact: false })).toContainText("4*(x+3)=4*x+3");
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect(page.getByText("Recheck 4 × (3).", { exact: false })).toBeVisible();
  await expect(page.locator(".tutor-feedback")).not.toContainText("12");
  expect(bodies).toHaveLength(1);
});

test("editing the whiteboard discards a pending transcription and ignores its late result", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const bodies = await mockTranscription(page, [transcribed("4(x+3)=4x+3"), transcribed("4x+12")], gate);
  await page.goto("/study");
  await draw(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByText("Reading your handwriting", { exact: false })).toBeVisible();
  await draw(page, 60);
  await expect(page.getByText("Reading your handwriting", { exact: false })).toHaveCount(0);
  release();
  await page.waitForTimeout(500);
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveCount(0);
  await checkInPanel(page, "Check work");
  await expect(page.getByText("Your whiteboard hasn't been read yet.", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveValue("4x+12");
  expect(bodies).toHaveLength(2);
  expect(bodies[1].revisionId).not.toBe(bodies[0].revisionId);
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await draw(page, -40);
  await checkInPanel(page, "Check work");
  await expect(page.getByText("Your whiteboard hasn't been read yet.", { exact: false })).toBeVisible();
});

test("switching input source cancels a pending read and discards its late transcription", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await mockTranscription(page, [transcribed("7(6k+2)=42k+2")], gate);
  await page.goto("/study");
  await draw(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByText("Reading your handwriting", { exact: false })).toBeVisible();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await page.getByRole("radio", { name: "Whiteboard", exact: true }).check();
  release();
  await expect(page.getByRole("button", { name: "Read handwriting", exact: true })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveCount(0);
  await checkInPanel(page, "Check work");
  await expect(page.getByRole("heading", { name: "Not checked", exact: true })).toBeVisible();
});

test("ambiguous symbols must be resolved by the student; a standalone expansion is checked", async ({ page }) => {
  await mockTranscription(page, [transcribed("4x+1?", "ambiguous")]);
  await page.goto("/study");
  await setProblem(page, "4(x+3)");
  await draw(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByText("Some symbols were unclear", { exact: false })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm transcription", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("textbox", { name: "What you wrote" }).fill("4x+12");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await checkInPanel(page, "Check work");
  await expect(page.getByRole("heading", { name: "Correct step", exact: true })).toBeVisible();
});

test("an equation for a different problem is proposed, never trusted", async ({ page }) => {
  await mockTranscription(page, [transcribed("-4(x+3)=-4x+-12")]);
  await page.goto("/study");
  await draw(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await checkInPanel(page, "Check work");
  await expect(page.getByRole("heading", { name: "Not checked", exact: true })).toBeVisible();
  await expect(page.getByText("which is not the active problem 7(6k + 2)", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Use -4*(x+3) as the active problem" }).click();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Correct step", exact: true })).toBeVisible();
});

test("unreadable work, missing credentials, sign-in and rate limits stay recoverable with structured fallback", async ({ page }) => {
  const error = (status: number, code: string, message: string) => () => ({ status, json: { error: { code, message, retryable: status >= 429 } } });
  await mockTranscription(page, [
    (revisionId) => ({ json: { transcription: { revisionId, status: "unreadable" } } }),
    error(503, "vision-not-configured", "Handwriting recognition is not configured on this server. Use Structured input instead."),
    error(401, "unauthenticated", "Please sign in."),
    error(429, "rate-limited", "Handwriting recognition is busy. Wait a moment and try again, or use Structured input."),
  ]);
  await page.goto("/study");
  await setProblem(page, "4(x+3)");
  await draw(page);
  const read = page.getByRole("button", { name: "Read handwriting", exact: true });
  await read.click();
  await expect(page.getByText("Newton couldn't read this handwriting", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Type what I wrote", exact: true }).click();
  await page.getByRole("textbox", { name: "What you wrote" }).fill("4x+12");
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await expect(page.getByText("Confirmed:", { exact: false })).toContainText("4*x+12");
  await read.click();
  await expect(page.getByRole("alert").filter({ hasText: "not configured on this server" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to use handwriting recognition" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "busy" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss handwriting transcription" }).click();
  await enterStep(page, "4(x+3)=4x+12");
  await checkInPanel(page, "Check work");
  await expect(page.getByRole("heading", { name: "Correct step", exact: true })).toBeVisible();
});

test("review shows the exact image that was read so misreads can be compared and corrected", async ({ page }) => {
  let sent = "";
  await page.route("**/api/work/transcribe", async (route) => {
    const body = route.request().postDataJSON() as { revisionId: string; image: string };
    sent = body.image;
    // A plausible model misread: the student wrote 42k+2, the reader returns 426+2.
    await route.fulfill({ json: { transcription: { revisionId: body.revisionId, status: "transcribed", text: "426+2" } } });
  });
  await page.goto("/study");
  await draw(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  const image = page.getByRole("img", { name: "The drawing Newton read" });
  await expect(image).toBeVisible();
  expect(await image.getAttribute("src")).toBe(sent);
  expect(sent).toMatch(/^data:image\/png;base64,/);
  // Student correction is preserved; the checker never repairs the misread.
  const field = page.getByRole("textbox", { name: "What you wrote" });
  await expect(field).toHaveValue("426+2");
  await field.fill("42k+2");
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await checkInPanel(page, "Ask for a hint");
  await expect(page.getByRole("heading", { name: "Check your expansion", exact: true })).toBeVisible();
  await expect(page.getByText("Recheck 7 × (2).", { exact: false })).toBeVisible();
  await expect(page.locator(".tutor-feedback")).not.toContainText("14");
  await page.keyboard.press("Escape");
  await draw(page, 60);
  await expect(page.getByRole("img", { name: "The drawing Newton read" })).toHaveCount(0);
});
