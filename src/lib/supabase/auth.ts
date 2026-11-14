import "server-only";

import { SupabaseConfigurationError } from "./config";
import { createClient } from "./server";
import { isUnauthenticatedError } from "./auth-errors";

/** Only bounded, student-safe messages belong in this error. */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: Headers,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export type AuthContext = Readonly<{
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>["supabase"];
  headers: Headers;
}>;

/** Call once per protected Route Handler request; never cache this context. */
export async function requireUser(): Promise<AuthContext> {
  let headers: Headers | undefined;
  try {
    const request = await createClient();
    headers = request.headers;
    // getSession() alone would trust unverified cookie data.
    const { data, error } = await request.supabase.auth.getUser();
    if (error && !isUnauthenticatedError(error)) {
      throw new BackendError(502, "auth-unavailable", "Unable to verify your sign-in. Please retry.", headers);
    }
    if (error || !data.user?.id) {
      throw new BackendError(401, "unauthenticated", "Please sign in.", headers);
    }
    return { userId: data.user.id, supabase: request.supabase, headers };
  } catch (error) {
    if (error instanceof BackendError) throw error;
    if (error instanceof SupabaseConfigurationError) {
      throw new BackendError(503, "not-configured", "Sign-in is not configured yet.", headers);
    }
    throw new BackendError(502, "auth-unavailable", "Unable to verify your sign-in. Please retry.", headers);
  }
}
