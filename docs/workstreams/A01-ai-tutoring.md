# A01 — AI, voice, and tutoring

**Owner:** Developer A · **Branch:** `feat/ai-tutoring`

Read the [central contracts and decisions](README.md), [architecture](../architecture.md), and [existing tutoring types](../../src/types/tutoring.ts). This is an implementation specification, not a description of existing functionality.

## Owned files and public boundary

Planned modules: `src/lib/ai/voice-session.ts` (client adapter), `realtime-credentials.ts` (server only), `tutor-instructions.ts`, `analyze-work.ts` (server), `intervention.ts` (pure decisions), `src/lib/math/verify-step.ts`, and `src/lib/learning/observations.ts` (server evidence eligibility). Own route handlers at `src/app/api/realtime/token/route.ts` and `src/app/api/work/analyze/route.ts`. Tests belong in `tests/ai/` and `tests/math/`. Add files as their milestone needs them.

Expose the proposed `VoiceSession`, `VoiceState`, and `InterventionDecision` from the coordinated contract PR. B owns all student controls; do not create a competing study page. Import C's auth/context/writer helpers; do not implement Supabase clients, schemas, or memory retrieval. Shared types and dependency changes require affected owners' review.

## Approved provider change

Twofold approved Deepgram Voice Agent for A1 because OpenAI API credits are unavailable. Use Deepgram's managed `open_ai` / `gpt-4o-mini` (Standard tier), with no BYO endpoint or `OPENAI_API_KEY`. This changes voice transport and credential issuance only. A/B/C ownership, Socratic behavior, whiteboard contracts, mathematical verification, and evidence-backed memory boundaries remain intact. Managed OpenAI usage through Deepgram does **not** automatically establish OpenAI Challenge or other hackathon-track eligibility; the team must confirm the competition rules with organizers.

## Milestone A1: real voice lifecycle

Implement/verify in order:

1. Keep the provider-neutral adapter in `src/lib/ai/voice-session.ts`: single-flight `start`, idempotent `stop`, `interrupt`, `subscribe`, `getState`, and `getSnapshot`. Its A-owned types are an implementation interface; shared tutoring contracts remain unchanged.
2. Use official `@deepgram/agents` core Browser Agent SDK behind `sdk-voice-connection.ts`. Deepgram manages listen/think/speak and turn-taking. Start with Nova-3 input, managed `gpt-4o-mini`, and Aura-2 Thalia output. No custom speech recognizer or audio transport.
3. A owns `POST /api/realtime/token` (the existing route name is retained). The server uses `DEEPGRAM_API_KEY` to call `/v1/auth/grant` for a 30-second JWT and normalizes it to `{ clientSecret, expiresAt }`. Never send the permanent key to the browser. `Cache-Control: no-store` applies to all responses.
4. Before C's auth integration, only `npm run voice:dev` enables issuance: it binds loopback, generates a random per-run server capability, and creates an ignored `/dev/voice` route. Require that capability, exact same-origin POST, a loopback host, a bounded JSON body, and a five-attempt/ten-minute local limit. Production, previews, CI, and ordinary dev servers fail closed. This approved local flow supersedes the previous Node-only issuer/pasted OpenAI credential flow. Do not expose the dev server with tunnels or publish its generated route.
5. Subscribe to settings acknowledgement before opening the microphone. Use SDK microphone/player APIs. Natural user speech interrupts playback; manual diagnostics silence/discard the current playback turn without claiming server-generation cancellation. Stop, navigation, unmount, and errors release microphone, audio contexts, WebSocket, timers, and listeners, including permission results arriving after Stop. Disable automatic reconnects; retries are explicit.
6. Keep reusable concise Socratic instructions: ask one guiding question, allow thinking time, acknowledge uncertainty, avoid historical roleplay or mastery claims, and never claim to see work or remember prior sessions before those inputs exist.

**External requirements:** Deepgram project/trial credits with Voice Agent access, a server-only key with at least Member permissions for auth grants, a microphone, and a supported browser on localhost/HTTPS. No separate OpenAI account credits/key are required. B is not required for local adapter testing. Deployed voice waits for C's verified auth, session ownership, and deployment-wide abuse controls.

**A1 acceptance:** real conversation starts, responds, yields to speech, continues, ends, and restarts cleanly. Check the actual microphone indicator after Stop/navigation and late permission approval. No permanent key appears in client bundles, responses, or logs. Production/preview token requests make zero upstream calls. Both missing-key and upstream-error states are recoverable. Local acceptance is distinct from deployed integration readiness; no live acoustic behavior may be claimed from mocks alone.

**Tests:** automate initial/success/error states, repeated starts, cancellation before/after resource allocation, delayed permission cleanup, SDK barge-in/player events, playback-drain timing, credential expiry/format, and request authorization/limits. Manually test a real session, speaking over Newton, manual silence, permission denial, disconnect, navigation, and restart. Default tests require no API calls or hardware. See [setup and recorded verification limits](../ai-voice.md).

## Future work and memory context

A2 still consumes B's versioned `WorkSnapshot`, produces `WorkAnalysis`, and gates hints through the intervention controller. Deepgram voice is not mathematical verification. A later reviewed delivery/context method can map verified current work into a bounded prompt update or controlled message; recheck revision/session before speaking. C supplies user-scoped factual `LearningContext`; A will append bounded evidence to the base tutoring prompt using the SDK's prompt-update/context mechanism. Treat it as data, preserve uncertainty, and stop/recreate voice when identity changes. None of analysis, intervention, or memory integration is implemented in A1.

## Milestone A2: work analysis and intervention

1. Consume B's `WorkSnapshot` through `{ sessionId, snapshot }`; validate at least one content source, UUID/revision lengths, image type/size, and expression bounds. Use the central PNG/structured-input limits; reject temporary URLs initially. Match `sourceRevisionId` exactly in every returned `WorkAnalysis`.
2. Interpret work with a vision-capable model separately from the Realtime conversation. Use structured input directly when selected. For the fixed `2(x + 3) = 14` problem, support clear algebra steps within the documented distributive-property domain. Verify transformations with CortexJS. Equivalent equations alone do not prove a particular misconception; unsupported steps are uncertain.
3. Return the actual `WorkAnalysis` discriminated union. Use `algebra.distributive-property` and `distribution.missed-term`. Uncertain input asks for clarification or waits; network errors return `ApiError`. Do not turn a failed model request into an incorrect-math result.
4. Implement a pure intervention controller with central pause, cooldown, freshness, activity, and duplicate-hint rules. It produces a decision; the voice adapter delivers it only after a final freshness check. B supplies revision/activity/mode and explicitly requests help. A owns scheduling/decision policy so B does not duplicate it.
5. When C is ready, retrieve bounded learning context at session start and pass it as quoted factual context, not instructions. In the server analysis path, construct only eligible `LearningEventInput` values and call C's writer; no browser-supplied analysis is accepted as proof. Apply the central historical-step rule for a result superseded during processing. Do not claim self-correction or hint-assisted correction without trustworthy prior/hint evidence.

**A2 acceptance/tests:** the completed incorrect step `2x + 3 = 14` produces a guiding question only when verified and intervention is allowed; `2x + 6 = 14` is recognized as a valid expansion. Ambiguous handwriting and unsupported transformations remain uncertain. Unit-test structured examples, low confidence, stale/reordered results, old sessions, edits during speech scheduling, duplicate requests/hints, and cooldown with fake timers. Test persistence eligibility independently from model confidence. Manually exercise B's real capture and C's cross-session memory after integration. Service failures show retry state without recording an invented observation.

## Handoff and non-goals

Give B the voice adapter/state subscription and analysis/controller interfaces; give C the server-created event payload and requested context shape. Dependencies are explicit in the central guide: A1 can begin alone, deployed voice waits for C, and A2 end-to-end waits for B and C. No full curriculum, custom speech stack, generic event bus, multi-agent framework, database ownership, memory UI, or guaranteed mastery judgments.

Official references: [Deepgram Browser Agent SDK](https://developers.deepgram.com/docs/browser-agent-javascript), [token authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication), and [managed LLMs](https://developers.deepgram.com/docs/voice-agent-llm-models).
