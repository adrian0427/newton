# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion for students in grades 9–12, built by **Twofold**, a three-developer team at the Cal Poly AI Hackathon, November 13–15, 2026. Our primary competition is the OpenAI Challenge. We want to make personalized academic support more accessible through patient, contextual tutoring.

## Current status

This branch includes a responsive homepage, email/password authentication, strict TypeScript contracts, tests, and CI. Sign-in and sign-out are available at `/auth/sign-in`; both team test accounts were manually verified against hosted Supabase on November 13, 2026. C's database migrations, local PostgreSQL policy tests, verified-user/session helpers, and `POST /api/study-sessions` are implemented. The migrations remain unapplied to hosted Supabase, so session creation cannot succeed there yet. Saved history, AI, voice, and whiteboard integration are not connected on this branch; the workspace button remains disabled. Hosted database ownership isolation is still unverified.

The planned MVP combines natural voice conversation, a whiteboard with structured math fallback, controlled Socratic hints, and evidence-backed memory across sessions. The first domain is **Algebra I: the distributive property**.

## Local setup

Use Node.js 22 (22.14 or newer) and npm. `.nvmrc` and CI use the same major version.

```sh
git clone https://github.com/adrian0427/newton.git
cd newton
nvm use
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No service credentials or environment file are needed for the scaffold. If already working in a checkout, start at `nvm use`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint, including Next.js rules; no warnings allowed |
| `npm run typecheck` | Generate Next.js route types, then check strict TypeScript |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Watch focused tests while developing |

For later integrations, copy `.env.example` to `.env.local` and fill in:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Server only | OpenAI requests and short-lived Realtime credentials |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase client initialization; requires auth and RLS for student data |

Never expose permanent OpenAI keys or Supabase privileged keys. Local environment files are ignored. The homepage does not read these values or contact external services. Supabase connection helpers read them lazily when called. Auth and study-session routes require configuration; study-session creation also requires the reviewed migrations to be applied.

## Stack and layout

Installed: Next.js App Router, React, TypeScript, Tailwind CSS, ESLint, Vitest, and the Supabase client/SSR libraries. The lockfile records exact dependency versions. Planned dependencies are added by their owners when needed: OpenAI Agents SDK and Realtime, Excalidraw, MathLive, and CortexJS Compute Engine. Vercel is the intended deployment target; no deployment is provisioned.

```text
src/app/                 Pages, layout, authentication and session routes
src/components/          Future whiteboard, tutor, and learning UI
src/lib/                 Supabase/auth and learning-session modules
src/types/tutoring.ts    Shared integration contracts
supabase/migrations/     Unapplied schema, constraints, grants, and RLS
tests/                   Service-free smoke and contract checks
docs/                    Product, architecture, workflow, decisions
.agents/skills/          validate-change and integration-review
.github/                 CI and pull request template
AGENTS.md                Persistent coding-agent instructions
```

## Working together

After the foundation is reviewed and merged, branch from `main`: A uses `feat/ai-tutoring`, B uses `feat/student-workspace`, and C uses `feat/backend-memory`. Coordinate changes to contracts, dependencies, layouts, and configuration before implementation. Use small PRs, one other developer's review, and passing CI. Do not commit credentials or unrelated artifacts.

- [Product and MVP](docs/product.md)
- [Architecture and data boundaries](docs/architecture.md)
- [Ownership, milestones, and contribution workflow](docs/contributing.md)
- [Three-developer workstream guide and implementation specifications](docs/workstreams/README.md)
- [Initial decisions](docs/decisions.md)
- [Backend database tests and remaining hosted verification](docs/backend-testing.md)
- [Agent instructions](AGENTS.md)

Configuration follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs), and [Next.js testing guidance](https://nextjs.org/docs/app/guides/testing/vitest). Integration references are maintained in the architecture document.

## Supabase helpers (local foundation)

`src/lib/supabase/client.ts` exports `createClient()` for browser components.
`src/lib/supabase/server.ts` exports an async `createClient()` for Route Handlers,
returning `{ supabase, headers }`. Pass `headers` into the HTTP response so auth
cookie refreshes cannot be cached. Each server call creates a separate client.
This helper requires writable request cookies; do not call it during Server
Component rendering. A refresh proxy is not wired; add it before using authenticated Server Components.

Missing configuration throws `SupabaseConfigurationError` with status 503 when
a helper is called, not at import time. Creating a client does not verify
identity. Server-only `requireUser()` verifies with Auth on each protected
request; `requireOwnedSession(auth, sessionId)` returns the same 404 for missing
and foreign sessions. The session endpoint accepts an empty body or `{}` and
returns `{ session: { id, startedAt, endedAt } }` with status 201. It uses the
verified request client and database defaults for ownership/time. Mutating
requests require a matching Origin header; responses are private/no-store.
See [backend verification](docs/backend-testing.md) for setup, limitations, and
remaining hosted acceptance. The auth page uses a writable Route Handler; it
does not use authenticated Server Component rendering.
