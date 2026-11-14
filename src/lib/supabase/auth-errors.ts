import type { AuthError } from "@supabase/supabase-js";

const terminalRefreshCodes = new Set([
  "refresh_token_not_found", "refresh_token_already_used", "session_expired",
]);

export function isUnauthenticatedError(error: AuthError): boolean {
  // Auth can return 400 for a dead refresh token. Do not convert all 400s:
  // unexpected service responses must remain distinguishable from sign-out.
  return error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403
    || (error.code !== undefined && terminalRefreshCodes.has(error.code));
}
