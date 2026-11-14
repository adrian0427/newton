export class RequestBodyTooLargeError extends Error {}

/** Preserve Request.text() decoding and existing UTF-16 limits with bounded input. */
export async function readBoundedText(request: Request, maxCharacters: number): Promise<string> {
  // UTF-8 needs at most three bytes per UTF-16 code unit, plus an optional BOM
  // which TextDecoder strips. This preserves valid Unicode/password behavior.
  const maxBytes = maxCharacters * 3 + 3;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const declared = request.headers.get("content-length") ?? "";
    if (/^\d+$/.test(declared) && Number(declared) > maxBytes) throw new RequestBodyTooLargeError();
    if (!request.body) return "";
    reader = request.body.getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    let bytes = 0;
    let characters = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (value) bytes += value.byteLength;
      if (bytes > maxBytes) throw new RequestBodyTooLargeError();
      const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
      characters += text.length;
      if (characters > maxCharacters) throw new RequestBodyTooLargeError();
      if (text) parts.push(text);
      if (done) return parts.join("");
    }
  } catch (error) {
    // Untrusted cancellation may reject or never settle; it must not delay 413.
    try { void (reader ?? request.body)?.cancel().catch(() => undefined); } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    reader?.releaseLock();
  }
}
