import type { CSSProperties } from "react";

const strokes = [
  [9, 15, 136, -24, 0], [79, 13, 94, -24, -7],
  [22, 36, 74, -24, -11], [88, 43, 158, -24, -3],
  [5, 63, 111, -24, -8], [73, 73, 88, -24, -14],
  [27, 88, 164, -24, -5], [94, 91, 68, -24, -10],
] as const;

/** Deterministic pencil streaks, kept outside the form's quiet center. */
export function CometBackground() {
  return <div className="sign-in-comets" aria-hidden="true">
    {strokes.map(([x, y, width, angle, delay], index) => (
      <span key={index} className="sign-in-comet" style={{
        left: `${x}%`, top: `${y}%`, width,
        "--comet-angle": `${angle}deg`, "--comet-delay": `${delay}s`,
      } as CSSProperties} />
    ))}
  </div>;
}
