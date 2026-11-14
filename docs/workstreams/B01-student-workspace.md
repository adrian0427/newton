# B01 — Student workspace

**Owner:** Developer B · **Branch:** `feat/student-workspace`

Read the [central contracts and decisions](README.md), [architecture](../architecture.md), and [existing tutoring types](../../src/types/tutoring.ts). Preserve the credential-free homepage. No fake working voice, analysis, authentication, or saved history.

## Files and component interfaces

Planned files below are B-owned; create only what the milestone needs. Callback/type names are proposals for the coordinated contract PR, not existing exports.

| File | Props/callbacks and responsibility |
| --- | --- |
| `src/app/study/page.tsx` | Study entry point; composes the client workspace. Coordinate root layout/global CSS edits. C owns `/auth/**`, not this page. |
| `src/components/whiteboard/StudentWorkspace.tsx` | Own transient canvas/input/current revision; integrate session, voice, analysis, and history state when available |
| `src/components/whiteboard/Whiteboard.tsx` | `revisionId`, `onContentChange()`, `onActivityChange(isEditing)`; workspace assigns revisions in response to content changes. Expose `capture(): Promise<WorkSnapshot>` and `clear(): void` through a small ref interface; handle Excalidraw loading |
| `src/components/whiteboard/MathInput.tsx` | `value`, `onChange(expression)` using normalized plain mathematical text, not uncontrolled raw LaTeX; MathLive adapter owns serialization |
| `src/components/tutor/TutorControls.tsx` | `state: VoiceState`, `mode: TutorMode`, `onStart`, `onStop`, `onInterrupt`, `onRequestHelp`, `onModeChange`, optional readable error; display and callbacks only |
| `src/components/learning/LearningHistory.tsx` | `context: LearningContext \| null`, `status: "unavailable" \| "loading" \| "ready" \| "error"`, `onRetry`; distinguish unavailable, empty, and failed history |

Use `tests/workspace/` for capture/state tests. A owns SDK connections and intervention scheduling. C owns sign-in components, authenticated session APIs, memory queries, and authorization. Do not create duplicate DTOs or a second voice state machine in UI code.

The Deepgram pivot does not expand B1. B does not implement Deepgram networking, credential fetching, microphone lifecycle, or provider-specific imports throughout the UI; consume A's small provider-independent adapter. Whiteboard PNG and structured-expression exports remain `WorkSnapshot` data for a separately selected analysis provider.

## First integration status

The [structured-work slice](../study-tutoring.md) now connects normalized MathLive work/revisions to exact local linear-expansion checks and targeted guidance. The real workspace uses A01's single voice session on the guarded `/dev/study` entry point, with additive bounded `sendText` context through the actual SDK. Public `/study` receives no development capability. C's auth/session APIs, server analysis, image recognition and learning memory remain absent; no local check authorizes persistence. Full milestone requirements below remain broader than this slice.

## Milestone B1: useful workspace without services

1. Build `/study` with a clear Algebra I prompt (`2(x + 3) = 14`), working area, structured input fallback, and honest unavailable tutor/history panels. Enable homepage navigation only when the study page works. Keep keyboard labels, visible focus, status announcements, and mobile layout usable.
2. Add Excalidraw as a client-only boundary and implement drawing, erasing, undo/redo, and clear. Own a single revision source at workspace level; new UUID for any content/input change, including undo and clear. Excalidraw selection or viewport changes do not count as work edits.
3. Add MathLive and expose normalized plain-text expressions for A's parser. Document a verified example such as `2*(x+3)=14` in an integration fixture. If MathLive cannot serialize a supported expression, report input error rather than silently changing its meaning. Coordinate supported syntax with A's verifier tests.
4. Implement capture for the student's selected source (whiteboard or structured expression). For image capture, freeze work/revision, export only the work region as PNG, enforce the 2 MiB decoded limit, and reject the result if editing continued during async export. Return `WorkSnapshot` with `capturedAt` ISO UTC. Structured capture returns the same revision contract with a trimmed expression, capped at 500 characters. Empty work is not submitted.
5. Let the developer capture/export a snapshot locally with visible success/error feedback. Any downloadable snapshot is explicit and may contain work; do not upload, autosave, log, or persist it by default. Revoke object URLs on replacement/unmount. Clear resets content, invalidates pending exports/analysis, and does not erase persistent history.

**B1 acceptance:** `/study` works without voice-provider or Supabase credentials; draw/erase/input/export/clear all work. Exports identify exactly the content captured. Edit-during-export cannot publish a mismatched snapshot. Tutor controls say unavailable and cannot open a microphone; history says not connected, not a fabricated empty personal history. The fixed exercise and work area remain usable at 360px width and on desktop; controls are keyboard accessible and named.

**Tests:** automate revision changes versus viewport-only changes, empty/oversized input rejection, concurrent export/edit/clear, normalized expression serialization, and object-URL cleanup. Test disabled/loading/error/empty states with fixtures only in tests. Manually draw and erase, use MathLive, export and inspect a real PNG/snapshot, exercise undo/clear during export, and check mobile layout and keyboard navigation.

## Milestone B2: connect real services

1. After C's auth UI is available, link to sign-in and create a study session via `POST /api/study-sessions` (empty body → `StudySession`). No session or user ID is fabricated. Signed-out users may use a local board; protected features remain unavailable. On identity/session change, stop voice, cancel in-flight work, invalidate the request generation, and clear previous-user history. Offer to clear local work before another user starts.
2. Subscribe to A's `VoiceSession`; wire start/stop and optional explicit interruption controls to its methods. Natural speech interruption is handled inside A's underlying voice implementation, not a second UI speech detector. Stop/unsubscribe on unmount/sign-out. Render connection status, listening, speaking, interrupted, stopping, unavailable, and error states from A's adapter. Disable repeated start while connecting; distinguish microphone permission denial from service unavailability.
3. Send snapshots to A only with the authenticated session. Supply current revision, editing activity, mode, and explicit help requests to A's controller. B does not implement a second pause timer or cooldown policy. Abort obsolete requests and also compare session/revision when responses arrive. A stale response must never change visible advice.
4. Retrieve C's `LearningContext`, render factual evidence and dates, and distinguish empty results from errors. Refresh after successful analysis/persistence or an explicit retry; never optimistically claim an event was saved. A failed memory lookup must not wipe the student's work or prevent manual study.

**B2 acceptance/tests:** genuine voice state drives controls, new edits reject delayed analysis, switching accounts never shows prior history, and C's empty/error/auth-expired states have distinct recovery UI. Manually run the two-session product scenario with A/C. Automated tests mock the documented interfaces without presenting mocks in the deployed app.

## Dependencies and non-goals

B1 requires no other developer or external service. B2 requires A's voice/analysis interfaces and C's auth/session/context interfaces; consume the shared additions only after review/merge. No SDK credential issuance, math correctness logic, intervention policy, Supabase policies, server memory summary, tutor avatar, or simulated AI experience.
