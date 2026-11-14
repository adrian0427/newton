"use client";

import { useEffect, useRef, useState, useCallback, type ClipboardEvent, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { worksheetKind } from "./files";
import { deletePart, loadPart, savePart } from "../whiteboard/persistence";

const PdfPage = dynamic(() => import("./PdfPage"), { ssr: false, loading: () => <p className="viewer-status" role="status">Opening PDF viewer...</p> });

type Worksheet = { file: File; kind: "pdf" | "image"; url: string };

export default function WorksheetPane({ onDocumentChange }: { onDocumentChange(present: boolean): void }) {
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLElement>(null);
  const request = useRef(0);
  const currentUrl = useRef<string | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => {
    request.current++;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
  }, []);

  const accept = useCallback(async (files: File[], persist = true) => {
    const generation = ++request.current;
    if (files.length !== 1) { setLoading(false); setError("Add one worksheet at a time."); return; }
    setLoading(true); setError("");
    try {
      const file = files[0];
      const kind = await worksheetKind(file);
      if (kind === "image") {
        const image = await createImageBitmap(file).catch(() => { throw new Error("This image could not be opened. Try another PNG, JPEG, or WebP file."); });
        const pixels = image.width * image.height;
        image.close();
        if (pixels > 32_000_000) throw new Error("This image is too large to display. Choose an image under 32 megapixels.");
      }
      if (generation !== request.current) return;
      const url = URL.createObjectURL(file);
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = url;
      setWorksheet({ file, kind, url });
      setZoom(1); setPage(1); setPageCount(0);
      onDocumentChange(true);
      if (persist) void savePart("worksheet", { name: file.name, type: file.type, blob: file });
    } catch (reason) {
      if (generation === request.current) setError(reason instanceof Error ? reason.message : "This file could not be opened. Try a different PDF or image.");
    } finally { if (generation === request.current) setLoading(false); }
  }, [onDocumentChange]);

  useEffect(() => {
    let active = true;
    void loadPart("worksheet").then((saved) => {
      if (active && saved && !currentUrl.current) void accept([new File([saved.blob], saved.name, { type: saved.type })], false);
    });
    return () => { active = false; };
  }, [accept]);

  useEffect(() => {
    function pasteWithoutEditor(event: globalThis.ClipboardEvent) {
      // Default paste belongs to the visible worksheet. Editors keep their own paste.
      if (event.defaultPrevented || !pane.current?.getClientRects().length) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".work-area, input, textarea, [contenteditable], math-field")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) { event.preventDefault(); void accept(files); }
    }
    document.addEventListener("paste", pasteWithoutEditor);
    return () => document.removeEventListener("paste", pasteWithoutEditor);
  }, [accept]);

  function remove() {
    request.current++;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null;
    setWorksheet(null); setError(""); setLoading(false); setPageCount(0);
    onDocumentChange(false);
    void deletePart("worksheet");
  }
  function paste(event: ClipboardEvent) {
    // Leave ordinary text paste alone; files are only read inside this pane.
    const files = Array.from(event.clipboardData.files);
    if (files.length) { event.preventDefault(); event.stopPropagation(); void accept(files); }
  }
  function drop(event: DragEvent) {
    event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false);
    if (event.dataTransfer.files.length) void accept(Array.from(event.dataTransfer.files));
    else setError("Drop a local PDF or image file. Website links are not imported.");
  }

  return <section ref={pane} className={`worksheet-pane ${dragging ? "is-dragging" : ""}`} aria-label="Worksheet" tabIndex={0}
    onPaste={paste} onDrop={drop}
    onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); dragDepth.current++; setDragging(true); } }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
    onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}>
    {worksheet && <header className="worksheet-file-toolbar"><span className="worksheet-name" title={worksheet.file.name}>{worksheet.file.name}</span><div className="toolbar-actions"><button className="small-button" type="button" onClick={() => input.current?.click()}>Replace worksheet</button><button className="icon-button" type="button" aria-label="Remove worksheet" onClick={remove}>×</button></div></header>}
    <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="visually-hidden" aria-label="Upload worksheet file" tabIndex={-1}
      onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void accept(files); }} />
    {error && <div className="worksheet-error" role="alert">{error}<button className="icon-button" type="button" aria-label="Dismiss file error" onClick={() => setError("")}>×</button></div>}
    {loading && <p className="file-loading" role="status">Opening your file...</p>}
    {worksheet ? <>
      <div className="document-viewport" key={worksheet.url}>
        {worksheet.kind === "pdf" ? <PdfPage file={worksheet.file} page={page} zoom={zoom} onPageCount={setPageCount} /> :
          <div className="worksheet-image-wrap" style={{ width: `${zoom * 100}%` }}>
            {/* A transient local Blob URL, with natural dimensions and user-controlled zoom. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={worksheet.url} alt={`Worksheet: ${worksheet.file.name}`} className="worksheet-image" onError={() => setError("This image could not be displayed. Try another file.")} />
          </div>}
      </div>
      <footer className="document-controls"><div className="zoom-controls"><button className="icon-button" type="button" aria-label="Zoom out worksheet" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button><button className="zoom-label" type="button" aria-label="Reset worksheet zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button className="icon-button" type="button" aria-label="Zoom in worksheet" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>+</button></div>
        {worksheet.kind === "pdf" && <div className="page-controls"><button className="icon-button" type="button" aria-label="Previous worksheet page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><span role="status">{page} / {pageCount || "..."}</span><button className="icon-button" type="button" aria-label="Next worksheet page" disabled={!pageCount || page >= pageCount} onClick={() => setPage((value) => value + 1)}>›</button></div>}
        <span className="local-file-note">On this device</span>
      </footer>
    </> : <div className="worksheet-empty">
      <div className="empty-page-icon" aria-hidden="true"><svg width="42" height="48" viewBox="0 0 42 48" fill="none"><path d="M8 2h18l12 12v30a2 2 0 0 1-2 2H8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.5"/><path d="M26 2v12h12M12 24h18M12 31h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
      <h2>Bring something to work on.</h2><p>Drop a worksheet here,<br />or paste a screenshot with <kbd>⌘ / Ctrl V</kbd>.</p>
      <button className="workspace-button" type="button" onClick={() => input.current?.click()}>Upload worksheet <span aria-hidden="true">↗</span></button>
      <span className="file-formats">PDF, PNG, JPEG, WebP · Up to 20 MiB</span>
      <p className="worksheet-privacy">Your files stay on this device.<br />Nothing is uploaded. Work is saved in this browser.</p>
    </div>}
    {dragging && <div className="drop-overlay" aria-hidden="true"><span>Drop your worksheet here</span></div>}
  </section>;
}
