import type { DistributionCheck } from "@/lib/math/check-distribution";

/** Total length of the correct-step celebration (Figma "Newton / Correct-step celebration"). */
export const CELEBRATION_MS = 1900;
export const CONFETTI_COUNT = 30;
const PALETTE = ["#B85C46", "#718365", "#D5A51C", "#EBD9B4", "#D98A74", "#233D32"] as const;
const SHAPES = ["rect", "rect", "circle", "strip", "leaf"] as const;

/**
 * Celebrates only a confirmed correct Check work result, once per submitted revision.
 * Hints, incorrect, and unsupported (whiteboard, worksheet, input errors) never celebrate.
 */
export function shouldCelebrate(result: Pick<DistributionCheck, "status">, showHint: boolean, workKey: string, lastCelebrated: string | null): boolean {
  return !showHint && result.status === "correct" && workKey !== lastCelebrated;
}

export type ConfettiPiece = {
  /** Burst end offset from Newton's center, px. */
  x: number; y: number;
  /** Extra fall during the drift, px. */
  fall: number;
  rotate: number; size: number; delay: number;
  color: (typeof PALETTE)[number]; shape: (typeof SHAPES)[number];
};

/**
 * Deterministic so server and client agree and tests are stable. Docked, the
 * burst fans left toward the page instead of spraying past the screen edge.
 */
export function confettiPieces(fan: "all" | "left", count = CONFETTI_COUNT, seed = 7): ConfettiPiece[] {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, (_, i) => {
    const t = i / count;
    const angle = fan === "all"
      ? -Math.PI / 2 + t * Math.PI * 2 + (random() - 0.5) * 0.35
      : Math.PI * (0.55 + t * 0.9) + (random() - 0.5) * 0.2;
    const distance = 70 + random() * 70;
    return {
      x: Math.round(Math.cos(angle) * distance), y: Math.round(Math.sin(angle) * distance),
      fall: Math.round(90 + random() * 70), rotate: Math.round((random() - 0.5) * 540),
      size: Math.round((5 + random() * 4) * 10) / 10, delay: Math.round(random() * 40),
      color: PALETTE[i % PALETTE.length], shape: SHAPES[i % SHAPES.length],
    };
  });
}
