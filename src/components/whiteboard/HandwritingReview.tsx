"use client";

import { useEffect, useRef } from "react";
import { reviewDraft } from "./handwriting";

export type HandwritingState =
  | { revisionId: string; phase: "reading" }
  | { revisionId: string; phase: "review"; ambiguous: boolean; draft: string; image?: string }
  | { revisionId: string; phase: "unreadable"; image?: string }
  | { revisionId: string; phase: "error"; message: string }
  | { revisionId: string; phase: "confirmed"; draft: string; expression: string; image?: string };

/** Student-confirmed transcription. The model's text is only a draft until the student confirms it. */
export default function HandwritingReview({ state, onDraft, onConfirm, onEdit, onReadAgain, onDismiss }: {
  state: HandwritingState;
  onDraft(draft: string): void; onConfirm(): void; onEdit(): void; onReadAgain(): void; onDismiss(): void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const reviewing = state.phase === "review";
  useEffect(() => {
    if (!reviewing) return;
    field.current?.focus({ preventScroll: true });
    // Keep Confirm visible on short screens by scrolling only this popover, never the page.
    const popover = actions.current?.closest(".handwriting-review");
    const overflow = popover && actions.current ? actions.current.getBoundingClientRect().bottom - popover.getBoundingClientRect().bottom + 12 : 0;
    if (popover && overflow > 0) popover.scrollTop += overflow;
  }, [reviewing]);
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
      <p className="helper">Newton copied this without correcting or grading it. Compare it with your drawing and fix any symbol that doesn&apos;t match; k, b, 6 and 2 are easy to confuse.</p>
      {state.ambiguous && <p id="transcription-ambiguous" className="input-error">Some symbols were unclear and are shown as ?. Replace each ? with what you wrote.</p>}
      {/* Image beside the field on wide panels, above it on narrow ones; actions always follow the field. */}
      <div className="transcription-compare">
        {state.image && <ReadImage image={state.image} />}
        <div className="transcription-field">
          <label htmlFor="transcription-input">What you wrote</label>
          <input ref={field} id="transcription-input" className="transcription-input" value={state.draft} maxLength={200} autoComplete="off" spellCheck={false} autoCapitalize="off"
            aria-invalid={!!draftCheck?.error} aria-describedby={showDraftError ? "transcription-error" : state.phase === "review" && state.ambiguous ? "transcription-ambiguous" : undefined} onChange={(event) => onDraft(event.target.value)} />
          {showDraftError ? <p id="transcription-error" className="input-error">{draftCheck!.error}</p> : !draftCheck?.error && <p className="expression-preview">Plain expression: <code>{draftCheck?.expression}</code></p>}
          <div ref={actions} className="transcription-actions">
            <button className="small-button" type="submit" disabled={!!draftCheck?.error}>Confirm transcription</button>
            <button className="text-button" type="button" onClick={onReadAgain}>Read again</button>
          </div>
        </div>
      </div>
    </form>}
    {state.phase === "unreadable" && state.image && <ReadImage image={state.image} />}
    {state.phase === "unreadable" && <div className="transcription-actions"><button className="small-button" type="button" onClick={onEdit}>Type what I wrote</button><button className="text-button" type="button" onClick={onReadAgain}>Read again</button></div>}
    {state.phase === "error" && <div className="transcription-actions"><button className="text-button" type="button" onClick={onReadAgain}>Try again</button></div>}
    {state.phase === "confirmed" && <div className="transcription-actions"><button className="text-button" type="button" onClick={onEdit}>Edit transcription</button></div>}
  </section>;
}

/** The exact image sent for reading, kept only in memory so the student can compare symbols. */
function ReadImage({ image }: { image: string }) {
  return <figure className="transcription-image">
    <img src={image} alt="The drawing Newton read" /* eslint-disable-line @next/next/no-img-element */ />
    {process.env.NODE_ENV === "development" && <figcaption><a className="text-button" href={image} download="newton-read-image.png">Download the exact image read (development only)</a></figcaption>}
  </figure>;
}
