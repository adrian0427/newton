import type { AgentSettingsObject } from "@deepgram/agents";
import { NEWTON_TUTOR_INSTRUCTIONS } from "./tutor-instructions";

/** Managed Standard-tier think model: deliberately no BYO endpoint or OpenAI key. */
export const NEWTON_AGENT_SETTINGS = {
  language: "en",
  listen: { provider: { type: "deepgram", version: "v1", model: "nova-3" } },
  think: { provider: { type: "open_ai", model: "gpt-4o-mini" }, prompt: NEWTON_TUTOR_INSTRUCTIONS },
  speak: { provider: { type: "deepgram", model: "aura-2-thalia-en" } },
} satisfies AgentSettingsObject;
