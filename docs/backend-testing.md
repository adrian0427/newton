# Backend verification

## Local database checks

With Node 22 and `npm ci`, run:

```sh
npm test -- tests/backend/database.test.ts
```

The development-only PGlite dependency runs PostgreSQL in process. Tests apply
both migrations to an empty database, simulate Supabase's `auth.users` and
`auth.uid()` boundary, then execute real constraints, grants, and RLS under
`authenticated` and `anon` roles. No network, hosted credentials, or Docker are
needed. Each test rolls back its writes; closing PGlite removes the database.
The fixture deliberately starts with broad legacy table grants so migrations
must explicitly remove them.

The portable SQL smoke script is executed by that suite too. To repeat it
against an already migrated **disposable Supabase test database**, use an owner
connection supplied locally:

```sh
psql "$NEWTON_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/learning_foundation.sql
```

The script creates synthetic Auth IDs, switches roles, checks isolation, and
rolls back its fixtures. Do not commit connection strings. This is a SQL role
test; it does not sign real users in or test Supabase's HTTP API.

## Schema application and acceptance

Server helper and route tests run with `npm test -- tests/backend/learning.test.ts
tests/backend/study-sessions-route.test.ts`. They mock the SDK boundary to check
identity verification, request-scoped ownership, sanitized service failures,
foreign/missing-session 404s, Origin checks, and body validation. SQL tests above
separately exercise actual database access rules. Neither proves hosted HTTP
integration.

After schema review/application, a signed-in same-origin browser can call
`fetch('/api/study-sessions', { method: 'POST' })`. Successful creation returns
status 201 with `{ session: { id, startedAt, endedAt: null } }`; times are ISO
UTC. An empty JSON object is also accepted; supplied fields are rejected. The
response omits ownership and auth tokens. A missing login returns 401, missing
configuration 503, and unavailable database/schema 502. All responses are
private/no-store. This endpoint is not yet connected to B's workspace.

The two migrations in `supabase/migrations/` were applied to the hosted
`newton-dev` project on 2026-11-14; see the hosted verification record below. Review and apply them in filename order to a disposable project before
using the session endpoint. The first migration enables RLS and revokes public,
anonymous, and authenticated privileges; the second adds constraints, policies,
and narrow column grants. Normal student access cannot choose owners/timestamps
or edit/delete events. Deleting a disposable Auth account administratively
cascades its data.

C1's real two-account acceptance passed on 2026-11-14 using pre-created test
accounts and an anonymous caller through **HTTP/helpers and the direct
authenticated Supabase client**. The reusable command and exact coverage are
recorded below. PGlite remains a separate local check; it does not test hosted
Auth, PostgREST, refresh cookies, or the team's project settings.

Keep fixtures synthetic. RLS isolates accounts; it does not establish that
self-owned evidence inserted directly through Supabase was produced by AI.

## Local verification record — 2026-11-14

The following records describe earlier checkpoints. Later sections supersede
their pending-verification statements.

The final foundation passed 102 Vitest tests (including 31 PostgreSQL role and
constraint cases plus the portable SQL script), ESLint, TypeScript, and
`npm run build -- --webpack` on Node 22. The built app returned 200 for home and
sign-in, 401 for anonymous identity/session creation, 403 for cross-origin
creation, and 405 for unsupported session GET. No signed-in writes were made.
The default Turbopack build previously hit a sandbox worker/port restriction on
this Mac; webpack production compilation passed. Hosted schema/HTTP acceptance
has not been run.

The final independent branch review found one important issue: terminal refresh
token failures arrived as Auth HTTP 400 and were misclassified as retryable
service failures. Three terminal codes now return 401 in both the identity
helper and auth session GET; unexpected Auth 400s remain 502. Six regression
cases failed before the fix and passed afterward, with two additional cases
checking that genuine unexpected responses remain distinguishable.

### Review scope decisions

- At this foundation checkpoint, event writing and context retrieval were
  deferred. Writer progress is recorded below; retrieval remains unfinished,
  so a complete memory workflow is not yet available.
- Hosted Auth/PostgREST and signed-in API acceptance remain unverified because
  schema application was not authorized tonight. Local tests cannot establish
  hosted readiness.
- Direct self-owned evidence, including correction outcomes, remains untrusted
  advisory data. Strong provenance is required before real-student use.
- Authenticated Server Components and their refresh proxy remain unsupported;
  use the writable Route Handler boundary to avoid unsaved refresh cookies.
- At the foundation checkpoint, request lengths were checked after buffering.
  The subsequent bounded-input fix below supersedes that limitation. Deployment
  request-rate/time limits still need separate verification before public use.
- Owners may change or clear their session end time; C01 allows ending a session
  and does not use it as an immutable audit or billing boundary.
- The migration gap was reviewed directly in the transactional SQL. There is
  no separate test paused between migrations; the schema immediately enables
  RLS and revokes student grants before committing.

## Learning writer verification — 2026-11-14

`npm test -- tests/backend/events.test.ts tests/backend/events-database.test.ts`
checks the server-only writer. Its 39 focused cases initially failed against a
stub, then passed. Ten integration cases use the installed Supabase query
builder with a narrow test `fetch` adapter that translates its inserts/equality
filters into parameterized PostgreSQL queries under the simulated authenticated
role. The adapter exercises actual migration constraints, privileges, RLS,
database defaults, and unique conflicts; it is not a PostgREST implementation or
real Supabase authentication.

Coverage includes normalized identical retries, changed evidence/misconceptions,
overlapping identical/conflicting calls, account separation, foreign/missing
sessions, independent outcomes on one revision, and the 500-character Unicode
boundary. PGlite serializes transactions on one connection; independent hosted
connection races still belong to real-service acceptance. No hosted writes or
AI-provider calls occurred.

After updating C's branch from `main` (`57b479f`), the full suite passed 181
tests, lint and TypeScript. The webpack production build and the workspace's
real MathLive input/snapshot/download/clear workflow passed at desktop and
360px mobile widths. The browser smoke required installing the version of
headless Chromium matching the project's existing Playwright dependency.
The normal `npm run build` using Turbopack also passed with current permissions.
One independent read-only review approved the step-4 checkpoint with no
findings. It checked writer boundaries, retry semantics, merge preservation,
manifest/lock consistency and diff hygiene. Hosted C1 acceptance and team
review before merging to `main` remain outstanding.


## Hosted verification — 2026-11-14

Applied `20261114000000_learning_schema.sql`, then
`20261114000100_learning_access.sql` through the authenticated SQL Editor in
`newton-dev` (project reference `ltoyfshczgknmhwjtogh`). Initial readback showed
all three target tables absent. Final catalog readback showed:

- All three tables have RLS enabled; profiles/sessions/events have 3/3/2 policies.
- Anonymous SELECT is denied on all three. Authenticated SELECT is granted,
  while owner-column INSERT/UPDATE and table DELETE are denied.
- The portable SQL role suite passed on hosted PostgreSQL. Synthetic Auth users
  and rows were rolled back; session/event row counts afterward were zero.
- Actual anonymous Supabase SDK requests denied SELECT on all three tables and
  INSERT into study_sessions with HTTP 401 and SQLSTATE 42501.

These are real hosted SQL/anonymous-HTTP results, not full real-user acceptance.
The role suite uses SET ROLE and simulated identity claims, so signed-in
HTTP/direct-client tests with both adult accounts remain required for C1.
No A/B integration was made. No raw work, audio, or real-user history was saved.

Application was manual through SQL Editor. The Supabase CLI migration-history
schema was absent; the SQL files were not registered as CLI-applied migrations.
Reconcile migration history before a future CLI db push; do not blindly rerun
these CREATE TABLE migrations against the existing tables.

## Bounded request input fix — 2026-11-14

Both body-reading routes now use an incremental UTF-8 reader. The existing
8192/1024 UTF-16 limits remain compatible with valid passwords and session input.
An independent byte ceiling is `3 * character limit + 3` for optional UTF-8 BOM
bytes. Overflow is rejected before retaining additional text; unread input is
cancelled without waiting for cancellation, and the reader lock is released.
Content-Length can reject early but cannot bypass actual streaming enforcement.

The former trigger no longer consumes the unread remainder: route tests show
413 immediately after the first excessive chunk, no provider/database writes,
and preserved no-store/refresh headers. Missing/false lengths, split Unicode,
BOM, pending/rejecting cancellation and legitimate passwords/empty sessions are
covered. Twelve assertions failed before the fix; all 197 tests, lint,
TypeScript and the normal production build passed afterward. One independent
pre-patch investigation and fresh candidate review found no surviving bypass
or compatibility issue; the reviewer also checked 4,000 split-byte decoding
cases against Request.text(). The original sealed audit describes the earlier
source revision; this verification records its remediation rather than changing
that historical report. A live built-app check additionally received 413 for a
chunked 8193-byte sign-in request before the sender ended its body; ordinary
malformed JSON still returned 400. No load attack or hosted mutation was used.

## Learning context verification — 2026-11-14

The authenticated GET endpoint accepts exactly one supported `conceptId`,
rejects ownership/session/unknown/duplicate parameters, and verifies identity
on every request. Its private/no-store response carries refresh headers on
success, validation failures, and service failures.

Twenty-nine focused helper/route tests failed against the initial stubs and
passed after implementation. Four additional PostgreSQL/SDK-transport cases
cover empty history, writer-to-retrieval round trips across sessions/accounts,
the latest-ten limit with timestamp/ID ties and newer foreign rows, and stored
correction vocabulary without enabling correction writes. Summary tests cover
quoted newlines/quotes/backslashes, Unicode-safe excerpts, stable output and
the 2,000-unit bound. Full evidence and source IDs remain in returned records.

Final full suite: 230 tests passed, plus lint, TypeScript, normal production
build and a clean independent feature review. The built GET endpoint returned
401/no-store without login. Local database identity/transport remains simulated;
this is not a replacement for the pending real signed-in hosted HTTP tests.
No A/B integration, new migration or provider call was required.

## Real two-account acceptance — 2026-11-14

The explicitly invoked suite uses real Supabase email/password Auth, two
independent HTTP cookie contexts against a locally running production app,
the actual server writer/ownership helpers, and direct user-scoped SDK clients.
Only the `server-only` import marker is replaced for Vitest execution; Auth,
PostgREST, database rules, and the app routes are real. No service-role key,
voice/analysis service, or AI-provider call is needed. The live auth browser
scenario requires Chromium; install it with `npx playwright install chromium`
if the matching Playwright browser is not already installed.

With Node 22, `npm ci`, and `.env.local` pointing at `newton-dev`:

1. Create `.env.hosted-test.local` in the repository root with the following
   names. Fill them locally with two distinct disposable test accounts; do not
   paste passwords into chat or commit the file. It is ignored by `.gitignore`.
   On macOS/Linux, run `chmod 600 .env.hosted-test.local`.

   ```dotenv
   NEWTON_TEST_EMAIL_A=
   NEWTON_TEST_PASSWORD_A=
   NEWTON_TEST_EMAIL_B=
   NEWTON_TEST_PASSWORD_B=
   ```

2. In one terminal, run `npm run build`, then
   `npm run start -- --hostname 127.0.0.1 --port 3107`.
3. In another terminal at the repository root, run
   `npm run test:hosted -- --reporter=verbose`.

The guard restricts the project to the team's `newton-dev` reference and the app
to a loopback origin; HTTP redirects are disabled. Optional `NEWTON_TEST_URL`
can select another local port. The default `npm test` and CI do not discover
the `.hosted.ts` suite or load these private credentials.

The final hosted run passed one integration scenario, including:

- Real Auth verification, separate cookie sign-ins, and one new session per account.
- Two concurrent first writes with one persisted event and identical IDs/times;
  sequential retry returns that record, while changed evidence returns 409.
- Owner history and bounded summary retrieval; B cannot retrieve A's event,
  profile, or session, and ownership-query tampering returns 400.
- Anonymous reads on all three tables and session insertion denied (42501).
- Direct blank/oversized evidence, unsupported outcome, and missing
  misconception detail rejected by database constraints (23514).
- Foreign-session event insertion denied by the composite FK (23503), owner
  reassignment denied, and foreign session-ending affects zero rows.
- Owner and foreign event UPDATE/DELETE denied (42501); personalized responses
  checked for no-store headers.
- Signed-out context denied (401); after sign-in and a new session, the original
  observation remains retrievable.

The suite signs its own SDK/HTTP clients out and disposes cookie contexts.
Synthetic sessions/events remain deliberately append-only; it creates an owner
profile only if missing and preserves existing preferences. Each successful
run prints fixture event/session IDs for later administrative cleanup. Do not
delete accounts that contain wanted data. After the demonstration, an
administrator can remove disposable test accounts and their cascading records.

C1 backend acceptance is complete. A/B integration (C2), deployed app testing,
long-running refresh behavior, and trustworthy AI provenance remain separate.
The test demonstrates account isolation and persistence, not readiness for real
student data. No schema or production application behavior changed in this step.

Final checkpoint checks: 238 default tests, the separate hosted integration
scenario, ESLint, TypeScript, and the normal Turbopack production build passed
on Node 22. Independent review identified two acceptance-test gaps; concurrent
first insertion and hosted anonymous/constraint checks were added, rerun
successfully, and approved in the follow-up review. Private credential values
were checked against staged contents and were absent; the local file remains
ignored with mode 0600.

## Google auth change

The preceding C1 results are historical. The current hosted harness authenticates its disposable password fixtures via the Supabase SSR SDK and installs the resulting cookies into separate HTTP contexts; the app no longer accepts password POSTs. This preserves real Auth/database/route coverage without pretending to automate Google consent. Follow [Google setup and manual acceptance](google-auth.md) for the actual OAuth flow and test-project/provider settings.

## Hosted migration ledger and Google-account acceptance — 2026-11-14

The two C1 migrations had been applied manually, but the hosted migration-history
relation was absent. Before recording them, a fresh PGlite database built from
both checked-in migrations was compared with hosted `newton-dev`. Canonical
fingerprints matched for columns (17), explicit constraints (17), column grants
(29), indexes (8), policies (8), and RLS settings (3). PostgreSQL 18's implicit
not-null constraint records were excluded from the constraint comparison;
column nullability was compared separately.

A guarded SQL transaction in the authenticated Supabase SQL Editor created the
private `supabase_migrations.schema_migrations` ledger and recorded versions
`20261114000000` (`learning_schema`) and `20261114000100` (`learning_access`),
including their source SQL. It aborted if a ledger already existed or the
schema fingerprints differed. This was a metadata reconciliation, not a
migration rerun or a CLI `db push`/`migration repair` execution. The statement
shape follows the Supabase CLI's [migration-history implementation](https://github.com/supabase/cli/blob/main/apps/cli/src/command-internal/migration-history.ts).

Afterward, all six fingerprints still matched and row counts were unchanged:
21 sessions, 7 learning events, and 1 profile. The ledger contained exactly the
two expected versions and no PUBLIC, anonymous, or authenticated table grants.
The ledger repair did not change learning-table definitions, policies, or data.

Actual Google OAuth acceptance then used two different accounts, with the user
completing Google's login and consent screens. A temporary, Git-ignored local
route exercised the existing verified-user, session-ownership, and event-writer
helpers. It ran only on localhost in development, rejected cross-origin POSTs,
and called no voice or model providers. Synthetic records were explicitly
labelled as acceptance fixtures, not student learning evidence.

Observed results on application revision `252b1d0`:

- Each account created a session through `POST /api/study-sessions`, saved one
  synthetic observation through `recordLearningEvent`, and could access its own
  session through `requireOwnedSession`.
- After reloading, each account's observation remained available through the
  real learning-context endpoint.
- Unfiltered session/event reads using each account's authenticated client
  excluded the other account's fixture, independently exercising hosted RLS.
- Both directions of foreign-session lookup returned 404. Neither account's
  history response included the other account's observation.
- After signing back into the first account, its original observation remained
  available and the second account's fixture remained hidden.
- After logout, the verified-user check and learning-context endpoint returned
  401.

The temporary route was removed and its URL returned 404. The two synthetic
sessions and observations remain in their respective hosted accounts; existing
records were preserved. No passwords, tokens, account emails, or raw student
work are included in this record.

Focused regression verification on the same application revision passed all
118 tests across database, learning helpers, context helpers/routes,
study-session routes, and voice-session authorization. This does not establish
the complete A/B tutoring integration, production deployment behavior,
long-running refresh behavior, or trustworthy AI provenance. No production
application source changed for this acceptance check.
