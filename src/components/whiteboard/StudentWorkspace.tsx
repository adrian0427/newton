"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import type { WorkSnapshot } from "@/types/tutoring";
import type { WhiteboardHandle } from "./Whiteboard";
import { WorkRevision, SnapshotDownload, expressionContent } from "./snapshots";
import { requestTranscription, reviewDraft } from "./handwriting";
import HandwritingReview, { type HandwritingState } from "./HandwritingReview";
import MathInput from "./MathInput";
import WorkspaceBoundary from "./WorkspaceBoundary";
import WorkspaceTutor, { type TutorWork } from "../tutor/WorkspaceTutor";
import WorksheetPane from "../worksheet/WorksheetPane";
import { loadPart, savePart } from "./persistence";
import { useWorkspaceAccount } from "./workspace-account-context";

const Whiteboard = dynamic(() => import("./Whiteboard"), { ssr: false, loading: () => <div className="board-loading" role="status">Opening your whiteboard...</div> });

export default function StudentWorkspace({ developmentVoiceCapability, storageScope }: { developmentVoiceCapability?: string; storageScope?: string } = {}) {
  const account = useWorkspaceAccount();
  const [revisions] = useState(() => new WorkRevision());
  const [revisionId, setRevisionId] = useState(revisions.current);
  const [downloads] = useState(() => new SnapshotDownload());
  const board = useRef<WhiteboardHandle>(null);
  const alive = useRef(true);
  const split = useRef<HTMLDivElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const workArea = useRef<HTMLElement>(null);
  const [splitWidth, setSplitWidth] = useState(44);
  const [mobilePane, setMobilePane] = useState<"worksheet" | "work">("worksheet");
  const [source, setSource] = useState<"whiteboard" | "expression">("whiteboard");
  const [expression, setExpression] = useState("");
  const [inputError, setInputError] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [download, setDownload] = useState<{ url: string; snapshot: WorkSnapshot } | null>(null);
  // One transcription per board revision; any content change discards it and its pending request.
  const [handwriting, setHandwriting] = useState<HandwritingState | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  // Popovers open below the work toolbar and whiteboard options, which wrap to more rows on narrow panes.
  useEffect(() => {
    const area = workArea.current;
    if (!area) return;
    const measure = () => {
      const top = area.getBoundingClientRect().top;
      const controls = [area.querySelector(".work-toolbar"), area.querySelector(".board-options")].filter((el): el is Element => !!el && el.getBoundingClientRect().height > 0);
      const bottom = Math.max(0, ...controls.map((el) => el.getBoundingClientRect().bottom - top));
      area.style.setProperty("--board-controls-bottom", `${Math.round(bottom)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    area.querySelectorAll(".work-toolbar, .board-options").forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [restored, toolsSlot, source, message, reviewOpen]);
  const reading = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; revisions.invalidate(); downloads.clear(); reading.current?.abort(); };
  }, [revisions, downloads]);

  // Restore device-local work once (restored is declared above), then save it whenever it changes.
  useEffect(() => {
    let active = true;
    void loadPart("work", storageScope).then((saved) => {
      if (!active) return;
      if (saved) { setExpression(saved.expression); setSource(saved.source); setSplitWidth(saved.splitWidth); }
      setRestored(true);
    });
    return () => { active = false; };
  }, [storageScope]);
  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => void savePart("work", { expression, source, splitWidth }, storageScope), 300);
    return () => clearTimeout(timer);
  }, [restored, expression, source, splitWidth, storageScope]);

  const changed = useCallback(() => {
    revisions.edit();
    setRevisionId(revisions.current);
    downloads.clear();
    setDownload(null);
    setMessage("");
    setFailed(false);
    reading.current?.abort();
    reading.current = null;
    setHandwriting(null);
  }, [revisions, downloads]);

  const worksheetChanged = changed;

  // Account teardown stops voice and invalidates transient reads before awaiting sign-out.
  // Saved drawings remain in their account scope; a new identity remounts this workspace.
  useEffect(() => account?.registerStop(changed), [account, changed]);

  function selectSource(next: "whiteboard" | "expression") {
    changed();
    setReviewOpen(false);
    setSource(next);
  }

  useEffect(() => {
    if (!focusMode) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) setFocusMode(false);
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [focusMode]);

  function clear() {
    changed();
    board.current?.clear();
    setExpression("");
    setInputError("");
    setInputKey((key) => key + 1);
    setEditing(false);
  }

  async function capture() {
    if (capturing || reading.current) return;
    setCapturing(true);
    setFailed(false);
    setReviewOpen(false);
    setMessage("Capturing your selected work...");
    try {
      if (inputError && source === "expression") throw new Error(inputError);
      const snapshot = source === "expression"
        ? await revisions.capture(async () => expressionContent(expression))
        : await (board.current?.capture() ?? Promise.reject(new Error("The whiteboard is still loading. Please try again.")));
      if (!alive.current) return;
      if (snapshot.revisionId !== revisions.current) throw new Error("Your work changed. Capture again.");
      const url = downloads.replace(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
      setDownload({ url, snapshot });
      setMessage("Snapshot ready. Download a local copy below. Nothing was uploaded.");
    } catch (error) {
      if (!alive.current) return;
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Capture failed. Please try again.");
    } finally { if (alive.current) setCapturing(false); }
  }

  /** Explicit request only: export the current drawing once, then show the transcription for confirmation. */
  async function readHandwriting() {
    if (capturing || reading.current) return;
    const controller = new AbortController();
    reading.current = controller;
    const requested = revisions.current;
    downloads.clear();
    setDownload(null);
    setMessage("");
    setReviewOpen(true);
    setHandwriting({ revisionId: requested, phase: "reading" });
    const current = () => alive.current && !controller.signal.aborted && revisions.current === requested;
    try {
      const snapshot = await (board.current?.capture({ forTranscription: true }) ?? Promise.reject(new Error("The whiteboard is still loading. Please try again.")));
      if (!current() || snapshot.revisionId !== requested) return;
      const result = await requestTranscription(snapshot, controller.signal);
      // Late responses for an older drawing are discarded, even if cancellation did not reach the server.
      if (!current() || result.revisionId !== revisions.current) return;
      setHandwriting(result.status === "unreadable" ? { revisionId: requested, phase: "unreadable" }
        : { revisionId: requested, phase: "review", ambiguous: result.status === "ambiguous", draft: result.text });
    } catch (error) {
      if (!current()) return;
      setHandwriting({ revisionId: requested, phase: "error", message: error instanceof Error ? error.message : "Newton couldn't read your handwriting. Try again, or use Structured input." });
    } finally { if (reading.current === controller) reading.current = null; }
  }

  function dismissReview() {
    setReviewOpen(false);
    if (handwriting?.phase === "confirmed") return;
    reading.current?.abort();
    reading.current = null;
    setHandwriting(null);
  }

  const confirmed = handwriting?.phase === "confirmed" && handwriting.revisionId === revisionId ? handwriting : null;
  const tutorWork: TutorWork = source === "expression" ? { revisionId, source, expression, inputError }
    : confirmed ? { revisionId, source: "handwriting", expression: confirmed.expression, inputError: "" }
      : { revisionId, source: "whiteboard", expression: "", inputError: "" };

  if (!restored) return <p role="status">Restoring local work…</p>;

  return <>
    <nav hidden={focusMode} className="mobile-workspace-tabs" aria-label="Workspace panels">
      <button type="button" aria-pressed={mobilePane === "worksheet"} onClick={() => setMobilePane("worksheet")}>Worksheet</button>
      <button type="button" aria-pressed={mobilePane === "work"} onClick={() => setMobilePane("work")}>Whiteboard</button>
    </nav>
    <div ref={split} className="workspace-split" data-focus={focusMode} data-mobile-pane={mobilePane} style={{ "--worksheet-width": `${splitWidth}%` } as CSSProperties}>
      <div className="worksheet-column"><WorksheetPane storageScope={storageScope} onDocumentChange={worksheetChanged} /></div>
      <div className="split-divider" role="separator" tabIndex={0} aria-label="Resize worksheet and whiteboard" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(splitWidth)}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !split.current) return;
          const bounds = split.current.getBoundingClientRect();
          setSplitWidth(Math.min(70, Math.max(30, (event.clientX - bounds.left) / bounds.width * 100)));
        }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            setSplitWidth((width) => event.key === "Home" ? 30 : event.key === "End" ? 70 : Math.min(70, Math.max(30, width + (event.key === "ArrowLeft" ? -2 : 2))));
          }
        }}><span /></div>
      <section ref={workArea} className="work-area" data-source={source} aria-label="Your working space">

        <div className="work-toolbar"><button className="small-button focus-toggle" type="button" aria-pressed={focusMode} onClick={() => { setFocusMode(!focusMode); setMobilePane("work"); }}>{focusMode ? "Exit focus" : "Focus mode"}</button>
        {/* The whiteboard renders its drawing tools here, between Focus mode and the source picker. */}
        <div ref={setToolsSlot} className="board-tools-slot" hidden={source !== "whiteboard"} /><fieldset className="source-picker"><legend>Snapshot source</legend>
          <label><input type="radio" name="source" value="whiteboard" checked={source === "whiteboard"} onChange={() => selectSource("whiteboard")} />Whiteboard</label>
          <label><input type="radio" name="source" value="expression" checked={source === "expression"} onChange={() => selectSource("expression")} />Structured input</label>
        </fieldset><button type="button" className="icon-button" aria-label="Clear local work" title="Clear local work" onClick={clear}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 7v5h-5" />
            <path d="M19.3 12a7.5 7.5 0 1 0-1.8 5.3M20 12l-3-3" />
          </svg>
        </button></div>
        <div className="whiteboard-frame" hidden={source !== "whiteboard"}><WorkspaceBoundary><Whiteboard storageScope={storageScope} toolsSlot={toolsSlot} ref={board} revisions={revisions} onContentChange={changed} onActivityChange={setEditing} onCapture={capture} capturing={capturing} captureDisabled={capturing || editing || handwriting?.phase === "reading"}
          onRead={readHandwriting} reading={handwriting?.phase === "reading"} readDisabled={capturing || editing || handwriting?.phase === "reading"} /></WorkspaceBoundary></div>
        <div className="expression-area" hidden={source !== "expression"}>
          <div className="expression-actions"><button className="small-button capture-button" type="button" disabled={capturing} onClick={capture}>{capturing ? "Capturing..." : "Capture snapshot"}</button></div>
          <h3>Your next step</h3><MathInput key={inputKey} value={expression} onChange={(value, error) => { changed(); setExpression(value); setInputError(error ?? ""); }} onActivityChange={setEditing} />
          {inputError ? <p role="alert" className="input-error">{inputError}</p> : <p className="expression-preview">Plain expression: <code>{expression || "Your expression will appear here"}</code></p>}
        </div>
        {source === "whiteboard" && reviewOpen && handwriting && <HandwritingReview state={handwriting}
          onDraft={(draft) => setHandwriting((state) => state?.phase === "review" ? { ...state, draft } : state)}
          onConfirm={() => setHandwriting((state) => {
            if (state?.phase !== "review") return state;
            const reviewed = reviewDraft(state.draft);
            return reviewed.error ? state : { revisionId: state.revisionId, phase: "confirmed", draft: state.draft, expression: reviewed.expression };
          })}
          onEdit={() => setHandwriting((state) => state && { revisionId: state.revisionId, phase: "review", ambiguous: false, draft: state.phase === "confirmed" ? state.draft : "" })}
          onReadAgain={() => { void readHandwriting(); }} onDismiss={dismissReview} />}
        {message && <section className="capture-popover" aria-label="Snapshot export">
          <button type="button" className="icon-button dismiss-capture" aria-label="Dismiss snapshot" onClick={() => { downloads.clear(); setDownload(null); setMessage(""); }}>×</button>
        <div className="capture-feedback" aria-live="polite" aria-atomic="true"><p className={failed ? "input-error" : ""}>{message}</p></div>
        {download && <div className="snapshot-result"><p className="eyebrow">Captured step</p><code className="revision-label">Revision {download.snapshot.revisionId}</code>
          {download.snapshot.image && <img className="snapshot-preview" src={download.snapshot.image.value} alt="Captured student whiteboard" /> /* eslint-disable-line @next/next/no-img-element */}
          {download.snapshot.structuredExpression && <p className="captured-expression">{download.snapshot.structuredExpression}</p>}
          <a className="text-button" href={download.url} download={`newton-step-${download.snapshot.revisionId}.json`}>Download snapshot (JSON)</a>
          {download.snapshot.image && <a className="text-button" href={download.snapshot.image.value} download={`newton-work-${download.snapshot.revisionId}.png`}>Download drawing (PNG)</a>}
        </div>}
        </section>}
      </section>
    </div>
    <WorkspaceTutor work={tutorWork} developmentVoiceCapability={developmentVoiceCapability} />
  </>;
}
