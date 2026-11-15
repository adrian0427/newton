import { expect, test, type Page } from "@playwright/test";
import { drawMultilineExample } from "./freehand-example";

test.use({ launchOptions: { args: process.env.NEWTON_TEST_LOCAL_VOICE ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] : [] } });
const firstSession = "ccaf9362-14b1-4b89-8fb2-c911c9ff1d70";
const secondSession = "ccaf9362-14b1-4b89-8fb2-c911c9ff1d71";
const expression = "7(6k+2)=42k+2";

async function storedBoard(page: Page, email: string) {
  return page.evaluate(email => new Promise<string | null>((resolve, reject) => {
    const opening = indexedDB.open("newton-workspace");
    opening.onerror = () => reject(new Error("Cannot open test storage"));
    opening.onsuccess = () => {
      const db = opening.result;
      const read = db.transaction("parts").objectStore("parts").get([`account:${email}`, "board"]);
      read.onsuccess = () => { resolve(read.result ? JSON.stringify(read.result) : null); db.close(); };
      read.onerror = () => { reject(new Error("Cannot read test storage")); db.close(); };
    };
  }), email);
}
// Excalidraw normalizes these two editing-only fields on restore; all stored
// symbols, geometry, styling, IDs, versions and files must remain identical.
function drawingContent(serialized: string | null) {
  const board = JSON.parse(serialized!);
  for (const element of board.elements) { delete element.boundElements; delete element.lastCommittedPoint; }
  return board;
}
async function openBoard(page: Page) {
  await expect(page.locator(".workspace-split")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  await expect(page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveValue(expression);
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
}
async function openTutor(page: Page) {
  await page.getByRole("button", { name: "Open Newton", exact: true }).click();
}
async function answerTranscription(page: Page, text = expression) {
  await page.route("**/api/work/transcribe", route => route.fulfill({ json: {
    transcription: { revisionId: route.request().postDataJSON().revisionId, status: "transcribed", text },
  } }));
}

test("restored account drawings can be read without overwriting storage or restoring confirmed text", async ({ page }) => {
  await page.route("**/auth/session", route => route.fulfill({ json: { user: { email: "drawing@example.com" } } }));
  await answerTranscription(page);
  await page.goto("/study");
  await drawMultilineExample(page);
  await expect.poll(() => storedBoard(page, "drawing@example.com")).not.toBeNull();
  // Wait for the last stroke, not merely an earlier debounced save.
  await page.getByRole("button", { name: "Capture snapshot", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download snapshot (JSON)" })).toBeVisible();
  await expect.poll(async () => JSON.parse((await storedBoard(page, "drawing@example.com"))!).elements.length).toBe(19);
  const before = await storedBoard(page, "drawing@example.com");
  await page.reload();
  await openBoard(page);
  await confirm(page);
  await openTutor(page);
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect(page.getByText("Recheck 7 × (2).", { exact: false })).toBeVisible();
  expect(drawingContent(await storedBoard(page, "drawing@example.com"))).toEqual(drawingContent(before));
  await page.reload();
  await openBoard(page);
  await expect(page.getByText("Confirmed:", { exact: false })).toHaveCount(0);
  await openTutor(page);
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByText("Your whiteboard hasn't been read yet.", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Clear local work", exact: true }).click();
  await expect.poll(async () => {
    const board = await storedBoard(page, "drawing@example.com");
    return !board || JSON.parse(board).elements.length === 0;
  }).toBe(true);
  await page.reload();
  await openBoard(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Draw something" })).toBeVisible();
});

test("a correct confirmed handwriting check retains main's once-per-work celebration", async ({ page }) => {
  // Provider output is mocked; this checks the confirmation/check/decoration seam, not recognition accuracy.
  await page.route("**/auth/session", route => route.fulfill({ json: { user: { email: "celebration@example.com" } } }));
  await answerTranscription(page, "42k+14");
  await page.goto("/study"); await drawMultilineExample(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveValue("42k+14");
  expect(await page.locator(".newton-celebration").count()).toBe(0);
  await page.getByRole("button", { name: "Confirm transcription", exact: true }).click();
  await openTutor(page);
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Correct step", exact: true })).toBeVisible();
  expect(await page.locator(".newton-celebration").count()).toBe(0);
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.locator(".newton-celebration")).toHaveCount(1);
  await expect(page.locator(".newton-celebration")).toHaveCount(0);
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  expect(await page.locator(".newton-celebration").count()).toBe(0);
});

test("owned voice receives confirmed handwriting and clears its context on logout and account switch", async ({ page }) => {
  test.skip(!process.env.NEWTON_TEST_LOCAL_VOICE, "Local development voice only; no paid calls");
  await page.context().grantPermissions(["microphone"]);
  let email: string | null = "first@example.com";
  let injections = 0, closed = 0;
  const prompts: string[] = [], issued: string[] = [];
  let spokenHint = () => {};
  await page.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const tracked = window as Window & { handwritingTracks?: MediaStreamTrack[] };
    tracked.handwritingTracks = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await capture(constraints);
      tracked.handwritingTracks!.push(...stream.getTracks()); return stream;
    };
  });
  await page.route("**/auth/session", route => {
    if (route.request().method() === "DELETE") { email = null; return route.fulfill({ json: { signedOut: true } }); }
    return route.fulfill(email ? { json: { user: { email } } } : { status: 401, json: { error: { message: "Sign in" } } });
  });
  await page.route("**/api/study-sessions", route => route.fulfill({ status: 201, json: { session: { id: email === "first@example.com" ? firstSession : secondSession } } }));
  await page.route("**/api/realtime/token", route => {
    issued.push(route.request().postDataJSON().sessionId);
    expect(route.request().headers()["x-newton-voice-dev"]).toBeUndefined();
    return route.fulfill({ json: { clientSecret: "fake.header.signature", expiresAt: new Date(Date.now() + 30000).toISOString() } });
  });
  await page.routeWebSocket(/agent\.deepgram\.com/, socket => {
    const send = (event: object) => socket.send(JSON.stringify(event));
    socket.onClose(() => { closed++; });
    const response = () => {
      send({ type: "AgentThinking" });
      send({ type: "ConversationText", role: "assistant", content: "Consider the constant term." });
      socket.send(Buffer.alloc(24000)); send({ type: "AgentAudioDone" });
    };
    spokenHint = () => {
      send({ type: "UserStartedSpeaking" });
      send({ type: "ConversationText", role: "user", content: "What did I do wrong?" }); response();
    };
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const event = JSON.parse(message);
      if (event.type === "Settings") { prompts.push(event.agent.think.prompt); send({ type: "SettingsApplied" }); }
      if (event.type === "UpdateThink") { prompts.push(event.think.prompt); send({ type: "ThinkUpdated" }); }
      if (event.type === "InjectUserMessage") {
        injections++; expect(event.content).toContain("7*(6*k+2)=42*k+2");
        send({ type: "ConversationText", role: "user", content: event.content }); response();
      }
    });
    send({ type: "Welcome", request_id: "00000000-0000-0000-0000-000000000001" });
  });
  await answerTranscription(page);
  await page.goto("/study");
  await page.getByRole("button", { name: "Start study session", exact: true }).click();
  await expect(page.getByText("Study session ready.", { exact: true })).toBeVisible();
  await drawMultilineExample(page);
  await confirm(page); await openTutor(page);
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your expansion" })).toBeVisible();
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(issued).toEqual([firstSession]);
  expect(prompts.at(-1)).toContain('"source":"confirmed_handwriting"');
  expect(prompts.at(-1)).toContain('"step":"7*(6*k+2)=42*k+2"');
  expect(prompts.at(-1)).toContain('"verification":"incorrect"');
  spokenHint();
  await expect(page.getByText("Voice: speaking", { exact: true })).toBeVisible();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(injections).toBe(0);
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect.poll(() => injections).toBe(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
  await expect.poll(() => closed).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const tracks = (window as Window & { handwritingTracks?: MediaStreamTrack[] }).handwritingTracks;
    return !!tracks?.length && tracks.every(track => track.readyState === "ended");
  })).toBe(true);
  await expect(page.getByText("Confirmed:", { exact: false })).toHaveCount(0);
  const closeSettings = page.getByRole("button", { name: "Close settings", exact: true });
  if (await closeSettings.isVisible()) await closeSettings.click();
  email = "second@example.com";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Start study session", exact: true }).click();
  await expect(page.getByText("Study session ready.", { exact: true })).toBeVisible();
  await openTutor(page);
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(issued).toEqual([firstSession, secondSession]);
  expect(prompts.at(-1)).toContain('"submission":null');
  expect(prompts.at(-1)).not.toContain("42*k+2");
  await page.getByRole("button", { name: "End voice", exact: true }).click();
});

test("account change cancels a pending read and never restores another account's confirmation", async ({ page }) => {
  let email = "first@example.com", release = () => {}, reads = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/auth/session", route => route.fulfill({ json: { user: { email } } }));
  await page.route("**/api/work/transcribe", async route => {
    reads++;
    const revisionId = route.request().postDataJSON().revisionId;
    await gate;
    await route.fulfill({ json: { transcription: { revisionId, status: "transcribed", text: expression } } }).catch(() => {});
  });
  await page.goto("/study"); await drawMultilineExample(page);
  await page.getByRole("button", { name: "Read handwriting", exact: true }).click();
  await expect.poll(() => reads).toBe(1);
  const closeSettings = page.getByRole("button", { name: "Close settings", exact: true });
  if (await closeSettings.isVisible()) await closeSettings.click();
  email = "second@example.com";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Reading your handwriting", { exact: false })).toHaveCount(0);
  release();
  await openBoard(page); await openTutor(page);
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByText("Your whiteboard hasn't been read yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What you wrote" })).toHaveCount(0);
  expect(await storedBoard(page, "second@example.com")).toBeNull();
});
