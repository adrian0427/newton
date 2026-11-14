# Newton agent instructions

Newton is the student-facing product; Twofold is the three-developer team. This repository begins as a scaffold. Do not claim planned tutoring features are implemented.

## Before implementing

Read `docs/product.md`, `docs/architecture.md`, and `docs/decisions.md`; inspect relevant types in `src/types/tutoring.ts`. Identify affected modules and owners in `docs/contributing.md`. Respect the requested scope and coordinate shared contracts, dependencies, layouts, and configuration.

## Engineering

- Prefer simple, modular implementations and established libraries over custom infrastructure.
- Use strict TypeScript; avoid unnecessary `any`. Validate untrusted data at runtime.
- Handle async errors and loading states. Discard analysis for obsolete revisions.
- Keep external services behind clear module interfaces; credentials must not be required for the homepage or default tests.
- Add focused tests for important behavior. Avoid unrelated edits and speculative dependencies.
- Document important architecture changes in the architecture document and decision log.

## Tutoring

- Prioritize understanding and Socratic guidance. Reveal solutions only when explicitly appropriate.
- Respect student-requested/proactive modes and thinking time; avoid unnecessary interruptions.
- Never treat uncertain handwriting as confirmed mathematical truth.
- Preserve evidence for learning observations; keep memory factual, contextual, and scoped.
- Do not infer ability or mastery from one mistake or unsupported evidence.

## Security and privacy

- Never commit credentials. Permanent OpenAI keys remain server-side.
- Authenticate protected routes, enforce Supabase RLS, and verify study-session ownership.
- Never trust a client-supplied user ID. Assign ownership from verified server identity.
- Do not persist raw audio, screenshots, or full conversations by default; minimize student PII.

## Validation and reporting

Run relevant tests (`npm test`), ESLint (`npm run lint`), and TypeScript (`npm run typecheck`) before reporting implementation complete. Run `npm run build` for application, dependency, configuration, and integration changes. Report failures honestly; summarize modified files and integration assumptions. Use the repository `validate-change` and `integration-review` skills when relevant.

## Git

Use feature branches and scoped changes. Do not force-push or overwrite another developer's work. Do not create commits, push, or open pull requests without explicit authorization. Preserve existing repository history and remotes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
