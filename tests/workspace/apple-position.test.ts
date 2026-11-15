import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION, DOCK_ZONE, dropPosition, gazeOffsets, gazeToward, movePosition, parsePosition, positionCenter, serializePosition } from "@/components/tutor/apple-position";

const viewport = { width: 1000, height: 800 };

describe("Newton apple position", () => {
  it("rejects malformed or out-of-range stored positions", () => {
    for (const raw of [null, "", "not json", "null", "[]", '{"mode":"free","x":2,"y":0.5}', '{"mode":"dock"}', '{"mode":"orbit","y":0.5}', '{"mode":"free","x":"0.5","y":0.5}']) {
      expect(parsePosition(raw)).toEqual(DEFAULT_POSITION);
    }
  });

  it("round-trips valid positions", () => {
    for (const position of [{ mode: "dock", y: 0.2 }, { mode: "free", x: 0.3, y: 0.7 }] as const) {
      expect(parsePosition(serializePosition(position))).toEqual(position);
    }
  });

  it("docks when released within the right-edge zone and frees him elsewhere", () => {
    expect(dropPosition(viewport.width - DOCK_ZONE, 400, viewport)).toEqual({ mode: "dock", y: 0.5 });
    expect(dropPosition(viewport.width - DOCK_ZONE - 1, 400, viewport)).toEqual({ mode: "free", x: 0.951, y: 0.5 });
    expect(dropPosition(-50, 2000, viewport)).toEqual({ mode: "free", x: 0, y: 1 });
  });

  it("keeps the placed apple fully on screen", () => {
    expect(positionCenter({ mode: "free", x: 0, y: 1 }, viewport)).toEqual({ x: 32, y: 768 });
    expect(positionCenter({ mode: "dock", y: 0 }, viewport)).toEqual({ x: 968, y: 32 });
  });

  it("moves with the keyboard: along the edge while docked, out with left, back in with right", () => {
    expect(movePosition({ mode: "dock", y: 0.5 }, "ArrowUp", false, viewport)).toEqual({ mode: "dock", y: 0.48 });
    expect(movePosition({ mode: "dock", y: 0.5 }, "ArrowRight", false, viewport)).toEqual({ mode: "dock", y: 0.5 });
    const out = movePosition({ mode: "dock", y: 0.5 }, "ArrowLeft", false, viewport);
    expect(out.mode).toBe("free");
    let back = out;
    for (let i = 0; i < 6 && back.mode === "free"; i++) back = movePosition(back, "ArrowRight", false, viewport);
    expect(back.mode).toBe("dock");
    expect(movePosition({ mode: "free", x: 0.5, y: 0.5 }, "ArrowDown", true, viewport)).toEqual({ mode: "free", x: 0.5, y: 0.58 });
  });
});

describe("Newton gaze", () => {
  const whiteboard = { left: 400, top: 0, width: 600, height: 800 }; // center (700, 400)

  it("looks at the whiteboard center from any side", () => {
    expect(gazeToward({ x: 100, y: 400 }, whiteboard)).toEqual({ x: 1, y: 0 });
    expect(gazeToward({ x: 700, y: 700 }, whiteboard)).toEqual({ x: 0, y: -1 });
    expect(gazeToward({ x: 400, y: 100 }, whiteboard)).toEqual({ x: 0.71, y: 0.71 });
  });

  it("looks straight ahead near the target or when the whiteboard is hidden", () => {
    expect(gazeToward({ x: 740, y: 430 }, whiteboard)).toEqual({ x: 0, y: 0 });
    expect(gazeToward({ x: 100, y: 400 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
    expect(gazeToward({ x: 100, y: 400 }, null)).toEqual({ x: 0, y: 0 });
  });

  it("matches the approved left-looking face when looking west", () => {
    const { face, pupils } = gazeOffsets({ x: -1, y: 0 });
    expect(face.x).toBeCloseTo(-2.85);
    expect(pupils.x).toBeCloseTo(-1.05);
  });
});
