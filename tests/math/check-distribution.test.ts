import { expect, it } from "vitest";
import { checkDistribution, distributionVoiceMessage } from "@/lib/math/check-distribution";
import { normalizeExpression } from "@/components/whiteboard/expressions";

it.each([
  "7(6k+2)=42k+14", "14+42k", "(84k+28)/2", "42k+14=7(6k+2)",
  "2(x+3)=6+2x", "-3(2x-5)=-6x+15", "0.1(3x+2)=0.3x+0.2", "(1/3)(3x+6)=x+2",
])("accepts exact equivalent linear forms: %s", (input) => {
  expect(checkDistribution(normalizeExpression(input)).status).toBe("correct");
});

it("identifies a verified missed-term pattern and targets the submitted problem", () => {
  const result = checkDistribution("7(6k+2)=42k+2");
  expect(result).toMatchObject({ status: "incorrect", misconceptionId: "distribution.missed-term", submission: "7(6k+2)=42k+2" });
  expect(result.hint).toContain("7 × (2)");
  expect(result.hint).not.toContain("42k+14");
  const other = checkDistribution("3(2x+5)=6x+5");
  expect(other.hint).toContain("3 × (5)");
  expect(other.hint).not.toContain("7");
});

it("distinguishes arithmetic errors from evidence for a missed distribution term", () => {
  expect(checkDistribution("42k+13")).toMatchObject({ status: "incorrect" });
  expect(checkDistribution("42k+13")).not.toHaveProperty("misconceptionId");
  expect(checkDistribution("7(6k+2)=6k+14")).toMatchObject({ status: "incorrect", misconceptionId: "distribution.missed-term" });
});

it.each(["", "k^2+2", "sin(k)", "2(x+3)=14", "k/k", "42k+14=1=1", "7(6k+2)=42x+14", "2(x+y)", "1/0+k", "4 2k+14", "1=1", "(".repeat(45)+"k"+")".repeat(45), "9".repeat(501)])(
  "leaves unsupported or ambiguous work unverified: %s", (input) => {
    const result = checkDistribution(input);
    expect(result.status).toBe("unsupported");
    expect(result).not.toHaveProperty("misconceptionId");
    expect(distributionVoiceMessage(result)).toBeNull();
  },
);

it("does not use numerical sampling or decimal rounding to establish equivalence", () => {
  expect(checkDistribution("0.1(3x+2)=0.3x+0.2000000001").status).toBe("incorrect");
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
