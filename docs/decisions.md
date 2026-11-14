# Architecture decisions

Accepted for the foundation on **2026-11-13**. Integration decisions describe planned implementation, not completed features.

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 001 | Next.js App Router with strict TypeScript | One application for UI and server routes, shared contracts, and straightforward Vercel hosting. Use npm, Tailwind, ESLint, and Vitest. |
| 002 | OpenAI Realtime for voice, through Agents SDK — superseded for A1 | Natural conversation and interruption; isolate voice transport from work interpretation and verification. Permanent API keys stay server-side. |
| 003 | Excalidraw with MathLive fallback | Preserve freehand work while allowing structured math when handwriting is ambiguous. Add these dependencies with the workspace feature. |
| 004 | Supabase Auth and PostgreSQL | Managed identity and relational cross-session history. RLS and session ownership are required; Developer C owns schema implementation. |
| 005 | Analyze after student pauses or explicitly requests help | Reduce cost and interruptions. Version every snapshot, discard stale results, and tune timing during the MVP. |
| 006 | Persistent, evidence-backed learning events | Personalization should reference observed work, not unsupported ability labels. No default storage of raw audio, screenshots, or full conversations. |
| 007 | Algebra I distributive property first | A narrow, demonstrable end-to-end loop fits November 13–15. Other curriculum waits until this loop works. |
| 008 | Three-developer ownership | A owns AI/voice/tutoring, B owns student UI, C owns auth/memory/backend. Coordinate shared contracts and configuration to reduce merge conflicts. |

Add a short dated entry when a meaningful decision changes. Keep rationale and implementation consequences explicit; avoid speculative infrastructure.

## 2026-11-13 — A01 voice provider pivot (approved)

Use **Deepgram Voice Agent**, official Browser Agent SDK, and Deepgram-managed `gpt-4o-mini` (Standard tier) for the first voice milestone because OpenAI API credits are unavailable. Omit BYO LLM endpoints; require only server-side `DEEPGRAM_API_KEY`. This supersedes decision 002 for voice; separate vision/math analysis, developer ownership, shared tutoring types, Socratic instruction, intervention policy, and learning-memory architecture remain unchanged.

The approved local flow replaces the previous Node-only/pasted credential approach with loopback-only, capability-protected, same-origin 30-second JWT issuance. Production and previews remain closed until C's authentication, ownership, and deployment-wide abuse controls are integrated. The process-local limit is only a development aid.

Future verified work and retrieved memory remain factual contextual inputs supplied through the voice adapter after revision/identity checks; A1 does not implement those integrations. Deepgram-managed OpenAI usage does **not** automatically establish hackathon-track eligibility; confirm rules with organizers before making eligibility claims.
