import type { VoiceSnapshot } from "@/lib/ai/voice-session";
import { PRACTICE_EXPRESSION, type DistributionCheck } from "@/lib/math/check-distribution";

export default function TutorControls({ voice = { state: "unavailable" }, voiceAvailable = false, feedback = null, onStart, onStop, onInterrupt, onCheck, onHint }: {
  voice?: VoiceSnapshot; voiceAvailable?: boolean;
  feedback?: { result: DistributionCheck; showHint: boolean; delivery: string } | null;
  onStart?: () => void; onStop?: () => void; onInterrupt?: () => void; onCheck?: () => void; onHint?: () => void;
}) {
  const active = ["connecting", "listening", "speaking", "interrupted", "stopping"].includes(voice.state);
  return <section className="workspace-panel" aria-labelledby="tutor-title">
    <div className="panel-heading"><span className="panel-symbol" aria-hidden="true">n</span><h2 id="tutor-title">Your thinking partner</h2></div>
    <span className="connection-label" role="status">Voice: {voiceAvailable ? voice.state : "unavailable"}</span>
    <p>Expansion practice: <strong>{PRACTICE_EXPRESSION}</strong>. Enter your expansion in Structured input, or include an original distributive expression and your step separated by =.</p>
    <button className="workspace-button" type="button" onClick={onStart} disabled={!voiceAvailable || active} aria-describedby="tutor-note">Start voice</button>
    {voiceAvailable && <>
      <button className="workspace-button secondary" type="button" onClick={onStop} disabled={!active}>End voice</button>
      <button className="workspace-button secondary" type="button" onClick={onInterrupt} disabled={voice.state !== "speaking"}>Interrupt playback</button>
    </>}
    {voice.error && <p role="alert">{voice.error}</p>}
    <button className="workspace-button secondary" type="button" onClick={onCheck} disabled={!onCheck}>Check work</button>
    <button className="workspace-button secondary" type="button" onClick={onHint} disabled={!onHint}>Ask for a hint</button>
    <p id="tutor-note" className="helper">{voiceAvailable ? "Check work submits your structured step to active voice, so you can ask for a hint aloud. Edits clear the submitted step. If a response is in progress, voice ends to prevent outdated guidance; start again when ready." : "Structured math checks work locally. Voice awaits authentication and owned study sessions; your microphone is off."}</p>
    {process.env.NODE_ENV === "development" && voiceAvailable && voice.context && <p className="helper" data-testid="voice-context-status">
      Context: {voice.context.status} · Revision: {voice.context.revisionId}{voice.context.code ? ` · ${voice.context.code}` : ""}
    </p>}
    {feedback && <div className="tutor-feedback" aria-live="polite" aria-atomic="true">
      <h3>{feedback.result.status === "correct" ? "Correct step" : feedback.result.status === "incorrect" ? "Check your expansion" : "Not checked"}</h3>
      {feedback.result.submission && <p>Submitted: <code>{feedback.result.submission}</code></p>}
      <p>{feedback.result.feedback}</p>
      {feedback.showHint && <p>{feedback.result.hint}</p>}
      {feedback.delivery && <p role="status">{feedback.delivery}</p>}
    </div>}
    <p className="helper">Checks compare linear expressions for all variable values; they do not solve equations or read handwriting. No work or learning history is saved.</p>
  </section>;
}
