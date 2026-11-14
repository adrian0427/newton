import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["node_modules/@excalidraw/excalidraw/dist/prod/fonts", "public/vendor/excalidraw/fonts"],
  ["node_modules/mathlive/fonts", "public/vendor/mathlive/fonts"],
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/vendor/pdfjs/pdf.worker.min.mjs"],
  ["node_modules/pdfjs-dist/cmaps", "public/vendor/pdfjs/cmaps"],
  ["node_modules/pdfjs-dist/standard_fonts", "public/vendor/pdfjs/standard_fonts"],
  ["node_modules/pdfjs-dist/wasm", "public/vendor/pdfjs/wasm"],
];
for (const [source, destination] of copies) {
  await mkdir(dirname(resolve(root, destination)), { recursive: true });
  await cp(resolve(root, source), resolve(root, destination), { recursive: true });
}
