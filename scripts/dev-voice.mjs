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

async function cleanup() {
  const current = await readFile(page, "utf8").catch(() => null);
  if (current === source) {
    await unlink(page);
    await rmdir(directory).catch(() => {});
  }
  if (current === null || current === source) {
    // next typegen refreshes build types, but stale dev types can still import the removed page.
    // Only clear generated type directories that actually refer to this harness artifact.
    for (const path of ["../.next/dev/types/", "../.next/types/"]) {
      const types = new URL(path, import.meta.url);
      const validator = await readFile(new URL("validator.ts", types), "utf8").catch(() => "");
      if (validator.includes("src/app/dev/voice/page")) await rm(types, { recursive: true, force: true });
    }
  }
}

const argument = process.argv[2];
if (argument === "--clean") {
  await cleanup();
} else {
  if (argument && argument !== "--prepare-only") throw new Error("Use voice:dev with no arguments, --prepare-only, or --clean.");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.VERCEL_ENV || process.env.CI) throw new Error("Voice harness is local development only.");
  await mkdir(directory, { recursive: true });
  const current = await readFile(page, "utf8").catch(() => null);
  if (current !== null && current !== source) throw new Error("An existing voice page belongs to another change; refusing to overwrite it.");
  await writeFile(page, source, { mode: 0o600 });
  if (argument === "--prepare-only") {
    console.log("Prepared ignored /dev/voice page. Remove with npm run voice:dev -- --clean.");
  } else {
    const require = createRequire(import.meta.url);
    const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1"], {
      cwd: root, stdio: "inherit", env: { ...process.env, NEWTON_VOICE_DEV_SECRET: randomBytes(32).toString("hex") },
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("error", async () => { await cleanup(); process.exitCode = 1; });
    child.on("exit", async (code) => { await cleanup(); process.exitCode = code ?? 0; });
  }
}
