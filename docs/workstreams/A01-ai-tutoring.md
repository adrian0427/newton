# A01 — AI, voice, and tutoring

**Owner:** Developer A · **Branch:** `feat/ai-tutoring`

Read the [central contracts and decisions](README.md), [architecture](../architecture.md), and [existing tutoring types](../../src/types/tutoring.ts). This is an implementation specification, not a description of existing functionality.

## Owned files and public boundary

Planned modules: `src/lib/ai/voice-session.ts` (client adapter), `realtime-credentials.ts` (server only), `tutor-instructions.ts`, `analyze-work.ts` (server), `intervention.ts` (pure decisions), `src/lib/math/verify-step.ts`, and `src/lib/learning/observations.ts` (server evidence eligibility). Own route handlers at `src/app/api/realtime/token/route.ts` and `src/app/api/work/analyze/route.ts`. Tests belong in `tests/ai/` and `tests/math/`. Add files as their milestone needs them.

Expose the proposed `VoiceSession`, `VoiceState`, and `InterventionDecision` from the coordinated contract PR. B owns all student controls; do not create a competing study page. Import C's auth/context/writer helpers; do not implement Supabase clients, schemas, or memory retrieval. Shared types and dependency changes require affected owners' review.

## Milestone A1: real voice lifecycle

Implement in order:

1. Define the voice adapter and test its transitions against a fake transport. `start` is single-flight, `stop` is idempotent, subscriptions return an unsubscribe function. Stop during connection prevents a late connection from reopening media.
2. Add OpenAI Agents SDK only when used. Read current official SDK/Realtime documentation and record chosen model/voice in the PR. Implement a server-only credential issuer using `OPENAI_API_KEY`; normalize its output to `{ clientSecret, expiresAt }` (ISO UTC expiry). Do not expose provider payloads or log credentials.
3. Implement `POST /api/realtime/token` with body `{ sessionId }`. Call C's `requireUser` and `requireOwnedSession` before issuance; absent auth integration/configuration returns 503, anonymous requests 401, foreign sessions 404. Return `no-store`; validate same-origin POSTs and enforce the agreed per-user request limit. A simple in-process limiter is only a local aid; keep public issuance disabled until deployment-wide abuse controls exist. C coordinates deployment controls; A owns route enforcement.
4. For independent manual development before C lands, use a local Node-only credential script and an untracked test harness bound to loopback. Paste only the short-lived credential into that harness. Do not create a credential bypass in deployed code or commit credentials/harness artifacts. Automated tests inject a fake issuer.
5. Implement explicit start, microphone permission, listening/speaking indicators, native speech barge-in, and explicit interruption. Stop tutor audio when interrupted and reconcile the conversation's playback state using the SDK. Release tracks, playback, peer connection, data channels, and listeners on stop, failure, unmount, and retry. Keep one active connection.
6. Add short Socratic instructions: introduce Newton as a study companion, ask one guiding question, allow thinking time, do not roleplay Isaac Newton, and do not claim to see work or remember history before those inputs exist. Surface denied permission, expired credential, missing configuration, network failure, and disconnect as recoverable errors.

**External requirements:** OpenAI project access/credits, server-only API key, microphone, and a browser supporting the chosen WebRTC flow. Use localhost or HTTPS. C's auth and owned study session are required for deployed voice. B is not required for local adapter validation.

**A1 acceptance:** a developer can start a real conversation, speak and hear a response, interrupt speech naturally, stop, and start again. Stop releases the browser microphone indicator; stopping while connecting also releases late resources. Failed starts do not leave media open or auto-retry indefinitely. No permanent key appears in client bundles, HTTP responses, or logs. The protected route makes zero provider calls when auth is missing/unwired. Report local real-voice success separately from deployed integration readiness.

**Tests:** automate state transitions, duplicate starts, stop-while-connecting, interruption, unsubscribe/cleanup, expired credential handling, denied auth/foreign sessions, and issuer failure using mocks. Manually test a real conversation, interruption, denied microphone access, disconnect/reconnect, navigation cleanup, and inspect network responses for short-lived credentials only. Never put live calls in `npm test`.

## Milestone A2: work analysis and intervention

1. Consume B's `WorkSnapshot` through `{ sessionId, snapshot }`; validate at least one content source, UUID/revision lengths, image type/size, and expression bounds. Use the central PNG/structured-input limits; reject temporary URLs initially. Match `sourceRevisionId` exactly in every returned `WorkAnalysis`.
2. Interpret work with a vision-capable model separately from the Realtime conversation. Use structured input directly when selected. For the fixed `2(x + 3) = 14` problem, support clear algebra steps within the documented distributive-property domain. Verify transformations with CortexJS. Equivalent equations alone do not prove a particular misconception; unsupported steps are uncertain.
3. Return the actual `WorkAnalysis` discriminated union. Use `algebra.distributive-property` and `distribution.missed-term`. Uncertain input asks for clarification or waits; network errors return `ApiError`. Do not turn a failed model request into an incorrect-math result.
4. Implement a pure intervention controller with central pause, cooldown, freshness, activity, and duplicate-hint rules. It produces a decision; the voice adapter delivers it only after a final freshness check. B supplies revision/activity/mode and explicitly requests help. A owns scheduling/decision policy so B does not duplicate it.
5. When C is ready, retrieve bounded learning context at session start and pass it as quoted factual context, not instructions. In the server analysis path, construct only eligible `LearningEventInput` values and call C's writer; no browser-supplied analysis is accepted as proof. Apply the central historical-step rule for a result superseded during processing. Do not claim self-correction or hint-assisted correction without trustworthy prior/hint evidence.

**A2 acceptance/tests:** the completed incorrect step `2x + 3 = 14` produces a guiding question only when verified and intervention is allowed; `2x + 6 = 14` is recognized as a valid expansion. Ambiguous handwriting and unsupported transformations remain uncertain. Unit-test structured examples, low confidence, stale/reordered results, old sessions, edits during speech scheduling, duplicate requests/hints, and cooldown with fake timers. Test persistence eligibility independently from model confidence. Manually exercise B's real capture and C's cross-session memory after integration. Service failures show retry state without recording an invented observation.

## Handoff and non-goals

Give B the voice adapter/state subscription and analysis/controller interfaces; give C the server-created event payload and requested context shape. Dependencies are explicit in the central guide: A1 can begin alone, deployed voice waits for C, and A2 end-to-end waits for B and C. No full curriculum, custom speech stack, generic event bus, multi-agent framework, database ownership, memory UI, or guaranteed mastery judgments.

Official implementation reference: [OpenAI Realtime WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc). Recheck provider details at implementation time; this spec defines Newton's interface, not a frozen provider SDK API.
