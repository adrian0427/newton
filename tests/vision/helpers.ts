/** Minimal PNG header (signature + IHDR) for request validation tests; not a renderable image. */
export function pngDataUrl(width = 64, height = 32, padding = 0): string {
  const bytes = Buffer.alloc(33 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

export function groqReply(content: string) {
  return Response.json({ choices: [{ message: { role: "assistant", content } }] });
}

export function geminiReply(parts: { text: string; thought?: boolean }[]) {
  return Response.json({ candidates: [{ content: { role: "model", parts } }] });
}
