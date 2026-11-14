"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

type Mode = "light" | "dark" | "system";
type Preference = { mode: Mode; dim: boolean };
const key = "newton-appearance";
let temporary: Preference | null = null;
function read(): Preference {
  if (temporary) return temporary;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (value && typeof value === "object" && "mode" in value && ["light", "dark", "system"].includes(String(value.mode))) {
      return { mode: value.mode as Mode, dim: !("dim" in value) || value.dim !== false };
    }
  } catch { /* Storage may be unavailable. Keep the preference for this tab. */ }
  return temporary ?? { mode: "light", dim: true };
}
function snapshot() {
  const { mode, dim } = read();
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  return `${mode}|${dark ? "dark" : "light"}|${dim}`;
}
function subscribe(callback: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", callback);
  window.addEventListener("newton-appearance", callback);
  media.addEventListener("change", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("newton-appearance", callback); media.removeEventListener("change", callback); };
}
function save(preference: Preference) {
  try { localStorage.setItem(key, JSON.stringify(preference)); temporary = null; } catch { temporary = preference; }
  window.dispatchEvent(new Event("newton-appearance"));
}
const AppearanceContext = createContext({ mode: "light" as Mode, theme: "light" as "light" | "dark", dim: true });
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(subscribe, snapshot, () => "light|light|true");
  const [mode, theme, dim] = value.split("|");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.dimWorksheet = dim;
    document.documentElement.style.colorScheme = theme;
  }, [theme, dim]);
  return <AppearanceContext value={{ mode: mode as Mode, theme: theme as "light" | "dark", dim: dim === "true" }}>{children}</AppearanceContext>;
}
export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceSettings() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } }
    function outside(event: PointerEvent) { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); }
    window.addEventListener("keydown", keydown); window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <div className="appearance-control" ref={root}>
    <button ref={button} className="small-button" type="button" aria-expanded={open} aria-controls="appearance-panel" onClick={() => setOpen(!open)}>Appearance</button>
    {open && <section className="appearance-panel" id="appearance-panel" role="dialog" aria-labelledby="appearance-title">
      <header><div><p className="eyebrow">PAPER THEME</p><h2 id="appearance-title">Make room for your focus.</h2></div><button ref={close} className="icon-button" type="button" aria-label="Close appearance" onClick={() => { setOpen(false); button.current?.focus(); }}>×</button></header>
      <AppearanceControls />
    </section>}
  </div>;
}

/** Shared preferences for appearance and account settings surfaces. */
export function AppearanceControls() {
  const { mode, dim } = useAppearance();
  return <>
      <fieldset><legend>Color mode</legend><div className="appearance-options">{(["light", "dark", "system"] as const).map((option) => <label key={option}><input type="radio" name="appearance" value={option} checked={mode === option} onChange={() => save({ mode: option, dim })} /><span>{option[0].toUpperCase() + option.slice(1)}</span></label>)}</div></fieldset>
      <label className="dim-worksheet"><span>Comfort preview in dark mode</span><input type="checkbox" checked={dim} onChange={(event) => save({ mode, dim: event.target.checked })} /></label>
      <p>Softens worksheet colors on screen. Your original file and exported work stay unchanged.</p>
  </>;
}
