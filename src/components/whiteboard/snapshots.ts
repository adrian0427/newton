import type { WorkSnapshot } from "@/types/tutoring";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_EXPRESSION_LENGTH = 500;

/**
 * Unique identifier for a local workspace revision. Prefers crypto.randomUUID,
 * but falls back for older browsers (e.g. Safari before 15.4) where it is
 * undefined; uniqueness only needs to hold within this one browser workspace.
 */
function randomRevisionId(): string {
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  return `rev-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** One clock per local workspace. Content edits, including undo, invalidate captures. */
export class WorkRevision {
  private revision = randomRevisionId();
  private generation = 0;
  get current() { return this.revision; }
  edit() { this.revision = randomRevisionId(); this.generation++; }
  invalidate() { this.generation++; }
  async capture(content: () => Promise<Pick<WorkSnapshot, "image" | "structuredExpression">>): Promise<WorkSnapshot> {
    const revisionId = this.revision;
    const generation = ++this.generation;
    const result = await content();
    if (generation !== this.generation || revisionId !== this.revision) {
      throw new Error("Your work changed during capture. Capture again when you are ready.");
    }
    return { revisionId, capturedAt: new Date().toISOString(), ...result };
  }
}

/** App state (selection, zoom, pan) deliberately does not participate. */
export function contentSignature(elements: readonly { id: string; version: number; versionNonce: number; isDeleted: boolean }[]): string {
  return JSON.stringify(elements.filter((element) => !element.isDeleted).map(({ id, version, versionNonce }) => [id, version, versionNonce]));
}

export function expressionContent(expression: string) {
  const trimmed = expression.trim();
  if (!trimmed) throw new Error("Write an expression before capturing.");
  if (trimmed.length > MAX_EXPRESSION_LENGTH) throw new Error("Use an expression of 500 characters or fewer.");
  return { structuredExpression: trimmed };
}

export async function pngContent(blob: Blob): Promise<Pick<WorkSnapshot, "image">> {
  if (blob.type !== "image/png" || !blob.size) throw new Error("The whiteboard could not be exported as PNG. Try again.");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("This image exceeds 2 MiB. Try capturing a smaller drawing.");
  const value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the snapshot."));
    reader.onerror = () => reject(new Error("Could not read the snapshot."));
    reader.readAsDataURL(blob);
  });
  return { image: { kind: "data-url", value } };
}

/** Explicit local download only; revoked as soon as the work or download changes. */
export class SnapshotDownload {
  private url: string | null = null;
  replace(blob: Blob): string {
    this.clear();
    this.url = URL.createObjectURL(blob);
    return this.url;
  }
  clear() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
