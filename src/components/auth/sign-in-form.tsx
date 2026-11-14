"use client";

import { useEffect, useState, type FormEvent } from "react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    try {
      const response = await fetch("/auth/session", {
        method: user ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: user ? undefined : JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error.message); return; }
      setUser(body.user ?? null);
      setPassword("");
      setNotice(body.signedOut ? "You’re signed out." : "You’re signed in.");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <p role="status" className="mt-8">Checking your sign-in…</p>;

  return (
    <form onSubmit={submit} className="sign-in-form" aria-busy={busy}>
      {user ? (
        <div><p className="text-sm text-muted">Signed in as</p><p className="mt-1 break-all font-medium">{user.email ?? "your test account"}</p>
          <p className="mt-4 text-sm leading-relaxed text-muted">Your login is working. Study sessions and learning history are still in development.</p></div>
      ) : (
        <>
          <div><label htmlFor="email" className="block text-sm font-medium">Username</label>
            <input id="email" name="email" type="email" autoComplete="username" required maxLength={254}
              value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy}
              placeholder="Account email" aria-describedby="username-hint" className="sign-in-input" />
            <span id="username-hint" className="sr-only">Use your account email to sign in.</span></div>
          <div><label htmlFor="password" className="block text-sm font-medium">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={4096}
              value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}
              className="sign-in-input" /></div>
        </>
      )}
      {error && <p role="alert" className="text-sm leading-relaxed">{error}</p>}
      <p role="status" className="sign-in-notice text-sm">{notice}</p>
      <button disabled={busy} className="sign-in-submit">
        {busy ? (user ? "Signing out…" : "Signing in…") : (user ? "Sign out" : "Sign in")}
      </button>
    </form>
  );
}
