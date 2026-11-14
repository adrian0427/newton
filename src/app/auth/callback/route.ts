import { createClient } from "@/lib/supabase/server";
import { getAuthOrigin } from "@/lib/supabase/auth-origin";

export async function GET(request: Request) {
  let origin: string;
  try { origin = getAuthOrigin(); }
  catch { return Response.json({ error: { message: "Sign-in is not configured yet." } }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
  const headers = new Headers({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
  const finish = (failed: boolean) => {
    headers.set("Location", `${origin}/auth/sign-in${failed ? "?oauth=failed" : ""}`);
    return new Response(null, { status: 303, headers });
  };
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (params.has("error") || params.getAll("code").length !== 1 || !code?.trim() || code.length > 2048) return finish(true);
  try {
    const client = await createClient();
    const result = await client.supabase.auth.exchangeCodeForSession(code);
    client.headers.forEach((value, name) => headers.set(name, value));
    if (result.error) return finish(true);
    const identity = await client.supabase.auth.getUser();
    client.headers.forEach((value, name) => headers.set(name, value));
    return finish(!!identity.error || !identity.data.user);
  } catch { return finish(true); }
}
