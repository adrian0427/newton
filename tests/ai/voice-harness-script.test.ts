import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "newton-voice-harness-"));
  temporary.push(root);
  mkdirSync(join(root, "scripts"));
  const script = join(root, "scripts/dev-voice.mjs");
  copyFileSync("scripts/dev-voice.mjs", script);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", VERCEL: "", VERCEL_ENV: "", CI: "" };
  return { root, script, env };
}

it("generates and cleans its route plus stale route types without touching other source", () => {
  const { root, script, env } = fixture();
  execFileSync(process.execPath, [script, "--prepare-only"], { env });
  const page = join(root, "src/app/dev/voice/page.tsx");
  const study = join(root, "src/app/dev/study/page.tsx");
  expect(existsSync(page)).toBe(true);
  expect(readFileSync(study, "utf8")).toContain("isLocalVoiceHarnessAllowed");
  expect(readFileSync(study, "utf8")).toContain("StudyShell developmentVoiceCapability");
  for (const path of [".next/dev/types", ".next/types"]) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "validator.ts"), 'import "../../../src/app/dev/voice/page.js";');
  }
  writeFileSync(join(root, "src/app/keep.tsx"), "Other developer's source");
  execFileSync(process.execPath, [script, "--clean"], { env });
  expect(existsSync(page)).toBe(false);
  expect(existsSync(study)).toBe(false);
  expect(existsSync(join(root, ".next/dev/types"))).toBe(false);
  expect(existsSync(join(root, ".next/types"))).toBe(false);
  expect(existsSync(join(root, "src/app/keep.tsx"))).toBe(true);
});

it("does not partially generate routes or remove another developer's study page", () => {
  const { root, script, env } = fixture();
  const directory = join(root, "src/app/dev/study");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "page.tsx"), "Other source");
  expect(spawnSync(process.execPath, [script, "--prepare-only"], { env }).status).toBe(1);
  expect(existsSync(join(root, "src/app/dev/voice/page.tsx"))).toBe(false);
  execFileSync(process.execPath, [script, "--clean"], { env });
  expect(readFileSync(join(directory, "page.tsx"), "utf8")).toBe("Other source");
});

it("refuses to replace another developer's page and cannot prepare in production", () => {
  const { root, script, env } = fixture();
  const directory = join(root, "src/app/dev/voice");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "page.tsx"), "Existing page");
  const result = spawnSync(process.execPath, [script, "--prepare-only"], { env, encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("refusing to overwrite");
  const production = spawnSync(process.execPath, [script, "--prepare-only"], { env: { ...env, NODE_ENV: "production" }, encoding: "utf8" });
  expect(production.status).toBe(1);
  expect(production.stderr).toContain("local development only");
});
