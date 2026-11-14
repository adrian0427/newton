import { SupabaseConfigurationError } from "./config";

/** Fixed application origin; never derive OAuth redirects from forwarded headers. */
export function getAuthOrigin(): string {
  try {
    const value = process.env.NEWTON_SITE_URL?.trim();
    if (!value) throw new Error();
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    return url.origin;
  } catch { throw new SupabaseConfigurationError(); }
}
