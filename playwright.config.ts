import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/workspace/browser",
  fullyParallel: false,
  use: { baseURL: process.env.NEWTON_TEST_URL ?? "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.NEWTON_TEST_URL ? undefined : { command: "npm run dev -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
