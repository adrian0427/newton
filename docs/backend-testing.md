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
