import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSdkVoiceConnection } from "@/lib/ai/sdk-voice-connection";

const sdk = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  micHandlers: new Map<string, (...args: unknown[]) => void>(),
  options: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), clearHistory: vi.fn(),
  micStart: vi.fn(), micStop: vi.fn(), sendAudio: vi.fn(),
  queue: vi.fn(), interrupt: vi.fn(), dispose: vi.fn(), remaining: vi.fn(),
  frame: undefined as ((frame: ArrayBuffer) => void) | undefined,
}));

vi.mock("@deepgram/agents", () => ({
  AgentSession: class {
    constructor(options: unknown) { sdk.options(options); }
    on(name: string, listener: (...args: unknown[]) => void) { sdk.handlers.set(name, listener); }
    removeAllListeners() { sdk.handlers.clear(); }
    connect = sdk.connect;
    disconnect = sdk.disconnect;
    clearConversationHistory = sdk.clearHistory;
    sendAudio = sdk.sendAudio;
  },
  AgentMicrophone: class {
    constructor(frame: (frame: ArrayBuffer) => void) { sdk.frame = frame; }
    on(name: string, listener: (...args: unknown[]) => void) { sdk.micHandlers.set(name, listener); }
    off(name: string) { sdk.micHandlers.delete(name); }
    start = sdk.micStart;
    stop = sdk.micStop;
  },
  AgentPlayer: class {
    queue = sdk.queue;
    interrupt = sdk.interrupt;
    dispose = sdk.dispose;
    getRemainingPlaybackTime = sdk.remaining;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sdk.handlers.clear(); sdk.micHandlers.clear();
  sdk.connect.mockImplementation(async () => { sdk.handlers.get("settings-applied")?.(); });
  sdk.micStart.mockResolvedValue(undefined);
  sdk.remaining.mockReturnValue(0);
});
afterEach(() => vi.useRealTimers());

const token = "header.payload.signature";

it("uses a managed Standard LLM without a BYO endpoint or raw API key", async () => {
  const connection = await createSdkVoiceConnection();
  const starting = connection.connect(token);
  const options = sdk.options.mock.calls[0][0];
  expect(options.agent.think.provider).toEqual({ type: "open_ai", model: "gpt-4o-mini" });
  expect(options.agent.think).not.toHaveProperty("endpoint");
  expect(options.auth).not.toHaveProperty("apiKey");
  expect(await options.auth.tokenFactory()).toBe(token);
  expect(options.reconnect.enabled).toBe(false);
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
  await vi.advanceTimersByTimeAsync(30);
  expect(changed).toHaveBeenLastCalledWith({ type: "listening" });
  connection.close();
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
