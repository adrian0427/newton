/** This guard never grants access to a token issuer. It only hides local diagnostic UI. */
export function isLocalVoiceHarnessAllowed(environment: {
  nodeEnv?: string;
  vercel?: string;
  vercelEnv?: string;
  ci?: string;
  host: string | null;
}): boolean {
  return environment.nodeEnv === "development" &&
    !environment.vercel && !environment.vercelEnv && !environment.ci &&
    environment.host !== null && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(environment.host);
}
