import { vi } from "vitest";

export function streamedRequest(path: string, chunks: Uint8Array[], headers: Record<string, string> = {}, cancelResult?: () => void | Promise<void>) {
  let delivered = 0;
  const cancel = vi.fn(cancelResult);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (delivered === chunks.length) controller.close();
      else controller.enqueue(chunks[delivered++]);
    },
    cancel,
  }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST", body, duplex: "half",
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...headers },
  };
  return { request: new Request(`http://localhost:3000${path}`, init), body, cancel, delivered: () => delivered };
}

export function bytes(text: string) { return new TextEncoder().encode(text); }
