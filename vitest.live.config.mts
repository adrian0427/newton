import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/live/**/*.live.ts"], testTimeout: 90_000, fileParallelism: false, maxWorkers: 1 },
});
