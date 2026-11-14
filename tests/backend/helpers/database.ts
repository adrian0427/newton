import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/** Real PostgreSQL, with only Supabase's identity boundary simulated. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    const root = new URL("../../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(root)).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(file, root), "utf8"));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
