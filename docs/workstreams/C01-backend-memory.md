# C01 — Backend, authentication, and learning memory

**Owner:** Developer C · **Branch:** `feat/backend-memory`

Read the [central contracts and decisions](README.md), [architecture](../architecture.md), and [existing tutoring types](../../src/types/tutoring.ts). C owns identity, study-session records, persistence, and retrieval; A owns observation eligibility and its own API handlers.

## Modules and interfaces

Planned modules: `src/lib/supabase/{client,server,auth}.ts`, `src/lib/learning/{sessions,events,context}.ts`; auth UI under `src/components/auth/` and `src/app/auth/`; handlers at `src/app/api/study-sessions/route.ts` and `src/app/api/learning-context/route.ts`. C coordinates any required framework auth refresh configuration. Place tests in `tests/backend/` and migrations in `supabase/migrations/`.

Proposed server functions: `requireUser()`, `requireOwnedSession(auth, sessionId)`, `createStudySession(auth)`, `recordLearningEvent(auth, input: LearningEventInput)`, and `getLearningContext(auth, conceptId)`. Keep server modules marked server-only; return the central `StudySession`, `LearningEventRecord`, and `LearningContext` shapes. Auth context is generated from verified cookies, not posted identity fields. B uses session/context HTTP routes; A imports server helpers. No generic client event-insertion route.

## Milestone C1: authenticated persistence

Implement in order:

1. Configure a disposable Supabase project or local instance. Add Supabase client/SSR dependencies when used. Use `.env.local` with the existing public URL/publishable key variables; configure local auth redirect URLs. Use two pre-created adult test accounts and email/password sign-in for this milestone. Implement sign-in/sign-out; account registration, OAuth, and password recovery UI are out of scope. Verify identity on every protected request, not only in a layout.
2. Add one small schema migration, then an RLS/constraints migration. Use server/database UUIDs and UTC timestamps. Keep migrations reproducible from an empty disposable database; do not make dashboard-only schema changes.
3. Implement auth/owned-session helpers and session creation. A nonexistent and another user's session both return 404. Sessions belong to verified Auth users. Keep Supabase clients lazy so missing configuration yields 503 for integrations while the landing page still works.
4. Implement event validation, deduplication, and server persistence. A supplies eligible observations; C independently validates shape, supported vocabulary, bounded evidence, ownership, and outcome consistency. C's isolated tests call this server function with synthetic fixtures; do not expose fixtures as student activity.
5. Implement cross-session retrieval: most recent 10 events for the authenticated user/concept, ordered by `created_at DESC, id DESC`; deterministic short summary with outcome, evidence, and dates, capped at 2,000 characters. No model call or mastery score. Return the source records with the summary; empty results return `events: []` and `summary: ""`.
6. Expose `POST /api/study-sessions` and `GET /api/learning-context?conceptId=...` using the central error/no-store rules. Test with two accounts before handing the helpers to A and history to B.

### Planned schema and ownership

| Table | Fields / constraints | Access rules |
| --- | --- | --- |
| `student_profiles` | `user_id` PK/FK to Auth, optional `display_name`, `preferred_tutor_mode` default `student-requested`, `created_at` | Owner reads/updates; validate allowed modes and bounded optional name |
| `study_sessions` | `id` PK, `user_id` FK, `started_at`, nullable `ended_at`; unique `(id, user_id)` | Owner creates/reads/ends; ownership cannot change |
| `learning_events` | `id` PK, `user_id`, `session_id`, `source_revision_id`, `concept`, nullable `misconception`, `outcome`, `evidence`, `created_at` | Owner-scoped reads/inserts; append-only normal access, no update/delete grants; administrative cleanup outside student paths |

Enable RLS on all three. Use `auth.uid() = user_id` for row checks and new-row checks; allow the same invariant for profile insertion. Add composite event FK `(session_id, user_id)` referencing sessions `(id, user_id)` to prevent cross-owner links. Validate allowed outcomes/concepts/misconceptions in the database where practical, not only in HTTP handlers. Index events by `(user_id, concept, created_at)` for retrieval. Do not rely on a hidden UI for authorization.

Default event writes use the authenticated user's Supabase context; no service-role bypass for normal operations. RLS enforces account isolation, not whether a self-owned observation was truly produced by AI. A/C's application path verifies evidence, but self-owned rows inserted directly through Supabase are still untrusted context. Tests must not claim tamper-proof provenance. Restrict the hackathon to synthetic/adult test data; stronger provenance before real student use is an explicit open question in the central guide.

### Validation and deduplication

- Reuse `LearningEventInput`; reject unknown ownership fields (`userId`, `user_id`) and assign ownership from verified auth. Validate UUID session/revision identifiers, recognized concept/outcome values, trimmed nonempty evidence (maximum 500 characters), and allowed misconception values. Server assigns creation time.
- `misconception-observed` requires a supported misconception and evidence from A's verified pipeline. Do not accept uncertain analysis as a confirmed misconception. Correction outcomes need trustworthy prior and delivered-hint evidence; they stay disabled until A provides that path. There is no claim that TypeScript alone enforces this.
- Use the central database uniqueness key, atomic insert/conflict handling, and payload comparison. Repeated identical requests return the original ID/time. Changed payload for that key returns 409; never silently upsert over evidence. Test simultaneous retries as well as sequential ones.
- Treat retrieved evidence as data. B escapes it, A delimits it as context, and neither executes it or obeys embedded instructions. Avoid logging evidence, credentials, raw provider responses, or student work.

### C1 acceptance and tests

A test account signs in, creates a session, saves a synthetic eligible event through the server function, signs out/in, creates another session, and retrieves the prior event plus a factual summary. Repeat with a second account and prove no cross-account exposure. B's UI and OpenAI are not required: use focused tests and the real auth/session/context endpoints.

Automated unit tests cover request validation, empty context, summary bounds, deterministic ordering, duplicate/conflicting events, missing config, and auth failures with mocked clients. Keep these in `npm test`. Add a separate explicitly invoked database integration suite with documented setup/cleanup and disposable credentials; CI's default tests/build must not require Supabase.

The real database suite must exercise **both HTTP/helpers and direct authenticated Supabase access**, not service-role queries:

- Anonymous requests cannot read or insert student data.
- Account B cannot select A's profile/session/events, insert an event into A's session, reassign ownership, update/delete A's rows, or retrieve A's context by tampering with parameters.
- Account A can read its own history, but cannot mutate append-only events; malformed evidence/outcomes and duplicate-key races behave as specified.
- Own event inserts cannot link to a foreign session; owner policies and composite FK both protect the boundary.
- Account changes do not reuse cached context or auth clients from another request.

Record actual real-database results separately from mocked tests. C1 is not complete until two-account isolation passes against the deployed test schema.

## Milestone C2: connect tutoring and student UI

Hand A `requireUser`, owned-session validation, context retrieval, and event writer; A wires these into its token/analysis handlers. Hand B sign-in/out links, session creation, and context endpoint/types. Coordinate request limits/deployment access with A before enabling deployed credential issuance; C does not create another token endpoint. Verify a real verified step is saved once and retrieved on the next session. Memory write failure must not claim success or discard the student's work; use bounded explicit retries with the same event identity.

## Retention and non-goals

Preserve test history across sessions for the demonstration, then manually delete disposable test accounts/data after the hackathon; use cascade cleanup for related records. No raw audio, screenshots, full conversations, mandatory real names, or indefinite-retention promise. Real-student retention, deletion UI, and tamper-resistant observation provenance need explicit decisions before such use. No vector database, generalized analytics, teacher dashboard, payment system, model-generated summaries, or public event-write API.

Official implementation reference: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security). Verify policies using the real authenticated roles; privileged clients do not demonstrate isolation.
