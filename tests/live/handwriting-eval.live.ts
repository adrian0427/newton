import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decodePngDataUrl, transcribeHandwriting, VisionError } from "@/lib/vision/handwriting";
import { selectVisionAdapter } from "@/lib/vision/providers";
import { checkDistribution } from "@/lib/math/check-distribution";
import { normalizeExpression } from "@/components/whiteboard/expressions";

// REAL MODEL, opt-in only. Makes no request unless NEWTON_EVAL_CONFIRM=1.
// Fixtures are the developer's own exact "Download the exact image read" PNGs in the
// Git-ignored tmp/handwriting-eval directory, listed in cases.json:
//   [{ "file": "two-line.png", "expected": "7(6k+2)=42k+2", "problem": "7(6k+2)" }, ...]
// Output reports match/mismatch, status and checker verdict. Model text is printed only
// with NEWTON_EVAL_SHOW_TEXT=1, and never written to disk.
type Case = { file: string; expected: string; problem: string };
const directory = process.env.NEWTON_EVAL_DIR ?? "tmp/handwriting-eval";
const confirmed = process.env.NEWTON_EVAL_CONFIRM === "1";
const providers = (process.env.NEWTON_EVAL_PROVIDERS ?? "groq").split(",").map((name) => name.trim()).filter(Boolean);
const repeats = Math.max(1, Math.min(3, Number(process.env.NEWTON_EVAL_REPEATS ?? 1)));
const spacingMs = Math.max(0, Number(process.env.NEWTON_EVAL_SPACING_MS ?? 25_000)); // Groq free tier: 8K tokens/min, ~2.5K per image.

function load(): Case[] {
  const manifest = join(directory, "cases.json");
  if (!existsSync(manifest)) return [];
  const cases = JSON.parse(readFileSync(manifest, "utf8")) as Case[];
  if (!Array.isArray(cases) || cases.length > 6 || cases.some((item) => typeof item?.file !== "string" || typeof item.expected !== "string" || typeof item.problem !== "string")) {
    throw new Error("cases.json must list at most six { file, expected, problem } entries");
  }
  return cases;
}
function available(provider: string) {
  try { return selectVisionAdapter({ ...process.env, NEWTON_VISION_PROVIDER: provider }, fetch).provider === provider; } catch { return false; }
}
const verdict = (text: string, problem: string) => { try { return checkDistribution(normalizeExpression(text), problem).status; } catch { return "unparseable"; } };

it.skipIf(!confirmed)("compares providers on identical genuine Excalidraw exports", async () => {
  const cases = load();
  const arms = providers.filter(available);
  const planned = cases.length * arms.length * repeats;
  console.log(`handwriting eval: ${cases.length} image(s) × ${arms.length} provider(s) [${arms.join(", ") || "none configured"}] × ${repeats} repeat(s) = ${planned} provider call(s)`);
  expect(planned).toBeGreaterThan(0);
  expect(planned).toBeLessThanOrEqual(18);
  let calls = 0;
  for (const item of cases) {
    const bytes = readFileSync(join(directory, item.file));
    const png = decodePngDataUrl(`data:image/png;base64,${bytes.toString("base64")}`);
    if (!png) throw new Error(`${item.file} is not a bounded PNG accepted by the transcription route`);
    const expected = normalizeExpression(item.expected);
    for (const provider of arms) {
      for (let repeat = 1; repeat <= repeats; repeat++) {
        if (calls++ && spacingMs) await new Promise((resolve) => setTimeout(resolve, spacingMs));
        const started = Date.now();
        let line: string;
        try {
          const result = await transcribeHandwriting(png, { env: { ...process.env, NEWTON_VISION_PROVIDER: provider }, timeoutMs: 30_000 });
          const text = result.status === "unreadable" ? "" : result.text;
          let normalized = "";
          try { normalized = text ? normalizeExpression(text.replaceAll("?", "")) : ""; } catch { normalized = ""; }
          const exact = result.status === "transcribed" && normalized === expected;
          line = `${result.status}; exact=${exact}; checker expected=${verdict(item.expected, item.problem)} got=${text && !text.includes("?") ? verdict(text, item.problem) : "n/a"}`
            + (process.env.NEWTON_EVAL_SHOW_TEXT === "1" ? `; text=${JSON.stringify(text)}` : "");
        } catch (error) {
          line = `error=${error instanceof VisionError ? `${error.code}${error.reason ? `/${error.reason}` : ""}` : "unexpected"}`;
        }
        console.log(`${item.file} · ${provider} #${repeat}: ${line}; ${Date.now() - started} ms`);
      }
    }
  }
}, 15 * 60_000);

it.runIf(!confirmed)("is skipped unless NEWTON_EVAL_CONFIRM=1", () => { expect(confirmed).toBe(false); });
