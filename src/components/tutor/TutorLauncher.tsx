"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import TutorControls from "./TutorControls";
import NewtonPeek, { indicatorDescriptions, type NewtonIndicator } from "./NewtonPeek";
import NewtonApple from "./NewtonApple";
import NewtonCelebration from "./NewtonCelebration";
import { CELEBRATION_MS } from "./celebration";
import { APPLE_SIZE, DEFAULT_GAZE, DEFAULT_POSITION, DRAG_THRESHOLD, STORAGE_KEY, dropPosition, gazeToward, inDockZone, isMoveKey, movePosition, parsePosition, positionCenter, serializePosition, type ApplePosition, type Gaze } from "./apple-position";

/** Newton looks at the center of the working pane (whiteboard or structured input). */
const WHITEBOARD_SELECTOR = ".work-area";

// Position is kept on this device only. Memory backs it when storage is unavailable.
const listeners = new Set<() => void>();
let memoryPosition: string | null = null;
function readStoredPosition(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY) ?? memoryPosition; } catch { return memoryPosition; }
}
function storePosition(position: ApplePosition) {
  memoryPosition = serializePosition(position);
  try { window.localStorage.setItem(STORAGE_KEY, memoryPosition); } catch { /* memory fallback */ }
  listeners.forEach((listener) => listener());
}
function subscribePosition(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

type Held = { x: number; y: number; overDock: boolean; origin: ApplePosition };
type Press = { pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; dragging: boolean };

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
const dockTop = (y: number) => `clamp(44px, ${y * 100}%, calc(100% - 44px))`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, value), Math.max(min, max));

/** `celebration` is a token; each new token plays the correct-step celebration once. */
export default function TutorLauncher({ indicator = "idle", controls, celebration = null }: { indicator?: NewtonIndicator; controls?: ReactNode; celebration?: string | null }) {
  const [open, setOpen] = useState(false);
  const [finishedCelebration, setFinishedCelebration] = useState<string | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const stored = useSyncExternalStore(subscribePosition, readStoredPosition, () => null);
  const position = parsePosition(stored);
  const launcher = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);
  const [gaze, setGaze] = useState<Gaze>(DEFAULT_GAZE);

  // Placed Newton keeps looking at the whiteboard as the divider, tabs, or window change it.
  useEffect(() => {
    const placed = parsePosition(stored);
    if (placed.mode !== "free") return;
    const target = document.querySelector(WHITEBOARD_SELECTOR);
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = gazeToward(positionCenter(placed, viewport()), target?.getBoundingClientRect() ?? null);
        setGaze((previous) => previous.x === next.x && previous.y === next.y ? previous : next);
      });
    }
    update();
    const observer = target ? new ResizeObserver(update) : null;
    if (target) observer?.observe(target);
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [stored]);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setFinishedCelebration(celebration), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  // Escape while held puts Newton back where he was picked up.
  useEffect(() => {
    if (!held) return;
    function key(event: KeyboardEvent) {
      if (event.key !== "Escape" || !press.current) return;
      const button = launcher.current;
      if (button?.hasPointerCapture(press.current.pointerId)) button.releasePointerCapture(press.current.pointerId);
      press.current = null;
      suppressClick.current = true;
      setHeld(null);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [held]);

  // The guidance panel opens beside wherever Newton sits, flipping to stay on screen.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const button = launcher.current, element = panel.current;
      if (!button || !element) return;
      const anchor = button.getBoundingClientRect(), box = element.getBoundingClientRect();
      const { width, height } = viewport();
      const gap = 10, margin = 8;
      const leftSpace = anchor.left - gap, rightSpace = width - anchor.right - gap;
      const preferLeft = leftSpace >= box.width + margin || leftSpace >= rightSpace;
      const left = clamp(preferLeft ? anchor.left - gap - box.width : anchor.right + gap, margin, width - box.width - margin);
      const top = clamp(anchor.top + anchor.height / 2 - box.height / 2, margin, height - box.height - margin);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, stored, held]);

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    // From the peek he pops out centered under the pointer; once placed, he keeps his grab point.
    const grabbed = position.mode === "free";
    press.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false,
      offsetX: grabbed ? event.clientX - (rect.left + rect.width / 2) : 0,
      offsetY: grabbed ? event.clientY - (rect.top + rect.height / 2) : 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.dragging && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return;
    if (!current.dragging) setFinishedCelebration(celebration); // Picking him up cancels a celebration.
    current.dragging = true;
    const x = event.clientX - current.offsetX, y = event.clientY - current.offsetY;
    setHeld((previous) => ({ x, y, overDock: inDockZone(x, viewport()), origin: previous?.origin ?? position }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.dragging) return;
    suppressClick.current = true;
    storePosition(dropPosition(event.clientX - current.offsetX, event.clientY - current.offsetY, viewport()));
    setHeld(null);
  }

  function pointerCancel() {
    press.current = null;
    setHeld(null);
  }

  function keyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (held) return;
    if (isMoveKey(event.key)) {
      event.preventDefault();
      storePosition(movePosition(position, event.key, event.shiftKey, viewport()));
    } else if (event.key === "Home") {
      event.preventDefault();
      storePosition(DEFAULT_POSITION);
    }
  }

  const mode = held ? "held" : position.mode;
  const style: CSSProperties = held
    ? { left: held.x - APPLE_SIZE / 2, top: held.y - APPLE_SIZE / 2 }
    : position.mode === "dock"
      ? { top: dockTop(position.y) }
      : { left: `clamp(0px, calc(${position.x * 100}% - ${APPLE_SIZE / 2}px), calc(100% - ${APPLE_SIZE}px))`, top: `clamp(0px, calc(${position.y * 100}% - ${APPLE_SIZE / 2}px), calc(100% - ${APPLE_SIZE}px))` };
  const describedBy = ["newton-move-hint", indicator !== "idle" ? "newton-indicator-status" : ""].filter(Boolean).join(" ");
  const celebrating = !!celebration && celebration !== finishedCelebration && !held;
  // Only reached after a client-side check, so reading the viewport here is safe.
  const burstAt = celebrating ? (() => {
    const size = viewport();
    if (position.mode === "free") return positionCenter(position, size);
    return { x: size.width - 20, y: clamp(position.y * size.height, 44, size.height - 44) };
  })() : null;

  return <>
    {burstAt && <NewtonCelebration key={celebration} x={burstAt.x} y={burstAt.y} fan={position.mode === "dock" ? "left" : "all"} />}
    {held && <>
      <span className="newton-dock-zone" data-active={held.overDock} aria-hidden="true" />
      {held.origin.mode === "dock" && <span className="newton-dock-ghost" style={{ top: dockTop(held.origin.y) }} aria-hidden="true" />}
    </>}
    <button ref={launcher} type="button" className="tutor-launcher" data-mode={mode} data-celebrating={celebrating} style={style}
      aria-label={open ? "Close Newton" : "Open Newton"} aria-expanded={open} aria-controls={open ? "newton-panel" : undefined} aria-describedby={describedBy}
      onClick={(event) => {
        // Only the click that ends a drag is swallowed; keyboard activation (detail 0) always opens.
        if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
        suppressClick.current = false;
        setOpen((value) => !value);
      }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onKeyDown={keyDown}>
      {mode === "dock"
        ? <NewtonPeek key={celebrating ? celebration : "peek"} indicator={indicator} />
        : <NewtonApple key={celebrating ? celebration : "apple"} indicator={indicator} held={mode === "held"} gaze={gaze} celebrating={celebrating} />}
    </button>
    <span id="newton-move-hint" className="visually-hidden">Drag Newton or use the arrow keys to move him. Home returns him to the edge.</span>
    <span id="newton-indicator-status" className="visually-hidden" role="status">{indicatorDescriptions[indicator]}</span>
    {open && <section ref={panel} id="newton-panel" className="tutor-popover" role="dialog" aria-labelledby="newton-panel-title">
      <header><div><p className="eyebrow">Here when you need it</p><h2 id="newton-panel-title">A little guidance.</h2></div><button ref={close} type="button" className="icon-button" aria-label="Dismiss Newton" onClick={() => { setOpen(false); launcher.current?.focus(); }}>×</button></header>
      {controls ?? <TutorControls />}
      <p className="tutor-privacy">Worksheets and drawings are saved on this device. Read handwriting sends only the whiteboard drawing to the reading service when you ask; transcriptions are not saved. With voice enabled, Check work or Ask for a hint shares the submitted step and its local check with the voice service.</p>
    </section>}
  </>;
}
