import { expect, it } from "vitest";
import { readBoundedText, RequestBodyTooLargeError } from "@/lib/http/body";
import { bytes, streamedRequest } from "./helpers/requests";

it("stops and cancels on the first excessive chunk without reading the remainder", async () => {
  const stream = streamedRequest("/", [bytes("1234"), bytes("5678"), bytes("9"), bytes("unread")]);
  await expect(readBoundedText(stream.request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(stream.delivered()).toBe(3);
  expect(stream.cancel).toHaveBeenCalledOnce();
  expect(stream.body.locked).toBe(false);
});

const lengthHeaders: Record<string, string>[] = [{}, { "content-length": "1" }, { "content-length": "invalid" }];
it.each(lengthHeaders)("enforces actual input despite absent/understated/invalid length (%j)", async (headers) => {
  const stream = streamedRequest("/", [bytes("123456789"), bytes("unread")], headers);
  await expect(readBoundedText(stream.request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(stream.delivered()).toBe(1);
});

it("rejects an excessive declared byte size without reading", async () => {
  const stream = streamedRequest("/", [bytes("unread")], { "content-length": "28" });
  await expect(readBoundedText(stream.request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(stream.delivered()).toBe(0);
  expect(stream.cancel).toHaveBeenCalledOnce();
});

it.each([() => Promise.reject(new Error("private cancellation failure")), () => new Promise<void>(() => {})])(
  "returns promptly even when cancellation fails or never settles (%#)", async (cancelResult) => {
    const stream = streamedRequest("/", [bytes("123456789")], {}, cancelResult);
    await expect(readBoundedText(stream.request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.body.locked).toBe(false);
  },
);

it("preserves exact Unicode/whitespace at the character boundary across split UTF-8 chunks", async () => {
  const text = " é🧮中 ";
  const encoded = bytes(text);
  const stream = streamedRequest("/", [...encoded].map((byte) => Uint8Array.of(byte)));
  expect(await readBoundedText(stream.request, text.length)).toBe(text);
  expect(stream.cancel).not.toHaveBeenCalled();
  expect(stream.body.locked).toBe(false);
});

it("enforces the independent byte bound before decoding an excessive chunk", async () => {
  const stream = streamedRequest("/", [new Uint8Array(28), bytes("unread")]);
  await expect(readBoundedText(stream.request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  expect(stream.delivered()).toBe(1);
});

it("counts a replacement character emitted only when the decoder is flushed", async () => {
  const stream = streamedRequest("/", [bytes("12345678"), Uint8Array.of(0xc3)]);
  await expect(readBoundedText(stream.request, 8)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
});

it("accepts empty bodies", async () => {
  expect(await readBoundedText(new Request("http://localhost/"), 8)).toBe("");
  expect(await readBoundedText(streamedRequest("/", []).request, 8)).toBe("");
});

it("preserves the optional UTF-8 BOM at the maximum multibyte boundary", async () => {
  const stream = streamedRequest("/", [bytes("\uFEFF" + "中".repeat(8))]);
  expect(await readBoundedText(stream.request, 8)).toBe("中".repeat(8));
});
