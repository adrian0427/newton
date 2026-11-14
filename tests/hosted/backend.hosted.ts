import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { request as playwrightRequest, type APIRequestContext, type APIResponse } from "@playwright/test";
import { it, vi } from "vitest";
import type { AuthContext } from "@/lib/supabase/auth";
import { hostedConfig } from "./config";

vi.mock("server-only", () => ({}));
import { recordLearningEvent } from "@/lib/learning/events";
import { requireOwnedSession } from "@/lib/learning/sessions";

function noStore(response: APIResponse) { assert.match(response.headers()["cache-control"] ?? "", /no-store/, "Personalized responses must not be cached"); }
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

it("verifies hosted Auth, cookie routes, writer retries, cross-session retrieval and direct-client account isolation", async () => {
  const config = hostedConfig(process.env);
  // Password accounts are test fixtures only; the app exposes Google sign-in.
  const jars = config.accounts.map(() => new Map<string, string>());
  const clients = jars.map((jar) => createServerClient(config.projectUrl, config.publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  }));
  const browserFor = (i: number) => playwrightRequest.newContext({
    baseURL: config.appUrl, extraHTTPHeaders: { Origin: config.appUrl }, maxRedirects: 0,
    storageState: { origins: [], cookies: [...jars[i]].map(([name, value]) => ({
      name, value, domain: new URL(config.appUrl).hostname, path: "/", expires: -1,
      httpOnly: false, secure: false, sameSite: "Lax" as const,
    })) },
  });
  const browsers: APIRequestContext[] = [];
  const auth: AuthContext[] = [];
  const sessions: string[] = [];
  const marker = `Synthetic C1 verification ${randomUUID()}`;
  try {
    for (let i = 0; i < 2; i++) {
      const signed = await clients[i].auth.signInWithPassword(config.accounts[i]);
      check(!signed.error, `Account ${i === 0 ? "A" : "B"} SDK sign-in failed; check the private credentials file.`);
      const verified = await clients[i].auth.getUser();
      check(!verified.error && verified.data.user, "Hosted Auth could not verify the test identity.");
      auth.push({ userId: verified.data.user.id, supabase: clients[i], headers: new Headers() });
      const browser = await browserFor(i);
      browsers.push(browser);
      const identity = await browser.get("/auth/session");
      assert.equal(identity.status(), 200, "Cookie identity did not persist"); noStore(identity);
      const created = await browser.post("/api/study-sessions");
      assert.equal(created.status(), 201, "Authenticated session creation failed"); noStore(created);
      const data = await created.json();
      check(typeof data.session?.id === "string", "Session response is malformed");
      sessions.push(data.session.id);
    }
    check(auth[0].userId !== auth[1].userId, "The two credentials resolved to the same Auth account.");
    console.log("PASS: two real Auth identities; separate verified SSR cookie sessions and study sessions.");

    const profile = await clients[0].from("student_profiles").select("user_id").eq("user_id", auth[0].userId);
    check(!profile.error, "Owner profile lookup failed.");
    if (!profile.data.length) {
      const inserted = await clients[0].from("student_profiles").insert({ display_name: "Synthetic C1 test preference" });
      check(!inserted.error, "Synthetic owner profile creation failed.");
    }
    const ownProfile = await clients[0].from("student_profiles").select("user_id").eq("user_id", auth[0].userId);
    check(!ownProfile.error && ownProfile.data.length === 1, "Owner profile control failed.");

    const input = { sessionId: sessions[0], sourceRevisionId: randomUUID(), conceptId: "algebra.distributive-property", outcome: "practiced" as const, evidence: `${marker}: expanded both terms.` };
    const [saved, concurrent] = await Promise.all([recordLearningEvent(auth[0], input), recordLearningEvent(auth[0], input)]);
    check(concurrent.id === saved.id && concurrent.createdAt === saved.createdAt, "Concurrent first writes did not return one original event.");
    const stored = await clients[0].from("learning_events").select("id").eq("session_id", input.sessionId).eq("source_revision_id", input.sourceRevisionId).eq("concept", input.conceptId).eq("outcome", input.outcome);
    check(!stored.error && stored.data.length === 1 && stored.data[0].id === saved.id, "Concurrent first writes must persist exactly one event.");
    const retried = await recordLearningEvent(auth[0], input);
    check(retried.id === saved.id && retried.createdAt === saved.createdAt, "Sequential retry did not return the original event.");
    await assert.rejects(recordLearningEvent(auth[0], { ...input, evidence: `${marker}: conflicting fixture.` }), (error: unknown) => (error as { status?: number }).status === 409, "Changed evidence must conflict");
    console.log("PASS: concurrent first writes persist one event; sequential retries and immutable conflict handling.");

    const unsigned = createClient(config.projectUrl, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    for (const table of ["student_profiles", "study_sessions", "learning_events"]) {
      const denied = await unsigned.from(table).select("user_id");
      assert.equal(denied.error?.code, "42501", `Anonymous ${table} read must be denied`);
    }
    const anonymousInsert = await unsigned.from("study_sessions").insert({ id: randomUUID() });
    assert.equal(anonymousInsert.error?.code, "42501", "Anonymous session insert must be denied");
    for (const invalid of [{ evidence: " " }, { evidence: "x".repeat(501) }, { outcome: "unsupported" }, { outcome: "misconception-observed", misconception: null }]) {
      const rejected = await clients[0].from("learning_events").insert({ session_id: sessions[0], source_revision_id: randomUUID(), concept: input.conceptId, outcome: "practiced", evidence: "Synthetic validation fixture", ...invalid });
      assert.equal(rejected.error?.code, "23514", "Database must reject malformed evidence/outcomes");
    }
    console.log("PASS: anonymous reads/inserts and malformed direct-client evidence/outcomes denied.");

    const historyPath = "/api/learning-context?conceptId=algebra.distributive-property";
    const historyA = await browsers[0].get(historyPath); assert.equal(historyA.status(), 200); noStore(historyA);
    const a = await historyA.json();
    check(a.events.some((event: { id: string }) => event.id === saved.id), "Account A cannot retrieve its saved event through the app.");
    check(a.events.length <= 10 && a.summary.length <= 2000 && a.summary.includes(marker), "History response violates its bounds or omits the synthetic observation.");
    const historyB = await browsers[1].get(historyPath); assert.equal(historyB.status(), 200); noStore(historyB);
    const b = await historyB.json();
    check(!b.events.some((event: { id: string }) => event.id === saved.id) && !b.summary.includes(marker), "Account B received account A's observation.");
    const tampered = await browsers[1].get(historyPath + `&user_id=${auth[0].userId}`);
    assert.equal(tampered.status(), 400, "Posted owner filters must be rejected");

    for (const table of ["student_profiles", "study_sessions", "learning_events"]) {
      const hidden = await clients[1].from(table).select("user_id").eq("user_id", auth[0].userId);
      check(!hidden.error && hidden.data.length === 0, `Foreign ${table} records are not properly isolated.`);
    }
    await assert.rejects(requireOwnedSession(auth[1], sessions[0]), (error: unknown) => (error as { status?: number }).status === 404);
    const foreignInsert = await clients[1].from("learning_events").insert({ session_id: sessions[0], source_revision_id: randomUUID(), concept: input.conceptId, outcome: "practiced", evidence: `${marker}: forbidden foreign attempt.` });
    assert.equal(foreignInsert.error?.code, "23503", "Composite ownership FK must reject the foreign session");
    const reassigned = await clients[1].from("study_sessions").update({ user_id: auth[1].userId }).eq("id", sessions[0]);
    assert.equal(reassigned.error?.code, "42501", "Ownership update must be denied");
    const ended = await clients[1].from("study_sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessions[0]).select("id");
    check(!ended.error && ended.data.length === 0, "Account B ended account A's session.");
    for (const client of clients) {
      const changed = await client.from("learning_events").update({ evidence: "Forbidden synthetic edit" }).eq("id", saved.id);
      assert.equal(changed.error?.code, "42501", "Event UPDATE must be denied");
      const deleted = await client.from("learning_events").delete().eq("id", saved.id);
      assert.equal(deleted.error?.code, "42501", "Event DELETE must be denied");
    }
    console.log("PASS: direct-client foreign reads/writes, ownership changes and event mutations denied.");

    const out = await browsers[0].delete("/auth/session"); assert.equal(out.status(), 200);
    assert.equal((await browsers[0].get(historyPath)).status(), 401, "Signed-out history must be inaccessible");
    const again = await clients[0].auth.signInWithPassword(config.accounts[0]);
    check(!again.error, "Test SDK reauthentication failed.");
    await browsers[0].dispose();
    browsers[0] = await browserFor(0);
    assert.equal((await browsers[0].get("/auth/session")).status(), 200);
    const later = await browsers[0].post("/api/study-sessions"); assert.equal(later.status(), 201);
    const laterId = (await later.json()).session.id;
    check(laterId !== sessions[0], "New study attempt reused the original session ID.");
    sessions.push(laterId);
    const persisted = await browsers[0].get(historyPath); assert.equal(persisted.status(), 200); noStore(persisted);
    check((await persisted.json()).events.some((event: { id: string }) => event.id === saved.id), "History did not persist across sign-out/in and a new session.");
    console.log("PASS: sign-out/in, a later study session and persisted cross-session retrieval.");
    console.log(`Synthetic fixture cleanup reference: event ${saved.id}; sessions ${sessions.join(", ")}. Keep history append-only; administrative cleanup is separate.`);
  } finally {
    for (const browser of browsers) {
      await browser.delete("/auth/session").catch(() => undefined);
      await browser.dispose();
    }
    for (const client of clients) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
});
