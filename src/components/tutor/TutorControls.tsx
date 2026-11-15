"use client";
import { useState, type ReactNode } from "react";
import type { VoiceSnapshot } from "@/lib/ai/voice-session";
import { PRACTICE_EXPRESSION, isSupportedProblem, type DistributionCheck } from "@/lib/math/check-distribution";
import { normalizeExpression } from "@/components/whiteboard/expressions";

function problemError(text: string): string {
  if (!text.trim()) return "Enter a problem such as 4(x+3).";
  if (text.includes("=")) return "Enter only the expression to expand, without =.";
  try { normalizeExpression(text); } catch (error) { return error instanceof Error ? error.message : "Check the problem's symbols."; }
  return isSupportedProblem(text) ? "" : "Use a number times a sum or difference with one variable, such as 4(x+3).";
}

export default function TutorControls({ voice = { state: "unavailable" }, voiceAvailable = false, feedback = null, problem = PRACTICE_EXPRESSION, onProblemChange, memoryControls, onStart, onStop, onInterrupt, onCheck, onHint }: {
  voice?: VoiceSnapshot; voiceAvailable?: boolean;
  memoryControls?: ReactNode;
  feedback?: { result: DistributionCheck; showHint: boolean; delivery: string } | null;
  problem?: string; onProblemChange?: (problem: string) => void;
  onStart?: () => void; onStop?: () => void; onInterrupt?: () => void; onCheck?: () => void; onHint?: () => void;
}) {
  const active = ["connecting", "listening", "speaking", "interrupted", "stopping"].includes(voice.state);
  const [problemDraft, setProblemDraft] = useState("");
  const [problemMessage, setProblemMessage] = useState("");
  const proposed = feedback?.result.proposedProblem;
  return <section className="workspace-panel" aria-labelledby="tutor-title">
    <div className="panel-heading"><span className="panel-symbol" aria-hidden="true">n</span><h2 id="tutor-title">Your thinking partner</h2></div>
    <span className="connection-label" role="status">Voice: {voiceAvailable ? voice.state : "unavailable"}</span>
    <p>Active problem: <strong>{problem}</strong>. Expand it in Structured input, or write it on the whiteboard and use Read handwriting. You can include the problem and your step separated by =.</p>
    {onProblemChange && <form className="problem-form" onSubmit={(event) => {
      event.preventDefault();
      const error = problemError(problemDraft);
      setProblemMessage(error);
      if (!error) { onProblemChange(problemDraft.trim()); setProblemDraft(""); }
    }}>
      <label htmlFor="problem-input">Change problem</label>
      <span className="problem-row"><input id="problem-input" value={problemDraft} maxLength={100} autoComplete="off" spellCheck={false} placeholder="4(x+3)"
        aria-invalid={!!problemMessage} aria-describedby={problemMessage ? "problem-error" : undefined} onChange={(event) => { setProblemDraft(event.target.value); setProblemMessage(""); }} />
      <button className="small-button" type="submit">Set problem</button></span>
      {problemMessage && <p id="problem-error" role="alert" className="input-error">{problemMessage}</p>}
    </form>}
    <button className="workspace-button" type="button" onClick={onStart} disabled={!voiceAvailable || active} aria-describedby="tutor-note">Start voice</button>
    {voiceAvailable && <>
      <button className="workspace-button secondary" type="button" onClick={onStop} disabled={!active}>End voice</button>
      <button className="workspace-button secondary" type="button" onClick={onInterrupt} disabled={voice.state !== "speaking"}>Interrupt playback</button>
    </>}
    {voice.error && <p role="alert">{voice.error}</p>}
    <button className="workspace-button secondary" type="button" onClick={onCheck} disabled={!onCheck}>Check work</button>
    <button className="workspace-button secondary" type="button" onClick={onHint} disabled={!onHint}>Ask for a hint</button>
    <p id="tutor-note" className="helper">{voiceAvailable ? "Check work submits your typed or confirmed step to active voice, so you can ask for a hint aloud. Edits clear the submitted step. If a response is in progress, voice ends to prevent outdated guidance; start again when ready." : "Checks run locally on your typed or confirmed step. Voice awaits authentication and owned study sessions; your microphone is off."}</p>
    {process.env.NODE_ENV === "development" && voiceAvailable && voice.context && <p className="helper" data-testid="voice-context-status">
      Context: {voice.context.status} · Revision: {voice.context.revisionId}{voice.context.code ? ` · ${voice.context.code}` : ""}
    </p>}
    {feedback && <div className="tutor-feedback" aria-live="polite" aria-atomic="true">
      <h3>{feedback.result.status === "correct" ? "Correct step" : feedback.result.status === "incorrect" ? "Check your expansion" : "Not checked"}</h3>
      {feedback.result.submission && <p>Submitted: <code>{feedback.result.submission}</code></p>}
      <p>{feedback.result.feedback}</p>
      {feedback.showHint && <p>{feedback.result.hint}</p>}
      {proposed && onProblemChange && <button className="small-button" type="button" onClick={() => onProblemChange(proposed)}>Use {proposed} as the active problem</button>}
      {feedback.delivery && <p role="status">{feedback.delivery}</p>}
    </div>}
    {memoryControls}
    <p className="helper">Checks compare linear expressions for all variable values; they do not solve equations. Handwriting is only transcribed for you to confirm, never graded by the reading service. Work is saved on this device. During a signed-in study session, supported checks save a short learning observation. Full transcriptions, hints, audio and conversations are not saved to learning history.</p>
  </section>;
}
