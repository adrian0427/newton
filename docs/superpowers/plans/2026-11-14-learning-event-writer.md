# Learning Event Writer Implementation Plan

> Execute inline with test-first implementation and one final whole-change review.

**Goal:** Complete C01 step 4: validate and persist eligible observations without duplicate retries or overwritten evidence.

**Architecture:** Keep `feat/backend-memory`, merge current `main` as the updated workstream guide directs, and preserve both B's workspace and C's foundation. Add a server-only `recordLearningEvent(auth, input: LearningEventInput)` using the verified user's Supabase client, existing session ownership helper, and database uniqueness constraint. Insert first; on a unique conflict, read the owner-scoped identity and compare immutable payloads. Identical retries return the original record; changed evidence/misconception returns 409.

**Tech Stack:** Existing Next.js/TypeScript, Supabase SDK, Vitest and development-only PGlite. No new production dependency.

**Spec:** `docs/workstreams/C01-backend-memory.md` and central workstream guide at GitHub `main` commit `57b479f`.

## Constraints and scope

- UUID session/revision identifiers; concept `algebra.distributive-property`; misconception `distribution.missed-term`.
- Trimmed nonempty evidence, maximum 500 Unicode characters. Reject unknown fields, including ownership, timestamps, and media.
- Enable only `practiced` and `misconception-observed`; the latter requires the supported misconception. Correction outcomes remain disabled until A supplies trustworthy prior/hint evidence.
- Do not interpret input shape as AI verification: A supplies eligible server observations. No public event-write endpoint, service-role client, raw media, hosted schema change, or change to A/B's implementation.
- Return local `LearningEventRecord = LearningEventInput & { id, createdAt }` until shared types are coordinated. Preserve existing tutoring contract.
- Full C1 still requires retrieval plus hosted two-account HTTP/direct-client acceptance.

## Review focus

- Insert races must resolve through database uniqueness, never a precheck/upsert that overwrites evidence.
- Duplicate lookup must include owner/session/revision/concept/outcome and reject changed evidence or misconception.
- Foreign sessions must fail before inserts, and UUID case/optional values must not make equivalent retries conflict.
- Error responses must not include provider details, student evidence, or internal owner fields.
- Tests must distinguish genuine PostgreSQL enforcement from simulated Supabase Auth/PostgREST transport.

## Task 1: align the branch

- [x] Merge `origin/main` locally. Reconcile shared docs and dependency manifests, retaining both implementations; regenerate the lockfile with npm.
- [x] Run existing unit tests, lint, typecheck, webpack build, and desktop/mobile workspace smoke checks. Commit the integration checkpoint.

## Task 2: event validation and persistence

Files: `src/lib/learning/events.ts`, `tests/backend/events.test.ts`, `tests/backend/events-database.test.ts`, reusable SQL test setup under `tests/backend/helpers/`, relevant status/verification docs.

- [x] Add failing tests for supported observations, invalid/unknown fields, ownership, disabled outcomes, evidence boundaries, identical/conflicting sequential and overlapping retries, and bounded failures.
- [x] Implement the minimum server-only writer. Reuse existing auth/session boundaries and database defaults; never update existing events.
- [x] Exercise the writer with the actual Supabase query builder and PostgreSQL constraints via a narrowly scoped test transport. This is not hosted PostgREST or real Auth acceptance.
- [x] Run full checks, inspect the diff and secret exclusions, complete one independent review, fix material findings, and save a tested checkpoint on the Developer C branch. No merge to main.

Final verification: 181 unit/database tests, lint, typecheck, normal Turbopack
and webpack production builds, and two desktop/mobile MathLive snapshot smoke
tests passed. One independent read-only review found no issues. B's relevant
runtime files match upstream `57b479f`; C's existing auth/session/schema files
are preserved. Hosted schema and C1 acceptance remain unverified. The writer's
local type publication, simulated test transport, and disabled correction
outcomes follow the explicitly documented interim boundaries.

## Deferred

Context retrieval, shared contract PR, frontend/voice wiring, applying hosted migrations, and real hosted acceptance remain separate steps.
