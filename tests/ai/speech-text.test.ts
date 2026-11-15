import { expect, it } from "vitest";
import { speechHazards } from "@/lib/ai/speech-text";
import { NEWTON_TUTOR_INSTRUCTIONS } from "@/lib/ai/tutor-instructions";
import { submittedContext, tutoringPrompt } from "@/lib/ai/tutoring-context";
import { checkDistribution, distributionVoiceMessage } from "@/lib/math/check-distribution";

// Deterministic checks of text classification and prompt policy. They do not prove live model or TTS behavior.
it("leaves plain spoken tutoring sentences unflagged", () => {
  for (const text of ["Let's look at the constant term. What is seven times two?", "Nice work. Can you say what six k plus two becomes?", "I think that's a good start!"]) {
    expect(speechHazards(text)).toEqual([]);
  }
});
it.each([
  ["Recheck **7 × 2** first.", ["markdown", "math-symbol"]],
  ["What is \\( 7 \\times 2 \\)?", ["latex"]],
  ["So 7*(6k+2) becomes 42k+14.", ["operator-symbol"]],
  ["Try x^2 next.", ["operator-symbol"]],
  ["Great job 🎉", ["emoji"]],
  ["Check the constant term v.", ["isolated-letter"]],
  ["Multiply each term by seven v?", ["isolated-letter"]],
])("flags %s", (text, hazards) => {
  expect(speechHazards(text)).toEqual(hazards);
});
it("does not treat the articles a or I as stray letters", () => {
  expect(speechHazards("That is a. I")).toEqual([]);
});

// The live context and hint request contain written notation the voice could repeat literally.
it("documents that verified math context contains symbols and instructs spoken wording", () => {
  const result = checkDistribution("7*(6*k+2)=42*k+2");
  const prompt = tutoringPrompt(submittedContext("revision-1", result));
  expect(prompt).toContain('"step":"7*(6*k+2)=42*k+2"');
  expect(prompt).toContain("7 × (2)");
  expect(prompt).toContain("say it in words instead of reading symbols");
  expect(NEWTON_TUTOR_INSTRUCTIONS).toContain("read aloud by a text-to-speech voice exactly as written");
  expect(NEWTON_TUTOR_INSTRUCTIONS).toContain("no Markdown, LaTeX, code, emoji");
  expect(NEWTON_TUTOR_INSTRUCTIONS).toContain("never a stray letter or symbol");
  expect(distributionVoiceMessage(result)).toContain("Reply in plain spoken words");
});
it("keeps the full voice prompt within Deepgram's managed-model limit", () => {
  const prompt = tutoringPrompt(submittedContext("revision-1", checkDistribution("7*(6*k+2)=42*k+2")));
  expect(prompt.length).toBeLessThan(25_000);
});
