import { expect, test } from "@playwright/test";

test.use({ permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });
test.skip(!process.env.NEWTON_TEST_DEV_STUDY, "Explicit local integration harness required; production study never receives its capability.");

test("workspace uses one real SDK session, recovers from credential failure, and sends checked context", async ({ page }) => {
  let issuance = 0, sockets = 0, injections = 0, closed = 0;
  let respond = () => {};
  let spokenHint = () => {};
  const prompts: string[] = [];
  await page.addInitScript(() => {
    const testWindow = window as Window & { testTracks?: MediaStreamTrack[] };
    testWindow.testTracks = [];
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await capture(constraints);
      testWindow.testTracks?.push(...stream.getTracks());
      return stream;
    };
  });
  await page.route("**/api/realtime/token", async (route) => {
    issuance++;
    expect(route.request().postDataJSON()).toEqual({ sessionId: "local-study-test" });
    expect(!!route.request().headers()["x-newton-voice-dev"]).toBe(true);
    await route.fulfill(issuance === 1 ? { status: 503, json: { error: { code: "unavailable" } } } : {
      json: { clientSecret: "fake.header.signature", expiresAt: new Date(Date.now() + 30_000).toISOString() },
    });
  });
  await page.routeWebSocket(/agent\.deepgram\.com/, (socket) => {
    sockets++;
    socket.onClose(() => { closed++; });
    const send = (message: object) => socket.send(JSON.stringify(message));
    spokenHint = () => {
      send({ type: "UserStartedSpeaking" });
      send({ type: "ConversationText", role: "user", content: "Can you give me a hint?" });
      send({ type: "AgentThinking" });
      send({ type: "ConversationText", role: "assistant", content: "Consider seven times the constant." });
      socket.send(Buffer.alloc(24_000));
      send({ type: "AgentAudioDone" });
    };
    socket.onMessage((message) => {
      if (typeof message !== "string") return;
      const event = JSON.parse(message);
      if (event.type === "Settings") {
        prompts.push(event.agent.think.prompt);
        send({ type: "SettingsApplied" });
      }
      if (event.type === "UpdateThink") {
        prompts.push(event.think.prompt);
        send({ type: "ThinkUpdated" });
      }
      if (event.type === "InjectUserMessage") {
        injections++;
        expect(event.content).toContain("7*(6*k+2)=42*k+2");
        expect(event.content).toContain('"localCheck":"incorrect"');
        send({ type: "ConversationText", role: "user", content: event.content });
        send({ type: "AgentThinking" });
        respond = () => {
          send({ type: "ConversationText", role: "assistant", content: "What should seven multiply besides six k?" });
          socket.send(Buffer.alloc(24_000));
          send({ type: "AgentAudioDone" });
        };
      }
    });
    send({ type: "Welcome", request_id: "00000000-0000-0000-0000-000000000001" });
  });
  await page.goto("/dev/study");
  await expect(page.locator(".excalidraw")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  await expect(page.locator("math-field")).toBeVisible();
  await page.locator("math-field").evaluate((field) => {
    (field as HTMLElement & { setValue(value: string, options: { format: string; silenceNotifications: boolean }): void }).setValue("7(6k+2)=42k+2", { format: "ascii-math", silenceNotifications: true });
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByText("Plain expression:", { exact: false })).toContainText("7*(6*k+2)=42*k+2");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice credentials are unavailable", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(prompts.at(-1)).toContain('"step":"7*(6*k+2)=42*k+2"');
  expect(prompts.at(-1)).toContain('"verification":"incorrect"');
  expect(prompts.at(-1)).toContain('"source":"structured_input"');
  await expect(page.getByTestId("voice-context-status")).toContainText("applied");
  spokenHint();
  await expect(page.getByText("Voice: speaking", { exact: true })).toBeVisible();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(injections).toBe(0); // ordinary speech uses initial context, never injected again
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).dblclick();
  await expect.poll(() => injections).toBe(1);
  await expect(page.getByText("Recheck 7 × (2).", { exact: false })).toBeVisible();
  respond();
  await expect(page.getByText("Voice: speaking", { exact: true })).toBeVisible();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(sockets).toBe(1);
  expect(issuance).toBe(2);
  await page.getByRole("button", { name: "End voice", exact: true }).click();
  await expect(page.getByText("Voice: idle", { exact: true })).toBeVisible();
  await expect.poll(() => closed).toBe(1);
  expect(await page.evaluate(() => (window as Window & { testTracks?: MediaStreamTrack[] }).testTracks?.every((track) => track.readyState === "ended"))).toBe(true);
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ask for a hint", exact: true }).click();
  await expect.poll(() => injections).toBe(2);
  await page.locator("math-field").evaluate((field) => {
    (field as HTMLElement & { setValue(value: string, options: { format: string; silenceNotifications: boolean }): void }).setValue("7(6k+2)=42k+14", { format: "ascii-math", silenceNotifications: true });
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByText("Voice: error", { exact: true })).toBeVisible();
  await expect(page.getByTestId("voice-context-status")).toContainText("CONTEXT_DELIVERY_FAILED");
  await expect(page.getByText("Submitted:", { exact: false })).toHaveCount(0);
  await expect.poll(() => closed).toBe(2);
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(prompts.at(-1)).toContain('"submission":null');
  expect(prompts.at(-1)).not.toContain("42*k+2");
  await page.getByRole("link", { name: "Newton home", exact: true }).click();
  await expect.poll(() => closed).toBe(3);
  expect(await page.evaluate(() => (window as Window & { testTracks?: MediaStreamTrack[] }).testTracks?.every((track) => track.readyState === "ended"))).toBe(true);
});

test("Check work silently updates active spoken context; edits clear evidence and failed updates close safely", async ({ page }) => {
  const prompts: string[] = [];
  let injections = 0, sockets = 0, closed = 0, failUpdate = false;
  let acknowledge = () => {};
  let spokenHint = () => {};
  await page.route("**/api/realtime/token", (route) => route.fulfill({ json: {
    clientSecret: "fake.header.signature", expiresAt: new Date(Date.now() + 30_000).toISOString(),
  } }));
  await page.routeWebSocket(/agent\.deepgram\.com/, (socket) => {
    sockets++;
    socket.onClose(() => { closed++; });
    const send = (event: object) => socket.send(JSON.stringify(event));
    spokenHint = () => {
      send({ type: "UserStartedSpeaking" });
      send({ type: "ConversationText", role: "user", content: "What did I do wrong?" });
      send({ type: "AgentThinking" });
      send({ type: "ConversationText", role: "assistant", content: "Consider the constant term." });
      socket.send(Buffer.alloc(24_000));
      send({ type: "AgentAudioDone" });
    };
    socket.onMessage((message) => {
      if (typeof message !== "string") return;
      const event = JSON.parse(message);
      if (event.type === "Settings") { prompts.push(event.agent.think.prompt); send({ type: "SettingsApplied" }); }
      if (event.type === "InjectUserMessage") injections++;
      if (event.type === "UpdateThink") {
        prompts.push(event.think.prompt);
        expect(event.think.provider).toEqual({ type: "open_ai", model: "gpt-4o-mini" });
        acknowledge = () => send(failUpdate ? { type: "Warning", code: "PROMPT_TOO_LONG", description: "DO NOT DISPLAY" } : { type: "ThinkUpdated" });
      }
    });
    send({ type: "Welcome", request_id: "00000000-0000-0000-0000-000000000002" });
  });
  await page.goto("/dev/study");
  await expect(page.locator(".excalidraw")).toBeAttached();
  const tab = page.getByRole("button", { name: "Whiteboard", exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.getByRole("radio", { name: "Structured input" }).check();
  const enter = async (value: string) => {
    await page.locator("math-field").evaluate((field, expression) => {
      (field as HTMLElement & { setValue(value: string, options: { format: string; silenceNotifications: boolean }): void }).setValue(expression, { format: "ascii-math", silenceNotifications: true });
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  await enter("42k+2");
  await page.getByRole("button", { name: "Open Newton" }).click();
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(prompts.at(-1)).toContain('"submission":null'); // draft wasn't submitted
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect(page.getByTestId("voice-context-status")).toContainText("pending");
  await expect.poll(() => prompts.length).toBe(2);
  expect(prompts.at(-1)).toContain('"step":"42*k+2"');
  expect(prompts.at(-1)).toContain('"verification":"incorrect"');
  acknowledge();
  await expect(page.getByTestId("voice-context-status")).toContainText("applied");
  spokenHint();
  await expect(page.getByText("Voice: speaking", { exact: true })).toBeVisible();
  await expect(page.getByText("Voice: listening", { exact: true })).toBeVisible();
  expect(injections).toBe(0);
  await enter("3(2x+5)=6x+5");
  await expect.poll(() => prompts.length).toBe(3);
  expect(prompts.at(-1)).toContain('"submission":null');
  expect(prompts.at(-1)).not.toContain("42*k+2");
  acknowledge();
  await expect(page.getByTestId("voice-context-status")).toContainText("applied");
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect.poll(() => prompts.length).toBe(4);
  // The written problem differs from the active one, so it is shared only as unverified work.
  expect(prompts.at(-1)).toContain('"problem":"7(6k + 2)"');
  expect(prompts.at(-1)).toContain('"verification":"unsupported"');
  acknowledge();
  await expect(page.getByTestId("voice-context-status")).toContainText("applied");
  await page.getByRole("button", { name: "Use 3*(2*x+5) as the active problem" }).click();
  await expect.poll(() => prompts.length).toBe(5);
  expect(prompts.at(-1)).toContain('"submission":null');
  acknowledge();
  await expect(page.getByTestId("voice-context-status")).toContainText("applied");
  await page.getByRole("button", { name: "Check work", exact: true }).click();
  await expect.poll(() => prompts.length).toBe(6);
  expect(prompts.at(-1)).toContain('"problem":"3*(2*x+5)"');
  expect(prompts.at(-1)).toContain('"step":"3*(2*x+5)=6*x+5"');
  expect(prompts.at(-1)).not.toContain("42*k+2");
  failUpdate = true;
  acknowledge();
  await expect(page.getByTestId("voice-context-status")).toContainText("CONTEXT_DELIVERY_FAILED");
  await expect(page.getByText("Voice: error", { exact: true })).toBeVisible();
  await expect.poll(() => closed).toBe(1);
  await expect(page.getByText("DO NOT DISPLAY")).toHaveCount(0);
  await page.getByRole("button", { name: "Start voice", exact: true }).click();
  await expect(page.getByTestId("voice-context-status")).toContainText("applied");
  expect(prompts.at(-1)).toContain('"step":"3*(2*x+5)=6*x+5"');
  expect(sockets).toBe(2);
  expect(injections).toBe(0);
  await page.getByRole("button", { name: "End voice", exact: true }).click();
});
