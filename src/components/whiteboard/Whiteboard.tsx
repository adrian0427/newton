"use client";

import { useImperativeHandle, useRef, useState, useEffect, type Ref } from "react";
import { Excalidraw, MainMenu, exportToBlob, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

type ExcalidrawElements = NonNullable<ExcalidrawInitialDataState["elements"]>;
import type { WorkSnapshot } from "@/types/tutoring";
import { useAppearance } from "../appearance/Appearance";
import { contentSignature, pngContent, type WorkRevision } from "./snapshots";
import { deletePart, loadPart, savePart } from "./persistence";
import "@excalidraw/excalidraw/index.css";

export type WhiteboardHandle = { capture(): Promise<WorkSnapshot>; clear(): void };

declare global { interface Window { EXCALIDRAW_ASSET_PATH: string } }
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/vendor/excalidraw/";

function loadBoard(storageScope?: string) {
  return loadPart("board", storageScope).then((saved) => ({
    elements: (saved?.elements ?? []) as ExcalidrawElements,
    files: (saved?.files ?? {}) as BinaryFiles,
    appState: { currentItemStrokeColor: "#39352f", currentItemFontFamily: 2 as const, activeTool: { type: "freedraw" as const, customType: null, lastActiveTool: null, locked: false } },
  }));
}

export default function Whiteboard({ storageScope, ref, revisions, onContentChange, onActivityChange, onCapture, capturing, captureDisabled }: {
  storageScope?: string;
  ref: Ref<WhiteboardHandle>;
  revisions: WorkRevision;
  onCapture(): void;
  capturing: boolean;
  captureDisabled: boolean;
  onContentChange(): void;
  onActivityChange(active: boolean): void;
}) {
  const { theme } = useAppearance();
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const signature = useRef("[]");
  const restored = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialData] = useState(() => loadBoard(storageScope));
  useEffect(() => {
    void initialData.finally(() => { restored.current = true; });
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [initialData]);
  const [settings, setSettings] = useState(false);
  const [more, setMore] = useState(false);
  const [stroke, setStroke] = useState("#39352f");
  const [width, setWidth] = useState(1);
  const [zoom, setZoom] = useState(1);
  function changeZoom(value: number) {
    const state = api.current?.getAppState();
    if (state) api.current?.updateScene({ appState: { zoom: { value: Math.min(4, Math.max(0.25, value)) as typeof state.zoom.value } } });
  }
  const settingsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!settings) return;
    function close(event: KeyboardEvent) { if (event.key === "Escape") { event.stopImmediatePropagation(); setSettings(false); settingsButton.current?.focus(); } }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [settings]);
  useImperativeHandle(ref, () => ({
    clear() {
      api.current?.updateScene({ elements: [], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      signature.current = "[]";
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void deletePart("board", storageScope);
    },
    async capture() {
      const board = api.current;
      if (!board) throw new Error("The whiteboard is still loading.");
      const elements = structuredClone(board.getSceneElements());
      if (!elements.some((element) => !element.isDeleted)) throw new Error("Draw something before capturing the whiteboard.");
      const files = structuredClone(board.getFiles());
      return revisions.capture(async () => pngContent(await exportToBlob({
        elements,
        files,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportEmbedScene: false },
        mimeType: "image/png",
        exportPadding: 24,
        maxWidthOrHeight: 2048,
      })));
    },
  }), [revisions, storageScope]);

  return <div className={`board-canvas ${more ? "show-extra-tools" : "compact-tools"}`} aria-label="Student whiteboard" onPointerUp={() => onActivityChange(false)} onPointerCancel={() => onActivityChange(false)} onBlur={() => onActivityChange(false)}>
    <div className="board-options" aria-label="Drawing options">
      <button className="small-button capture-button" type="button" disabled={captureDisabled} onClick={onCapture}>{capturing ? "Capturing..." : "Capture snapshot"}</button>
      <button ref={settingsButton} className="small-button" type="button" aria-expanded={settings} aria-controls="pen-settings" onClick={() => { setSettings(!settings); setMore(false); }}>Pen settings</button>
      <button className="small-button" type="button" aria-expanded={more} onClick={() => { setMore(!more); setSettings(false); }}>{more ? "Fewer tools" : "More tools"}</button>
      <button className="small-button library-toggle" type="button" onClick={() => api.current?.toggleSidebar({ name: "default", tab: "library" })}>Library</button>
    </div>
    {settings && <section className="pen-settings" id="pen-settings" role="dialog" aria-label="Pen settings">
      <header><strong>Writing style</strong><button className="icon-button" type="button" aria-label="Close pen settings" onClick={() => { setSettings(false); settingsButton.current?.focus(); }}>×</button></header>
      <label>Ink color<input type="color" aria-label="Ink color" value={stroke} onChange={(event) => { setStroke(event.target.value); api.current?.updateScene({ appState: { currentItemStrokeColor: event.target.value } }); }} /></label>
      <label>Stroke width <output>{width}</output><input type="range" aria-label="Stroke width" min={1} max={4} step={1} value={width} onChange={(event) => { const value = Number(event.target.value); setWidth(value); api.current?.updateScene({ appState: { currentItemStrokeWidth: value } }); }} /></label>
    </section>}
    <div className="board-zoom" aria-label="Whiteboard zoom">
      <button type="button" aria-label="Zoom out whiteboard" disabled={zoom <= 0.25} onClick={() => changeZoom(zoom - 0.1)}>−</button>
      <button type="button" aria-label="Reset whiteboard zoom" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label="Zoom in whiteboard" disabled={zoom >= 4} onClick={() => changeZoom(zoom + 0.1)}>+</button>
    </div>
    <Excalidraw
      excalidrawAPI={(value) => { api.current = value; }}
      initialData={initialData}
      onChange={(elements, state, files) => {
        setZoom(state.zoom.value);
        const next = contentSignature(elements);
        if (signature.current === next || !restored.current) { signature.current = next; return; }
        signature.current = next;
        onContentChange();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const live = elements.filter((element) => !element.isDeleted);
          const used = new Set<string>(live.flatMap((element) => "fileId" in element && element.fileId ? [element.fileId] : []));
          // IndexedDB copies the value itself; avoid structuredClone (absent before Safari 15.4).
          void savePart("board", { elements: live, files: Object.fromEntries(Object.entries(files).filter(([id]) => used.has(id))) }, storageScope);
        }, 400);
      }}
      onPointerDown={() => onActivityChange(true)}
      UIOptions={{ canvasActions: { loadScene: false, export: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false } }}
      theme={theme}
    >
      <MainMenu><MainMenu.DefaultItems.ClearCanvas /><MainMenu.DefaultItems.ChangeCanvasBackground /><MainMenu.DefaultItems.Help /></MainMenu>
    </Excalidraw>
  </div>;
}
