"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppearanceControls } from "@/components/appearance/Appearance";

import { useWorkspaceAccount } from "../whiteboard/workspace-account-context";
import type { WorkspaceAccount } from "@/lib/learning/workspace-account";

type Account = { state: "loading" | "guest" | "unavailable" } | { state: "signed-in"; email: string };

function AccountControls() {
  const [account, setAccount] = useState<Account>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const signOutRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function checkAccount() {
      try {
        const response = await fetch("/auth/session", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { setAccount({ state: "guest" }); return; }
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== "object" || !("user" in body)
          || !body.user || typeof body.user !== "object" || !("email" in body.user)
          || typeof body.user.email !== "string") throw new Error("Invalid account response");
        setAccount({ state: "signed-in", email: body.user.email });
      } catch {
        if (!controller.signal.aborted) setAccount({ state: "unavailable" });
      }
    }
    void checkAccount();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => { signOutRequest.current?.abort(); }, []);

  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    signOutRequest.current = controller;
    try {
      const response = await fetch("/auth/session", { method: "DELETE", signal: controller.signal });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("signedOut" in body) || body.signedOut !== true) {
        throw new Error("Sign-out failed");
      }
      setAccount({ state: "guest" });
      setNotice("Signed out. Your local work is still here.");
    } catch {
      if (!controller.signal.aborted) setError("Unable to sign out. Please try again.");
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <>
    <div className="settings-account">
      <p className="settings-caption">Account</p>
      {account.state === "loading" && <p role="status">Checking sign-in…</p>}
      {account.state === "signed-in" && <p className="settings-email">{account.email}</p>}
      {account.state === "guest" && <p>Guest workspace</p>}
      {account.state === "unavailable" && <><p role="status">Unable to check sign-in.</p><button className="text-button" type="button" onClick={() => { setAccount({ state: "loading" }); setAttempt(attempt + 1); }}>Retry</button></>}
    </div>
    <AppearanceControls />
    <div className="settings-account-action">
      {account.state === "signed-in" ? <button className="settings-sign-out" type="button" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</button>
        : account.state !== "loading" && <Link href="/auth/sign-in">Sign in</Link>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </>;
}

function ConnectedAccountControls({ account }: { account: WorkspaceAccount }) {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot);
  return <>
    <div className="settings-account">
      <p className="settings-caption">Account</p>
      {state.status === "checking" ? <p role="status">Checking sign-in…</p> : state.status === "signed-in"
        ? <p className="settings-email">{state.email}</p> : <p>Guest workspace</p>}
    </div>
    <AppearanceControls />
    <div className="settings-account-action">
      {state.status === "signed-in" ? <button className="settings-sign-out" type="button" disabled={state.busy === "logout"} onClick={() => { void account.logout(); }}>{state.busy === "logout" ? "Signing out…" : "Sign out"}</button>
        : <Link href="/auth/sign-in">Sign in</Link>}
      {state.error && <><p role="alert">{state.error}</p><button className="text-button" disabled={!!state.busy} onClick={() => { void account.check(); }}>Retry</button></>}
      {state.status === "signed-out" && state.epoch > 0 && <p role="status">Signed out. Your account’s local work is hidden until you sign back in.</p>}
    </div>
  </>;
}

export function WorkspaceSettings() {
  const account = useWorkspaceAccount();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopImmediatePropagation(); setOpen(false); button.current?.focus(); }
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <div className="appearance-control" ref={root} onBlur={(event) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={button} className="icon-button settings-toggle" type="button" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open} aria-controls="workspace-settings" onClick={() => setOpen(!open)}>
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h4l.5 2.5 1.5.9 2.4-.8 2 3.4-1.9 1.7v2.6l1.9 1.7-2 3.4-2.4-.8-1.5.9L14 21h-4l-.5-2.5-1.5-.9-2.4.8-2-3.4 1.9-1.7v-2.6L3.6 9l2-3.4 2.4.8 1.5-.9Z" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
    {open && <section id="workspace-settings" className="appearance-panel settings-panel" role="dialog" aria-labelledby="settings-title">
      <header><h2 id="settings-title">Settings</h2><button ref={close} className="icon-button" type="button" aria-label="Close settings" onClick={() => { setOpen(false); button.current?.focus(); }}>×</button></header>
      {account ? <ConnectedAccountControls account={account} /> : <AccountControls />}
    </section>}
  </div>;
}
