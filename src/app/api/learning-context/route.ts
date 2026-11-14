import { getLearningContext } from "@/lib/learning/context";
import { BackendError, requireUser } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  let headers: Headers | undefined;
  try {
    const auth = await requireUser();
    headers = auth.headers;
    const query = new URL(request.url).searchParams;
    const concepts = query.getAll("conceptId");
    if (concepts.length !== 1 || concepts[0] !== "algebra.distributive-property" || [...query.keys()].some((key) => key !== "conceptId")) {
      throw new BackendError(400, "invalid-input", "Provide exactly one supported concept ID.");
    }
    const context = await getLearningContext(auth, concepts[0]);
    return Response.json(context, { headers });
  } catch (error) {
    const failure = error instanceof BackendError ? error
      : new BackendError(502, "backend-unavailable", "Learning history is unavailable. Please retry.");
    const responseHeaders = new Headers(headers ?? failure.headers);
    if (!responseHeaders.get("Cache-Control")?.includes("no-store")) responseHeaders.set("Cache-Control", "private, no-store");
    return Response.json({ error: { code: failure.code, message: failure.message, retryable: failure.status >= 500 } }, {
      status: failure.status, headers: responseHeaders,
    });
  }
}
