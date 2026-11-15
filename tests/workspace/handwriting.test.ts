import { expect, it, vi } from "vitest";
import { handwritingExportDimensions, requestTranscription, reviewDraft } from "@/components/whiteboard/handwriting";
import type { WorkSnapshot } from "@/types/tutoring";

// Client contract tests with a mocked server response.
const snapshot: WorkSnapshot = { revisionId: "revision-1", capturedAt: "2026-11-14T00:00:00.000Z", image: { kind: "data-url", value: "data:image/png;base64,AAAA" } };
const reply = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status }));
const signal = new AbortController().signal;

it("sends only the revision and image, and accepts a matching transcription", async () => {
  const fetchMock = reply(200, { transcription: { revisionId: "revision-1", status: "transcribed", text: "4(x+3)=4x+3" } });
  await expect(requestTranscription(snapshot, signal, fetchMock)).resolves.toEqual({ revisionId: "revision-1", status: "transcribed", text: "4(x+3)=4x+3" });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/work/transcribe");
  expect(JSON.parse(String(init.body))).toEqual({ revisionId: "revision-1", image: snapshot.image!.value });
});
it("rejects a response for another revision and malformed transcriptions", async () => {
  await expect(requestTranscription(snapshot, signal, reply(200, { transcription: { revisionId: "revision-0", status: "transcribed", text: "4x+12" } }))).rejects.toMatchObject({ code: "invalid-response" });
  await expect(requestTranscription(snapshot, signal, reply(200, { transcription: { revisionId: "revision-1", status: "transcribed", text: "<b>4x</b>" } }))).rejects.toMatchObject({ code: "invalid-response" });
  await expect(requestTranscription(snapshot, signal, reply(200, { transcription: { revisionId: "revision-1", status: "ambiguous", text: "4x+12" } }))).rejects.toMatchObject({ code: "invalid-response" });
});
it("explains sign-in, missing configuration and rate limits without exposing internals", async () => {
  await expect(requestTranscription(snapshot, signal, reply(401, { error: { code: "unauthenticated", message: "Please sign in." } }))).rejects.toThrow("Sign in to use handwriting recognition");
  await expect(requestTranscription(snapshot, signal, reply(503, { error: { code: "vision-not-configured", message: "Handwriting recognition is not configured on this server. Use Structured input instead." } }))).rejects.toMatchObject({ code: "vision-not-configured" });
  await expect(requestTranscription(snapshot, signal, reply(429, { error: { code: "rate-limited", message: "x".repeat(400) } }))).rejects.toThrow("Try again, or use Structured input");
});
it("requires the student to resolve unclear symbols before confirming", () => {
  expect(reviewDraft("4(x+?)=4x+12").error).toContain("Replace each ?");
  expect(reviewDraft("").error).not.toBe("");
  expect(reviewDraft("4(x+3)=4x+3")).toEqual({ expression: "4*(x+3)=4*x+3", error: "" });
  expect(reviewDraft("4(x+3)=4x+3$").error).not.toBe("");
});

it.each([
  [445, 334, 890, 668], [1024, 512, 2048, 1024], [1500, 750, 2048, 1024], [4096, 1024, 2048, 512],
  [200, 1600, 256, 2048],
])("renders %s × %s strokes at up to 2x while keeping both image dimensions bounded", (width, height, expectedWidth, expectedHeight) => {
  const result = handwritingExportDimensions(width, height);
  expect(result.width).toBe(expectedWidth);
  expect(result.height).toBe(expectedHeight);
  expect(result.scale).toBeLessThanOrEqual(2);
  expect(Math.abs(result.width / result.height - width / height)).toBeLessThan(0.01);
});

it.each([[0, 100], [100, -1], [Infinity, 100], [100, NaN]])("rejects invalid drawing dimensions %s × %s", (width, height) => {
  expect(() => handwritingExportDimensions(width, height)).toThrow("Invalid drawing dimensions");
});
