# Backend Foundation Implementation Plan

> Execute inline using the executing-plans guidance, then review the whole change. The user authorized local commits and no pushes or hosted database changes.

**Goal:** Prepare C01's reproducible database foundation and verified study-session API for review.

**Architecture:** Two SQL migrations create the three tables, then their constraints, indexes, explicit grants, and owner-scoped RLS. Server-only request helpers use the existing Supabase cookie client; a session endpoint derives ownership from verified identity. No frontend or AI integration changes.

**Tech Stack:** PostgreSQL, Supabase, Next.js App Router, TypeScript, Vitest; development-only PGlite for real PostgreSQL SQL tests.

**Spec:** `docs/workstreams/C01-backend-memory.md` and the current `origin/main` version of that document.

## Global constraints

- Node 22.14+ within major 22, npm lockfile, existing architecture and shared tutoring types.
- No service-role bypass, raw student media, real passwords in tests, or hosted SQL writes.
- Events are append-only for normal students; evidence is limited to 500 characters.
- Preserve drafts in a temporary backup before replacing them. No changes to A/B's branches or features.
- C1 stays incomplete until real Supabase two-account HTTP/direct-client verification succeeds.

## Review focus

- A forged owner/session link must fail even through direct SQL under an authenticated role.
- Direct users cannot overwrite creation timestamps, transfer ownership, or mutate/delete history.
- Same revision with different outcomes is legitimate; duplicate identity must be unique atomically.
- Missing identity, malformed UUIDs, missing configuration, and database failures must be bounded errors.
- Fresh clients and response headers must be kept per request; schema creation must not expose tables between migrations.

## Task 1: database foundation

Files: `supabase/migrations/20261114000000_learning_schema.sql`, `20261114000100_learning_access.sql`, `tests/backend/database.test.ts`, `supabase/tests/learning_foundation.sql`, package manifest/lockfile, `docs/backend-testing.md`.

- [x] Add executable tests against PostgreSQL roles for C01 constraints, grants, cross-account reads/writes, anonymous access, append-only events, and duplicate identity. Observe failures against the old draft.
- [x] Replace the unapplied draft with two migrations. Enable RLS immediately in the schema migration; grant nothing to students until access migration completes. Defaults assign owner/time; column grants prevent overriding them.
- [x] Run database SQL tests, full unit suite, lint, typecheck, and webpack production build. Inspect the diff and save a local checkpoint.

## Task 2: verified identity and study sessions

Files: `src/lib/supabase/auth.ts`, `src/lib/learning/sessions.ts`, `src/app/api/study-sessions/route.ts`, focused tests, architecture/status docs.

Interfaces: `requireUser()` returns a server-only context with verified user ID, request Supabase client, and response headers. `requireOwnedSession(auth, sessionId)` returns `{ id, startedAt, endedAt }` or 404 for missing/foreign sessions. `createStudySession(auth)` generates a server UUID and returns the same shape. `POST /api/study-sessions` accepts an empty object/body only, rejects cross-origin requests and posted ownership, verifies identity, and returns a new session with status 201 and no-store headers.

- [x] Add failing tests for identity verification, anonymous/missing config/service failure, malformed and foreign sessions, and request/body checks.
- [x] Implement the minimum server-only helpers and endpoint, without connecting B's UI or enabling provider credentials.
- [ ] Run affected/full checks, inspect final diff and secret/config exclusions, perform a final independent review, fix material findings, and commit locally.

## Deferred

Learning-event writer, bounded context retrieval, shared integration types, frontend/voice wiring, migration application, and real hosted acceptance tests remain later slices. Do not imply this local foundation completes C1.
