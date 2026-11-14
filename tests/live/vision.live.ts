import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decodePngDataUrl, transcribeHandwriting } from "@/lib/vision/handwriting";
import { selectVisionAdapter } from "@/lib/vision/providers";
import { checkDistribution } from "@/lib/math/check-distribution";
import { normalizeExpression } from "@/components/whiteboard/expressions";

// REAL MODEL: opt-in only (npm run test:vision). Uses GROQ_API_KEY or GEMINI_API_KEY from the local environment.
// Images are rendered in Excalidraw's handwriting font, not photographed student handwriting.
const configured = (() => { try { selectVisionAdapter(process.env, fetch); return true; } catch { return false; } })();
const fontDirectory = "public/vendor/excalidraw/fonts/Excalifont";
let browser: Browser | undefined;

beforeAll(async () => { if (configured) browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });

async function render(text: string): Promise<Uint8Array> {
  // Excalifont ships as unicode-range subsets; listing every subset lets the browser compose all glyphs.
  const faces = readdirSync(fontDirectory).filter((name) => name.endsWith(".woff2"))
    .map((name) => `@font-face{font-family:Hand;src:url(data:font/woff2;base64,${readFileSync(join(fontDirectory, name)).toString("base64")}) format("woff2")}`).join("");
  const page = await browser!.newPage({ viewport: { width: 900, height: 260 } });
  await page.setContent(`<style>${faces}body{margin:0;background:#fff}p{font:64px Hand;color:#39352f;padding:60px 48px;margin:0;white-space:nowrap}</style><p></p>`);
  await page.locator("p").evaluate((element, value) => { element.textContent = value; }, text);
  await page.evaluate(() => document.fonts.ready);
  const image = await page.locator("p").screenshot({ type: "png" });
  await page.close();
  const png = decodePngDataUrl(`data:image/png;base64,${image.toString("base64")}`);
  if (!png) throw new Error("Rendered fixture exceeds the request bounds");
  return png;
}

it.skipIf(!configured).each([
  ["4(x+3)=4x+12", "correct"],
  ["-4(x+3)=-4x+-12", "correct"],
  ["4(x+3)=4x+3", "incorrect"],
])("transcribes %s exactly, leaving grading to the deterministic checker", async (written, expected) => {
  const result = await transcribeHandwriting(await render(written), { timeoutMs: 30_000 });
  expect(result.status).toBe("transcribed");
  if (result.status !== "transcribed") return;
  const transcribed = normalizeExpression(result.text);
  expect(transcribed).toBe(normalizeExpression(written));
  const problem = written.startsWith("-") ? "-4(x+3)" : "4(x+3)";
  expect(checkDistribution(transcribed, problem).status).toBe(expected);
}, 60_000);

it.runIf(!configured)("is skipped because no vision provider key is configured", () => {
  expect(configured).toBe(false);
});
