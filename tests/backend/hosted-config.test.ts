import { expect, it } from "vitest";
import { hostedConfig } from "../hosted/config";

const fixture = {
  NEXT_PUBLIC_SUPABASE_URL: "https://ltoyfshczgknmhwjtogh.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEWTON_TEST_EMAIL_A: "a@example.com", NEWTON_TEST_PASSWORD_A: " password a ", NEWTON_TEST_EMAIL_B: "b@example.com", NEWTON_TEST_PASSWORD_B: "password b",
};
it("accepts the intended local test setup and preserves password whitespace", () => {
  expect(hostedConfig(fixture).accounts[0].password).toBe(" password a ");
  expect(hostedConfig(fixture).appUrl).toBe("http://127.0.0.1:3107");
});
it.each(["https://example.com", "http://127.0.0.1.example.com", "file:///tmp/test", "http://user:pass@localhost", "http://localhost/other", "http://localhost?secret=x"])("rejects an unsafe app destination %s", (NEWTON_TEST_URL) => {
  expect(() => hostedConfig({ ...fixture, NEWTON_TEST_URL })).toThrow();
});
it("rejects missing credentials, the same account, and another Supabase project", () => {
  expect(() => hostedConfig({ ...fixture, NEWTON_TEST_PASSWORD_A: "" })).toThrow(/NEWTON_TEST_PASSWORD_A/);
  expect(() => hostedConfig({ ...fixture, NEWTON_TEST_EMAIL_B: fixture.NEWTON_TEST_EMAIL_A })).toThrow(/distinct/);
  expect(() => hostedConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" })).toThrow(/newton-dev/);
});
