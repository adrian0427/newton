import { getAuthOrigin } from "@/lib/supabase/auth-origin";
import { getSupabaseConfig, SupabaseConfigurationError } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/supabase/origin";
import { isUnauthenticatedError } from "@/lib/supabase/auth-errors";
import { readBoundedText, RequestBodyTooLargeError } from "@/lib/http/body";

function failure(code: string, message: string, status: number, headers?: Headers) {
  return Response.json({ error: { code, message, retryable: status >= 500 || status === 429 } }, {
    status, headers: headers ?? { "Cache-Control": "private, no-store" },
  });
}

function unavailable(error: unknown) {
  return error instanceof SupabaseConfigurationError
    ? failure("not-configured", "Sign-in is not configured yet.", 503)
    : failure("auth-unavailable", "Unable to reach sign-in. Please try again.", 502);
}

export async function GET() {
  try {
    const { supabase, headers } = await createClient();
    // Verify with Auth rather than trusting the user object in a session cookie.
    const { data, error } = await supabase.auth.getUser();
    if (error && !isUnauthenticatedError(error)) {
      return failure("auth-unavailable", "Unable to check your sign-in. Please retry.", 502, headers);
    }
    if (!data.user || error) return failure("unauthenticated", "Please sign in.", 401, headers);
    return Response.json({ user: { email: data.user.email } }, { headers });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return failure("forbidden", "This request must come from Newton.", 403);
  try {
    const body = await readBoundedText(request, 8192);
    if (body.trim()) return failure("invalid-input", "Use Continue with Google to sign in.", 400);
  } catch (error) {
    return failure("invalid-input", "Sign-in request could not be read.", error instanceof RequestBodyTooLargeError ? 413 : 400);
  }
  try {
    const origin = getAuthOrigin();
    if (request.headers.get("origin") !== origin) return failure("forbidden", "Open Newton at its configured address to sign in.", 403);
    const { supabase, headers } = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error || !data.url) return failure("auth-unavailable", "Google sign-in is unavailable. Please try again.", 502, headers);
    const destination = new URL(data.url);
    if (destination.origin !== new URL(getSupabaseConfig().url).origin || destination.pathname !== "/auth/v1/authorize"
      || destination.username || destination.password || destination.searchParams.get("provider") !== "google") {
      return failure("auth-unavailable", "Google sign-in could not be started. Please try again.", 502, headers);
    }
    return Response.json({ url: destination.href }, { headers });
  } catch (error) { return unavailable(error); }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return failure("forbidden", "This request must come from Newton.", 403);
  try {
    const { supabase, headers } = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return failure("sign-out-failed", "Sign-out failed. Please retry.", 502, headers);
    return Response.json({ signedOut: true }, { headers });
  } catch (error) {
    return unavailable(error);
  }
}
