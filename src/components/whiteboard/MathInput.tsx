"use client";

import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { normalizeExpression } from "./expressions";

export default function MathInput({ value, onChange, onActivityChange }: {
  value: string; onChange(expression: string, error?: string): void; onActivityChange(active: boolean): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const lastValue = useRef(value);
  const callback = useRef(onChange);
  const activity = useRef(onActivityChange);
  const [status, setStatus] = useState("Loading math keyboard...");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callback.current = onChange; activity.current = onActivityChange; }, [onChange, onActivityChange]);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    import("mathlive").then(({ MathfieldElement }) => {
      if (disposed || !host.current) return;
      MathfieldElement.fontsDirectory = "/vendor/mathlive/fonts";
      MathfieldElement.soundsDirectory = null;
      const mathfield = new MathfieldElement();
      mathfield.mathVirtualKeyboardPolicy = "manual";
      mathfield.setValue(lastValue.current, { format: "ascii-math" });
      mathfield.setAttribute("aria-label", "Your algebra expression");
      mathfield.setAttribute("aria-describedby", "math-input-help");
      const input = () => {
        try { const normalized = normalizeExpression(mathfield.getValue("ascii-math")); lastValue.current = normalized; callback.current(normalized); }
        catch (error) { lastValue.current = ""; callback.current("", error instanceof Error ? error.message : "This expression cannot be exported."); }
      };
      const focus = () => activity.current(true);
      const blur = () => activity.current(false);
      mathfield.addEventListener("input", input);
      mathfield.addEventListener("focus", focus);
      mathfield.addEventListener("blur", blur);
      host.current.append(mathfield);
      field.current = mathfield;
      setStatus("");
      cleanup = () => {
        mathfield.removeEventListener("input", input);
        mathfield.removeEventListener("focus", focus);
        mathfield.removeEventListener("blur", blur);
        mathfield.remove();
        field.current = null;
      };
    }).catch(() => { if (!disposed) setStatus("The math keyboard could not load."); });
    return () => { disposed = true; cleanup(); };
  }, [attempt]);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      field.current?.setValue(value, { format: "ascii-math", silenceNotifications: true });
    }
  }, [value]);
  return <div className="math-input">
    <div ref={host} />
    {status && <p role="status">{status} {status.includes("could not") && <button type="button" onClick={() => setAttempt((count) => count + 1)}>Retry math keyboard</button>}</p>}
    <p id="math-input-help" className="helper">Type your next step. Use parentheses, fractions, or powers. The keyboard icon opens math symbols.</p>
  </div>;
}
