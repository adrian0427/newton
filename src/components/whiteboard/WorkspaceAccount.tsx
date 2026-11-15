"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createWorkspaceAccount } from "@/lib/learning/workspace-account";
import { WorkspaceAccountContext, useWorkspaceAccount } from "./workspace-account-context";
import StudentWorkspace from "./StudentWorkspace";

export function WorkspaceAccountProvider({ children }: { children: ReactNode }) {
  const [account] = useState(() => createWorkspaceAccount());
  useEffect(() => {
    void account.check();
    const check = () => { void account.check(); };
    window.addEventListener("focus", check);
    return () => { window.removeEventListener("focus", check); account.dispose(); };
  }, [account]);
  return <WorkspaceAccountContext.Provider value={account}>{children}</WorkspaceAccountContext.Provider>;
}
export default function AccountWorkspace() {
  const account = useWorkspaceAccount()!;
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot);
  const scope = state.status === "signed-in" ? `account:${state.email}` : undefined;
  return <>
    <section className="workspace-account" aria-label="Study session" aria-busy={!!state.busy}>
      <p role="status">{state.status === "checking" ? "Checking your sign-in…" : state.status === "signed-out"
        ? "Sign in to start an account-based study session. You can still use the local whiteboard."
        : state.sessionId ? "Study session ready." : "Start a session when you’re ready to study."}</p>
      {state.status === "signed-out" && <Link className="workspace-button" href="/auth/sign-in">Sign in with Google</Link>}
      {state.status === "signed-in" && !state.sessionId && <button className="workspace-button" disabled={!!state.busy} onClick={() => { void account.start(); }}>{state.busy === "starting" ? "Starting session…" : "Start study session"}</button>}
      {state.error && <><p role="alert">{state.error}</p><button className="workspace-button secondary" disabled={!!state.busy} onClick={() => { void account.check(); }}>Retry sign-in check</button></>}
    </section>
    {state.status !== "checking" && <StudentWorkspace key={`${scope ?? "guest"}:${state.epoch}`} storageScope={scope} />}
  </>;
}
