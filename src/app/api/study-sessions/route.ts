import { createStudySession } from "@/lib/learning/sessions";
import { BackendError, requireUser } from "@/lib/supabase/auth";
import { isSameOrigin } from "@/lib/supabase/origin";
import { readBoundedText, RequestBodyTooLargeError } from "@/lib/http/body";

function failure(error: BackendError, headers = error.headers) {
  const responseHeaders = new Headers(headers);
  // Never permit caching, even if an upstream failure supplied no headers.
  if (!responseHeaders.get("Cache-Control")?.includes("no-store")) responseHeaders.set("Cache-Control", "private, no-store");
  return Response.json({ error: { code: error.code, message: error.message, retryable: error.status >= 500 } }, {
    status: error.status, headers: responseHeaders,
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return failure(new BackendError(403, "forbidden", "This request must come from Newton."));
  let headers: Headers | undefined;
  try {
    const auth = await requireUser();
    headers = auth.headers;
    let input: unknown = {};
    try {
      const body = await readBoundedText(request, 1024);
      if (body.length) {
        if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
          throw new BackendError(400, "invalid-input", "Send an empty JSON object to start a session.");
        }
        input = JSON.parse(body);
      }
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) throw new BackendError(413, "invalid-input", "Session details are too long.");
      if (error instanceof BackendError) throw error;
      throw new BackendError(400, "invalid-input", "Send an empty JSON object to start a session.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
      throw new BackendError(400, "invalid-input", "Session ownership and time are assigned automatically. Send an empty object.");
    }
    const session = await createStudySession(auth);
    return Response.json({ session }, { status: 201, headers });
  } catch (error) {
    return failure(error instanceof BackendError ? error
      : new BackendError(502, "backend-unavailable", "Unable to start a study session. Please retry."), headers);
  }
}
