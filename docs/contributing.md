# Contributing to Newton

Twofold has three workstreams. Start feature development after the foundation is reviewed and merged into `main`. Read the product, architecture, decisions, and relevant shared contracts first.

Use the [central workstream guide](workstreams/README.md) for concrete interfaces, file ownership, integration order, and branch setup. Each developer starts with one implementation specification:

- [A01 — AI, voice, and tutoring](workstreams/A01-ai-tutoring.md)
- [B01 — Student workspace](workstreams/B01-student-workspace.md)
- [C01 — Backend, authentication, and memory](workstreams/C01-backend-memory.md)

The specifications define tasks, dependencies, acceptance criteria, and tests. Planned files and additive interface proposals are labeled; existing shared TypeScript contracts remain unchanged.

## Ownership and first milestones

| Developer | Branch | Owns | First milestone |
| --- | --- | --- | --- |
| A — AI, Voice & Tutoring | `feat/ai-tutoring` | `src/lib/ai/`, `src/lib/math/`, AI-specific logic in `src/lib/learning/`, voice-token/analysis API handlers | Real voice connection that starts, handles interruption, stops, and cleans up safely |
| B — Frontend & Student Experience | `feat/student-workspace` | Student pages, `src/components/whiteboard/`, `src/components/tutor/`, `src/components/learning/` | Workspace exports a versioned whiteboard snapshot; edits invalidate earlier captures |
| C — Backend, Authentication & Memory | `feat/backend-memory` | `src/lib/supabase/`, `supabase/migrations/`, auth routes, memory persistence/retrieval modules | Authenticated session and event persistence with proof that two accounts cannot access each other's records |

A also owns the Deepgram Browser Agent SDK integration, later vision interpretation (provider/funding undecided), CortexJS checks, Socratic prompts, intervention timing, and use of retrieved memory. B owns Excalidraw state/export, MathLive fallback, provider-independent voice controls/status, history presentation, and responsive UX. C owns profiles, study sessions, RLS, cross-session queries, reusable authentication helpers, and deployment configuration.

`src/lib/learning/` is a boundary, not permission for duplicate implementations: A owns `observations.ts` for evidence eligibility; C owns `sessions.ts`, `events.ts`, and `context.ts` for persistence/retrieval. A owns voice lifecycle logic, while B owns the controls that call it. A owns `/api/realtime/token` and `/api/work/analyze`; C owns `/api/study-sessions`, `/api/learning-context`, and auth routes. Follow the workstream guide's interface proposals and coordinate their additive types before connecting consumers.

Shared ownership: `src/types/tutoring.ts`, `package.json` and lockfile, application configuration, shared layouts, architecture documentation, and integration interfaces. Notify affected owners and agree contract changes before coding consumers. Do not implement another owner's feature in parallel.

## Workflow

1. Update from `main`, then use the workstream branch or a small `feat/`, `fix/`, `docs/`, or `chore/` topic branch. The initialization branch is `chore/initialize-newton`.
2. Keep PRs narrow and independently reviewable. Add dependencies with npm only when used, and include `package-lock.json`.
3. Add focused behavior tests: freshness and uncertainty for A, capture/input/error states for B, authenticated ownership and RLS for C. Do not require live credentials in default tests.
4. Run `npm test`, `npm run lint`, and `npm run typecheck`. Run `npm run build` for application, dependency, configuration, or integration changes; CI runs all four.
5. Use the PR template, explain contract/security impacts, and show screenshots for visible changes. State what was actually tested and what still depends on another workstream.
6. Get at least one other developer's review; affected owners review shared interfaces. Resolve CI failures before merging. Merge one PR at a time, then update dependent branches from `main` and verify the connected flow.

Prefer small integration slices over one end-of-hackathon merge. Start by agreeing snapshot/event contracts, then connect voice lifecycle to controls, analysis to current snapshots, and authenticated observations to memory retrieval. Keep `main` runnable without credentials on the landing page. Do not force-push or overwrite another developer's work; coordinate conflict resolution with the owner.

The Deepgram decision changes voice infrastructure only. Preserve A's existing `1f7b031` implementation and tests; follow the [audit note](workstreams/A01-ai-tutoring.md#existing-implementation-and-migration-follow-up) before further provider changes. After these docs merge, all owners [update their existing branches](workstreams/README.md#updating-existing-feature-branches) and reconcile overlapping docs without copying or discarding another owner's implementation.

## Review expectations

Check error/loading states, runtime input validation, stale async results, voice cleanup, and authentication boundaries. Changes to memory must preserve evidence and session ownership. Prefer simple code and named module boundaries over generic service frameworks. Record significant architecture changes in `docs/decisions.md` and update `docs/architecture.md`.

Repository skills are in `.agents/skills/validate-change/` and `.agents/skills/integration-review/`. Agents must follow `AGENTS.md`; agents may not commit, push, or open PRs without explicit user authorization.

## Tooling follow-up

The initial lockfile uses TypeScript 6.0 because the installed typescript-eslint parser does not yet support TypeScript 7. ESLint 9 satisfies the Next.js configuration's React, import, and accessibility plugin peer ranges; those plugins do not yet declare ESLint 10 support. npm marks ESLint 9 deprecated. Upgrade this group together when compatible releases are available; do not suppress peer checks.

At initialization, `npm audit` reports eight moderate development-only findings in the Next.js lint dependency chain, rooted in a minimatch advisory. `npm audit --omit=dev` reports zero vulnerabilities. The suggested automatic fix downgrades the Next.js ESLint configuration across a major version, so it was not applied. Track compatible upstream fixes instead of forcing a mismatched lint configuration or an unverified transitive major override.
