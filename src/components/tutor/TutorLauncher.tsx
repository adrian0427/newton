"use client";

import { useEffect, useRef, useState } from "react";
import TutorControls from "./TutorControls";

export default function TutorLauncher() {
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
    <button ref={launcher} type="button" className="tutor-launcher" aria-label={open ? "Close Newton" : "Open Newton"} aria-expanded={open} aria-controls="newton-panel" onClick={() => setOpen((value) => !value)}><span aria-hidden="true">n</span></button>
    {open && <section id="newton-panel" className="tutor-popover" role="dialog" aria-labelledby="newton-panel-title">
      <header><div><p className="eyebrow">Here when you need it</p><h2 id="newton-panel-title">A little guidance.</h2></div><button ref={close} type="button" className="icon-button" aria-label="Dismiss Newton" onClick={() => { setOpen(false); launcher.current?.focus(); }}>×</button></header>
      <TutorControls />
      <p className="tutor-privacy">Worksheet sharing and audio activation will be available when tutoring is connected. Your microphone is off.</p>
    </section>}
  </>;
}
