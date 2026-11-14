import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import VoiceHarness from "@/lib/ai/dev/voice-harness";

afterEach(() => vi.unstubAllEnvs());

it("renders local checkpoints and a disabled text probe until settings are applied", () => {
  vi.stubEnv("NODE_ENV", "development");
  const html = renderToStaticMarkup(<VoiceHarness tokenCapability="local-capability" />);
  expect(html).toContain("Pipeline checkpoints");
  expect(html).toContain("Frames captured / forwarded");
  expect(html).toContain("User / agent transcript counts");
  expect(html).toContain("Speech / manual interruption calls");
  expect(html).toContain("Playback completions / repeated done markers");
  expect(html).toContain("Recent event trace");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Inject test question<\/button>/);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mute microphone \(isolate feedback\)<\/button>/);
  expect(html).not.toContain("local-capability");
});

it("does not render the diagnostic page or text injection button in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(renderToStaticMarkup(<VoiceHarness tokenCapability="local-capability" />)).toBe("");
});
