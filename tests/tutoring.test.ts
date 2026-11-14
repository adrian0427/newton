import { expectTypeOf, it } from "vitest";
import type { LearningEventInput, WorkAnalysis } from "@/types/tutoring";

it("keeps uncertain analysis from confirming a misconception or requesting a hint", () => {
  type Uncertain = Extract<WorkAnalysis, { correctness: "uncertain" }>;
  expectTypeOf<Uncertain["misconceptionId"]>().toEqualTypeOf<undefined>();
  expectTypeOf<Uncertain["suggestedAction"]>().toEqualTypeOf<"wait" | "ask-for-clarification">();
  expectTypeOf<Extract<keyof LearningEventInput, "userId" | "user_id">>().toEqualTypeOf<never>();
});
