"use client";

import { useEffect, useRef } from "react";
import { reviewDraft } from "./handwriting";

export type HandwritingState =
  | { revisionId: string; phase: "reading" }
  | { revisionId: string; phase: "review"; ambiguous: boolean; draft: string }
  | { revisionId: string; phase: "unreadable" }
  | { revisionId: string; phase: "error"; message: string }
  | { revisionId: string; phase: "confirmed"; draft: string; expression: string };

/** Student-confirmed transcription. The model's text is only a draft until the student confirms it. */
export default function HandwritingReview({ state, onDraft, onConfirm, onEdit, onReadAgain, onDismiss }: {
  state: HandwritingState;
  onDraft(draft: string): void; onConfirm(): void; onEdit(): void; onReadAgain(): void; onDismiss(): void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const reviewing = state.phase === "review";
  useEffect(() => { if (reviewing) field.current?.focus(); }, [reviewing]);
  const draftCheck = state.phase === "review" ? reviewDraft(state.draft) : null;
  // The ambiguity notice already explains unresolved ? marks; avoid repeating it as a field error.
  const showDraftError = !!draftCheck?.error && !(state.phase === "review" && state.ambiguous && state.draft.includes("?"));
  return <section className="capture-popover handwriting-review" aria-label="Handwriting transcription">
    <button type="button" className="icon-button dismiss-capture" aria-label="Dismiss handwriting transcription" onClick={onDismiss}>×</button>
    <div className="capture-feedback" aria-live="polite" aria-atomic="true">
      {state.phase === "reading" && <p role="status">Reading your handwriting... Only the drawing is sent, and nothing is saved.</p>}
      {state.phase === "unreadable" && <p>Newton couldn&apos;t read this handwriting. Try writing larger and more clearly, type what you wrote, or switch to Structured input.</p>}
      {state.phase === "error" && <p role="alert" className="input-error">{state.message}</p>}
      {state.phase === "confirmed" && <p>Confirmed: <code>{state.expression}</code>. Open Newton and choose Check work or Ask for a hint.</p>}
    </div>
    {state.phase === "review" && <form className="transcription-review" onSubmit={(event) => { event.preventDefault(); if (!draftCheck?.error) onConfirm(); }}>
      <p className="eyebrow">Check the transcription</p>
      <p className="helper">Newton copies what you wrote without correcting or grading it. Edit anything that doesn&apos;t match your work.</p>
      {state.ambiguous && <p id="transcription-ambiguous" className="input-error">Some symbols were unclear and are shown as ?. Replace each ? with what you wrote.</p>}
      <label htmlFor="transcription-input">What you wrote</label>
      <input ref={field} id="transcription-input" className="transcription-input" value={state.draft} maxLength={200} autoComplete="off" spellCheck={false} autoCapitalize="off"
        aria-invalid={!!draftCheck?.error} aria-describedby={showDraftError ? "transcription-error" : state.phase === "review" && state.ambiguous ? "transcription-ambiguous" : undefined} onChange={(event) => onDraft(event.target.value)} />
      {showDraftError ? <p id="transcription-error" className="input-error">{draftCheck!.error}</p> : !draftCheck?.error && <p className="expression-preview">Plain expression: <code>{draftCheck?.expression}</code></p>}
      <div className="transcription-actions">
        <button className="small-button" type="submit" disabled={!!draftCheck?.error}>Confirm transcription</button>
        <button className="text-button" type="button" onClick={onReadAgain}>Read again</button>
      </div>
    </form>}
    {state.phase === "unreadable" && <div className="transcription-actions"><button className="small-button" type="button" onClick={onEdit}>Type what I wrote</button><button className="text-button" type="button" onClick={onReadAgain}>Read again</button></div>}
    {state.phase === "error" && <div className="transcription-actions"><button className="text-button" type="button" onClick={onReadAgain}>Try again</button></div>}
    {state.phase === "confirmed" && <div className="transcription-actions"><button className="text-button" type="button" onClick={onEdit}>Edit transcription</button></div>}
  </section>;
}
