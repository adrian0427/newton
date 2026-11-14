import type { WorkSnapshot } from "@/types/tutoring";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_EXPRESSION_LENGTH = 500;

/** One clock per local workspace. Content edits, including undo, invalidate captures. */
export class WorkRevision {
  private revision = crypto.randomUUID();
  private generation = 0;
  get current() { return this.revision; }
  edit() { this.revision = crypto.randomUUID(); this.generation++; }
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
