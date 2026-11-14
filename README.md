# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion for students in grades 9–12, built by **Twofold**, a three-developer team at the Cal Poly AI Hackathon, November 13–15, 2026. Our primary competition is the OpenAI Challenge. We want to make personalized academic support more accessible through patient, contextual tutoring.

## Current status

This repository includes a responsive homepage, email/password authentication, strict TypeScript contracts, agent guidance, tests, and CI. The student workspace button is intentionally disabled. Local email/password sign-in and sign-out are available at `/auth/sign-in`. There is no microphone access, AI connection, whiteboard, or saved learning history yet. Both team test accounts were manually verified signing in against the hosted Supabase project on November 13, 2026. Database ownership isolation remains unverified until persistence is implemented.

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

Never expose permanent OpenAI keys or Supabase privileged keys. Local environment files are ignored. The homepage does not read these values or contact external services. Supabase connection helpers read them lazily when called; the auth screen uses the session route; no database operation is connected yet.

## Stack and layout

Installed: Next.js App Router, React, TypeScript, Tailwind CSS, ESLint, Vitest, and the Supabase client/SSR libraries. The lockfile records exact dependency versions. Planned dependencies are added by their owners when needed: OpenAI Agents SDK and Realtime, Excalidraw, MathLive, and CortexJS Compute Engine. Vercel is the intended deployment target; no deployment is provisioned.

```text
src/app/                 Pages, layout, and future route handlers
src/components/          Future whiteboard, tutor, and learning UI
src/lib/                 Future AI, math, learning, and Supabase modules
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
a helper is called, not at import time. Future routes must map this to a bounded
error response. Creating a client does not verify identity; protected operations
will need verified auth and ownership checks. The auth screen calls `/auth/session` for verified identity, password sign-in, and local sign-out. Mutating requests require a matching Origin header. Hosted persistence is not implemented. The current auth page checks sessions through a writable Route Handler; it does not use authenticated Server Component rendering.
