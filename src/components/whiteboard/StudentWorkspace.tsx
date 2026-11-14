"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import type { WorkSnapshot } from "@/types/tutoring";
import type { WhiteboardHandle } from "./Whiteboard";
import { WorkRevision, SnapshotDownload, expressionContent } from "./snapshots";
import MathInput from "./MathInput";
import WorkspaceBoundary from "./WorkspaceBoundary";
import TutorLauncher from "../tutor/TutorLauncher";
import WorksheetPane from "../worksheet/WorksheetPane";

const Whiteboard = dynamic(() => import("./Whiteboard"), { ssr: false, loading: () => <div className="board-loading" role="status">Opening your whiteboard...</div> });

export default function StudentWorkspace() {
  const [revisions] = useState(() => new WorkRevision());
  const [downloads] = useState(() => new SnapshotDownload());
  const board = useRef<WhiteboardHandle>(null);
  const alive = useRef(true);
  const split = useRef<HTMLDivElement>(null);
  const [focusMode, setFocusMode] = useState(false);
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

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; revisions.invalidate(); downloads.clear(); };
  }, [revisions, downloads]);

  const changed = useCallback(() => {
    revisions.edit();
    downloads.clear();
    setDownload(null);
    setMessage("");
    setFailed(false);
  }, [revisions, downloads]);

  const worksheetChanged = changed;

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
    setMessage("Local work cleared. You can start again.");
  }

  async function capture() {
    if (capturing) return;
    setCapturing(true);
    setFailed(false);
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

  return <>
    <nav hidden={focusMode} className="mobile-workspace-tabs" aria-label="Workspace panels">
      <button type="button" aria-pressed={mobilePane === "worksheet"} onClick={() => setMobilePane("worksheet")}>Worksheet</button>
      <button type="button" aria-pressed={mobilePane === "work"} onClick={() => setMobilePane("work")}>Whiteboard</button>
    </nav>
    <div ref={split} className="workspace-split" data-focus={focusMode} data-mobile-pane={mobilePane} style={{ "--worksheet-width": `${splitWidth}%` } as CSSProperties}>
      <div className="worksheet-column"><WorksheetPane onDocumentChange={worksheetChanged} /></div>
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
      <section className="work-area" data-source={source} aria-label="Your working space">

        <div className="work-toolbar"><button className="small-button focus-toggle" type="button" aria-pressed={focusMode} onClick={() => { setFocusMode(!focusMode); setMobilePane("work"); }}>{focusMode ? "Exit focus" : "Focus mode"}</button><fieldset className="source-picker"><legend>Snapshot source</legend>
          <label><input type="radio" name="source" value="whiteboard" checked={source === "whiteboard"} onChange={() => { revisions.invalidate(); downloads.clear(); setDownload(null); setMessage(""); setSource("whiteboard"); }} />Whiteboard</label>
          <label><input type="radio" name="source" value="expression" checked={source === "expression"} onChange={() => { revisions.invalidate(); downloads.clear(); setDownload(null); setMessage(""); setSource("expression"); }} />Structured input</label>
        </fieldset><button type="button" className="text-button" onClick={clear}>Clear local work</button></div>
        <div className="whiteboard-frame" hidden={source !== "whiteboard"}><WorkspaceBoundary><Whiteboard ref={board} revisions={revisions} onContentChange={changed} onActivityChange={setEditing} onCapture={capture} capturing={capturing} captureDisabled={capturing || editing} /></WorkspaceBoundary></div>
        <div className="expression-area" hidden={source !== "expression"}>
          <div className="expression-actions"><button className="small-button capture-button" type="button" disabled={capturing} onClick={capture}>{capturing ? "Capturing..." : "Capture snapshot"}</button></div>
          <h3>Your next step</h3><MathInput key={inputKey} value={expression} onChange={(value, error) => { changed(); setExpression(value); setInputError(error ?? ""); }} onActivityChange={setEditing} />
          {inputError ? <p role="alert" className="input-error">{inputError}</p> : <p className="expression-preview">Plain expression: <code>{expression || "Your expression will appear here"}</code></p>}
        </div>
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
    <TutorLauncher />
  </>;
}
