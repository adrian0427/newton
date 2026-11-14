# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion for students in grades 9–12, built by **Twofold**, a three-developer team at the Cal Poly AI Hackathon, November 13–15, 2026. Our primary competition is the OpenAI Challenge. We want to make personalized academic support more accessible through patient, contextual tutoring.

## Current status

This checkout combines A01's Deepgram voice foundation and B01's local student workspace, alongside the responsive homepage, shared TypeScript contracts, tests, and CI. `/study` provides worksheet viewing, Excalidraw drawing, MathLive input, revision-safe snapshots, appearance preferences, and an on-demand Newton panel. Its Check work and Ask for a hint controls now support a bounded exact-arithmetic structured-expansion demo. Public voice remains disabled until C supplies authentication/owned sessions; the same workspace connects to A01 voice through the guarded local `/dev/study` entry point. See [the integration demo](docs/study-tutoring.md).

A01 provides browser conversations, microphone capture, audible playback, natural/manual interruption, broad mathematical tutoring, and development lifecycle diagnostics. The developer confirmed live browser recognition and playback before this merge; the latest stability changes still require manual acoustic acceptance. Voice diagnostics remain available at `/dev/voice`; `/dev/study` adds the combined workspace demonstration through the same local guards. Authentication, deployed voice, server work analysis, handwriting recognition, proactive intervention, and persistent learning history remain planned.

For voice setup, adapter handoff, and manual acceptance, see [A01 voice development](docs/ai-voice.md). Set server-only `DEEPGRAM_API_KEY` in `.env.local` and run `npm run voice:dev`; open the printed loopback address at `/dev/study` for the workspace or `/dev/voice` for diagnostics. The harness obtains temporary tokens on Start. Ordinary dev, production, and preview issuance remain closed until the appropriate authentication and abuse controls are integrated.

The planned MVP combines natural voice conversation, a whiteboard with structured math fallback, controlled Socratic hints, and evidence-backed memory across sessions. Automated work analysis and proactive intervention initially target **Algebra I: the distributive property**; this does not restrict general mathematical voice conversation.

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
| `npm run build` | Production build; use `npm run build -- --webpack` for the Webpack validation path |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint, including Next.js rules; no warnings allowed |
| `npm run typecheck` | Generate Next.js route types, then check strict TypeScript |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Watch focused tests while developing |
| `npm run voice:dev` | Guarded loopback voice diagnostic harness; requires server-only Deepgram credentials |
| `npm run test:e2e` | Real drawing/input/download checks at desktop and 360px widths (first run `npx playwright install chromium`) |

The homepage and `/study` need no service credentials. For local voice testing or later integrations, copy `.env.example` to `.env.local` and configure only the services being used:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | Server only | Deepgram managed voice; Member-level or higher key for temporary browser-token issuance |
| `OPENAI_API_KEY` | Server only, optional | Not needed for managed voice; separately funded future vision only if OpenAI is selected |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase client initialization; requires auth and RLS for student data |

Never expose permanent provider keys through `NEXT_PUBLIC_` variables or browser responses. Supabase privileged keys remain server-side too. Local environment files are ignored. The homepage, local workspace, and default unit tests require no service credentials. Only the explicitly enabled local voice flow contacts Deepgram. Deployed voice-token issuance stays disabled until authentication, session ownership, and abuse controls are integrated; preview deployments are included.

## Stack and layout

Installed: Next.js App Router, React, TypeScript, Tailwind CSS, the official core Deepgram Browser Agent SDK (`@deepgram/agents`), Excalidraw, MathLive, PDF.js, ESLint, Vitest, and Playwright. `server-only` protects server modules. The lockfile records exact dependency versions. CortexJS Compute Engine and Supabase remain planned dependencies to be added by their owners when needed. Vercel is the intended deployment target; no deployment is provisioned.

The hackathon voice selection is Deepgram Voice Agent using intended trial credits and a managed OpenAI model, initially `gpt-4o-mini`, subject to availability and pricing. It needs no separate OpenAI API key. Whiteboard vision is a separate, undecided provider choice because funded OpenAI vision API access is unavailable. Using OpenAI through Deepgram does not establish OpenAI Challenge eligibility; ask the organizers. See [decision 013](docs/decisions.md#2026-11-13--deepgram-voice-pivot) and [A's existing implementation audit](docs/workstreams/A01-ai-tutoring.md#existing-implementation-and-migration-follow-up).

```text
src/app/                 Homepage, /study, layout, and guarded voice-token handler
src/components/          Worksheet reference, whiteboard/input, and on-demand tutor UI
src/lib/ai/              Provider-independent voice lifecycle, Deepgram adapter, local diagnostics
src/lib/                 Future math, learning, and Supabase integrations
src/types/tutoring.ts    Shared integration contracts
supabase/migrations/     Reserved for Developer C; no schema yet
tests/                   Voice lifecycle, workspace, contract, and browser checks
docs/                    Product, architecture, workflow, decisions
.agents/skills/          validate-change and integration-review
.github/                 CI and pull request template
AGENTS.md                Persistent coding-agent instructions
```

## Working together

Developer ownership remains unchanged: A uses `feat/ai-tutoring`, B uses `feat/student-workspace`, and C uses `feat/backend-memory`. Coordinate changes to contracts, dependencies, layouts, and configuration before implementation. Use small PRs, one other developer's review, and passing CI. Do not commit credentials or unrelated artifacts.

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

Scoped npm overrides update Excalidraw's pinned nanoid dependencies and its dependency tree's lodash-es to patched releases. The mermaid adapter uses nanoid's named `nanoid()` export, retained in version 5. B01's prior audit reported lint-chain moderate findings and a low-severity KaTeX finding through Excalidraw's Mermaid dependency; Mermaid/formula import is not exposed by this workspace. npm also reports existing React 19 peer-range warnings from Excalidraw's older nested Radix components; this merge retains their locked versions rather than changing the UI dependency tree.

## Integration boundaries

Developer A owns `src/lib/ai/`, microphone/playback lifecycle, the existing `/api/realtime/token` handler, and future work analysis/intervention. Developer B owns `/study`, worksheet/drawing/input UI, snapshots, and presentation of voice state. Developer C owns authentication, owned study sessions, learning persistence, and deployment controls.

A's current `VoiceSession` exposes `start({ sessionId })`, `stop()`, `interrupt()`, `getState()`, `getSnapshot()`, and notification-only `subscribe(listener)`. `WorkspaceTutor` now wires those methods into `TutorControls` on the guarded development path; the additive `sendText(message)` sends an explicitly requested structured-work hint on that connection. UI components do not own another microphone lifecycle. B's `WorkSnapshot` exports preserve revisions and remain local. Bounded structured checks are local exact arithmetic; server analysis, worksheet sharing, general verified intervention delivery, and memory context remain future integrations. None is inferred from the voice model.
