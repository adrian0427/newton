import type { ReactNode } from "react";
import type { NewtonIndicator } from "./NewtonPeek";
import { DEFAULT_GAZE, gazeOffsets, type Gaze } from "./apple-position";

/**
 * Unclipped Newton for the placed and picked-up poses. Paths match the approved
 * peek frames in public/newton/; the picked-up face is from the Figma draggable board.
 */
const BODY = <>
  <path fill="#B85C46" d="M16 10.9C12.9 8.9 9.5 8.8 6.8 11.3C2.2 15.6 5.1 23.9 9.2 28.1C11.4 30.4 13.2 29.2 16 28.5C18.7 29.4 20.7 30.1 22.8 27.9C27.4 23.3 30 15.6 25.7 11.6C23.1 9.2 19.2 9 16 10.9Z" />
  <path fill="#B85C46" d="M14.5 11C14.6 9.4 14.1 8.1 13.2 7.2C12.8 6.8 12.8 6.2 13.2 5.8C13.6 5.4 14.2 5.4 14.6 5.8C16 7.2 16.6 9 16.5 11Z" />
  <path transform="translate(32 0) scale(-1 1)" fill="#718365" d="M17.4 8C17.6 4.5 20.3 2.2 24.7 2.4C24.1 6.4 21.5 8.5 17.4 8Z" />
</>;
const MOUTH = <path d="M14.65 23.05Q16 24.15 17.35 23.05" fill="none" stroke="#233D32" strokeWidth=".55" strokeLinecap="round" />;

// Pupils are drawn centered in the whites; the gaze offset moves them.
const OPEN_PUPILS = <>
  <ellipse cx="12.65" cy="18.6" rx="1.35" ry="1.75" fill="#233D32" /><circle cx="12.23" cy="17.93" r=".43" fill="#FFFFFF" />
  <ellipse cx="19.35" cy="18.6" rx="1.35" ry="1.75" fill="#233D32" /><circle cx="18.93" cy="17.93" r=".43" fill="#FFFFFF" />
</>;
const OPEN_WHITES = <g fill="#FFFFFF" stroke="#233D32" strokeWidth=".38"><ellipse cx="12.65" cy="18.6" rx="2.45" ry="3.2" /><ellipse cx="19.35" cy="18.6" rx="2.45" ry="3.2" /></g>;
const HALF_WHITES = <g fill="#FFFFFF" stroke="#233D32" strokeWidth=".38"><ellipse cx="12.65" cy="18.6" rx="2.45" ry="1.3" /><ellipse cx="19.35" cy="18.6" rx="2.45" ry="1.3" /></g>;
const HALF_PUPILS = <g fill="#233D32"><ellipse cx="12.65" cy="18.6" rx="1.1" ry="1" /><ellipse cx="19.35" cy="18.6" rx="1.1" ry="1" /></g>;
const CLOSED_LIDS = <path d="M10.3 19Q12.65 20 15 19M17 19Q19.35 20 21.7 19M14.65 23.05Q16 24.15 17.35 23.05" fill="none" stroke="#233D32" strokeWidth=".5" strokeLinecap="round" />;

/** Open, half, and closed frames share one gaze so he never glances away mid-blink. */
function GazingFace({ gaze }: { gaze: Gaze }) {
  const { face, pupils } = gazeOffsets(gaze);
  const shift = (x: number, y: number) => ({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` });
  return <g className="newton-gaze" style={shift(face.x, face.y)}>
    <g className="newton-frame-open">{OPEN_WHITES}<g className="newton-gaze" style={shift(pupils.x, pupils.y)}>{OPEN_PUPILS}</g>{MOUTH}</g>
    {/* Half-closed lids leave no vertical room, so those pupils only move across. */}
    <g className="newton-frame-half">{HALF_WHITES}<g className="newton-gaze" style={shift(pupils.x, 0)}>{HALF_PUPILS}</g>{MOUTH}</g>
    <g className="newton-frame-closed">{CLOSED_LIDS}</g>
  </g>;
}
const WIDE = <g>
  <g fill="#FFFFFF" stroke="#233D32" strokeWidth=".38"><ellipse cx="12.5" cy="18.2" rx="2.75" ry="3.6" /><ellipse cx="19.5" cy="18.2" rx="2.75" ry="3.6" /></g>
  <ellipse cx="12.5" cy="18.4" rx="1.45" ry="1.85" fill="#233D32" /><circle cx="12.05" cy="17.7" r=".45" fill="#FFFFFF" />
  <ellipse cx="19.5" cy="18.4" rx="1.45" ry="1.85" fill="#233D32" /><circle cx="19.05" cy="17.7" r=".45" fill="#FFFFFF" />
  <ellipse cx="16" cy="24" rx=".9" ry="1.1" fill="#233D32" />
</g>;
const INDICATORS: Record<NewtonIndicator, ReactNode> = {
  idle: null,
  question: <g transform="translate(-13 -7) scale(.57)"><g transform="rotate(-16 28 12)">
    <path d="M24 8.5C24 3.6 32.3 3.6 32.3 8.7C32.3 12 28 12 28 14.4" fill="none" stroke="#D5A51C" strokeWidth="2.5" strokeLinecap="round" /><circle cx="28" cy="18" r="1.5" fill="#D5A51C" />
  </g></g>,
  error: <g transform="translate(-13 -7) scale(.57)"><g transform="rotate(-16 28 12)">
    <path d="M28 5.5V14" fill="none" stroke="#C74438" strokeWidth="2.7" strokeLinecap="round" /><circle cx="28" cy="18" r="1.5" fill="#C74438" />
  </g></g>,
};

// Correct-step celebration faces: squeezed shut before the pop, happy with cheeks after reforming.
const SQUEEZE = <g className="newton-face-squeeze">
  <path d="M10.4 18.2L12.9 19.2L10.4 20.2M21.6 18.2L19.1 19.2L21.6 20.2" fill="none" stroke="#233D32" strokeWidth=".6" strokeLinecap="round" strokeLinejoin="round" />
  <path d="M14.7 23Q16 23.6 17.3 23" fill="none" stroke="#233D32" strokeWidth=".55" strokeLinecap="round" />
</g>;
const HAPPY = <g className="newton-face-happy">
  <path d="M10.3 19.4Q12.65 17.2 15 19.4M17 19.4Q19.35 17.2 21.7 19.4" fill="none" stroke="#233D32" strokeWidth=".6" strokeLinecap="round" />
  <path d="M13.6 22.4Q16 25.4 18.4 22.4Z" fill="#233D32" />
  <ellipse cx="9.6" cy="22" rx="1.3" ry=".8" fill="#D98A74" opacity=".8" /><ellipse cx="22.4" cy="22" rx="1.3" ry=".8" fill="#D98A74" opacity=".8" />
</g>;

export default function NewtonApple({ indicator = "idle", held = false, gaze = DEFAULT_GAZE, celebrating = false }: { indicator?: NewtonIndicator; held?: boolean; gaze?: Gaze; celebrating?: boolean }) {
  const face = held ? WIDE : celebrating
    ? <><g className="newton-face-gaze"><GazingFace gaze={gaze} /></g>{SQUEEZE}{HAPPY}</>
    : <GazingFace gaze={gaze} />;
  return <span className="newton-apple" data-indicator={indicator} data-held={held} data-celebrating={celebrating} aria-hidden="true">
    <svg viewBox="-6 -7 40 40" width="64" height="64" focusable="false">
      <g className="newton-apple-body" transform={`rotate(${held ? 8 : -4} 16 18)`}>{BODY}{face}</g>
      {INDICATORS[indicator]}
    </svg>
  </span>;
}
