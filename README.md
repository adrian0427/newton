# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion for students in grades 9–12, built by **Twofold**, a three-developer team at the Cal Poly AI Hackathon, November 13–15, 2026. Our primary competition is the OpenAI Challenge. We want to make personalized academic support more accessible through patient, contextual tutoring.

## Current status

This repository includes a responsive homepage, strict TypeScript contracts, agent guidance, tests, and CI. A01 adds an Deepgram Voice Agent adapter and a local diagnostic harness; live microphone behavior still requires manual verification. The student workspace button is intentionally disabled. Authentication, whiteboarding, deployed voice, and saved learning history are not implemented yet.

For voice development, see [A01 setup, adapter interface, and manual testing](docs/ai-voice.md). Run `npm run voice:dev` for the local diagnostic page after setting server-only `DEEPGRAM_API_KEY` in `.env.local`. The harness obtains short-lived tokens on Start; production and preview issuance stay closed until authentication and abuse controls are integrated.

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
| `DEEPGRAM_API_KEY` | Server only | Short-lived Deepgram tokens for local voice testing; managed LLM needs no OpenAI key |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase client initialization; requires auth and RLS for student data |

Never expose permanent provider keys or Supabase privileged keys. Local environment files are ignored. The homepage and default tests need no credentials. Only the guarded local voice flow contacts Deepgram.

## Stack and layout

Installed: Next.js App Router, React, TypeScript, Tailwind CSS, Deepgram Browser Agent SDK, ESLint, and Vitest. The lockfile records exact dependency versions. Planned dependencies are added by their owners when needed: Excalidraw, MathLive, CortexJS Compute Engine, and Supabase. Vercel is the intended deployment target; no deployment is provisioned.

```text
src/app/                 Pages, layout, and future route handlers
src/components/          Future whiteboard, tutor, and learning UI
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
- [Initial decisions](docs/decisions.md)
- [Agent instructions](AGENTS.md)

Configuration follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs), and [Next.js testing guidance](https://nextjs.org/docs/app/guides/testing/vitest). Integration references are maintained in the architecture document.
