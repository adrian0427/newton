import { describe, expect, it } from "vitest";
import { CONFETTI_COUNT, confettiPieces, shouldCelebrate } from "@/components/tutor/celebration";

describe("correct-step celebration", () => {
  it("celebrates only a confirmed correct Check work, once per revision", () => {
    expect(shouldCelebrate({ status: "correct" }, false, "rev-1", null)).toBe(true);
    expect(shouldCelebrate({ status: "correct" }, false, "rev-1", "rev-1")).toBe(false);
    expect(shouldCelebrate({ status: "correct" }, false, "rev-2", "rev-1")).toBe(true);
    expect(shouldCelebrate({ status: "correct" }, true, "rev-1", null)).toBe(false);
    expect(shouldCelebrate({ status: "incorrect" }, false, "rev-1", null)).toBe(false);
    expect(shouldCelebrate({ status: "unsupported" }, false, "rev-1", null)).toBe(false);
  });

  it("generates the same confetti every time", () => {
    expect(confettiPieces("all")).toEqual(confettiPieces("all"));
    expect(confettiPieces("all")).toHaveLength(CONFETTI_COUNT);
  });

  it("fans docked confetti toward the page, away from the right edge", () => {
    for (const piece of confettiPieces("left")) expect(piece.x).toBeLessThan(15);
    const all = confettiPieces("all");
    expect(all.some((piece) => piece.x > 40)).toBe(true);
    expect(all.some((piece) => piece.x < -40)).toBe(true);
  });
});
