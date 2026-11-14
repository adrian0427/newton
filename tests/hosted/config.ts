/** Explicit live-test guard: never send test credentials to a remote app URL. */
export function hostedConfig(env: Record<string, string | undefined>) {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEWTON_TEST_EMAIL_A", "NEWTON_TEST_PASSWORD_A", "NEWTON_TEST_EMAIL_B", "NEWTON_TEST_PASSWORD_B"] as const;
  for (const key of required) if (!env[key]?.trim()) throw new Error(`Missing private live-test setting: ${key}`);
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL!);
  if (project.origin !== "https://ltoyfshczgknmhwjtogh.supabase.co" || project.pathname !== "/" || project.search || project.hash || project.username || project.password) {
    throw new Error("Live tests are restricted to the team's newton-dev Supabase project.");
  }
  const app = new URL(env.NEWTON_TEST_URL ?? "http://127.0.0.1:3107");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(app.hostname) || !["http:", "https:"].includes(app.protocol)
    || app.username || app.password || app.pathname !== "/" || app.search || app.hash) {
    throw new Error("Live test app URL must be a loopback origin without credentials, path or query.");
  }
  if (env.NEWTON_TEST_EMAIL_A!.trim().toLowerCase() === env.NEWTON_TEST_EMAIL_B!.trim().toLowerCase()) throw new Error("Provide two distinct test accounts.");
  return {
    projectUrl: project.origin, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, appUrl: app.origin,
    accounts: [
      { email: env.NEWTON_TEST_EMAIL_A!.trim(), password: env.NEWTON_TEST_PASSWORD_A! },
      { email: env.NEWTON_TEST_EMAIL_B!.trim(), password: env.NEWTON_TEST_PASSWORD_B! },
    ],
  };
}
