"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import TutorControls from "./TutorControls";
import NewtonPeek, { indicatorDescriptions, type NewtonIndicator } from "./NewtonPeek";

export default function TutorLauncher({ indicator = "idle", controls }: { indicator?: NewtonIndicator; controls?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return <>
    <button ref={launcher} type="button" className="tutor-launcher" aria-label={open ? "Close Newton" : "Open Newton"} aria-expanded={open} aria-controls={open ? "newton-panel" : undefined} aria-describedby={indicator !== "idle" ? "newton-indicator-status" : undefined} onClick={() => setOpen((value) => !value)}><NewtonPeek indicator={indicator} /></button>
    <span id="newton-indicator-status" className="visually-hidden" role="status">{indicatorDescriptions[indicator]}</span>
    {open && <section id="newton-panel" className="tutor-popover" role="dialog" aria-labelledby="newton-panel-title">
      <header><div><p className="eyebrow">Here when you need it</p><h2 id="newton-panel-title">A little guidance.</h2></div><button ref={close} type="button" className="icon-button" aria-label="Dismiss Newton" onClick={() => { setOpen(false); launcher.current?.focus(); }}>×</button></header>
      {controls ?? <TutorControls />}
      <p className="tutor-privacy">Worksheet images stay local. Read handwriting sends only the whiteboard drawing to the reading service when you ask; nothing is saved. With voice enabled, Check work or Ask for a hint shares the submitted step and its local check with the voice service.</p>
    </section>}
  </>;
}
