"use client";

import { useImperativeHandle, useRef, useState, useEffect, type Ref } from "react";
import { Excalidraw, MainMenu, exportToBlob, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

type ExcalidrawElements = NonNullable<ExcalidrawInitialDataState["elements"]>;
import type { WorkSnapshot } from "@/types/tutoring";
import { useAppearance } from "../appearance/Appearance";
import { contentSignature, pngContent, type WorkRevision } from "./snapshots";
import { handwritingExportDimensions } from "./handwriting";
import { deletePart, loadPart, savePart } from "./persistence";
import { createPortal } from "react-dom";
import { TOOL_ICONS, type ToolIcon } from "./board-tool-icons";

/**
 * Excalidraw's full tool bar, moved into the work toolbar. Each button clicks
 * Excalidraw's own (hidden) tool input, so behavior such as the image picker
 * and tool lock stays exactly Excalidraw's.
 */
const TOOLS = [
  { id: "lock", label: "Keep selected tool active after drawing", shortcut: "Q", key: null },
  "divider",
  { id: "hand", label: "Hand (panning tool)", shortcut: "H", key: null },
  { id: "selection", label: "Selection", shortcut: "V or 1", key: "1" },
  { id: "rectangle", label: "Rectangle", shortcut: "R or 2", key: "2" },
  { id: "diamond", label: "Diamond", shortcut: "D or 3", key: "3" },
  { id: "ellipse", label: "Ellipse", shortcut: "O or 4", key: "4" },
  { id: "arrow", label: "Arrow", shortcut: "A or 5", key: "5" },
  { id: "line", label: "Line", shortcut: "L or 6", key: "6" },
  { id: "freedraw", label: "Draw", shortcut: "P or 7", key: "7" },
  { id: "text", label: "Text", shortcut: "T or 8", key: "8" },
  { id: "image", label: "Insert image", shortcut: "9", key: "9" },
  { id: "eraser", label: "Eraser", shortcut: "E or 0", key: "0" },
] as const;

const STYLES_KEY = "newton.board-styles.v1";
const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
function Icon({ icon }: { icon: ToolIcon }) {
  const attrs = Object.fromEntries(Object.entries(icon.attrs).map(([name, value]) => [camel(name), value]));
  // Static markup copied from Excalidraw's icons in board-tool-icons.ts; never user data.
  return <svg aria-hidden="true" focusable="false" viewBox={icon.viewBox} {...attrs} dangerouslySetInnerHTML={{ __html: icon.body }} />;
}
import "@excalidraw/excalidraw/index.css";

export type WhiteboardHandle = { capture(options?: { forTranscription: boolean }): Promise<WorkSnapshot>; clear(): void };

declare global { interface Window { EXCALIDRAW_ASSET_PATH: string } }
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/vendor/excalidraw/";

function loadBoard(storageScope?: string) {
  return loadPart("board", storageScope).then((saved) => ({
    elements: (saved?.elements ?? []) as ExcalidrawElements,
    files: (saved?.files ?? {}) as BinaryFiles,
    appState: { currentItemStrokeColor: "#39352f", currentItemFontFamily: 2 as const, activeTool: { type: "freedraw" as const, customType: null, lastActiveTool: null, locked: false } },
  }));
}

export default function Whiteboard({ storageScope, toolsSlot = null, ref, revisions, onContentChange, onActivityChange, onCapture, capturing, captureDisabled, onRead, reading, readDisabled }: {
  storageScope?: string;
  /** Element in the work toolbar where the drawing tools render. */
  toolsSlot?: HTMLElement | null;
  ref: Ref<WhiteboardHandle>;
  revisions: WorkRevision;
  onCapture(): void;
  capturing: boolean;
  captureDisabled: boolean;
  onRead(): void;
  reading: boolean;
  readDisabled: boolean;
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
  const boardRoot = useRef<HTMLDivElement>(null);
  const [toolLocked, setToolLocked] = useState(false);
  // Excalidraw's Stroke / Background / ... card. Remembered on this device; client-only component.
  const [stylesHidden, setStylesHidden] = useState(() => { try { return window.localStorage.getItem(STYLES_KEY) === "hidden"; } catch { return false; } });
  function toggleStyles() {
    const next = !stylesHidden;
    setStylesHidden(next);
    try { if (next) window.localStorage.setItem(STYLES_KEY, "hidden"); else window.localStorage.removeItem(STYLES_KEY); } catch { /* this page only */ }
  }
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string>("freedraw");
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
    async capture(options) {
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
        // maxWidthOrHeight overrides getDimensions in the installed SDK.
        ...(options?.forTranscription ? { getDimensions: handwritingExportDimensions } : { maxWidthOrHeight: 2048 }),
      })));
    },
  }), [revisions, storageScope]);

  const tools = <div className="board-tools" role="toolbar" aria-label="Drawing tools">
    {TOOLS.map((tool, index) => tool === "divider" ? <span key={`divider-${index}`} className="board-tool-divider" aria-hidden="true" /> : <button key={tool.id} type="button" className="board-tool"
      aria-label={tool.label} title={`${tool.label} — ${tool.shortcut}`} aria-pressed={tool.id === "lock" ? toolLocked : activeTool === tool.id}
      onClick={() => boardRoot.current?.querySelector<HTMLInputElement>(`.excalidraw [data-testid="toolbar-${tool.id}"]`)?.click()}>
      <Icon icon={TOOL_ICONS[tool.id]} />{tool.key && <span className="board-tool-key" aria-hidden="true">{tool.key}</span>}
    </button>)}
  </div>;

  return <div ref={boardRoot} className="board-canvas compact-tools" data-styles={stylesHidden ? "hidden" : "shown"} aria-label="Student whiteboard" onPointerUp={() => onActivityChange(false)} onPointerCancel={() => onActivityChange(false)} onBlur={() => onActivityChange(false)}>
    {toolsSlot ? createPortal(tools, toolsSlot) : null}
    <div className="board-options" aria-label="Drawing options">
      {/* Opens Excalidraw's main menu; data-prevent-outside-click keeps its outside-click handler from re-closing it. */}
      <button className="small-button board-menu-button" type="button" aria-label="Whiteboard menu" aria-haspopup="menu" aria-expanded={menuOpen} data-prevent-outside-click="true"
        onClick={() => api.current?.updateScene({ appState: { openMenu: api.current.getAppState().openMenu === "canvas" ? null : "canvas" } })}>
        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <button className="small-button capture-button" type="button" disabled={captureDisabled} onClick={onCapture}>{capturing ? "Capturing..." : "Capture snapshot"}</button>
      <button className="small-button read-button" type="button" disabled={readDisabled} onClick={onRead}>{reading ? "Reading..." : "Read handwriting"}</button>
      <button ref={settingsButton} className="small-button" type="button" aria-expanded={settings} aria-controls="pen-settings" onClick={() => setSettings(!settings)}>Pen settings</button>
      <button className="small-button" type="button" aria-pressed={stylesHidden} title="Show or hide the Stroke, Background, and other style options for the selected shape" onClick={toggleStyles}>{stylesHidden ? "Show styles" : "Hide styles"}</button>
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
        setMenuOpen(state.openMenu === "canvas");
        setActiveTool(state.activeTool.type);
        setToolLocked(state.activeTool.locked);
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
