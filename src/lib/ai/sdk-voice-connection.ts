import { NEWTON_AGENT_SETTINGS } from "./realtime-config";
import type { VoiceConnection, VoiceConnectionEvent } from "./voice-session";
import { tutoringPrompt, validTutoringContext, type TutoringContext } from "./tutoring-context";

type DiagnosticEvent = "connect" | "connected" | "settings-applied" | "user-speech" | "user-text" |
  "assistant-text" | "thinking" | "agent-started-speaking" | "response-audio-start" | "server-audio-done" | "repeated-audio-done" |
  "playback-complete" | "speech-interrupt" | "manual-interrupt" | "inject" | "injection-blocked" |
  "mic-muted" | "mic-unmuted" | "reconnecting" | "disconnected" | "cleanup";
type DiagnosticTrace = { sequence: number; atMs: number; event: DiagnosticEvent; stream: number;
  queuedSeconds: number; inputLevel: number; outputLevel: number };

/** Local diagnostics contain only counters, levels and fixed/allowlisted codes. */
export type VoiceDiagnostics = {
  connection: "idle" | "connecting" | "connected" | "disconnected";
  welcome: boolean;
  settingsApplied: boolean;
  microphone: "idle" | "requesting" | "capturing" | "failed" | "stopped";
  microphoneMuted: boolean;
  inputLevel: number;
  framesCaptured: number;
  framesForwarded: number;
  bytesForwarded: number;
  userSpeechEvents: number;
  speechDuringPlayback: number;
  repeatedSpeechEvents: number;
  userTranscripts: number;
  agentTranscripts: number;
  thinkingEvents: number;
  thinking: boolean;
  agentAudioChunks: number;
  queuedAudioChunks: number;
  droppedAudioChunks: number;
  mutedQueueAudioChunks: number;
  queueErrors: number;
  playerInterruptions: number;
  speechInterruptions: number;
  manualInterruptions: number;
  cleanupInterruptions: number;
  agentStartedEvents: number;
  responseStarts: number;
  agentAudioDoneEvents: number;
  repeatedAudioDoneEvents: number;
  playbackCompletions: number;
  connectionEvents: number;
  reconnectAttempts: number;
  unexpectedDisconnections: number;
  discardingInterruptedResponse: boolean;
  playback: "idle" | "queued" | "interrupted" | "stopped";
  playerMuted: boolean;
  playerVolume: number;
  outputLevel: number;
  playbackSeconds: number;
  injections: number;
  injectionPending: boolean;
  blockedInjections: number;
  trace: DiagnosticTrace[];
  codes: string[];
};

export const INITIAL_VOICE_DIAGNOSTICS: VoiceDiagnostics = {
  connection: "idle", welcome: false, settingsApplied: false, microphone: "idle",
  microphoneMuted: false, inputLevel: 0, framesCaptured: 0, framesForwarded: 0, bytesForwarded: 0,
  userSpeechEvents: 0, userTranscripts: 0, agentTranscripts: 0, thinkingEvents: 0, thinking: false,
  speechDuringPlayback: 0, repeatedSpeechEvents: 0, speechInterruptions: 0, manualInterruptions: 0,
  agentAudioChunks: 0, queuedAudioChunks: 0, droppedAudioChunks: 0, mutedQueueAudioChunks: 0,
  queueErrors: 0, playerInterruptions: 0, cleanupInterruptions: 0, agentStartedEvents: 0,
  discardingInterruptedResponse: false, playback: "idle", playerMuted: false, playerVolume: 1,
  outputLevel: 0, playbackSeconds: 0, injections: 0, codes: [],
  responseStarts: 0, agentAudioDoneEvents: 0, repeatedAudioDoneEvents: 0, playbackCompletions: 0,
  connectionEvents: 0, reconnectAttempts: 0, unexpectedDisconnections: 0,
  injectionPending: false, blockedInjections: 0, trace: [],
};

type DevelopmentDiagnostics = {
  onUpdate: (snapshot: VoiceDiagnostics) => void;
  onTextProbeReady: (inject: (() => boolean) | null) => void;
  onMicrophoneControlReady?: (toggle: (() => void) | null) => void;
};

// Never display descriptions, messages, request IDs, transcripts, or arbitrary code strings.
const PROVIDER_CODES = new Set([
  "INTERNAL_SERVER_ERROR", "CLIENT_MESSAGE_TIMEOUT", "UNPARSABLE_CLIENT_MESSAGE",
  "NON_SETTINGS_MESSAGE_BEFORE_SETTINGS", "SETTINGS_ALREADY_APPLIED", "INVALID_SETTINGS",
  "FAILED_TO_START_LISTENING", "ASR_CONNECTION_CLOSED", "ASR_DRIVER_TIMEOUT", "USER_AUDIO_FORMAT",
  "FAILED_TO_SPEAK", "FAILED_TO_THINK", "SERVER_GOING_AWAY", "MAXIMUM_SESSION_LENGTH_REACHED",
  "NON_EXISTENT_FUNCTION_CALLED", "AGENT_ID_NOT_SUPPORTED", "INVALID_AGENT_ID",
  "INJECT_AGENT_MESSAGE_DURING_USER_SPEECH", "INJECT_AGENT_MESSAGE_DURING_AGENT_SPEECH",
  "PROMPT_TOO_LONG", "THINK_REQUEST_FAILED", "SPEAK_REQUEST_FAILED", "FUNCTION_CALL_FAILED",
  "SLOW_THINK_REQUEST", "SLOW_SPEAK_REQUEST", "FORCE_END_TURN_UNSUPPORTED",
  "GPT_4O_STREAM_END_ERROR", "MAXIMUM_SESSION_LENGTH_APPROACHING", "THINK_MODEL_MIP_OPT_OUT_UNSUPPORTED",
]);
function providerCode(value: unknown, fallback: string) {
  if (typeof value === "object" && value !== null && "code" in value &&
      typeof value.code === "string" && PROVIDER_CODES.has(value.code)) return value.code;
  return fallback;
}

/** Browser only. Deepgram manages STT/LLM/TTS and turn-taking; its SDK handles audio I/O. */
export async function createSdkVoiceConnection(development?: DevelopmentDiagnostics): Promise<VoiceConnection> {
  const diagnostics = process.env.NODE_ENV === "development" ? development : undefined;
  const { AgentSession, AgentMicrophone, AgentPlayer } = await import("@deepgram/agents");
  let bearer = "";
  const agent = { ...NEWTON_AGENT_SETTINGS, think: { ...NEWTON_AGENT_SETTINGS.think } };
  const session = new AgentSession({
    auth: { tokenFactory: async () => bearer },
    agent,
    audio: { input: { encoding: "linear16", sampleRate: 16_000 }, output: { encoding: "linear16", sampleRate: 24_000 } },
    reconnect: { enabled: false },
  });
  const player = new AgentPlayer({ sampleRate: 24_000 });
  let closed = false;
  let settingsApplied = false;
  let tutorSpeaking = false;
  let responseActive = false;
  let dropCurrentTurn = false;
  let newUserTurnAfterInterrupt = false;
  let audioRevision = 0;
  let lastDoneRevision = -1;
  let lastPlayedRevision = 0;
  let draining = false;
  let audioStreamOpen = false;
  let speechAwaitingTranscript = false;
  let playbackTimer: ReturnType<typeof setTimeout> | undefined;
  let diagnosticTimer: ReturnType<typeof setInterval> | undefined;
  let captureStartedAt = 0;
  let lastFrameAt = 0;
  let contextPending: { resolve: (applied: boolean) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  let contextFailed = false;
  const startedAt = Date.now();
  let traceSequence = 0;
  const stats: VoiceDiagnostics = { ...INITIAL_VOICE_DIAGNOSTICS, codes: [], trace: [] };
  function publishDiagnostics() {
    diagnostics?.onUpdate({ ...stats, discardingInterruptedResponse: dropCurrentTurn, codes: [...stats.codes], trace: [...stats.trace] });
  }
  function trace(event: DiagnosticEvent) {
    if (!diagnostics) return;
    stats.trace = [...stats.trace, { sequence: ++traceSequence, atMs: Math.max(0, Date.now() - startedAt),
      event, stream: stats.responseStarts, queuedSeconds: player.getRemainingPlaybackTime(),
      inputLevel: stats.inputLevel, outputLevel: player.getOutputVolume() }].slice(-40);
  }
  function code(value: string) {
    if (!diagnostics) return;
    stats.codes = [...stats.codes.filter((item) => item !== value), value].slice(-8);
    publishDiagnostics();
  }
  const listeners = new Set<(event: VoiceConnectionEvent) => void>();
  const emit = (event: VoiceConnectionEvent) => { if (!closed) for (const listener of listeners) listener(event); };
  const mic = new AgentMicrophone((frame) => {
    if (closed) return;
    if (diagnostics) {
      stats.framesCaptured++;
      lastFrameAt = Date.now();
      // Aggregate energy only; never retain the PCM frame or sample values.
      const samples = new Int16Array(frame, 0, Math.floor(frame.byteLength / 2));
      let sum = 0;
      for (const sample of samples) sum += (sample / 32768) ** 2;
      stats.inputLevel = samples.length ? Math.sqrt(sum / samples.length) : 0;
    }
    if (settingsApplied && !contextPending && !contextFailed) {
      try {
        session.sendAudio(frame);
        if (diagnostics) { stats.framesForwarded++; stats.bytesForwarded += frame.byteLength; }
      } catch (error) { code("AUDIO_FORWARD_FAILED"); reportError(error); }
    }
  }, { sampleRate: 16_000, echoCancellation: true, noiseSuppression: true });
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {}); // A stop/error can happen before connect awaits settings.

  function interrupt(cause: "manual" | "speech" = "manual") {
    if (closed) return;
    trace(cause === "speech" ? "speech-interrupt" : "manual-interrupt");
    // An idle speech/noise detection must not blacklist the next response.
    if (responseActive || tutorSpeaking || stats.injectionPending || player.getRemainingPlaybackTime() > 0) {
      dropCurrentTurn = true;
      newUserTurnAfterInterrupt = false;
    }
    clearTimeout(playbackTimer);
    draining = false;
    audioStreamOpen = false;
    player.interrupt();
    stats.playerInterruptions++;
    if (cause === "speech") stats.speechInterruptions++;
    else stats.manualInterruptions++;
    stats.injectionPending = false;
    responseActive = false;
    tutorSpeaking = false;
    stats.playback = "interrupted";
    publishDiagnostics();
    emit({ type: "interrupted" });
  }

  function reportError(error: unknown) { emit({ type: "error", error }); }
  function finishContext(applied: boolean) {
    const pending = contextPending;
    if (!pending) return;
    contextPending = undefined;
    clearTimeout(pending.timer);
    contextFailed = !applied;
    pending.resolve(applied);
  }
  function updateContext(context: TutoringContext): Promise<boolean> {
    if (closed || !settingsApplied || stats.connection !== "connected" || contextPending || contextFailed || !validTutoringContext(context)) return Promise.resolve(false);
    // An unlabelled binary response cannot be reassigned to a newer work revision.
    // The owner closes on false and keeps the new context for explicit restart.
    if (speechAwaitingTranscript || responseActive || tutorSpeaking || stats.injectionPending ||
        (dropCurrentTurn && stats.playback === "interrupted") || player.getRemainingPlaybackTime() > 0) return Promise.resolve(false);
    dropCurrentTurn = true;
    newUserTurnAfterInterrupt = false;
    return new Promise((resolve) => {
      contextPending = { resolve, timer: setTimeout(() => finishContext(false), 5000) };
      try {
        // UpdatePrompt appends. UpdateThink replaces the full configuration, so
        // send the same managed provider and one fresh complete prompt each time.
        session.updateThink({ ...NEWTON_AGENT_SETTINGS.think, prompt: tutoringPrompt(context) });
      } catch { finishContext(false); }
    });
  }
  function contextTrafficBlocked() {
    // Speech/response racing an update makes its revision ambiguous. Fail closed.
    if (contextPending) finishContext(false);
    return contextFailed;
  }
  function sendText(message: string): boolean {
    if (closed || contextPending || contextFailed || !settingsApplied || stats.connection !== "connected" || !message.trim() || message.length > 2000) return false;
    if (stats.injectionPending || responseActive || tutorSpeaking || player.getRemainingPlaybackTime() > 0) {
      stats.blockedInjections++; trace("injection-blocked"); publishDiagnostics(); return false;
    }
    stats.injectionPending = true;
    try {
      session.injectUserMessage(message);
      stats.injections++; trace("inject"); publishDiagnostics(); return true;
    } catch { stats.injectionPending = false; code("TEXT_INJECTION_FAILED"); return false; }
  }
  function beginAssistantResponse() {
    // Binary chunks have no turn IDs. Keep rejecting an interrupted response
    // until the ordered stream acknowledges new user text, then new assistant
    // text (or its optional started-speaking marker). No timer opens this gate.
    if (dropCurrentTurn && !newUserTurnAfterInterrupt) return;
    dropCurrentTurn = false;
    newUserTurnAfterInterrupt = false;
    responseActive = true;
    stats.thinking = false;
    // Metadata can repeat or arrive after AudioDone. Only actual new audio,
    // interruption or cleanup invalidates the queue-drain check.
  }
  function finishPlaybackWhenDrained() {
    if (closed || !draining || dropCurrentTurn) return;
    // A suspended AudioContext does not advance with wall time. Recheck the queue
    // rather than claiming to be listening while audio is still waiting to play.
    const remaining = Math.max(0, player.getRemainingPlaybackTime());
    if (remaining > 0) {
      playbackTimer = setTimeout(finishPlaybackWhenDrained, Math.min(250, remaining * 1000 + 20));
      return;
    }
    const playbackChanged = stats.playback !== "idle";
    tutorSpeaking = false;
    draining = false;
    stats.injectionPending = false;
    if (audioRevision > lastPlayedRevision) {
      lastPlayedRevision = audioRevision;
      stats.playbackCompletions++;
      trace("playback-complete");
    }
    stats.playback = "idle";
    publishDiagnostics();
    if (playbackChanged) emit({ type: "listening" });
  }
  session.on("settings-applied", () => {
    if (closed) return;
    if (settingsApplied) return;
    settingsApplied = true;
    stats.settingsApplied = true;
    trace("settings-applied");
    diagnostics?.onTextProbeReady(() => sendText("Can you explain the distributive property?"));
    diagnostics?.onMicrophoneControlReady?.(() => {
      if (closed || stats.microphone !== "capturing") return;
      if (mic.muted) {
        mic.unmute(); captureStartedAt = Date.now();
        if (lastFrameAt) lastFrameAt = Date.now();
      }
      else mic.mute();
      stats.microphoneMuted = mic.muted;
      stats.inputLevel = 0;
      trace(mic.muted ? "mic-muted" : "mic-unmuted"); publishDiagnostics();
    });
    publishDiagnostics();
    resolveReady();
  });
  session.on("connected", () => { if (closed) return; stats.connectionEvents++; stats.connection = "connected"; trace("connected"); publishDiagnostics(); });
  session.on("think-updated", () => { if (!closed) finishContext(true); });
  session.on("welcome", () => { if (closed) return; stats.welcome = true; publishDiagnostics(); });
  session.on("conversation-text", (message) => {
    if (closed || contextTrafficBlocked()) return;
    if (message.role === "user") {
      stats.userTranscripts++;
      speechAwaitingTranscript = false;
      responseActive = true;
      trace("user-text");
      if (dropCurrentTurn) newUserTurnAfterInterrupt = true;
    } else if (message.role === "assistant") {
      stats.agentTranscripts++;
      trace("assistant-text");
      beginAssistantResponse();
    }
    publishDiagnostics();
  });
  session.on("agent-thinking", () => {
    if (closed || contextTrafficBlocked()) return;
    if (!dropCurrentTurn) responseActive = true;
    stats.thinking = true; stats.thinkingEvents++; trace("thinking"); publishDiagnostics();
  });
  session.on("warning", (warning) => { if (closed) return; if (contextPending) finishContext(false); code(providerCode(warning, "PROVIDER_WARNING")); });
  session.on("injection-refused", () => { if (closed) return; stats.injectionPending = false; code("INJECTION_REFUSED"); });
  session.on("audio", (chunk) => {
    if (closed || contextTrafficBlocked()) return;
    stats.agentAudioChunks++;
    if (dropCurrentTurn) { stats.droppedAudioChunks++; publishDiagnostics(); return; }
    try {
      clearTimeout(playbackTimer);
      draining = false;
      player.queue(chunk);
      if (player.muted) { stats.mutedQueueAudioChunks++; publishDiagnostics(); return; }
      audioRevision++;
      if (!audioStreamOpen) { audioStreamOpen = true; stats.responseStarts++; trace("response-audio-start"); }
      stats.queuedAudioChunks++;
      responseActive = true;
      tutorSpeaking = true;
      stats.playback = "queued";
      publishDiagnostics();
      emit({ type: "speaking" });
    } catch (error) { stats.queueErrors++; code("PLAYBACK_FAILED"); reportError(error); }
  });
  session.on("agent-started-speaking", () => {
    if (closed || contextTrafficBlocked()) return;
    stats.agentStartedEvents++;
    trace("agent-started-speaking");
    beginAssistantResponse();
    publishDiagnostics();
  });
  session.on("user-started-speaking", () => {
    if (closed || contextTrafficBlocked()) return;
    stats.userSpeechEvents++; stats.thinking = false;
    if (speechAwaitingTranscript) stats.repeatedSpeechEvents++;
    speechAwaitingTranscript = true;
    if (player.getRemainingPlaybackTime() > 0) stats.speechDuringPlayback++;
    trace("user-speech"); publishDiagnostics();
    if (responseActive || tutorSpeaking || stats.injectionPending || player.getRemainingPlaybackTime() > 0) interrupt("speech");
    else {
      emit({ type: "listening" });
    }
  });
  session.on("agent-audio-done", () => {
    if (closed) return;
    stats.agentAudioDoneEvents++;
    // No new queued PCM is a repeated-marker indicator, not proof of a duplicate
    // turn (an utterance can contain no audio). Completion itself is idempotent.
    if (lastDoneRevision === audioRevision) {
      stats.repeatedAudioDoneEvents++; trace("repeated-audio-done");
    } else trace("server-audio-done");
    lastDoneRevision = audioRevision;
    audioStreamOpen = false;
    responseActive = false;
    stats.thinking = false;
    publishDiagnostics();
    if (dropCurrentTurn) return;
    draining = true;
    clearTimeout(playbackTimer);
    finishPlaybackWhenDrained();
  });
  session.on("error", (error) => { if (closed) return; code(providerCode(error, "PROVIDER_ERROR")); reportError(error); });
  session.on("sdk-error", (error) => { if (closed) return; code("SDK_ERROR"); reportError(error); });
  session.on("disconnected", () => {
    if (closed) return;
    stats.unexpectedDisconnections++; stats.connection = "disconnected"; trace("disconnected");
    publishDiagnostics(); emit({ type: "disconnected" });
  });
  session.on("reconnecting", () => { if (closed) return; stats.reconnectAttempts++; trace("reconnecting"); publishDiagnostics(); });
  const microphoneError = (error: unknown) => {
    if (closed) return;
    stats.microphone = "failed";
    code(error instanceof Error && error.name === "NotAllowedError" ? "MICROPHONE_PERMISSION_DENIED" : "MICROPHONE_CAPTURE_FAILED");
    reportError(error);
  };
  mic.on("error", microphoneError);

  function close() {
    if (closed) return;
    closed = true;
    bearer = "";
    clearTimeout(playbackTimer);
    clearInterval(diagnosticTimer);
    finishContext(false);
    diagnostics?.onTextProbeReady(null);
    diagnostics?.onMicrophoneControlReady?.(null);
    trace("cleanup");
    listeners.clear();
    rejectReady(new Error("Voice connection closed"));
    // Complete every teardown even if one SDK cleanup operation throws.
    for (const teardown of [
      () => session.removeAllListeners(),
      () => mic.off("error", microphoneError),
      () => session.disconnect(),
      () => session.clearConversationHistory(),
      () => mic.stop(),
      () => { stats.cleanupInterruptions++; player.interrupt(); },
      () => player.dispose(),
    ]) {
      try { teardown(); } catch { /* Continue releasing the remaining resources. */ }
    }
    responseActive = false; dropCurrentTurn = false; newUserTurnAfterInterrupt = false;
    draining = false; stats.injectionPending = false;
    stats.connection = "disconnected"; stats.settingsApplied = false; stats.thinking = false;
    if (stats.microphone !== "failed") stats.microphone = "stopped";
    stats.playback = "stopped"; stats.inputLevel = 0; stats.outputLevel = 0; stats.playbackSeconds = 0;
    publishDiagnostics();
  }

  return {
    async connect(clientSecret, context) {
      if (closed) return;
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(clientSecret)) throw new Error("Temporary bearer token required");
      bearer = clientSecret;
      agent.think.prompt = tutoringPrompt(context);
      stats.connection = "connecting"; trace("connect"); publishDiagnostics();
      if (diagnostics) diagnosticTimer = setInterval(() => {
        if (closed) return;
        stats.microphoneMuted = mic.muted;
        stats.playerMuted = player.muted;
        stats.playerVolume = player.volume;
        stats.outputLevel = player.getOutputVolume();
        stats.playbackSeconds = player.getRemainingPlaybackTime();
        if (captureStartedAt && !mic.muted && Date.now() - captureStartedAt > 3000 && stats.framesCaptured === 0) code("NO_CAPTURED_FRAMES");
        if (lastFrameAt && !mic.muted && Date.now() - lastFrameAt > 3000) { stats.inputLevel = 0; code("CAPTURE_STALLED"); }
        publishDiagnostics();
      }, 250);
      try {
        await session.connect();
        if (closed) return;
        await ready;
        if (closed) return;
        stats.microphone = "requesting"; publishDiagnostics();
        try { await mic.start(); }
        catch (error) { microphoneError(error); throw error; }
        if (!closed) { stats.microphone = "capturing"; captureStartedAt = Date.now(); publishDiagnostics(); }
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
    sendText,
    updateContext,
    close,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
