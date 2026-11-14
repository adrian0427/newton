import { NEWTON_AGENT_SETTINGS } from "./realtime-config";
import type { VoiceConnection, VoiceConnectionEvent } from "./voice-session";

/** Browser only. Deepgram manages STT/LLM/TTS and turn-taking; its SDK handles audio I/O. */
export async function createSdkVoiceConnection(): Promise<VoiceConnection> {
  const { AgentSession, AgentMicrophone, AgentPlayer } = await import("@deepgram/agents");
  let bearer = "";
  const session = new AgentSession({
    auth: { tokenFactory: async () => bearer },
    agent: NEWTON_AGENT_SETTINGS,
    audio: { input: { encoding: "linear16", sampleRate: 16_000 }, output: { encoding: "linear16", sampleRate: 24_000 } },
    reconnect: { enabled: false },
  });
  const player = new AgentPlayer({ sampleRate: 24_000 });
  let closed = false;
  let settingsApplied = false;
  let tutorSpeaking = false;
  let dropCurrentTurn = false;
  let playbackTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(event: VoiceConnectionEvent) => void>();
  const emit = (event: VoiceConnectionEvent) => { if (!closed) for (const listener of listeners) listener(event); };
  const mic = new AgentMicrophone((frame) => {
    if (!closed && settingsApplied) session.sendAudio(frame);
  }, { sampleRate: 16_000, echoCancellation: true, noiseSuppression: true });
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {}); // A stop/error can happen before connect awaits settings.

  function interrupt() {
    if (closed) return;
    clearTimeout(playbackTimer);
    player.interrupt();
    dropCurrentTurn = true;
    tutorSpeaking = false;
    emit({ type: "interrupted" });
  }

  function reportError(error: unknown) { emit({ type: "error", error }); }
  session.on("settings-applied", () => { settingsApplied = true; resolveReady(); });
  session.on("audio", (chunk) => {
    if (closed || dropCurrentTurn) return;
    try {
      clearTimeout(playbackTimer);
      player.queue(chunk);
      tutorSpeaking = true;
      emit({ type: "speaking" });
    } catch (error) { reportError(error); }
  });
  session.on("agent-started-speaking", () => { clearTimeout(playbackTimer); dropCurrentTurn = false; });
  session.on("user-started-speaking", () => {
    if (tutorSpeaking) interrupt();
    else {
      player.interrupt();
      dropCurrentTurn = true;
      emit({ type: "listening" });
    }
  });
  session.on("agent-audio-done", () => {
    clearTimeout(playbackTimer);
    playbackTimer = setTimeout(() => {
      tutorSpeaking = false;
      emit({ type: "listening" });
    }, Math.max(0, player.getRemainingPlaybackTime()) * 1000 + 20);
  });
  session.on("error", reportError);
  session.on("sdk-error", reportError);
  session.on("disconnected", () => emit({ type: "disconnected" }));
  mic.on("error", reportError);

  function close() {
    if (closed) return;
    closed = true;
    bearer = "";
    clearTimeout(playbackTimer);
    listeners.clear();
    rejectReady(new Error("Voice connection closed"));
    // Complete every teardown even if one SDK cleanup operation throws.
    for (const teardown of [
      () => session.removeAllListeners(),
      () => mic.off("error", reportError),
      () => session.disconnect(),
      () => session.clearConversationHistory(),
      () => mic.stop(),
      () => player.interrupt(),
      () => player.dispose(),
    ]) {
      try { teardown(); } catch { /* Continue releasing the remaining resources. */ }
    }
  }

  return {
    async connect(clientSecret) {
      if (closed) return;
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clientSecret)) throw new Error("Temporary bearer token required");
      bearer = clientSecret;
      try {
        await session.connect();
        if (closed) return;
        await ready;
        if (closed) return;
        await mic.start();
      } catch (error) {
        close();
        throw error;
      } finally {
        bearer = "";
        // SDK permission requests cannot be aborted. Release a stream arriving after Stop.
        if (closed) { try { mic.stop(); } catch { /* Already stopping. */ } }
      }
    },
    interrupt,
    close,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
