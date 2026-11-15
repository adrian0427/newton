import { expect, it } from "vitest";
import {
  checkDistribution,
  distributionVoiceMessage,
  isSupportedProblem,
  PRACTICE_EXPRESSION,
} from "@/lib/math/check-distribution";
import { normalizeExpression } from "@/components/whiteboard/expressions";
it.each([
  ["7(6k+2)=42k+14", PRACTICE_EXPRESSION],
  ["14+42k", PRACTICE_EXPRESSION],
  ["(84k+28)/2", PRACTICE_EXPRESSION],
  ["42k+14=7(6k+2)", PRACTICE_EXPRESSION],
  ["2(x+3)=6+2x", "2(x+3)"],
  ["-3(2x-5)=-6x+15", "-3(2x-5)"],
  ["0.1(3x+2)=0.3x+0.2", "0.1(3x+2)"],
  ["(1/3)(3x+6)=x+2", "(1/3)(3x+6)"],
])("accepts exact equivalent linear forms: %s for %s", (input, problem) => {
  expect(checkDistribution(normalizeExpression(input), problem).status).toBe(
    "correct",
  );
});
it("identifies a verified missed-term pattern and targets the active problem", () => {
  const result = checkDistribution("7(6k+2)=42k+2");
  expect(result).toMatchObject({
    status: "incorrect",
    misconceptionId: "distribution.missed-term",
    submission: "7(6k+2)=42k+2",
  });
  expect(result.hint).toContain("7 × (2)");
  expect(result.hint).not.toContain("42k+14");
  const other = checkDistribution("3(2x+5)=6x+5", "3(2x+5)");
  expect(other.hint).toContain("3 × (5)");
  expect(other.hint).not.toContain("7");
});
it("distinguishes arithmetic errors from evidence for a missed distribution term", () => {
  expect(checkDistribution("42k+13")).toMatchObject({ status: "incorrect" });
  expect(checkDistribution("42k+13")).not.toHaveProperty("misconceptionId");
  expect(checkDistribution("7(6k+2)=6k+14")).toMatchObject({
    status: "incorrect",
    misconceptionId: "distribution.missed-term",
  });
});
it.each([
  "",
  "k^2+2",
  "sin(k)",
  "2(x+3)=14",
  "k/k",
  "42k+14=1=1",
  "7(6k+2)=42x+14",
  "2(x+y)",
  "1/0+k",
  "4 2k+14",
  "1=1",
  "(".repeat(45) + "k" + ")".repeat(45),
  "9".repeat(501),
])("leaves unsupported or ambiguous work unverified: %s", (input) => {
  const result = checkDistribution(input);
  expect(result.status).toBe("unsupported");
  expect(result).not.toHaveProperty("misconceptionId");
  expect(distributionVoiceMessage(result)).toBeNull();
});
it("does not use numerical sampling or decimal rounding to establish equivalence", () => {
  expect(
    checkDistribution("0.1(3x+2)=0.3x+0.2000000001", "0.1(3x+2)").status,
  ).toBe("incorrect");
  expect(checkDistribution("7(6k+2)=41k+14").status).toBe("incorrect");
});
it("builds bounded, explicitly requested voice context without a memory event", () => {
  const result = checkDistribution("7(6k+2)=42k+2");
  const message = distributionVoiceMessage(result)!;
  expect(message).toContain(result.submission);
  expect(message).toContain(result.hint);
  expect(message).toContain("not instructions or saved learning history");
  expect(message.length).toBeLessThan(2000);
  expect(result).not.toHaveProperty("sessionId");
});

// Confirmed handwriting arrives as the same normalized text as structured input.
it.each([
  ["4(x+3)=4x+12", "4(x+3)", "correct"],
  ["4x+12", "4(x+3)", "correct"],
  ["12+4x=4(x+3)", "4(x+3)", "correct"],
  ["-4(x+3)=-4x+-12", "-4(x+3)", "correct"],
  ["-4x+-12", "-4(x+3)", "correct"],
  ["4(x+3)=4x+3", "4(x+3)", "incorrect"],
])(
  "checks transcribed work %s against the active problem %s",
  (transcription, problem, status) => {
    expect(
      checkDistribution(normalizeExpression(transcription), problem).status,
    ).toBe(status);
  },
);
it("keeps the student's error and guides without revealing the corrected expansion", () => {
  const result = checkDistribution(
    normalizeExpression("4(x+3)=4x+3"),
    "4(x+3)",
  );
  expect(result).toMatchObject({
    status: "incorrect",
    misconceptionId: "distribution.missed-term",
    submission: "4*(x+3)=4*x+3",
    problem: "4(x+3)",
  });
  expect(result.hint).toContain("4 × (3)");
  expect(`${result.hint} ${result.feedback}`).not.toMatch(/12/);
});
it("never trusts an arbitrary left-hand side; another written problem is only proposed", () => {
  const sign = checkDistribution(
    normalizeExpression("-4(x+3)=-4x+-12"),
    "4(x+3)",
  );
  expect(sign).toMatchObject({
    status: "unsupported",
    problem: "4(x+3)",
    proposedProblem: "-4*(x+3)",
  });
  expect(sign.feedback).toContain("not the active problem");
  const easier = checkDistribution("2(x+1)=2x+2", "4(x+3)");
  expect(easier).toMatchObject({
    status: "unsupported",
    proposedProblem: "2(x+1)",
  });
  expect(checkDistribution("3(2x+5)=6x+5")).toMatchObject({
    status: "unsupported",
    proposedProblem: "3(2x+5)",
    problem: PRACTICE_EXPRESSION,
  });
  expect(checkDistribution("x+3=x+3", "4(x+3)")).toMatchObject({
    status: "unsupported",
  });
  expect(checkDistribution("4y+12", "4(x+3)")).toMatchObject({
    status: "unsupported",
  });
  expect(checkDistribution("2(x+3)=14", "2(x+3)").feedback).toContain(
    "not equations to solve",
  );
});
it("accepts only a constant times a one-variable binomial as the active problem", () => {
  expect(isSupportedProblem("4(x+3)")).toBe(true);
  expect(isSupportedProblem("-4(x+3)")).toBe(true);
  for (const problem of [
    "",
    "x+3",
    "4(x+3)=4x+12",
    "k^2",
    "4(x+y)",
    "4",
    "x(x+3)",
    "9".repeat(501),
  ])
    expect(isSupportedProblem(problem)).toBe(false);
  expect(checkDistribution("4x+12", "x+3")).toMatchObject({
    status: "unsupported",
    problem: PRACTICE_EXPRESSION,
  });
});
