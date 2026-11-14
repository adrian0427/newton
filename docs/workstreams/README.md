# Newton implementation workstreams

Start here, then read your assigned specification. This guide formalizes the existing architecture; every module and endpoint below is **planned**, unless already present in the repository. A1 voice implementation and local verification instructions are in [the voice handoff](../ai-voice.md); later features remain planned.

## Assignments and ownership

| Owner / specification | Branch | Exclusive implementation ownership | Initial milestone is done when |
| --- | --- | --- | --- |
| [A — AI & tutoring](A01-ai-tutoring.md) | `feat/ai-tutoring` | `src/lib/ai/**`, `src/lib/math/**`, `src/lib/learning/observations.ts`; `/api/realtime/token`, `/api/work/analyze` | Real voice starts, converses, interrupts, stops, cleans up, and handles errors; deployed credential issuance fails closed without verified auth |
| [B — Student workspace](B01-student-workspace.md) | `feat/student-workspace` | `/study` page, `src/components/{whiteboard,tutor,learning}/**` | Drawing, erasing, structured input, revision-safe export, clear/edit, and honest unavailable tutor/history states work |
| [C — Backend & memory](C01-backend-memory.md) | `feat/backend-memory` | `src/lib/supabase/**`, `src/lib/learning/{sessions,events,context}.ts`, `supabase/migrations/**`; `/auth/**`, `/api/study-sessions`, `/api/learning-context`; `src/components/auth/**` | Sign-in, session creation, evidence persistence, cross-session retrieval, and anonymous/two-account isolation checks pass |

A owns voice state and microphone resources; B renders controls and subscribes to A's interface. C owns authenticated study-session records; B owns transient workspace state. A determines whether observations are justified; C validates and stores them. B displays C's history, without independently summarizing mastery. C owns auth screens; B owns the study screen. There is no public learning-event write endpoint in the first integration.

Directories named above may not exist yet. Create only the modules needed for the current milestone. Existing shared contracts live in [`src/types/tutoring.ts`](../../src/types/tutoring.ts).

## Shared changes and PR strategy

- One author per change to `package.json` and `package-lock.json`, root layout/global CSS, project configuration, shared types, and architecture docs. Request affected owners' review before merging; consumers use the merged definitions rather than copy them.
- Add dependencies only in the owning feature PR. Do not independently regenerate or hand-merge the lockfile; resolve dependency intent, then regenerate with npm.
- The interface shapes below are **implementation proposals for the first contract PR**, not new exports already available. A authors voice/analysis/controller types; C authors auth/session/memory types. Publish shared additions in a small coordinated `src/types/integrations.ts` PR reviewed by all three; import existing tutoring types. No breaking changes to `tutoring.ts` are needed to start.
- Deliver small PRs: interface definitions, isolated milestone, then integration. Keep `main` credential-free for the homepage/default tests. Use the PR template, passing checks, and at least one reviewer; affected owners review boundary changes. Update from `main` after each merge. No force pushes.

## Integration contracts

Existing types are `WorkSnapshot`, `WorkAnalysis`, `LearningEventInput`, and `TutorMode`. These remain the source of truth. Proposed names below supplement them; do not redefine their fields or enum values.

| Boundary | Producer → consumer; owner | Input → output | Error behavior |
| --- | --- | --- | --- |
| Work → analysis | B → A; B captures, A owns handler | `POST /api/work/analyze` with `{ sessionId, snapshot: WorkSnapshot }` → `{ analysis: WorkAnalysis }` | Reject empty/oversized/invalid input; return service errors separately from mathematical uncertainty; B discards stale revisions |
| Analysis → controller | A analysis → A controller | `WorkAnalysis` plus `{ sessionId, currentRevisionId, mode: TutorMode, isEditing, voiceState, now }` → `InterventionDecision` | Stale, busy, cooldown, or unsupported input yields `wait`; no speech as a side effect of analysis |
| Controller → voice | A controller → A voice adapter; B supplies activity and mode | `InterventionDecision` → `deliver(decision): Promise<void>` | Recheck session/revision immediately before delivery; cancel outdated hints; connection failure becomes visible state, never a queued hint on a later revision |
| Outcome → memory write | A verified observation → C server-only writer | `recordLearningEvent(auth, event: LearningEventInput)` → `LearningEventRecord` | Invalid evidence rejected; foreign session denied; identical retry returns same record; conflicting retry returns conflict |
| Memory → future tutoring/history | C → A and B | `getLearningContext(auth, conceptId)` / `GET /api/learning-context?conceptId=...` → `LearningContext` | Empty history is success with `events: []`; auth/service failure is distinct; A can continue without personalization if retrieval fails |
| Identity → protected operations | C → A/C handlers | `requireUser()` → server-only `AuthContext`; `requireOwnedSession(auth, sessionId)` → `StudySession` | Unauthenticated 401; foreign/missing session 404; unavailable configuration 503; never trust posted user IDs |

`auth` is created inside each server request by C's helper, never deserialized from the browser or exposed in client types. A remains responsible for calling the helper in its handlers; C does not edit A's route files.

### Proposed additional shapes

Agree and encode these in the contract PR before connecting consumers. Tests may use matching fixtures in the meantime; fixtures are never presented as working features.

| Name/interface | Shape and semantics | Author |
| --- | --- | --- |
| `VoiceState` | `unavailable`, `idle`, `connecting`, `listening`, `speaking`, `interrupted`, `stopping`, `error` | A |
| `VoiceSession` | `start({ sessionId }): Promise<void>`, idempotent `stop(): Promise<void>`, `interrupt(): void`, `getState(): VoiceState`, `subscribe(listener): () => void`, `deliver(decision): Promise<void>`; A1 subscribers are notified to read `getSnapshot()`; `deliver` remains an A2 proposal | A |
| `InterventionDecision` | Union: `{ kind: "wait", reason }` or `{ kind: "speak", sessionId, sourceRevisionId, action: Exclude<WorkAnalysis["suggestedAction"], "wait">, prompt, hintId }`; hints remain untrusted context, never privileged instructions | A |
| `TutorController` | Construct with B's `capture(): Promise<WorkSnapshot>`, an analysis client, the voice adapter, and `getCurrentWork(): { sessionId, revisionId }`. Expose `updateContext({ sessionId, currentRevisionId, mode, isEditing, voiceState })`, `requestHelp(): Promise<void>`, and `dispose(): void`; A owns timers/cancellation, B calls these on state changes/unmount | A |
| `StudySession` | `{ id, startedAt, endedAt: string \| null }`; times are ISO UTC, no browser-controlled owner | C |
| `LearningEventRecord` | `LearningEventInput & { id: string; createdAt: string }`; no owner in browser response | C |
| `LearningContext` | `{ conceptId: string; events: LearningEventRecord[]; summary: string }`; bounded factual summary, empty string for no events | C |
| `ApiError` | `{ error: { code, message, retryable } }`; no stack trace, provider response, key, or student content | C, reviewed by A/B |

Common HTTP rules: 400 invalid input; 401 missing/expired auth; 404 missing or foreign session; 409 conflicting retry; 413 oversized snapshot; 429 rate limit; 502 upstream failure; 503 unavailable configuration. Use `Cache-Control: no-store` on credentials and personalized responses. Browser POSTs use same-origin cookie authentication and reject cross-origin requests. Cancellation is local control flow, not a mathematical result. Catch errors and let the student explicitly retry; do not repeatedly mint credentials automatically.

The voice adapter also receives the same `getCurrentWork` callback when constructed, so it can reject a stale decision at delivery time. Until an authenticated session exists, B does not construct the connected controller. A's local test harness uses test context only, never a fabricated authenticated app session.

## Initial integration decisions

1. **Revision identity:** B assigns a new random UUID for every content edit, erase, undo/redo, clear, and structured-input change. Selection, pan, and zoom alone do not create revisions. Pair revision with study-session ID; reject responses from a prior session. Export against a frozen revision, discard if content changes during export, and check freshness again before render/speech. Timestamps never decide freshness.
2. **Snapshot scope:** start with transient PNG data URLs (maximum decoded image 2 MiB), or a trimmed expression (maximum 500 characters). At least one is required. The shared type permits temporary URLs, but A rejects them in this first iteration to avoid arbitrary server fetches. B lets students choose structured input or whiteboard capture; do not send two disagreeing representations as if equivalent. Fixed first problem: `2(x + 3) = 14`.
3. **Timing:** default `student-requested`. In opt-in proactive mode, wait 1,500 ms after the last content edit, no active stroke, and no student/tutor speech; at most one analysis per revision. Use a 10-second spoken-hint cooldown and one hint per `(sessionId, revisionId, action)`. Explicit help bypasses pause/cooldown, not freshness, uncertainty, or duplicate in-flight requests. New edits cancel pending speech. These are tunable demo defaults.
4. **Credentials:** A1 now uses Deepgram Voice Agent because OpenAI credits are unavailable. Managed `gpt-4o-mini` is selected without a BYO endpoint. The local-only harness may request 30-second Deepgram JWTs using a per-run capability, same-origin/loopback checks, and a five-attempt/ten-minute process limit. Deployed production/preview issuance remains closed until C's verified auth, owned-session checks, and deployment-wide abuse controls land. This approved change replaces the earlier Node-only/pasted OpenAI credential flow. Do not expose the harness with public tunnels. Managed OpenAI use does not automatically establish hackathon-track eligibility.
5. **Uncertainty:** low/unknown confidence, ambiguous handwriting, or unsupported math returns the existing uncertain variant. Ask for confirmation/structured input; never assign a misconception. Provider/network errors are service errors, not uncertain math. Proactive corrective hints require high confidence; medium confidence waits for student help and is not persisted as a confirmed misconception.
6. **Evidence:** A creates an event only from a server-validated snapshot, supported math checks, and high-confidence interpretation (or unambiguous structured input). Evidence describes the actual step. `self-corrected` and `corrected-with-guidance` require trustworthy earlier-step and delivered-hint evidence; until available, persist only `practiced` or `misconception-observed`. Never infer correction from two unordered client claims. A calls C's writer on the server; the browser cannot submit an analysis result for acceptance as verified evidence.
7. **Freshness versus history:** obsolete results never trigger current UI/hints. A verified submitted step may be recorded as historical practice even if a later edit races with server completion; its revision remains explicit and no claim about the latest work is made. Do not wait for an unverifiable browser assertion to establish mathematical truth. This clarifies the earlier blanket freshness rule for persistence.
8. **Deduplication:** C enforces a database uniqueness key `(user_id, session_id, source_revision_id, concept, outcome)`. Compare payload on conflict: identical returns the original event; changed evidence/misconception returns 409. Another outcome for the same revision is allowed. A reuses the same revision/outcome on retry. C never silently overwrites evidence.
9. **Independent development:** B needs no credentials; A uses mocked transports for automated tests and Deepgram only for explicit local manual voice tests; C uses a disposable Supabase project/local instance and two adult test accounts, with no OpenAI dependency. Missing services render unavailable states. C can test persistence with explicit synthetic observations in test code, not fake student history in the app.

## Dependencies and integration order

1. Review this guide and merge additive shared interface definitions. Each developer can start their isolated modules and tests immediately from the existing scaffold.
2. Build A's voice adapter, B's workspace/export, and C's auth/session/memory modules independently. B's unavailable UI must not depend on A/C shipping first.
3. Merge C's auth helpers/session creation. A wires its protected token route; B creates a study session after sign-in and connects A's real voice controls. Changing user or signing out stops voice and clears user-specific UI.
4. Connect B's snapshots to A's analysis/controller; verify late-result and uncertainty behavior before enabling proactive mode. Analysis needs auth/session support in deployed environments.
5. Connect A's eligible server observations to C's writer, C's context to A's tutoring instructions, and C's history to B's display. Complete the product's two-session scenario and two-account isolation tests.

Every milestone requires its specification's acceptance checks, relevant automated tests, lint, typecheck, and an appropriate production build. Include real-service manual results or explicitly mark that part incomplete; mocked tests alone do not complete A's real voice or C's real persistence milestones.

## Open product questions and limits

No open question prevents isolated implementation. Before use with real students, decide retention/deletion UX, consent and deployment policies, and whether memory needs tamper-resistant provenance beyond user-owned RLS records. The hackathon uses synthetic/adult test data and deletes it after the demonstration. Client-writable self-owned rows are not proof of AI verification; retrieved memory is advisory context, never authority. A selects a supported voice settings and a later vision model during its first PR and records the choice; pause/cooldown values are evaluated in the demo. These choices do not require a new framework.

## Start implementation

Once the foundation and these specifications are available on `main`, each developer runs:

```sh
git clone https://github.com/adrian0427/newton.git
cd newton
nvm use
npm ci
git switch main
git pull --ff-only
# Choose exactly one:
git switch -c feat/ai-tutoring
# git switch -c feat/student-workspace
# git switch -c feat/backend-memory
npm run dev
```

For an existing checkout, update a clean `main` and create your assigned branch (or switch to it if it already exists); do not reset existing work. Read `AGENTS.md`, the [architecture](../architecture.md), [shared contracts](../../src/types/tutoring.ts), and your linked specification. Begin its first numbered implementation task. Do not create commits or push through an agent without explicit authorization.
