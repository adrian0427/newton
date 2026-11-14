import { mkdir, readFile, writeFile, unlink, rmdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = new URL("../src/app/dev/voice/", import.meta.url);
const page = new URL("page.tsx", directory);
const source = `// Generated local voice harness. Do not commit.\nimport { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalVoiceHarnessAllowed } from "@/lib/ai/local-voice-guard";
import VoiceHarness from "@/lib/ai/dev/voice-harness";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isLocalVoiceHarnessAllowed({ nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV, ci: process.env.CI, host: (await headers()).get("host") }) || !process.env.NEWTON_VOICE_DEV_SECRET) notFound();
  return <VoiceHarness tokenCapability={process.env.NEWTON_VOICE_DEV_SECRET} />;
}
`;

const studyDirectory = new URL("../src/app/dev/study/", import.meta.url);
const studyPage = new URL("page.tsx", studyDirectory);
const studySource = `// Generated local study integration. Do not commit.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalVoiceHarnessAllowed } from "@/lib/ai/local-voice-guard";
import StudyShell from "@/components/whiteboard/StudyShell";
import "../../study/study.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isLocalVoiceHarnessAllowed({ nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV, ci: process.env.CI, host: (await headers()).get("host") }) || !process.env.NEWTON_VOICE_DEV_SECRET) notFound();
  return <StudyShell developmentVoiceCapability={process.env.NEWTON_VOICE_DEV_SECRET} />;
}
`;
const harnesses = [
  { directory, page, source, route: "src/app/dev/voice/page" },
  { directory: studyDirectory, page: studyPage, source: studySource, route: "src/app/dev/study/page" },
];

async function cleanup() {
  for (const harness of harnesses) {
    const current = await readFile(harness.page, "utf8").catch(() => null);
    if (current === harness.source) {
      await unlink(harness.page);
      await rmdir(harness.directory).catch(() => {});
    }
    if (current === null || current === harness.source) {
      for (const path of ["../.next/dev/types/", "../.next/types/"]) {
        const types = new URL(path, import.meta.url);
        const validator = await readFile(new URL("validator.ts", types), "utf8").catch(() => "");
        if (validator.includes(harness.route)) await rm(types, { recursive: true, force: true });
      }
    }
  }
}

const argument = process.argv[2];
if (argument === "--clean") {
  await cleanup();
} else {
  if (argument && argument !== "--prepare-only") throw new Error("Use voice:dev with no arguments, --prepare-only, or --clean.");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.VERCEL_ENV || process.env.CI) throw new Error("Voice harness is local development only.");
  // Preflight every path before writing either generated route.
  for (const harness of harnesses) {
    const current = await readFile(harness.page, "utf8").catch(() => null);
    if (current !== null && current !== harness.source) throw new Error("An existing local page belongs to another change; refusing to overwrite it.");
  }
  for (const harness of harnesses) {
    await mkdir(harness.directory, { recursive: true });
    await writeFile(harness.page, harness.source, { mode: 0o600 });
  }
  if (argument === "--prepare-only") {
    console.log("Prepared ignored /dev/voice and /dev/study pages. Remove with npm run voice:dev -- --clean.");
  } else {
    await import("./prepare-workspace-assets.mjs");
    const require = createRequire(import.meta.url);
    const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1"], {
      cwd: root, stdio: "inherit", env: { ...process.env, NEWTON_VOICE_DEV_SECRET: randomBytes(32).toString("hex") },
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("error", async () => { await cleanup(); process.exitCode = 1; });
    child.on("exit", async (code) => { await cleanup(); process.exitCode = code ?? 0; });
  }
}
