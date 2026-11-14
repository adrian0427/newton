# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion for students in grades 9–12, built by **Twofold**, a three-developer team at the Cal Poly AI Hackathon, November 13–15, 2026. Our primary competition is the OpenAI Challenge. We want to make personalized academic support more accessible through patient, contextual tutoring.

## Current status

This repository is the foundation only: a responsive homepage, strict TypeScript contracts, agent guidance, tests, and CI. The student workspace button is intentionally disabled. There is no authentication, microphone access, AI connection, whiteboard, or saved learning history yet.

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

Never expose permanent provider keys through `NEXT_PUBLIC_` variables or browser responses. Supabase privileged keys remain server-side too. Local environment files are ignored. The scaffold does not read these values or contact external services. Deployed voice-token issuance stays disabled until authentication, session ownership, and abuse controls are integrated; preview deployments are included.

## Stack and layout

Installed: Next.js App Router, React, TypeScript, Tailwind CSS, Excalidraw, MathLive, PDF.js, ESLint, Vitest, and Playwright. The lockfile records exact dependency versions. Planned dependencies are added by their owners when needed: the official Deepgram Browser Agent SDK, CortexJS Compute Engine, and Supabase. Vercel is the intended deployment target; no deployment is provisioned.

The hackathon voice selection is Deepgram Voice Agent using intended trial credits and a managed OpenAI model, initially `gpt-4o-mini`, subject to availability and pricing. It needs no separate OpenAI API key. Whiteboard vision is a separate, undecided provider choice because funded OpenAI vision API access is unavailable. Using OpenAI through Deepgram does not establish OpenAI Challenge eligibility; ask the organizers. See [decision 013](docs/decisions.md#2026-11-13--deepgram-voice-pivot) and [A's existing implementation audit](docs/workstreams/A01-ai-tutoring.md#existing-implementation-and-migration-follow-up).

```text
src/app/                 Pages, layout, and future route handlers
src/components/          Worksheet reference, whiteboard/input, and on-demand tutor UI
src/lib/                 Future AI, math, learning, and Supabase modules
src/types/tutoring.ts    Shared integration contracts
supabase/migrations/     Reserved for Developer C; no schema yet
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
- [Agent instructions](AGENTS.md)

Configuration follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs), and [Next.js testing guidance](https://nextjs.org/docs/app/guides/testing/vitest). Integration references are maintained in the architecture document.

## Local workspace (B1)

At `/study`, upload or drop a local PDF/image worksheet, or paste a screenshot. Resize the desktop divider or switch panes on mobile. Draw, erase, undo/redo, or enter structured algebra alongside the reference. Choose a source and capture a step to preview it, then explicitly download JSON or PNG. Work is transient and is lost on reload; no server upload, autosave, microphone, authentication, or saved history is connected. Newton stays hidden behind its side icon until clicked. New edits and clear invalidate captures and revoke download URLs.

The predev/prebuild script copies drawing/math fonts and PDF.js worker/rendering assets into ignored `public/vendor/` so the app serves them locally. The initial structured transport fixture is `2(x+3)=14` normalized to `2*(x+3)=14`; unsupported notation blocks capture. Review parser compatibility with Developer A before B2 integration.

Scoped npm overrides update Excalidraw's pinned nanoid dependencies and its dependency tree's lodash-es to patched releases. The mermaid adapter uses nanoid's named `nanoid()` export, retained in version 5. The current audit still reports the existing lint-chain moderate findings and a low-severity KaTeX finding through Excalidraw's Mermaid dependency; Mermaid/formula import is not exposed by this workspace.
