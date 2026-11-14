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

## Schema application and remaining acceptance

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

The two migrations in `supabase/migrations/` are unapplied to the team's hosted
project. Review and apply them in filename order to a disposable project before
using the session endpoint. The first migration enables RLS and revokes public,
anonymous, and authenticated privileges; the second adds constraints, policies,
and narrow column grants. Normal student access cannot choose owners/timestamps
or edit/delete events. Deleting a disposable Auth account administratively
cascades its data.

C1 remains incomplete. After the remaining event writer/context retrieval are
implemented, verify using both pre-created adult test accounts and an anonymous
caller through **HTTP/helpers and the direct authenticated Supabase client**:
create a session, save a synthetic observation, sign out/in, retrieve it in a
later session, and reject cross-account reads/writes, owner reassignment,
append-only mutations, and duplicate/conflicting event retries. Record hosted
results separately from local/mock results. PGlite does not test hosted Auth,
PostgREST, refresh cookies, or the team's project settings.

Keep fixtures synthetic. RLS isolates accounts; it does not establish that
self-owned evidence inserted directly through Supabase was produced by AI.

## Local verification record — 2026-11-14

The initial foundation passed 94 Vitest tests (including 31 PostgreSQL role and
constraint cases plus the portable SQL script), ESLint, TypeScript, and
`npm run build -- --webpack` on Node 22. The built app returned 200 for home and
sign-in, 401 for anonymous identity/session creation, 403 for cross-origin
creation, and 405 for unsupported session GET. No signed-in writes were made.
The default Turbopack build previously hit a sandbox worker/port restriction on
this Mac; webpack production compilation passed. Hosted schema/HTTP acceptance
has not been run.
