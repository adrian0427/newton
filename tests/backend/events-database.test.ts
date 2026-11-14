import type { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/supabase/auth";
import type { LearningEventInput } from "@/types/tutoring";
import { createTestDatabase } from "./helpers/database";

vi.mock("server-only", () => ({}));
import { recordLearningEvent } from "@/lib/learning/events";
import { getLearningContext } from "@/lib/learning/context";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const sessionA = "10abcdef-0000-4000-8000-000000000001";
const sessionB = "10abcdef-0000-4000-8000-000000000002";
const laterSessionA = "10abcdef-0000-4000-8000-000000000003";
const input: LearningEventInput = {
  sessionId: sessionA, sourceRevisionId: "20abcdef-0000-4000-8000-000000000001",
  conceptId: "algebra.distributive-property", outcome: "practiced", evidence: "Synthetic expansion evidence.",
};
let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query("insert into auth.users(id) values ($1), ($2)", [ownerA, ownerB]);
  await db.query("insert into public.study_sessions(id, user_id) values ($1,$2), ($3,$4), ($5,$2)", [sessionA, ownerA, sessionB, ownerB, laterSessionA]);
}, 30_000);
afterEach(async () => { await db.exec("delete from public.learning_events"); });
afterAll(async () => { await db?.close(); });

function equality(url: URL, name: string): string {
  const filter = url.searchParams.get(name);
  if (!filter?.startsWith("eq.")) throw new Error(`Test transport requires equality on ${name}`);
  return filter.slice(3);
}

function authFor(userId: string): AuthContext {
  // The installed SDK builds real requests; this narrow test transport sends
  // their filters/inserts to PostgreSQL under a simulated identity. It is not
  // PostgREST or hosted Auth. PGlite serializes transactions on one connection.
  const fetch: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init);
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json() as Record<string, unknown> : undefined;
    try {
      const rows = await db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        if (url.pathname === "/rest/v1/study_sessions" && request.method === "GET") {
          return (await tx.query("select * from public.study_sessions where id=$1 and user_id=$2", [equality(url, "id"), equality(url, "user_id")])).rows;
        }
        if (url.pathname === "/rest/v1/learning_events" && body) {
          const names = Object.keys(body);
          const allowed = new Set(["id", "user_id", "session_id", "source_revision_id", "concept", "misconception", "outcome", "evidence", "created_at"]);
          if (!names.length || names.some((name) => !allowed.has(name))) throw new Error("Unexpected test insert columns");
          // Whitelisted identifiers, parameterized values. Extra protected
          // columns really reach PostgreSQL and must fail its column grants.
          return (await tx.query(`insert into public.learning_events (${names.join(",")})
            values (${names.map((_, index) => `$${index + 1}`).join(",")}) returning *`, names.map((name) => body[name]))).rows;
        }
        if (url.pathname === "/rest/v1/learning_events" && request.method === "GET") {
          if (!url.searchParams.has("outcome")) {
            if (url.searchParams.get("order") !== "created_at.desc,id.desc" || url.searchParams.get("limit") !== "10") {
              throw new Error("Context requests must specify deterministic recency and a ten-row limit");
            }
            return (await tx.query(`select * from public.learning_events where user_id=$1 and concept=$2
              order by created_at desc, id desc limit $3`, [equality(url, "user_id"), equality(url, "concept"), Number(url.searchParams.get("limit"))])).rows;
          }
          return (await tx.query(`select * from public.learning_events
            where user_id=$1 and session_id=$2 and source_revision_id=$3 and concept=$4 and outcome=$5`,
          ["user_id", "session_id", "source_revision_id", "concept", "outcome"].map((name) => equality(url, name)))).rows;
        }
        throw new Error("Unexpected test transport request");
      });
      return Response.json(request.headers.get("accept")?.includes("vnd.pgrst.object") ? rows[0] : rows);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (!code) throw error;
      return Response.json({ code, message: "Synthetic database test error.", details: null, hint: null }, {
        status: code === "23505" ? 409 : 400,
      });
    }
  };
  return {
    userId, headers: new Headers({ "Cache-Control": "private, no-store" }),
    supabase: createClient("https://database-test.invalid", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
    }),
  };
}

async function savedRows() {
  return (await db.query<{ id: string; user_id: string; evidence: string; misconception: string | null; outcome: string }>(
    "select id, user_id, evidence, misconception, outcome from public.learning_events order by user_id, outcome")).rows;
}

describe("writer with PostgreSQL enforcement and the installed Supabase query builder", () => {
  it("saves under the caller's role, returning generated identity/time without owner data", async () => {
    const saved = await recordLearningEvent(authFor(ownerA), { ...input, evidence: ` ${input.evidence}\n` });
    expect(saved).toMatchObject(input);
    expect(saved.id).toMatch(/^[\da-f-]{36}$/);
    expect(saved.createdAt).toBe(new Date(saved.createdAt).toISOString());
    expect(saved).not.toHaveProperty("user_id");
    expect(await savedRows()).toEqual([{ id: saved.id, user_id: ownerA, evidence: input.evidence, misconception: null, outcome: "practiced" }]);
  });

  it("returns original identity/time for an identical normalized retry", async () => {
    const first = await recordLearningEvent(authFor(ownerA), input);
    const retried = await recordLearningEvent(authFor(ownerA), {
      ...input, sessionId: input.sessionId.toUpperCase(), sourceRevisionId: input.sourceRevisionId.toUpperCase(), evidence: ` ${input.evidence} `,
    });
    expect(retried).toEqual(first);
    expect(await savedRows()).toHaveLength(1);
  });

  it("collapses overlapping identical calls to one database event", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => recordLearningEvent(authFor(ownerA), input)));
    for (const result of results) expect(result).toEqual(results[0]);
    expect(await savedRows()).toHaveLength(1);
  });

  it("preserves the winner when overlapping calls have conflicting evidence", async () => {
    const results = await Promise.allSettled([
      recordLearningEvent(authFor(ownerA), input),
      recordLearningEvent(authFor(ownerA), { ...input, evidence: "Different synthetic evidence." }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { status: 409, code: "event-conflict" } });
    const winner = results.find((result) => result.status === "fulfilled");
    expect(await savedRows()).toEqual([expect.objectContaining({ id: winner!.value.id, evidence: winner!.value.evidence })]);
  });

  it("rejects a changed misconception without modifying saved evidence", async () => {
    const original = await recordLearningEvent(authFor(ownerA), input);
    await expect(recordLearningEvent(authFor(ownerA), { ...input, misconceptionId: "distribution.missed-term" }))
      .rejects.toMatchObject({ status: 409, code: "event-conflict" });
    expect(await savedRows()).toEqual([expect.objectContaining({ id: original.id, misconception: null, evidence: original.evidence })]);
  });

  it("permits distinct outcomes on the same revision", async () => {
    const practiced = await recordLearningEvent(authFor(ownerA), input);
    const observed = await recordLearningEvent(authFor(ownerA), {
      ...input, outcome: "misconception-observed", misconceptionId: "distribution.missed-term", evidence: "Synthetic missed-term observation.",
    });
    expect(observed.id).not.toBe(practiced.id);
    expect(await savedRows()).toHaveLength(2);
  });

  it.each([sessionB, "10000000-0000-4000-8000-000000000099"])("rejects foreign or missing session %s before writing", async (sessionId) => {
    await expect(recordLearningEvent(authFor(ownerA), { ...input, sessionId })).rejects.toMatchObject({ status: 404, code: "session-not-found" });
    expect(await savedRows()).toEqual([]);
  });

  it("keeps account identities separate across overlapping requests", async () => {
    const [a, b] = await Promise.all([
      recordLearningEvent(authFor(ownerA), input),
      recordLearningEvent(authFor(ownerB), { ...input, sessionId: sessionB, evidence: "Synthetic account B evidence." }),
    ]);
    expect(a.id).not.toBe(b.id);
    expect(await savedRows()).toEqual([
      expect.objectContaining({ id: a.id, user_id: ownerA, evidence: input.evidence }),
      expect.objectContaining({ id: b.id, user_id: ownerB, evidence: b.evidence }),
    ]);
    expect(await recordLearningEvent(authFor(ownerB), { ...input, sessionId: sessionB, evidence: b.evidence })).toEqual(b);
  });

  it("matches PostgreSQL's 500-character Unicode boundary", async () => {
    const evidence = "🧮".repeat(500);
    expect((await recordLearningEvent(authFor(ownerA), { ...input, evidence })).evidence).toBe(evidence);
    expect((await savedRows())[0].evidence).toBe(evidence);
  });
});

describe("cross-session context with PostgreSQL enforcement", () => {
  it("returns genuine empty history for an account without events", async () => {
    expect(await getLearningContext(authFor(ownerA), input.conceptId)).toEqual({ conceptId: input.conceptId, events: [], summary: "" });
  });

  it("retrieves saved observations from both sessions and separates the next account", async () => {
    const earlier = await recordLearningEvent(authFor(ownerA), input);
    const later = await recordLearningEvent(authFor(ownerA), { ...input, sessionId: laterSessionA, evidence: "Synthetic second-session evidence." });
    const a = await getLearningContext(authFor(ownerA), input.conceptId);
    expect(new Set(a.events.map((event) => event.id))).toEqual(new Set([earlier.id, later.id]));
    expect(new Set(a.events.map((event) => event.sessionId))).toEqual(new Set([sessionA, laterSessionA]));
    expect(await getLearningContext(authFor(ownerB), input.conceptId)).toEqual({ conceptId: input.conceptId, events: [], summary: "" });
    const b = await recordLearningEvent(authFor(ownerB), { ...input, sessionId: sessionB, evidence: "Synthetic B evidence." });
    expect((await getLearningContext(authFor(ownerB), input.conceptId)).events).toEqual([b]);
    expect((await getLearningContext(authFor(ownerA), input.conceptId)).events).toEqual(a.events);
  });

  it("returns exactly the latest ten with stable ID tie-breaking and excludes newer foreign rows", async () => {
    await db.query(`insert into public.learning_events(id,user_id,session_id,source_revision_id,concept,outcome,evidence,created_at)
      select ('30000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, $1,
        case when i%2=0 then $2::uuid else $3::uuid end, gen_random_uuid(),
        'algebra.distributive-property','practiced','Synthetic bounded history ' || i,
        '2026-11-14T06:00:00Z'::timestamptz from generate_series(1,12) i`, [ownerA, sessionA, laterSessionA]);
    await db.query(`insert into public.learning_events(user_id,session_id,source_revision_id,concept,outcome,evidence,created_at)
      values ($1,$2,gen_random_uuid(),'algebra.distributive-property','practiced','Synthetic newer foreign row.','2026-11-15T00:00:00Z')`, [ownerB, sessionB]);
    const context = await getLearningContext(authFor(ownerA), input.conceptId);
    expect(context.events.map((event) => event.id)).toEqual(Array.from({ length: 10 }, (_, index) => `30000000-0000-4000-8000-${String(12 - index).padStart(12, "0")}`));
    expect(context.summary).not.toContain("foreign");
    expect(context.summary.length).toBeLessThanOrEqual(2000);
  });

  it("reads all database outcome vocabulary without allowing correction writes through the writer", async () => {
    await db.query(`insert into public.learning_events(user_id,session_id,source_revision_id,concept,outcome,evidence)
      values ($1,$2,gen_random_uuid(),'algebra.distributive-property','corrected-with-guidance','Synthetic historical guided correction.')`, [ownerA, sessionA]);
    const result = await getLearningContext(authFor(ownerA), input.conceptId);
    expect(result.events[0].outcome).toBe("corrected-with-guidance");
    expect(result.summary).toContain("corrected-with-guidance");
    await expect(recordLearningEvent(authFor(ownerA), { ...input, outcome: "corrected-with-guidance" })).rejects.toMatchObject({ status: 400 });
  });
});
