import { describe, expect, it, vi, afterEach } from "vitest";
import { WorkRevision, SnapshotDownload, contentSignature, expressionContent, pngContent, MAX_IMAGE_BYTES } from "@/components/whiteboard/snapshots";
import { normalizeExpression } from "@/components/whiteboard/expressions";

afterEach(() => vi.restoreAllMocks());

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("revision-safe snapshots", () => {
  it("preserves the captured revision and UTC timestamp", async () => {
    const work = new WorkRevision();
    const revisionId = work.current;
    const snapshot = await work.capture(async () => expressionContent(" 2*(x+3)=14 "));
    expect(snapshot).toEqual({ revisionId, capturedAt: expect.stringMatching(/Z$/), structuredExpression: "2*(x+3)=14" });
    work.edit();
    expect(work.current).not.toBe(revisionId);
  });
  it.each(["edit", "invalidate"] as const)("rejects late export after %s", async (action) => {
    const work = new WorkRevision();
    const content = pending<{ structuredExpression: string }>();
    const capture = work.capture(() => content.promise);
    work[action]();
    content.resolve({ structuredExpression: "x=4" });
    await expect(capture).rejects.toThrow("changed during capture");
  });
  it("only publishes the most recent concurrent export", async () => {
    const work = new WorkRevision();
    const content = pending<{ structuredExpression: string }>();
    const first = work.capture(() => content.promise);
    const second = await work.capture(async () => expressionContent("x=4"));
    content.resolve({ structuredExpression: "x=4" });
    await expect(first).rejects.toThrow("changed during capture");
    expect(second.structuredExpression).toBe("x=4");
  });
  it("ignores viewport and selection but detects drawing, erase, undo, redo, and clear", () => {
    const original = [{ id: "stroke", version: 1, versionNonce: 1, isDeleted: false }];
    const selected = { elements: original, zoom: 2, selectedElementIds: { stroke: true } };
    expect(contentSignature(selected.elements)).toBe(contentSignature(original));
    expect(contentSignature([{ ...original[0], version: 2, versionNonce: 2 }])).not.toBe(contentSignature(original));
    const erased = [{ ...original[0], isDeleted: true }];
    expect(contentSignature(erased)).toBe(contentSignature([]));
    expect(contentSignature(original)).not.toBe(contentSignature(erased));
  });
  it("rejects empty or oversized structured input and images", async () => {
    expect(() => expressionContent("  ")).toThrow("Write an expression");
    expect(() => expressionContent("x".repeat(501))).toThrow("500");
    await expect(pngContent(new Blob([], { type: "image/png" }))).rejects.toThrow("PNG");
    await expect(pngContent(new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: "image/png" }))).rejects.toThrow("2 MiB");
    await expect(pngContent(new Blob(["x"], { type: "text/plain" }))).rejects.toThrow("PNG");
  });
  it("revokes object URLs on replacement and repeated cleanup", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const download = new SnapshotDownload();
    download.replace(new Blob(["one"]));
    download.replace(new Blob(["two"]));
    download.clear(); download.clear();
    expect(create).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
  });
});

describe("MathLive ASCIIMath transport", () => {
  it.each([
    ["2(x+3)=14", "2*(x+3)=14"],
    ["2 x + 6 = 14", "2*x+6=14"],
    ["(x+3)/2=7", "(x+3)/2=7"],
    ["x^2 + 2x - 3=0", "x^2+2*x-3=0"],
    ["−2×x=4", "-2*x=4"],
    ["", ""],
  ])("normalizes %s without claiming correctness", (input, output) => {
    expect(normalizeExpression(input)).toBe(output);
  });
  it.each(["sqrt(x)", "x≤3", "\\frac{x}{2}", "2+", "(x+3", "x==4", "1 2", "2..3", "x=", "sin(x)", "x_2", "( )"])("rejects unsupported or incomplete notation %s", (input) => {
    expect(() => normalizeExpression(input)).toThrow();
  });
});
