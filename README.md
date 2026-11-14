# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion for students in grades 9–12, built by **Twofold**, a three-developer team at the Cal Poly AI Hackathon, November 13–15, 2026. Our primary competition is the OpenAI Challenge. We want to make personalized academic support more accessible through patient, contextual tutoring.

## Current status

This branch includes a responsive homepage, email/password authentication, strict TypeScript contracts, tests, and CI. Sign-in and sign-out are available at `/auth/sign-in`; both team test accounts were manually verified against hosted Supabase on November 13, 2026. C's database migrations, local PostgreSQL policy tests, verified-user/session helpers, and `POST /api/study-sessions` are implemented. Both migrations were applied to hosted `newton-dev` on November 14, 2026; hosted SQL role tests and anonymous API-denial checks passed. The local `/study` workspace is available; its tutoring, auth/session, and saved-history integration remains pending. Real signed-in two-account HTTP isolation remains unverified.

The planned MVP combines natural voice conversation, a whiteboard with structured math fallback, controlled Socratic hints, and evidence-backed memory across sessions. The first domain is **Algebra I: the distributive property**.

C's server-only `recordLearningEvent()` validates supported observations, checks
session ownership, and saves under the verified user's database context.
Identical retries return the original ID/time; conflicting evidence returns
409 and preserves existing history. It is tested locally and awaits A's
eligible-observation integration. Correction outcomes remain disabled, and
cross-session retrieval is the next backend slice. No public event-write route
is exposed.

## Local setup

Use Node.js 22 (22.14 or newer) and npm. `.nvmrc` and CI use the same major version.

```sh
git clone https://github.com/adrian0427/newton.git
cd newton
nvm use
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Open `/study` for the full-page worksheet/whiteboard workspace and structured math input. No service credentials or environment file are needed for the homepage or workspace. If already working in a checkout, start at `nvm use`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint, including Next.js rules; no warnings allowed |
| `npm run typecheck` | Generate Next.js route types, then check strict TypeScript |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Watch focused tests while developing |
| `npm run test:e2e` | Real drawing/input/download checks at desktop and 360px widths (first run `npx playwright install chromium`) |

For later integrations, copy `.env.example` to `.env.local` and fill in:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | Server only | Deepgram managed voice; Member-level or higher key for temporary browser-token issuance |
| `OPENAI_API_KEY` | Server only, optional | Not needed for managed voice; separately funded future vision only if OpenAI is selected |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase client initialization; requires auth and RLS for student data |

Never expose permanent provider keys through `NEXT_PUBLIC_` variables or browser responses. Supabase privileged keys remain server-side too. Local environment files are ignored. The homepage and local workspace need no service credentials. Supabase helpers read configuration lazily; auth routes require it and session creation also requires the migrations to be applied. Deployed voice-token issuance stays disabled until authentication, session ownership, and abuse controls are integrated; preview deployments are included.

## Stack and layout

Installed: Next.js App Router, React, TypeScript, Tailwind CSS, Excalidraw, MathLive, PDF.js, the Supabase client/SSR libraries, ESLint, Vitest, and Playwright. The lockfile records exact dependency versions. Planned dependencies are added by their owners when needed: the official Deepgram Browser Agent SDK and CortexJS Compute Engine. Vercel is the intended deployment target; no deployment is provisioned.

The hackathon voice selection is Deepgram Voice Agent using intended trial credits and a managed OpenAI model, initially `gpt-4o-mini`, subject to availability and pricing. It needs no separate OpenAI API key. Whiteboard vision is a separate, undecided provider choice because funded OpenAI vision API access is unavailable. Using OpenAI through Deepgram does not establish OpenAI Challenge eligibility; ask the organizers. See [decision 013](docs/decisions.md#2026-11-13--deepgram-voice-pivot) and [A's existing implementation audit](docs/workstreams/A01-ai-tutoring.md#existing-implementation-and-migration-follow-up).

```text
src/app/                 Pages, layout, authentication and session routes
src/components/          Worksheet reference, whiteboard/input, and on-demand tutor UI
src/lib/                 Supabase/auth and learning-session modules
src/types/tutoring.ts    Shared integration contracts
supabase/migrations/     Versioned schema, constraints, grants, and RLS
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

## Local workspace (B1)

At `/study`, upload or drop a local PDF/image worksheet, or paste a screenshot. Resize the desktop divider or switch panes on mobile. Draw, erase, undo/redo, or enter structured algebra alongside the reference. Choose a source and capture a step to preview it, then explicitly download JSON or PNG. Work is transient and is lost on reload; no server upload, autosave, microphone, authentication, or saved history is connected to the workspace. The separate auth screen is available at `/auth/sign-in`. Newton stays hidden behind its side icon until clicked. New edits and clear invalidate captures and revoke download URLs.

The predev/prebuild script copies drawing/math fonts and PDF.js worker/rendering assets into ignored `public/vendor/` so the app serves them locally. The initial structured transport fixture is `2(x+3)=14` normalized to `2*(x+3)=14`; unsupported notation blocks capture. Review parser compatibility with Developer A before B2 integration.

Scoped npm overrides update Excalidraw's pinned nanoid dependencies and its dependency tree's lodash-es to patched releases. The mermaid adapter uses nanoid's named `nanoid()` export, retained in version 5. The current audit still reports the existing lint-chain moderate findings and a low-severity KaTeX finding through Excalidraw's Mermaid dependency; Mermaid/formula import is not exposed by this workspace.
