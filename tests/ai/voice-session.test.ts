import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceSession, type VoiceConnection, type VoiceConnectionEvent, type VoiceCredential } from "@/lib/ai/voice-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function connection() {
  const listeners = new Set<(event: VoiceConnectionEvent) => void>();
  return {
    connect: vi.fn<VoiceConnection["connect"]>().mockResolvedValue(undefined),
    close: vi.fn(),
    interrupt: vi.fn(),
    subscribe(listener: (event: VoiceConnectionEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit(event: VoiceConnectionEvent) { for (const listener of listeners) listener(event); },
  } satisfies VoiceConnection & { emit(event: VoiceConnectionEvent): void };
}

const credential = (): VoiceCredential => ({ clientSecret: "ek_test_only", expiresAt: new Date(Date.now() + 60_000).toISOString() });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("voice lifecycle", () => {
  it("starts idle, publishes SDK activity, interrupts, stops, and unsubscribes", async () => {
    const sdk = connection();
    const voice = createVoiceSession({ credentialProvider: async () => credential(), createConnection: () => sdk });
    expect(voice.getState()).toBe("idle");
    const changed = vi.fn();
    const unsubscribe = voice.subscribe(changed);
    await voice.start({ sessionId: "session" });
    expect(sdk.connect).toHaveBeenCalledWith("ek_test_only");
    expect(voice.getState()).toBe("listening");
    sdk.emit({ type: "speaking" });
    expect(voice.getState()).toBe("speaking");
    voice.interrupt();
    expect(sdk.interrupt).toHaveBeenCalledOnce();
    expect(voice.getState()).toBe("interrupted");
    sdk.emit({ type: "listening" });
    expect(voice.getState()).toBe("listening");
    unsubscribe();
    const count = changed.mock.calls.length;
    await voice.stop();
    await voice.stop();
    expect(sdk.close).toHaveBeenCalledOnce();
    expect(voice.getState()).toBe("idle");
    expect(changed).toHaveBeenCalledTimes(count);
    sdk.emit({ type: "speaking" });
    expect(voice.getState()).toBe("idle");
  });

  it("coalesces repeated starts and closes a pending connection when stopped", async () => {
    const pending = deferred<void>();
    const sdk = connection();
    sdk.connect.mockReturnValue(pending.promise);
    const factory = vi.fn(() => sdk);
    const provider = vi.fn(async () => credential());
    const voice = createVoiceSession({ credentialProvider: provider, createConnection: factory });
    const first = voice.start({ sessionId: "session" });
    const second = voice.start({ sessionId: "session" });
    expect(first).toBe(second);
    await vi.waitFor(() => expect(sdk.connect).toHaveBeenCalledOnce());
    await voice.stop();
    await first;
    expect(sdk.close).toHaveBeenCalledOnce();
    pending.resolve();
    expect(factory).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledOnce();
    expect(voice.getState()).toBe("idle");
  });

  it("cancels before credential retrieval without opening a microphone connection", async () => {
    const token = deferred<VoiceCredential>();
    const factory = vi.fn(() => connection());
    const voice = createVoiceSession({ credentialProvider: () => token.promise, createConnection: factory });
    const starting = voice.start({ sessionId: "session" });
    await voice.stop();
    await starting;
    token.resolve(credential());
    await Promise.resolve();
    expect(factory).not.toHaveBeenCalled();
    expect(voice.getState()).toBe("idle");
  });

  it("closes a factory result that arrives after Stop and permits a fresh attempt", async () => {
    const late = deferred<VoiceConnection>();
    const old = connection();
    const fresh = connection();
    const factory = vi.fn<() => Promise<VoiceConnection> | VoiceConnection>().mockReturnValueOnce(late.promise).mockReturnValueOnce(fresh);
    const voice = createVoiceSession({ credentialProvider: async () => credential(), createConnection: factory });
    const starting = voice.start({ sessionId: "old-session" });
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    await voice.stop();
    await starting;
    await voice.start({ sessionId: "new-session" });
    late.resolve(old);
    await vi.waitFor(() => expect(old.close).toHaveBeenCalledOnce());
    expect(old.connect).not.toHaveBeenCalled();
    expect(voice.getState()).toBe("listening");
    await voice.stop();
  });

  it.each(["missing", "expired", "malformed"])("rejects %s credentials before constructing the SDK", async (kind) => {
    const factory = vi.fn(() => connection());
    const token = kind === "missing" ? { clientSecret: "", expiresAt: "" } :
      kind === "expired" ? { ...credential(), expiresAt: new Date(0).toISOString() } :
      { ...credential(), clientSecret: "token with whitespace" };
    const voice = createVoiceSession({ credentialProvider: async () => token, createConnection: factory });
    await expect(voice.start({ sessionId: "session" })).rejects.toThrow("short-lived credential");
    expect(factory).not.toHaveBeenCalled();
    expect(voice.getState()).toBe("error");
  });

  it("sanitizes failures, cleans up, and allows retry after denied permission", async () => {
    const sdk = connection();
    sdk.connect.mockRejectedValueOnce(new DOMException("sensitive provider detail", "NotAllowedError"));
    const voice = createVoiceSession({ credentialProvider: async () => credential(), createConnection: () => sdk });
    await expect(voice.start({ sessionId: "session" })).rejects.toThrow("permission was denied");
    expect(sdk.close).toHaveBeenCalledOnce();
    expect(voice.getSnapshot().error).not.toContain("sensitive");
    await voice.start({ sessionId: "session" });
    expect(voice.getState()).toBe("listening");
    await voice.stop();
  });

  it("handles asynchronous SDK errors and unexpected disconnects without retaining a connection", async () => {
    const sdk = connection();
    const voice = createVoiceSession({ credentialProvider: async () => credential(), createConnection: () => sdk });
    await voice.start({ sessionId: "session" });
    sdk.emit({ type: "error", error: new Error("secret raw response") });
    expect(voice.getState()).toBe("error");
    expect(voice.getSnapshot().error).not.toContain("secret");
    expect(sdk.close).toHaveBeenCalledOnce();
    await voice.start({ sessionId: "session" });
    sdk.emit({ type: "disconnected" });
    expect(voice.getSnapshot().error).toContain("disconnected");
    expect(sdk.close).toHaveBeenCalledTimes(2);
  });

  it("bounds a connection attempt even if the SDK never settles", async () => {
    vi.useFakeTimers();
    const sdk = connection();
    sdk.connect.mockReturnValue(new Promise(() => {}));
    const voice = createVoiceSession({ credentialProvider: async () => credential(), createConnection: () => sdk, connectTimeoutMs: 100 });
    const starting = voice.start({ sessionId: "session" });
    const rejected = expect(starting).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(sdk.close).toHaveBeenCalledOnce();
    expect(voice.getState()).toBe("error");
  });

  it("handles unavailable credential endpoint without echoing its response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret details", { status: 503 })));
    const factory = vi.fn(() => connection());
    const voice = createVoiceSession({ createConnection: factory });
    await expect(voice.start({ sessionId: "session" })).rejects.toThrow("Voice credentials are unavailable");
    expect(factory).not.toHaveBeenCalled();
    expect(voice.getSnapshot().error).not.toContain("secret details");
  });
});
