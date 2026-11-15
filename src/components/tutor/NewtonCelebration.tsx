import type { CSSProperties } from "react";
import { confettiPieces } from "./celebration";

const PIECES = { all: confettiPieces("all"), left: confettiPieces("left") };
// Reduced motion: five still sparkles around Newton instead of a burst.
const SPARKLES = [[-44, -34, "#D5A51C", 0], [46, -28, "#718365", 30], [-52, 18, "#B85C46", -20], [52, 26, "#D5A51C", 45], [0, -62, "#D98A74", 15]] as const;

/** Decoration only: never focusable, never blocks the page, removed after the celebration. */
export default function NewtonCelebration({ x, y, fan }: { x: number; y: number; fan: "all" | "left" }) {
  return <div className="newton-celebration" data-fan={fan} style={{ left: x, top: y }} aria-hidden="true">
    <span className="newton-pop-ring" />
    {PIECES[fan].map((piece, i) => <span key={i} className={`newton-confetti newton-confetti-${piece.shape}`} style={{
      "--x": `${piece.x}px`, "--y": `${piece.y}px`, "--fall": `${piece.fall}px`, "--rotate": `${piece.rotate}deg`,
      "--size": `${piece.size}px`, "--delay": `${piece.delay}ms`, background: piece.color,
    } as CSSProperties} />)}
    {SPARKLES.map(([dx, dy, color, rotate], i) => <span key={i} className="newton-sparkle" style={{ "--x": `${dx}px`, "--y": `${dy}px`, "--rotate": `${rotate}deg`, background: color } as CSSProperties} />)}
  </div>;
}
