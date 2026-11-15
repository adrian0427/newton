"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { createSdkVoiceConnection, INITIAL_VOICE_DIAGNOSTICS, type VoiceDiagnostics, type VoiceProbe } from "../sdk-voice-connection";
import { createVoiceSession, createCredentialProvider } from "../voice-session";
import { SPEECH_HAZARDS } from "../speech-text";
import { submittedContext } from "../tutoring-context";
import { checkDistribution, distributionVoiceMessage } from "../../math/check-distribution";

// Fixed synthetic step for comparing a response with and without verified math context. Never student work.
const SAMPLE_CHECK = checkDistribution("7*(6*k+2)=42*k+2");

export default function VoiceHarness({ tokenCapability }: { tokenCapability: string }) {
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(INITIAL_VOICE_DIAGNOSTICS);
  const [probe, setProbe] = useState<((probe?: VoiceProbe) => boolean) | null>(null);
  const [toggleMicrophone, setToggleMicrophone] = useState<(() => void) | null>(null);
  const [session] = useState(() => createVoiceSession({
    createConnection: () => createSdkVoiceConnection({
      onUpdate: setDiagnostics,
      onTextProbeReady: (inject) => { setProbe(() => inject); },
      onMicrophoneControlReady: (toggle) => { setToggleMicrophone(() => toggle); },
    }),
    credentialProvider: createCredentialProvider({ "X-Newton-Voice-Dev": tokenCapability }),
  }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const active = ["connecting", "listening", "speaking", "interrupted", "stopping"].includes(snapshot.state);
  const probeDisabled = !probe || !diagnostics.settingsApplied || diagnostics.connection !== "connected" || diagnostics.injectionPending || diagnostics.thinking || snapshot.state === "speaking";

  useEffect(() => {
    const stop = () => { void session.stop(); };
    window.addEventListener("pagehide", stop);
    return () => { window.removeEventListener("pagehide", stop); stop(); };
  }, [session]);

  async function start() {
    if (!["idle", "error", "unavailable"].includes(session.getState())) return;
    setDiagnostics({ ...INITIAL_VOICE_DIAGNOSTICS, codes: [], trace: [] });
    setProbe(null);
    setToggleMicrophone(null);
    try { await session.start({ sessionId: "local-voice-test" }); }
    catch { /* The adapter publishes a sanitized error below. */ }
  }

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Newton voice diagnostics</h1>
      <p>Local development only. Start requests a short-lived Deepgram token from this loopback server. Your API key stays on the server.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => { void start(); }} disabled={active} className="rounded bg-ink px-4 py-3 text-paper disabled:opacity-50">Start Conversation</button>
        <button type="button" onClick={() => { void session.stop(); }} disabled={!active} className="rounded border border-line px-4 py-3 disabled:opacity-50">End Conversation</button>
        <button type="button" onClick={() => session.interrupt()} disabled={snapshot.state !== "speaking"} className="rounded border border-line px-4 py-3 disabled:opacity-50">Interrupt playback</button>
        <button type="button" onClick={() => { probe?.("explain"); }} disabled={probeDisabled} className="rounded border border-line px-4 py-3 disabled:opacity-50">Inject test question</button>
        <button type="button" onClick={() => toggleMicrophone?.()} disabled={!toggleMicrophone || diagnostics.microphone !== "capturing"} aria-pressed={diagnostics.microphoneMuted} className="rounded border border-line px-4 py-3 disabled:opacity-50">{diagnostics.microphoneMuted ? "Unmute microphone" : "Mute microphone (isolate feedback)"}</button>
      </div>
      <section aria-label="Speech artifact probes" className="space-y-3 rounded border border-line p-4">
        <h2 className="text-xl font-semibold">Speech artifact probes</h2>
        <p className="text-sm">Mute the microphone first. Speak probes bypass the language model and send fixed text straight to text-to-speech, isolating TTS and playback. The sample step installs a fixed synthetic checked step, 7(6k+2)=42k+2, through the same context path as the workspace.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => { probe?.("speak-plain"); }} disabled={probeDisabled} className="rounded border border-line px-4 py-3 disabled:opacity-50">Speak plain sentence (TTS only)</button>
          <button type="button" onClick={() => { probe?.("speak-symbols"); }} disabled={probeDisabled} className="rounded border border-line px-4 py-3 disabled:opacity-50">Speak math symbols (TTS only)</button>
          <button type="button" onClick={() => { void session.updateContext(submittedContext("harness-sample-step", SAMPLE_CHECK)); }} disabled={!active} className="rounded border border-line px-4 py-3 disabled:opacity-50">Install sample checked step</button>
          <button type="button" onClick={() => { const message = distributionVoiceMessage(SAMPLE_CHECK); if (message) session.sendText(message); }} disabled={probeDisabled || snapshot.context?.status !== "applied"} className="rounded border border-line px-4 py-3 disabled:opacity-50">Ask hint about sample step</button>
        </div>
        <p className="text-sm" role="status">Sample context: {snapshot.context ? `${snapshot.context.status}${snapshot.context.code ? ` · ${snapshot.context.code}` : ""}` : "not installed"}</p>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-sm">
          <dt>Assistant text segments / with speech hazards</dt><dd>{diagnostics.assistantTextSegments} / {diagnostics.speechHazardSegments}</dd>
          {SPEECH_HAZARDS.map((hazard) => <Fragment key={hazard}><dt>Hazard: {hazard}</dt><dd>{diagnostics.speechHazards[hazard]}</dd></Fragment>)}
        </dl>
        <p className="text-sm">Hazards are fixed categories detected in assistant text; the text itself is never shown, stored or logged. If you hear an extra letter on a turn whose trace row lists no hazard, the text was clean and the sound came from TTS or playback. If the turn lists a hazard (for example latex or isolated-letter), the model&apos;s text contained it.</p>
      </section>
      <p role="status" aria-live="polite">Voice status: {snapshot.state}</p>
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      <section aria-label="Voice pipeline diagnostics" className="space-y-3 rounded border border-line p-4">
        <h2 className="text-xl font-semibold">Pipeline checkpoints</h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-sm">
          <dt>SDK connection</dt><dd>{diagnostics.connection}</dd>
          <dt>Welcome / SettingsApplied</dt><dd>{String(diagnostics.welcome)} / {String(diagnostics.settingsApplied)}</dd>
          <dt>Microphone permission/capture</dt><dd>{diagnostics.microphone}</dd>
          <dt>SDK microphone muted / PCM input RMS</dt><dd>{String(diagnostics.microphoneMuted)} / {diagnostics.inputLevel.toFixed(2)}</dd>
          <dt>Frames captured / forwarded</dt><dd>{diagnostics.framesCaptured} / {diagnostics.framesForwarded}</dd>
          <dt>Bytes passed to sendAudio</dt><dd>{diagnostics.bytesForwarded}</dd>
          <dt>User speech detections</dt><dd>{diagnostics.userSpeechEvents}</dd>
          <dt>Speech while playback queued / repeated before user text</dt><dd>{diagnostics.speechDuringPlayback} / {diagnostics.repeatedSpeechEvents}</dd>
          <dt>User / agent transcript counts</dt><dd>{diagnostics.userTranscripts} / {diagnostics.agentTranscripts}</dd>
          <dt>Agent thinking / events</dt><dd>{String(diagnostics.thinking)} / {diagnostics.thinkingEvents}</dd>
          <dt>Audio chunks received / queued unmuted</dt><dd>{diagnostics.agentAudioChunks} / {diagnostics.queuedAudioChunks}</dd>
          <dt>Guard drops (interrupted response)</dt><dd>{diagnostics.droppedAudioChunks}</dd>
          <dt>Suppression gate / started-speaking events</dt><dd>{String(diagnostics.discardingInterruptedResponse)} / {diagnostics.agentStartedEvents}</dd>
          <dt>Muted queue calls / queue errors</dt><dd>{diagnostics.mutedQueueAudioChunks} / {diagnostics.queueErrors}</dd>
          <dt>Response interrupts / cleanup flushes</dt><dd>{diagnostics.playerInterruptions} / {diagnostics.cleanupInterruptions}</dd>
          <dt>Speech / manual interruption calls</dt><dd>{diagnostics.speechInterruptions} / {diagnostics.manualInterruptions}</dd>
          <dt>Audio stream starts / server audio done</dt><dd>{diagnostics.responseStarts} / {diagnostics.agentAudioDoneEvents}</dd>
          <dt>Playback completions / repeated done markers</dt><dd>{diagnostics.playbackCompletions} / {diagnostics.repeatedAudioDoneEvents}</dd>
          <dt>Connected events / reconnect attempts / unexpected disconnects</dt><dd>{diagnostics.connectionEvents} / {diagnostics.reconnectAttempts} / {diagnostics.unexpectedDisconnections}</dd>
          <dt>Playback / queued seconds</dt><dd>{diagnostics.playback} / {diagnostics.playbackSeconds.toFixed(2)}</dd>
          <dt>AudioContext state</dt><dd>Not exposed by SDK; compare queue and output level</dd>
          <dt>Player muted / volume / output level</dt><dd>{String(diagnostics.playerMuted)} / {diagnostics.playerVolume.toFixed(2)} / {diagnostics.outputLevel.toFixed(2)}</dd>
          <dt>Text questions injected</dt><dd>{diagnostics.injections}</dd>
          <dt>Injection pending / blocked attempts</dt><dd>{String(diagnostics.injectionPending)} / {diagnostics.blockedInjections}</dd>
          <dt>Sanitized error/warning codes</dt><dd>{diagnostics.codes.join(", ") || "none"}</dd>
        </dl>
        <p className="text-sm">Input: linear16, 16 kHz. Output: linear16, 24 kHz. Queued means an unmuted player.queue call returned, not proof of audible sound. Guard drops count chunks rejected before the player. Interrupt/cleanup counters count SDK flush calls; the SDK does not expose how many buffered chunks those calls discard. Post-close callbacks are ignored, not counted as live guard drops.</p>
        <p className="text-sm">Inject test question sends “Can you explain the distributive property?” after SettingsApplied. If text works but speech does not, inspect capture/forwarding and STT. If agent text arrives without audio, inspect TTS; if audio arrives without sound, inspect playback, browser/tab output, and audio restrictions.</p>
        <p className="text-sm">Mute microphone is an explicit diagnostic control; it stops forwarding new capture frames while playback continues. Unmute to test natural interruption. Repeated markers and speech detections are indicators, not proof of duplicated questions. Audio stream numbers are local counters, not server turn IDs. Queue depth is measured in seconds; the SDK exposes no buffered chunk count.</p>
        <details>
          <summary>Recent event trace (last 40, milliseconds since connection creation)</summary>
          <ol className="space-y-1 font-mono text-xs">
            {diagnostics.trace.map((event) => <li key={event.sequence}>#{event.sequence} +{event.atMs}ms stream {event.stream}: {event.event}{event.hazards ? ` [hazards: ${event.hazards.join(", ")}]` : ""}; queue {event.queuedSeconds.toFixed(2)}s; input {event.inputLevel.toFixed(2)}; output {event.outputLevel.toFixed(2)}</li>)}
          </ol>
        </details>
      </section>
      <p className="text-sm">Speak to begin. Try asking about 2(x + 3), talk over a response, then end the conversation and check that the browser microphone indicator turns off. Manual interruption silences the current playback turn; speak to naturally interrupt the agent. No transcripts or recordings are saved by this harness.</p>
    </main>
  );
}
