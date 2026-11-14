import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

/**
 * For Route Handlers with writable cookies. Pass the returned headers into the
 * HTTP response. Do not cache this client or use it during component rendering.
 */
export async function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();
  const headers = new Headers({ "Cache-Control": "private, no-store" });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        Object.entries(cacheHeaders).forEach(([name, value]) => headers.set(name, value));
      },
    },
  });

  return { supabase, headers };
}
