import { expect, it } from "vitest";
import { submittedContext, tutoringPrompt, validTutoringContext } from "@/lib/ai/tutoring-context";
import { checkDistribution } from "@/lib/math/check-distribution";

it("carries the actual structured step and exact local result for the reproduced example", () => {
  const context = submittedContext("revision-1", checkDistribution("42k+2"));
  expect(context).toMatchObject({ problem: "7(6k + 2)", submission: {
    source: "structured_input", step: "42k+2", verification: "incorrect",
  } });
  expect(context.submission?.guidingHint).toContain("7 × (2)");
  expect(validTutoringContext(context)).toBe(true);
  expect(tutoringPrompt(context)).toContain(JSON.stringify(context));
  expect(tutoringPrompt(context)).toContain("not handwriting recognition");
});

it("uses a different explicitly submitted problem and clears all old evidence on invalidation", () => {
  const context = submittedContext("revision-2", checkDistribution("3(2x+5)=6x+5"));
  expect(context.problem).toBe("3(2x+5)");
  expect(context.submission?.guidingHint).toContain("3 × (5)");
  const cleared = tutoringPrompt({ ...context, revisionId: "revision-3", submission: null });
  expect(cleared).not.toContain("6x+5");
  expect(cleared).not.toContain("3 × (5)");
  expect(cleared).toContain('"submission":null');
});

it("does not send an unsupported check as verified work and bounds all context fields", () => {
  const context = submittedContext("revision-1", checkDistribution("x^2"));
  expect(context.submission?.verification).toBe("unsupported");
  expect(context.submission).not.toHaveProperty("guidingHint");
  expect(validTutoringContext({ ...context, revisionId: "private content!" })).toBe(false);
  expect(validTutoringContext({ ...context, problem: "x".repeat(501) })).toBe(false);
  expect(() => tutoringPrompt({ ...context, revisionId: "bad id" })).toThrow("Invalid tutoring context");
});
