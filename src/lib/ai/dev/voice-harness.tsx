"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createSdkVoiceConnection } from "../sdk-voice-connection";
import { createVoiceSession, createCredentialProvider } from "../voice-session";

export default function VoiceHarness({ tokenCapability }: { tokenCapability: string }) {
  const [session] = useState(() => createVoiceSession({
    createConnection: createSdkVoiceConnection,
    credentialProvider: createCredentialProvider({ "X-Newton-Voice-Dev": tokenCapability }),
  }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const active = ["connecting", "listening", "speaking", "interrupted", "stopping"].includes(snapshot.state);

  useEffect(() => {
    const stop = () => { void session.stop(); };
    window.addEventListener("pagehide", stop);
    return () => { window.removeEventListener("pagehide", stop); stop(); };
  }, [session]);

  async function start() {
    try { await session.start({ sessionId: "local-voice-test" }); }
    catch { /* The adapter publishes a sanitized error below. */ }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Newton voice diagnostics</h1>
      <p>Local development only. Start requests a short-lived Deepgram token from this loopback server. Your API key stays on the server.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => { void start(); }} disabled={active} className="rounded bg-ink px-4 py-3 text-paper disabled:opacity-50">Start Conversation</button>
        <button type="button" onClick={() => { void session.stop(); }} disabled={!active} className="rounded border border-line px-4 py-3 disabled:opacity-50">End Conversation</button>
        <button type="button" onClick={() => session.interrupt()} disabled={snapshot.state !== "speaking"} className="rounded border border-line px-4 py-3 disabled:opacity-50">Interrupt playback</button>
      </div>
      <p role="status" aria-live="polite">Voice status: {snapshot.state}</p>
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      <p className="text-sm">Speak to begin. Try asking about 2(x + 3), talk over a response, then end the conversation and check that the browser microphone indicator turns off. Manual interruption silences the current playback turn; speak to naturally interrupt the agent. No transcripts or recordings are saved by this harness.</p>
    </main>
  );
}
