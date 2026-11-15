/**
 * Local-development diagnostics only: flags characters a text-to-speech voice may
 * vocalize literally. Returns fixed category names, never the text itself.
 */
export const SPEECH_HAZARDS = ["markdown", "latex", "math-symbol", "operator-symbol", "emoji", "isolated-letter"] as const;
export type SpeechHazard = (typeof SPEECH_HAZARDS)[number];

const checks: Record<SpeechHazard, RegExp> = {
  markdown: /\*\*|__|`|^\s{0,3}#{1,6}\s|^\s*(?:[-*\u2022]|\d+\.)\s/m,
  latex: /\\[()[\]a-zA-Z]|\$/,
  "math-symbol": /[\u00d7\u00f7\u2212\u221a\u00b2\u00b3\u00b7\u22c5\u2260\u2264\u2265\u00b1\u221e\u03c0]/u,
  "operator-symbol": /(?<!\*)\*(?!\*)|\^/,
  emoji: /\p{Extended_Pictographic}/u,
  // A standalone letter other than "a" or "I" ending a sentence, such as "...the constant term v."
  // Variable names (for example "solve for x.") also match; this is an indicator, not proof.
  "isolated-letter": /(?:^|[\s(])(?![aAI](?![A-Za-z]))[A-Za-z](?=[)\]]?\s*(?:[.!?]|$))/m,
};

export function speechHazards(text: string): SpeechHazard[] {
  if (typeof text !== "string" || !text) return [];
  return SPEECH_HAZARDS.filter((hazard) => checks[hazard].test(text));
}

export function emptySpeechHazardCounts(): Record<SpeechHazard, number> {
  return Object.fromEntries(SPEECH_HAZARDS.map((hazard) => [hazard, 0])) as Record<SpeechHazard, number>;
}
