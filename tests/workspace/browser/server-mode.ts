/**
 * Which voice behaviour the server under test is expected to have.
 * - development: `npm run dev` (Playwright's default web server). Signed-in students with an owned
 *   study session may start voice; credentials and the Deepgram socket are mocked in each test.
 * - production: `npm run build && npm start` (or a preview). Voice must stay disabled.
 * When NEWTON_TEST_URL points at an existing server, NEWTON_TEST_SERVER_MODE must say which it is,
 * so no test silently assumes the wrong voice policy. The isolated `/dev/study` harness is separate
 * and opted into with NEWTON_TEST_DEV_STUDY=1.
 */
export type ServerMode = "development" | "production";

export function serverMode(): ServerMode {
  const mode = process.env.NEWTON_TEST_SERVER_MODE ?? (process.env.NEWTON_TEST_URL ? undefined : "development");
  if (mode === "development" || mode === "production") return mode;
  throw new Error("Set NEWTON_TEST_SERVER_MODE=development or production when NEWTON_TEST_URL points at an existing server.");
}

/** Fake microphone flags for development-mode voice tests; production tests never start voice. */
export function fakeMediaArgs(): string[] {
  return process.env.NEWTON_TEST_SERVER_MODE === "production" ? [] : ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
}
