import { describe, expect, it } from "vitest";
import { parseBoard, parseWork, parseWorksheet } from "@/components/whiteboard/persistence";

describe("workspace persistence validation", () => {
  it("accepts saved work and clamps the split width", () => {
    expect(parseWork({ expression: "2*(x+3)", source: "expression", splitWidth: 95 })).toEqual({ expression: "2*(x+3)", source: "expression", splitWidth: 70 });
  });
  it("rejects malformed or oversized work", () => {
    expect(parseWork(null)).toBeNull();
    expect(parseWork({ expression: 1, source: "expression", splitWidth: 40 })).toBeNull();
    expect(parseWork({ expression: "x", source: "camera", splitWidth: 40 })).toBeNull();
    expect(parseWork({ expression: "x".repeat(501), source: "whiteboard", splitWidth: 40 })).toBeNull();
    expect(parseWork({ expression: "x", source: "whiteboard", splitWidth: Number.NaN })).toBeNull();
  });
  it("validates board elements", () => {
    expect(parseBoard({ elements: [{ id: "a", type: "freedraw" }], files: {} })).not.toBeNull();
    expect(parseBoard({ elements: [{ type: "freedraw" }], files: {} })).toBeNull();
    expect(parseBoard({ elements: "nope", files: {} })).toBeNull();
  });
  it("validates worksheets", () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    expect(parseWorksheet({ name: "w.pdf", type: "application/pdf", blob })?.name).toBe("w.pdf");
    expect(parseWorksheet({ name: "w.pdf", type: "application/pdf", blob: "data" })).toBeNull();
  });
});
