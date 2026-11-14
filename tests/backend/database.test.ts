import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "./helpers/database";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const sessionA = "10000000-0000-4000-8000-000000000001";
const sessionB = "10000000-0000-4000-8000-000000000002";
const revision = "20000000-0000-4000-8000-000000000001";
let db: PGlite;

async function asUser(id: string) {
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
}

function event(session = sessionA, outcome = "practiced", evidence = "Expanded both terms.", misconception: string | null = null) {
  return db.query(`insert into public.learning_events(session_id, source_revision_id, concept, outcome, evidence, misconception)
    values ($1, $2, 'algebra.distributive-property', $3, $4, $5) returning id, created_at`,
  [session, revision, outcome, evidence, misconception]);
}

beforeAll(async () => {
  db = await createTestDatabase();
  // Execute the portable owner-invoked smoke script too. Its fixtures roll back.
  await db.exec(await readFile(new URL("../../supabase/tests/learning_foundation.sql", import.meta.url), "utf8"));
  await db.query("insert into auth.users(id) values ($1), ($2)", [ownerA, ownerB]);
  await db.query("insert into public.study_sessions(id, user_id) values ($1,$2), ($3,$4)", [sessionA, ownerA, sessionB, ownerB]);
}, 30_000);

beforeEach(async () => { await db.exec("begin"); await asUser(ownerA); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db?.close(); });

describe("PostgreSQL learning foundation", () => {
  it("creates profile/session defaults without letting callers choose ownership or time", async () => {
    const profile = await db.query<{ user_id: string; preferred_tutor_mode: string }>(
      "insert into public.student_profiles(display_name) values ('Test student') returning user_id, preferred_tutor_mode");
    expect(profile.rows[0]).toEqual({ user_id: ownerA, preferred_tutor_mode: "student-requested" });
    const created = await db.query<{ id: string; user_id: string; started_at: Date; ended_at: null }>(
      "insert into public.study_sessions(id) values (default) returning *");
    expect(created.rows[0]).toMatchObject({ user_id: ownerA, ended_at: null });
    expect(created.rows[0].id).toMatch(/^[\da-f-]{36}$/);
    expect(created.rows[0].started_at).toBeInstanceOf(Date);
  });

  it("allows owner event inserts and preserves independent outcomes on one revision", async () => {
    await event();
    await event(sessionA, "misconception-observed", "Missed the second term.", "distribution.missed-term");
    const result = await db.query<{ user_id: string; outcome: string }>("select user_id, outcome from public.learning_events order by outcome");
    expect(result.rows).toEqual([
      { user_id: ownerA, outcome: "misconception-observed" }, { user_id: ownerA, outcome: "practiced" },
    ]);
  });

  it("rejects duplicate event identity instead of overwriting evidence", async () => {
    await event();
    await expect(event(sessionA, "practiced", "Changed evidence.")).rejects.toMatchObject({ code: "23505" });
  });

  it("hides A's records from B and prevents B ending A's session", async () => {
    await db.exec("insert into public.student_profiles(display_name) values ('Test A')");
    await event();
    await asUser(ownerB);
    expect((await db.query("select * from public.student_profiles")).rows).toEqual([]);
    expect((await db.query("select * from public.learning_events")).rows).toEqual([]);
    expect((await db.query<{ id: string }>("select id from public.study_sessions")).rows).toEqual([{ id: sessionB }]);
    expect((await db.query("update public.study_sessions set ended_at=now() where id=$1 returning id", [sessionA])).rows).toEqual([]);
    expect((await db.query("update public.student_profiles set display_name='Changed' returning user_id")).rows).toEqual([]);
    await expect(event(sessionA)).rejects.toMatchObject({ code: "23503" });
  });

  it("also enforces the composite owner/session FK without relying on RLS", async () => {
    await db.exec("reset role");
    await expect(db.query(`insert into public.learning_events(user_id,session_id,source_revision_id,concept,outcome,evidence)
      values ($1,$2,$3,'algebra.distributive-property','practiced','Synthetic mismatch.')`, [ownerA, sessionB, revision]))
      .rejects.toMatchObject({ code: "23503" });
  });

  it.each([
    "insert into public.study_sessions(id,user_id) values (gen_random_uuid(),'00000000-0000-4000-8000-000000000002')",
    "update public.study_sessions set user_id='00000000-0000-4000-8000-000000000002'",
    "update public.study_sessions set started_at=now()",
    "insert into public.student_profiles(user_id) values ('00000000-0000-4000-8000-000000000002')",
    "insert into public.learning_events(user_id) values ('00000000-0000-4000-8000-000000000002')",
    "insert into public.learning_events(created_at) values (now())",
    "update public.learning_events set evidence='Changed'",
    "delete from public.learning_events",
    "delete from public.study_sessions",
    "delete from public.student_profiles",
  ])("denies protected columns and destructive student writes: %s", async (statement) => {
    await expect(db.exec(statement)).rejects.toMatchObject({ code: "42501" });
  });

  it.each([
    ["unknown", "Valid evidence.", null],
    ["misconception-observed", "Missing misconception.", null],
    ["practiced", "   ", null],
    ["practiced", "\n\t", null],
    ["practiced", "x".repeat(501), null],
    ["practiced", "Wrong misconception.", "made-up-concept"],
  ])("rejects malformed learning evidence/outcomes (%s)", async (outcome, evidence, misconception) => {
    await expect(event(sessionA, outcome, evidence, misconception)).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts the evidence length boundary", async () => {
    expect((await event(sessionA, "practiced", "x".repeat(500))).rows).toHaveLength(1);
  });

  it("requires the supported concept and a UUID revision", async () => {
    await expect(db.query(`insert into public.learning_events(session_id,source_revision_id,concept,outcome,evidence)
      values ($1,$2,'unsupported','practiced','Synthetic evidence.')`, [sessionA, revision])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects malformed UUID revisions", async () => {
    await expect(db.query(`insert into public.learning_events(session_id,source_revision_id,concept,outcome,evidence)
      values ($1,'not-a-uuid','algebra.distributive-property','practiced','Synthetic evidence.')`, [sessionA]))
      .rejects.toMatchObject({ code: "22P02" });
  });

  it("allows ending an owned session and rejects inverted timestamps", async () => {
    expect((await db.query("update public.study_sessions set ended_at=now() where id=$1 returning id", [sessionA])).rows).toHaveLength(1);
    await expect(db.query("update public.study_sessions set ended_at=started_at-interval '1 second' where id=$1", [sessionA]))
      .rejects.toMatchObject({ code: "23514" });
  });

  it.each(["student_profiles", "study_sessions", "learning_events"])("denies anonymous access to %s", async (table) => {
    await db.exec("set local role anon");
    await expect(db.exec(`select * from public.${table}`)).rejects.toMatchObject({ code: "42501" });
  });

  it("returns no rows without identity and blocks inserting a session", async () => {
    await asUser("");
    expect((await db.query("select * from public.study_sessions")).rows).toEqual([]);
    await expect(db.exec("insert into public.study_sessions(id) values (default)")).rejects.toMatchObject({ code: "42501" });
  });

  it("validates profile preferences", async () => {
    await expect(db.exec("insert into public.student_profiles(preferred_tutor_mode) values ('invalid')")).rejects.toMatchObject({ code: "23514" });
  });

  it("cleans up A's records on administrative Auth deletion while preserving B", async () => {
    await event();
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [ownerA]);
    expect((await db.query("select * from public.learning_events")).rows).toEqual([]);
    expect((await db.query<{ id: string }>("select id from public.study_sessions")).rows).toEqual([{ id: sessionB }]);
  });
});
