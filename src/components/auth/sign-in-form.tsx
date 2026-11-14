"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export function SignInForm({ oauthFailed = false }: { oauthFailed?: boolean }) {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthFailed ? "Google sign-in was cancelled or could not be completed. Please try again." : "");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (response.ok) setUser(body.user);
        else if (response.status !== 401) setError(body.error.message);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to check your sign-in. Reload to retry."); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    let redirecting = false;
    try {
      const response = await fetch("/auth/session", {
        method: user ? "DELETE" : "POST",
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error.message); return; }
      if (!user) { window.location.assign(body.url); redirecting = true; return; }
      setUser(null);
      setNotice(body.signedOut ? "You’re signed out." : "You’re signed in.");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      if (!redirecting) setBusy(false);
    }
  }

  if (checking) return <p role="status" className="mt-8">Checking your sign-in…</p>;

  return (
    <form onSubmit={submit} className="mt-8 space-y-5" aria-busy={busy}>
      {user ? (
        <div><p className="text-sm text-muted">Signed in as</p><p className="mt-1 break-all font-medium">{user.email ?? "your account"}</p>
          <Link href="/study" className="mt-4 inline-block underline underline-offset-4">Open study workspace</Link></div>
      ) : <p className="text-sm leading-relaxed text-muted">Continue with your Google account to sign in or create an account.</p>}
      {error && <p role="alert" className="text-sm leading-relaxed">{error}</p>}
      <p role="status" className="text-sm">{notice}</p>
      <button disabled={busy} className="min-h-12 w-full rounded-lg bg-ink px-5 py-3 font-medium text-paper disabled:cursor-wait disabled:opacity-70">
        {busy ? (user ? "Signing out…" : "Opening Google…") : (user ? "Sign out" : "Continue with Google")}
      </button>
    </form>
  );
}
