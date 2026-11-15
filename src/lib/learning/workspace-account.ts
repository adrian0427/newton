/** Browser lifecycle only. Identity and session ownership are enforced again by the server. */
export type WorkspaceAccountSnapshot = Readonly<{
  status: "checking" | "signed-in" | "signed-out";
  email: string | null; sessionId: string | null; busy: "starting" | "logout" | null; error: string; epoch: number;
}>;
export function createWorkspaceAccount(request: typeof fetch = fetch) {
  let state: WorkspaceAccountSnapshot = { status: "checking", email: null, sessionId: null, busy: null, error: "", epoch: 0 };
  let generation = 0;
  const listeners = new Set<() => void>();
  const stops = new Set<() => void | Promise<void>>();
  function update(patch: Partial<WorkspaceAccountSnapshot>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
  async function stop() { await Promise.all([...stops].map(fn => fn())); }
  async function clear() {
    generation++;
    await stop();
    update({ status: "signed-out", email: null, sessionId: null, busy: null, error: "", epoch: state.epoch + (state.status === "signed-in" ? 1 : 0) });
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    registerStop(fn: () => void | Promise<void>) { stops.add(fn); return () => { stops.delete(fn); }; },
    async check() {
      if (state.busy) return;
      const attempt = ++generation;
      try {
        const response = await request("/auth/session", { cache: "no-store" });
        if (attempt !== generation) return;
        if (response.status === 401) { await clear(); return; }
        if (!response.ok) throw Error();
        const body = await response.json();
        if (attempt !== generation) return;
        if (!body.user || typeof body.user !== "object" || Array.isArray(body.user) || (typeof body.user.email !== "string" || !body.user.email.trim())) throw Error();
        const email = body.user.email ?? null;
        if (state.status === "signed-in" && state.email !== email) { await clear(); }
        update({ status: "signed-in", email, error: "" });
      } catch {
        if (attempt === generation) {
          await stop();
          if (attempt !== generation) return;
          update({ error: "Unable to verify your sign-in. Please retry.", sessionId: null });
        }
      }
    },
    async start() {
      if (state.status !== "signed-in" || state.busy || state.sessionId) return;
      const attempt = ++generation;
      update({ busy: "starting", error: "" });
      try {
        const response = await request("/api/study-sessions", { method: "POST", cache: "no-store" });
        if (attempt !== generation) return;
        if (response.status === 401) { await clear(); return; }
        if (response.status !== 201) throw Error();
        const body = await response.json();
        if (attempt !== generation) return;
        if (typeof body.session?.id !== "string" || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.session.id)) throw Error();
        update({ sessionId: body.session.id, busy: null });
      } catch {
        if (attempt === generation) update({ busy: null, error: "Unable to start your study session. Please retry." });
      }
    },
    async logout() {
      if (state.busy === "logout") return;
      ++generation; // Invalidate late identity/session responses before awaiting media cleanup.
      update({ busy: "logout", error: "" });
      try {
        await stop();
        const response = await request("/auth/session", { method: "DELETE", cache: "no-store" });
        if (!response.ok || (await response.json()).signedOut !== true) throw Error();
        await clear();
      } catch { update({ busy: null, error: "Sign-out failed. Your workspace is preserved; please retry." }); }
    },
    dispose() { generation++; void stop(); },
  };
}
export type WorkspaceAccount = ReturnType<typeof createWorkspaceAccount>;
