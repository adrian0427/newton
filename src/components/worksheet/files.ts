export const MAX_WORKSHEET_BYTES = 20 * 1024 * 1024;

/** Inspect file bytes rather than trusting a name or browser-supplied MIME type. */
export async function worksheetKind(file: Blob): Promise<"pdf" | "image"> {
  if (!file.size) throw new Error("This file is empty. Choose a PDF or image.");
  if (file.size > MAX_WORKSHEET_BYTES) throw new Error("Choose a worksheet smaller than 20 MiB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) || starts(0xff, 0xd8, 0xff)
    || (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")) return "image";
  throw new Error("Choose a PDF, PNG, JPEG, or WebP image.");
}
