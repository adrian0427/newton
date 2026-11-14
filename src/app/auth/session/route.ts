import { createClient } from "@/lib/supabase/server";
import { SupabaseConfigurationError } from "@/lib/supabase/config";
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
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return failure("invalid-input", "Send an email address and password.", 400);
  }
  let input: unknown;
  try {
    const body = await readBoundedText(request, 8192);
    input = JSON.parse(body);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return failure("invalid-input", "Sign-in details are too long.", 413);
    return failure("invalid-input", "Send an email address and password.", 400);
  }
  if (!input || typeof input !== "object" || !("email" in input) || !("password" in input)
    || typeof input.email !== "string" || typeof input.password !== "string"
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || input.email.length > 254
    || !input.password || input.password.length > 4096) {
    return failure("invalid-input", "Enter a valid email address and password.", 400);
  }
  try {
    const { supabase, headers } = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    if (error) {
      if (error.status === 429) return failure("rate-limited", "Too many attempts. Wait a moment, then try again.", 429, headers);
      if (!error.status || error.status >= 500) return failure("auth-unavailable", "Sign-in is unavailable. Please retry.", 502, headers);
      return failure("invalid-credentials", "Sign-in failed. Check your email and password and confirm the test account is enabled.", 401, headers);
    }
    if (!data.user) return failure("auth-unavailable", "Sign-in could not be confirmed. Please retry.", 502, headers);
    return Response.json({ user: { email: data.user.email } }, { headers });
  } catch (error) {
    return unavailable(error);
  }
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
