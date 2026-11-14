import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSdkVoiceConnection, type VoiceDiagnostics } from "@/lib/ai/sdk-voice-connection";
import { createVoiceSession } from "@/lib/ai/voice-session";
import { NEWTON_TUTOR_INSTRUCTIONS } from "@/lib/ai/tutor-instructions";

const sdk = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  micHandlers: new Map<string, (...args: unknown[]) => void>(),
  options: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), clearHistory: vi.fn(),
  subscription: vi.fn(),
  micStart: vi.fn(), micStop: vi.fn(), sendAudio: vi.fn(),
  queue: vi.fn(), interrupt: vi.fn(), dispose: vi.fn(), remaining: vi.fn(),
  inject: vi.fn(), inputVolume: vi.fn(), outputVolume: vi.fn(),
  playerOptions: vi.fn(), playerMuted: false,
  frame: undefined as ((frame: ArrayBuffer) => void) | undefined,
}));

vi.mock("@deepgram/agents", () => ({
  AgentSession: class {
    constructor(options: unknown) { sdk.options(options); }
    on(name: string, listener: (...args: unknown[]) => void) { sdk.subscription(name); sdk.handlers.set(name, listener); }
    removeAllListeners() { sdk.handlers.clear(); }
    connect = sdk.connect;
    disconnect = sdk.disconnect;
    clearConversationHistory = sdk.clearHistory;
    sendAudio = sdk.sendAudio;
    injectUserMessage = sdk.inject;
  },
  AgentMicrophone: class {
    constructor(frame: (frame: ArrayBuffer) => void) {
      // Match the installed SDK: mute suppresses new frame callbacks.
      sdk.frame = (data) => { if (!this.muted) frame(data); };
    }
    on(name: string, listener: (...args: unknown[]) => void) { sdk.micHandlers.set(name, listener); }
    off(name: string) { sdk.micHandlers.delete(name); }
    start = sdk.micStart;
    stop = sdk.micStop;
    muted = false;
    mute() { this.muted = true; }
    unmute() { this.muted = false; }
    getInputVolume = sdk.inputVolume;
  },
  AgentPlayer: class {
    constructor(options: unknown) { sdk.playerOptions(options); }
    queue = sdk.queue;
    interrupt = sdk.interrupt;
    dispose = sdk.dispose;
    getRemainingPlaybackTime = sdk.remaining;
    get muted() { return sdk.playerMuted; }
    volume = 1;
    getOutputVolume = sdk.outputVolume;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sdk.handlers.clear(); sdk.micHandlers.clear();
  sdk.connect.mockImplementation(async () => {
    sdk.handlers.get("connected")?.();
    sdk.handlers.get("welcome")?.();
    sdk.handlers.get("settings-applied")?.();
  });
  sdk.micStart.mockResolvedValue(undefined);
  sdk.remaining.mockReturnValue(0);
  sdk.inputVolume.mockReturnValue(0.4);
  sdk.outputVolume.mockReturnValue(0.2);
  sdk.playerMuted = false;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const token = "header.payload.signature";

it("uses a managed Standard LLM without a BYO endpoint or raw API key", async () => {
  const connection = await createSdkVoiceConnection();
  const starting = connection.connect(token);
  const options = sdk.options.mock.calls[0][0];
  expect(options.agent.think.provider).toEqual({ type: "open_ai", model: "gpt-4o-mini" });
  expect(options.agent.think.prompt).toBe(NEWTON_TUTOR_INSTRUCTIONS);
  expect(options.agent.think).not.toHaveProperty("endpoint");
  expect(options.auth).not.toHaveProperty("apiKey");
  expect(await options.auth.tokenFactory()).toBe(token);
  expect(options.reconnect.enabled).toBe(false);
  expect(options.audio.output).toEqual({ encoding: "linear16", sampleRate: 24_000 });
  expect(sdk.playerOptions).toHaveBeenCalledWith({ sampleRate: 24_000 });
  await starting;
  expect(sdk.micStart).toHaveBeenCalledOnce();
  sdk.frame?.(new ArrayBuffer(2));
  expect(sdk.sendAudio).toHaveBeenCalledOnce();
  connection.close();
  expect(sdk.micStop).toHaveBeenCalled();
  expect(sdk.disconnect).toHaveBeenCalledOnce();
  expect(sdk.dispose).toHaveBeenCalledOnce();
  expect(sdk.clearHistory).toHaveBeenCalledOnce();
  expect(await options.auth.tokenFactory()).toBe("");
});

it("waits for settings before opening the microphone", async () => {
  sdk.connect.mockResolvedValueOnce(undefined);
  const connection = await createSdkVoiceConnection();
  const starting = connection.connect(token);
  await Promise.resolve();
  expect(sdk.micStart).not.toHaveBeenCalled();
  sdk.handlers.get("settings-applied")?.();
  await starting;
  connection.close();
});

it("queues a response after idle speech detection without requiring agent-started-speaking", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  // Reproduce the live trace: one ambient/user detection, user text, assistant
  // text segments and binary audio, with no AgentStartedSpeaking message.
  sdk.handlers.get("user-started-speaking")?.();
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "Question" });
  for (let i = 0; i < 5; i++) {
    sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Response segment" });
    sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  }
  expect(sdk.queue).toHaveBeenCalledTimes(5);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    agentAudioChunks: 5, droppedAudioChunks: 0, playback: "queued",
  }));
  connection.close();
});

it("allows the next spoken response after an interruption without replaying stale chunks", async () => {
  const connection = await createSdkVoiceConnection();
  await connection.connect(token);
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "First response" });
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  sdk.handlers.get("user-started-speaking")?.();
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  expect(sdk.queue).toHaveBeenCalledOnce();
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "Follow-up" });
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "New response" });
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  expect(sdk.queue).toHaveBeenCalledTimes(2);
  connection.close();
});

it("keeps stale binary and metadata suppressed until an acknowledged new user/assistant exchange", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  const first = new ArrayBuffer(960), stale = new ArrayBuffer(480), next = new ArrayBuffer(1920);
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Old response" });
  sdk.handlers.get("audio")?.(first);
  connection.interrupt();
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Late old segment" });
  sdk.handlers.get("agent-started-speaking")?.();
  sdk.handlers.get("audio")?.(stale);
  sdk.handlers.get("agent-audio-done")?.();
  sdk.handlers.get("audio")?.(stale);
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "New question" });
  sdk.handlers.get("audio")?.(stale);
  expect(sdk.queue).toHaveBeenCalledExactlyOnceWith(first);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    discardingInterruptedResponse: true, droppedAudioChunks: 3, playerInterruptions: 1,
  }));
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "New response" });
  sdk.handlers.get("audio")?.(next);
  expect(sdk.queue).toHaveBeenLastCalledWith(next);
  expect(sdk.queue.mock.calls.some(([chunk]) => chunk === stale)).toBe(false);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    discardingInterruptedResponse: false, queuedAudioChunks: 2, droppedAudioChunks: 3,
  }));
  connection.close();
});

it("does not poison playback after manual interruption while idle", async () => {
  const connection = await createSdkVoiceConnection();
  await connection.connect(token);
  connection.interrupt();
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  expect(sdk.queue).toHaveBeenCalledOnce();
  connection.close();
});

it("suppresses a response interrupted after its text but before its first audio chunk", async () => {
  const connection = await createSdkVoiceConnection();
  await connection.connect(token);
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Pending speech" });
  sdk.handlers.get("user-started-speaking")?.();
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  expect(sdk.interrupt).toHaveBeenCalledOnce();
  expect(sdk.queue).not.toHaveBeenCalled();
  connection.close();
});

it("plays the injected-question response despite idle ambient speech detection", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn(), onTextProbeReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady });
  await connection.connect(token);
  sdk.handlers.get("user-started-speaking")?.();
  expect(sdk.interrupt).not.toHaveBeenCalled();
  const inject = onTextProbeReady.mock.calls[0][0] as () => boolean;
  expect(inject()).toBe(true);
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "Injected question" });
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Response" });
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  expect(sdk.queue).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    injections: 1, queuedAudioChunks: 1, droppedAudioChunks: 0, agentStartedEvents: 0,
  }));
  connection.close();
});

it("distinguishes SDK muted queue calls from application guard drops", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  sdk.playerMuted = true;
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  expect(sdk.queue).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    agentAudioChunks: 1, queuedAudioChunks: 0, mutedQueueAudioChunks: 1, droppedAudioChunks: 0,
  }));
  connection.close();
});

it("flushes buffered playback on cleanup and never queues or publishes late audio", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  const receiveAudio = sdk.handlers.get("audio");
  receiveAudio?.(new ArrayBuffer(960));
  sdk.remaining.mockReturnValue(1);
  sdk.handlers.get("agent-audio-done")?.();
  connection.close();
  const calls = onUpdate.mock.calls.length;
  receiveAudio?.(new ArrayBuffer(960));
  expect(sdk.queue).toHaveBeenCalledOnce();
  expect(sdk.interrupt).toHaveBeenCalledOnce();
  expect(sdk.dispose).toHaveBeenCalledOnce();
  expect(sdk.micStop).toHaveBeenCalledOnce();
  expect(sdk.disconnect).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenCalledTimes(calls);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    playback: "stopped", cleanupInterruptions: 1, playerInterruptions: 0, droppedAudioChunks: 0,
  }));
  expect(vi.getTimerCount()).toBe(0);
});

it("interrupts on natural speech and suppresses the rest of a manually interrupted turn", async () => {
  const connection = await createSdkVoiceConnection();
  const changed = vi.fn();
  connection.subscribe(changed);
  await connection.connect(token);
  const audio = new ArrayBuffer(4);
  sdk.handlers.get("audio")?.(audio);
  expect(changed).toHaveBeenLastCalledWith({ type: "speaking" });
  sdk.handlers.get("user-started-speaking")?.();
  expect(sdk.interrupt).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenLastCalledWith({ type: "interrupted" });
  sdk.handlers.get("audio")?.(audio);
  expect(sdk.queue).toHaveBeenCalledOnce();
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "New question" });
  sdk.handlers.get("agent-started-speaking")?.();
  sdk.handlers.get("audio")?.(audio);
  expect(sdk.queue).toHaveBeenCalledTimes(2);
  connection.interrupt();
  sdk.handlers.get("audio")?.(audio);
  expect(sdk.queue).toHaveBeenCalledTimes(2);
  connection.close();
});

it("does not report listening until queued playback has drained", async () => {
  vi.useFakeTimers();
  const connection = await createSdkVoiceConnection();
  const changed = vi.fn(); connection.subscribe(changed);
  await connection.connect(token);
  sdk.handlers.get("audio")?.(new ArrayBuffer(2));
  sdk.remaining.mockReturnValue(0.5);
  sdk.handlers.get("agent-audio-done")?.();
  await vi.advanceTimersByTimeAsync(499);
  expect(changed).toHaveBeenLastCalledWith({ type: "speaking" });
  sdk.remaining.mockReturnValue(0);
  await vi.advanceTimersByTimeAsync(30);
  expect(changed).toHaveBeenLastCalledWith({ type: "listening" });
  connection.close();
});

it("keeps checking playback after repeated assistant metadata and completes only once", async () => {
  vi.useFakeTimers();
  const connection = await createSdkVoiceConnection();
  const changed = vi.fn(); connection.subscribe(changed);
  await connection.connect(token);
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Response" });
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  sdk.remaining.mockReturnValue(0.5);
  sdk.handlers.get("agent-audio-done")?.();
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Response" });
  sdk.handlers.get("agent-started-speaking")?.();
  sdk.handlers.get("agent-started-speaking")?.();
  sdk.remaining.mockReturnValue(0);
  await vi.advanceTimersByTimeAsync(250);
  expect(changed).toHaveBeenLastCalledWith({ type: "listening" });
  sdk.handlers.get("agent-audio-done")?.();
  expect(changed.mock.calls.filter(([event]) => event.type === "listening")).toHaveLength(1);
  expect(sdk.queue).toHaveBeenCalledOnce();
  expect(sdk.interrupt).not.toHaveBeenCalled();
  connection.close();
});

it("prevents duplicate diagnostic injections before a response and permits the next completed turn", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onTextProbeReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate: vi.fn(), onTextProbeReady });
  await connection.connect(token);
  const inject = onTextProbeReady.mock.calls[0][0] as () => boolean;
  expect(inject()).toBe(true);
  expect(inject()).toBe(false);
  expect(sdk.inject).toHaveBeenCalledOnce();
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "Probe" });
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "Response" });
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  sdk.remaining.mockReturnValue(1);
  sdk.handlers.get("agent-audio-done")?.();
  expect(inject()).toBe(false);
  sdk.remaining.mockReturnValue(0);
  // A repeated server marker must not restart the response or complete twice.
  sdk.handlers.get("agent-audio-done")?.();
  await vi.advanceTimersByTimeAsync(250);
  expect(inject()).toBe(true);
  expect(sdk.inject).toHaveBeenCalledTimes(2);
  connection.close();
});

it("completes two ordinary responses on the same connection without replay or interruption", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  const first = new ArrayBuffer(960), second = new ArrayBuffer(480);
  for (const audio of [first, second]) {
    sdk.handlers.get("user-started-speaking")?.();
    sdk.handlers.get("conversation-text")?.({ role: "user", content: "PRIVATE QUESTION" });
    sdk.handlers.get("agent-thinking")?.();
    sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "PRIVATE ANSWER" });
    sdk.handlers.get("audio")?.(audio);
    sdk.handlers.get("agent-audio-done")?.();
  }
  expect(sdk.queue.mock.calls).toEqual([[first], [second]]);
  expect(sdk.interrupt).not.toHaveBeenCalled();
  expect(sdk.connect).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    responseStarts: 2, agentAudioDoneEvents: 2, playbackCompletions: 2,
    userTranscripts: 2, agentTranscripts: 2, reconnectAttempts: 0, playerInterruptions: 0,
  }));
  connection.close();
});

it("records real barge-in immediately, ignores repeated idle detections, and keeps stale audio suppressed", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  sdk.remaining.mockReturnValue(1);
  sdk.handlers.get("user-started-speaking")?.();
  expect(sdk.interrupt).toHaveBeenCalledOnce(); // No transcript confirmation or debounce.
  sdk.remaining.mockReturnValue(0); // The real SDK flushes its queue on interruption.
  sdk.handlers.get("user-started-speaking")?.();
  sdk.handlers.get("audio")?.(new ArrayBuffer(480));
  expect(sdk.interrupt).toHaveBeenCalledOnce();
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "PRIVATE NEW QUESTION" });
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "PRIVATE NEW ANSWER" });
  sdk.handlers.get("audio")?.(new ArrayBuffer(1920));
  connection.interrupt();
  expect(sdk.interrupt).toHaveBeenCalledTimes(2);
  const latest = onUpdate.mock.lastCall?.[0] as VoiceDiagnostics;
  expect(latest).toMatchObject({
    userSpeechEvents: 2, speechDuringPlayback: 1, repeatedSpeechEvents: 1,
    speechInterruptions: 1, manualInterruptions: 1, playerInterruptions: 2,
    queuedAudioChunks: 2, droppedAudioChunks: 1,
  });
  expect(latest.trace.map((event) => event.event)).toEqual(expect.arrayContaining(["user-speech", "speech-interrupt", "manual-interrupt"]));
  expect(JSON.stringify(latest)).not.toContain("PRIVATE");
  connection.close();
});

it("isolates capture with explicit microphone mute without interrupting playback", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn(), onMicrophoneControlReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn(), onMicrophoneControlReady });
  await connection.connect(token);
  const toggle = onMicrophoneControlReady.mock.calls[0][0] as () => void;
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  sdk.frame?.(new ArrayBuffer(256));
  expect(sdk.sendAudio).toHaveBeenCalledOnce(); // Full duplex is preserved by default.
  toggle();
  sdk.frame?.(new ArrayBuffer(256));
  expect(sdk.sendAudio).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(3500);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ microphoneMuted: true, inputLevel: 0, codes: [] }));
  expect(sdk.interrupt).not.toHaveBeenCalled();
  expect(sdk.micStop).not.toHaveBeenCalled();
  toggle();
  sdk.frame?.(new ArrayBuffer(256));
  expect(sdk.sendAudio).toHaveBeenCalledTimes(2);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ microphoneMuted: false }));
  connection.close();
  expect(onMicrophoneControlReady).toHaveBeenLastCalledWith(null);
  const calls = onUpdate.mock.calls.length;
  toggle();
  expect(onUpdate).toHaveBeenCalledTimes(calls);
});

it("makes repeated settings/events idempotent and bounds sanitized event traces", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn(), onTextProbeReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady });
  await connection.connect(token);
  sdk.handlers.get("settings-applied")?.();
  expect(onTextProbeReady).toHaveBeenCalledOnce();
  expect(sdk.micStart).toHaveBeenCalledOnce();
  const names = sdk.subscription.mock.calls.map(([name]) => name);
  expect(new Set(names).size).toBe(names.length);
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  for (let i = 0; i < 50; i++) {
    sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "PRIVATE REPETITION" });
    sdk.handlers.get("agent-started-speaking")?.();
  }
  sdk.handlers.get("agent-audio-done")?.();
  sdk.handlers.get("agent-audio-done")?.();
  const latest = onUpdate.mock.lastCall?.[0] as VoiceDiagnostics;
  expect(latest).toMatchObject({ responseStarts: 1, playbackCompletions: 1, repeatedAudioDoneEvents: 1 });
  expect(latest.trace).toHaveLength(40);
  expect(latest.trace.every((event) => event.atMs >= 0 && Number.isInteger(event.sequence))).toBe(true);
  expect(JSON.stringify(latest)).not.toContain("PRIVATE");
  expect(sdk.queue).toHaveBeenCalledOnce();
  connection.close();
});

it("releases injection guards on refusal and synchronous SDK failure", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onTextProbeReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate: vi.fn(), onTextProbeReady });
  await connection.connect(token);
  const inject = onTextProbeReady.mock.calls[0][0] as () => boolean;
  expect(inject()).toBe(true);
  sdk.handlers.get("injection-refused")?.();
  expect(inject()).toBe(true);
  sdk.handlers.get("injection-refused")?.();
  sdk.inject.mockImplementationOnce(() => { throw new Error("PRIVATE"); });
  expect(inject()).toBe(false);
  expect(inject()).toBe(true);
  connection.close();
});

it("cleans up an unexpected disconnect and recovers only through one explicit fresh start", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const credentialProvider = vi.fn(async () => ({ clientSecret: token, expiresAt: new Date(Date.now() + 30_000).toISOString() }));
  const createConnection = vi.fn(() => createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() }));
  const voice = createVoiceSession({ credentialProvider, createConnection });
  const first = voice.start({ sessionId: "local" });
  expect(voice.start({ sessionId: "local" })).toBe(first);
  await first;
  sdk.handlers.get("audio")?.(new ArrayBuffer(960));
  sdk.handlers.get("disconnected")?.("PRIVATE REASON");
  expect(voice.getState()).toBe("error");
  expect(sdk.micStop).toHaveBeenCalledOnce();
  expect(sdk.dispose).toHaveBeenCalledOnce();
  expect(sdk.handlers.size).toBe(0);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ unexpectedDisconnections: 1, reconnectAttempts: 0, cleanupInterruptions: 1 }));
  await vi.advanceTimersByTimeAsync(10_000);
  expect(sdk.connect).toHaveBeenCalledOnce();
  await voice.start({ sessionId: "local" });
  await voice.start({ sessionId: "local" }); // Already active: no connection/listener duplication.
  expect(sdk.connect).toHaveBeenCalledTimes(2);
  expect(credentialProvider).toHaveBeenCalledTimes(2);
  expect(createConnection).toHaveBeenCalledTimes(2);
  expect(voice.getState()).toBe("listening");
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ responseStarts: 0, agentAudioChunks: 0, unexpectedDisconnections: 0 }));
  expect(sdk.queue).toHaveBeenCalledOnce(); // No old audio replay.
  await voice.stop();
  expect(sdk.micStop).toHaveBeenCalledTimes(2);
  expect(sdk.dispose).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores callbacks retained from a closed session after a new session starts", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const oldUpdate = vi.fn(), nextUpdate = vi.fn();
  const old = await createSdkVoiceConnection({ onUpdate: oldUpdate, onTextProbeReady: vi.fn() });
  await old.connect(token);
  const late = new Map(sdk.handlers);
  old.close();
  const next = await createSdkVoiceConnection({ onUpdate: nextUpdate, onTextProbeReady: vi.fn() });
  await next.connect(token);
  const count = oldUpdate.mock.calls.length;
  late.get("conversation-text")?.({ role: "assistant", content: "PRIVATE OLD TEXT" });
  late.get("agent-started-speaking")?.();
  late.get("user-started-speaking")?.();
  late.get("agent-thinking")?.();
  late.get("agent-audio-done")?.();
  late.get("connected")?.();
  late.get("welcome")?.();
  late.get("reconnecting")?.();
  late.get("disconnected")?.();
  late.get("warning")?.({ code: "INVALID_SETTINGS" });
  late.get("error")?.({ code: "FAILED_TO_THINK" });
  late.get("sdk-error")?.(new Error("PRIVATE"));
  late.get("injection-refused")?.();
  late.get("audio")?.(new ArrayBuffer(960));
  expect(oldUpdate).toHaveBeenCalledTimes(count);
  expect(nextUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ connection: "connected", agentAudioChunks: 0 }));
  expect(sdk.queue).not.toHaveBeenCalled();
  next.close();
});

it("does not mistake wall time for playback progress when the audio clock is suspended", async () => {
  vi.useFakeTimers();
  const connection = await createSdkVoiceConnection();
  const changed = vi.fn(); connection.subscribe(changed);
  await connection.connect(token);
  sdk.handlers.get("audio")?.(new ArrayBuffer(2));
  sdk.remaining.mockReturnValue(0.5);
  sdk.handlers.get("agent-audio-done")?.();
  await vi.advanceTimersByTimeAsync(1500);
  expect(changed).toHaveBeenLastCalledWith({ type: "speaking" });
  sdk.remaining.mockReturnValue(0);
  await vi.advanceTimersByTimeAsync(250);
  expect(changed).toHaveBeenLastCalledWith({ type: "listening" });
  connection.close();
  expect(vi.getTimerCount()).toBe(0);
});

it("releases a microphone that finishes starting after Stop", async () => {
  let resolve!: () => void;
  sdk.micStart.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
  const connection = await createSdkVoiceConnection();
  const starting = connection.connect(token);
  await vi.waitFor(() => expect(sdk.micStart).toHaveBeenCalledOnce());
  connection.close();
  resolve();
  await starting;
  expect(sdk.micStop).toHaveBeenCalledTimes(2);
  expect(sdk.handlers.size).toBe(0);
  expect(sdk.micHandlers.size).toBe(0);
  sdk.frame?.(new ArrayBuffer(2));
  expect(sdk.sendAudio).not.toHaveBeenCalled();
});

it("finishes cleanup after an SDK failure and rejects raw keys before connecting", async () => {
  const connection = await createSdkVoiceConnection();
  await expect(connection.connect("raw-deepgram-api-key")).rejects.toThrow("bearer token");
  expect(sdk.connect).not.toHaveBeenCalled();
  sdk.disconnect.mockImplementationOnce(() => { throw new Error("Close failed"); });
  connection.close(); connection.close();
  expect(sdk.dispose).toHaveBeenCalledOnce();
  expect(sdk.micStop).toHaveBeenCalledOnce();
});

it("reports capture, forwarding and conversation checkpoints without transcript content", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn(); const onTextProbeReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady });
  await connection.connect(token);
  sdk.frame?.(new Int16Array(128).fill(4096).buffer);
  sdk.handlers.get("user-started-speaking")?.();
  sdk.handlers.get("conversation-text")?.({ role: "user", content: "PRIVATE STUDENT TEXT" });
  sdk.handlers.get("agent-thinking")?.();
  sdk.handlers.get("conversation-text")?.({ role: "assistant", content: "PRIVATE AGENT TEXT" });
  sdk.handlers.get("agent-started-speaking")?.();
  sdk.handlers.get("audio")?.(new ArrayBuffer(128));
  await vi.advanceTimersByTimeAsync(250);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    connection: "connected", welcome: true, settingsApplied: true, microphone: "capturing",
    framesCaptured: 1, framesForwarded: 1, bytesForwarded: 256, userSpeechEvents: 1,
    userTranscripts: 1, agentTranscripts: 1, thinkingEvents: 1, agentAudioChunks: 1,
    inputLevel: 0.125, outputLevel: 0.2, playerMuted: false, microphoneMuted: false,
  }));
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain("PRIVATE");
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain(token);
  connection.close();
  expect(onTextProbeReady).toHaveBeenLastCalledWith(null);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    connection: "disconnected", microphone: "stopped", playback: "stopped", settingsApplied: false,
  }));
  const calls = onUpdate.mock.calls.length;
  sdk.frame?.(new ArrayBuffer(256));
  await vi.advanceTimersByTimeAsync(500);
  expect(onUpdate).toHaveBeenCalledTimes(calls);
});

it("permits the fixed text probe only after settings and refuses it after close", async () => {
  vi.stubEnv("NODE_ENV", "development");
  sdk.connect.mockResolvedValueOnce(undefined);
  const onTextProbeReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate: vi.fn(), onTextProbeReady });
  const starting = connection.connect(token);
  await Promise.resolve();
  expect(onTextProbeReady).not.toHaveBeenCalled();
  sdk.frame?.(new ArrayBuffer(256));
  expect(sdk.sendAudio).not.toHaveBeenCalled();
  sdk.handlers.get("connected")?.();
  sdk.handlers.get("settings-applied")?.();
  await starting;
  const inject = onTextProbeReady.mock.calls[0][0] as () => boolean;
  expect(inject()).toBe(true);
  expect(sdk.inject).toHaveBeenCalledExactlyOnceWith("Can you explain the distributive property?");
  connection.close();
  expect(inject()).toBe(false);
  expect(sdk.inject).toHaveBeenCalledOnce();
});

it("shows allowlisted error/warning codes and injection refusal without leaking provider data", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  sdk.handlers.get("warning")?.({ code: token, description: "PRIVATE" });
  sdk.handlers.get("warning")?.({ code: "THINK_REQUEST_FAILED", description: "PRIVATE" });
  sdk.handlers.get("injection-refused")?.({ content: "PRIVATE" });
  sdk.handlers.get("error")?.({ code: "FAILED_TO_THINK", description: "PRIVATE" });
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    codes: ["PROVIDER_WARNING", "THINK_REQUEST_FAILED", "INJECTION_REFUSED", "FAILED_TO_THINK"],
  }));
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain("PRIVATE");
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain(token);
  connection.close();
});

it("warns when microphone startup succeeds but no frames arrive", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  await vi.advanceTimersByTimeAsync(3500);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    framesCaptured: 0, codes: ["NO_CAPTURED_FRAMES"],
  }));
  connection.close();
  expect(vi.getTimerCount()).toBe(0);
});

it("reports microphone permission failure and cleans up the connection", async () => {
  vi.stubEnv("NODE_ENV", "development");
  sdk.micStart.mockRejectedValueOnce(new DOMException("PRIVATE", "NotAllowedError"));
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await expect(connection.connect(token)).rejects.toThrow();
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    microphone: "failed", codes: ["MICROPHONE_PERMISSION_DENIED"], connection: "disconnected",
  }));
  expect(sdk.disconnect).toHaveBeenCalledOnce();
  expect(sdk.micStop).toHaveBeenCalled();
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain("PRIVATE");
});

it("distinguishes stalled capture from an initial microphone with no frames", async () => {
  vi.useFakeTimers(); vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  await connection.connect(token);
  sdk.frame?.(new Int16Array([4096]).buffer);
  await vi.advanceTimersByTimeAsync(3500);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    framesCaptured: 1, inputLevel: 0, codes: ["CAPTURE_STALLED"],
  }));
  connection.close();
});

it("ignores a late permission rejection after Stop instead of overwriting diagnostics", async () => {
  vi.stubEnv("NODE_ENV", "development");
  let reject!: (error: Error) => void;
  sdk.micStart.mockReturnValueOnce(new Promise<void>((_, fail) => { reject = fail; }));
  const onUpdate = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  const starting = connection.connect(token);
  await vi.waitFor(() => expect(sdk.micStart).toHaveBeenCalledOnce());
  connection.close();
  const calls = onUpdate.mock.calls.length;
  reject(new DOMException("PRIVATE", "NotAllowedError"));
  await expect(starting).rejects.toThrow();
  expect(onUpdate).toHaveBeenCalledTimes(calls);
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ microphone: "stopped" }));
});

it("never enables diagnostic callbacks or text injection in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const onUpdate = vi.fn(), onTextProbeReady = vi.fn(), onMicrophoneControlReady = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady, onMicrophoneControlReady });
  await connection.connect(token);
  sdk.frame?.(new ArrayBuffer(256));
  sdk.handlers.get("warning")?.({ code: "INVALID_SETTINGS" });
  expect(onUpdate).not.toHaveBeenCalled();
  expect(onTextProbeReady).not.toHaveBeenCalled();
  expect(onMicrophoneControlReady).not.toHaveBeenCalled();
  expect(sdk.inject).not.toHaveBeenCalled();
  connection.close();
});

it("distinguishes a captured frame from a failed forwarding attempt", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const onUpdate = vi.fn(); const listener = vi.fn();
  const connection = await createSdkVoiceConnection({ onUpdate, onTextProbeReady: vi.fn() });
  connection.subscribe(listener);
  await connection.connect(token);
  sdk.sendAudio.mockImplementationOnce(() => { throw new Error("PRIVATE"); });
  sdk.frame?.(new ArrayBuffer(256));
  expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    framesCaptured: 1, framesForwarded: 0, bytesForwarded: 0, codes: ["AUDIO_FORWARD_FAILED"],
  }));
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ type: "error" }));
  expect(JSON.stringify(onUpdate.mock.calls)).not.toContain("PRIVATE");
  connection.close();
});
