/**
 * Device-local workspace persistence (IndexedDB). Nothing here leaves the browser.
 * Each part is stored under its own key so a failure in one never blocks the others.
 * Stored values are treated as untrusted on read and validated before use.
 */

const DB_NAME = "newton-workspace";
const STORE = "parts";
const VERSION = 1;

export type SavedBoard = { elements: unknown[]; files: Record<string, unknown> };
export type SavedWork = { expression: string; source: "whiteboard" | "expression"; splitWidth: number };
export type SavedWorksheet = { name: string; type: string; blob: Blob };

type Parts = { board: SavedBoard; work: SavedWork; worksheet: SavedWorksheet };
export type PartKey = keyof Parts;

const MAX_EXPRESSION = 500;
const MAX_WORKSHEET_BYTES = 20 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBoard(value: unknown): SavedBoard | null {
  if (!isRecord(value) || !Array.isArray(value.elements) || !isRecord(value.files)) return null;
  if (!value.elements.every((element) => isRecord(element) && typeof element.id === "string" && typeof element.type === "string")) return null;
  return { elements: value.elements, files: value.files };
}

export function parseWork(value: unknown): SavedWork | null {
  if (!isRecord(value)) return null;
  const { expression, source, splitWidth } = value;
  if (typeof expression !== "string" || expression.length > MAX_EXPRESSION) return null;
  if (source !== "whiteboard" && source !== "expression") return null;
  if (typeof splitWidth !== "number" || !Number.isFinite(splitWidth)) return null;
  return { expression, source, splitWidth: Math.min(70, Math.max(30, splitWidth)) };
}

export function parseWorksheet(value: unknown): SavedWorksheet | null {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.type !== "string") return null;
  if (typeof Blob === "undefined" || !(value.blob instanceof Blob) || value.blob.size > MAX_WORKSHEET_BYTES) return null;
  return { name: value.name.slice(0, 255), type: value.type, blob: value.blob };
}

const parsers: { [K in PartKey]: (value: unknown) => Parts[K] | null } = { board: parseBoard, work: parseWork, worksheet: parseWorksheet };

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => { opening = null; throw error; });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Returns null when absent, invalid, or storage is unavailable (private mode, quota, etc.). */
export async function loadPart<K extends PartKey>(key: K, scope?: string): Promise<Parts[K] | null> {
  try { return parsers[key](await run("readonly", (store) => store.get(scope ? [scope, key] : key))); } catch { return null; }
}

export async function savePart<K extends PartKey>(key: K, value: Parts[K], scope?: string): Promise<void> {
  try { await run("readwrite", (store) => store.put(value, scope ? [scope, key] : key)); } catch { /* Persistence is best effort; the live workspace still works. */ }
}

export async function deletePart(key: PartKey, scope?: string): Promise<void> {
  try { await run("readwrite", (store) => store.delete(scope ? [scope, key] : key)); } catch { /* best effort */ }
}
