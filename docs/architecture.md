# Newton architecture

## Status and boundaries

This checkout implements the homepage, B1's local `/study` workspace, A1's Deepgram voice adapter and guarded local harness, the first structured-work tutoring slice, shared TypeScript contracts, developer tooling, Supabase client helpers, and Google OAuth authentication. `/auth/sign-in` calls `/auth/session` for Google OAuth start, verified current identity, and local sign-out. `/auth/callback` exchanges the PKCE code using the fixed `NEWTON_SITE_URL` origin. Auth checks and cookie refresh occur in writable Route Handlers; authenticated Server Component rendering and its refresh proxy are not implemented. C1's server-only helpers, session/event persistence, bounded context retrieval, migrations, and local PostgreSQL policy tests are implemented. Both migrations are applied to hosted `newton-dev`; SQL-role, anonymous API, and real signed-in two-account HTTP/helper/direct-client acceptance passed on 2026-11-14. The developer confirmed browser recognition and audible voice playback before this merge; the latest stability changes still need manual acoustic acceptance.

A1 and B1 are connected through the first structured-work slice; C1 now supplies authenticated study-session identity to the local workspace voice path; learning-memory integration remains pending. `/study` and the generated `/dev/study` page render the same `StudyShell` and `StudentWorkspace`. On both, `WorkspaceTutor` runs a deterministic exact-rational distributive-expansion check of explicitly submitted structured input or student-confirmed handwriting in the browser. Only `/dev/study` receives the per-run local capability. In local development, signed-in `/study` users can explicitly create an owned session and start voice with its real UUID through the ordinary credential provider. Production `/study` keeps voice disabled. The token handler remains local-development-only. Requests without a harness capability now call C's verified-user and owned-session helpers before issuance. The isolated capability harness retains its existing development-only behavior. `/dev/study` starts voice with a fixed local test session ID, not a C-owned study session. The signed-in workspace creates study sessions and clears account-specific in-memory work after successful logout, retaining only its scoped device-local saved source work. Tutoring does not yet write or retrieve learning events. Authenticated deployed voice, general server work analysis, proactive intervention, and tutoring use of persistent memory remain planned. The diagram below describes the target end-to-end design, not a completed integration. See [the implemented slice, bounds and demo](study-tutoring.md). Keep one Next.js application; add dependencies only with the feature that uses them.

The [workstream guide](workstreams/README.md) defines the implementation assignments, concrete boundary proposals, and initial timing/deduplication decisions. Its A01/B01/C01 specifications are the starting points for feature work; additional interface names there are proposals unless explicitly implemented below. `AuthContext` and `StudySession` are local module exports pending the coordinated shared-contract PR.

```mermaid
flowchart TD
  Work[Student work: Excalidraw or MathLive] --> Snapshot[Versioned transient snapshot]
  Snapshot --> Interpret[Server: handwriting transcription, student-confirmed]
  Interpret --> Verify[CortexJS: supported math verification]
  Verify --> Decide[Intervention decision + revision check]
  Decide --> Response[Socratic tutoring response]
  Response --> Observation[Evidence-backed learning event]
  Observation --> DB[(Supabase PostgreSQL + RLS)]
  DB --> Retrieve[Server: scoped cross-session retrieval]
  Retrieve --> Response
  Student[Student browser] <--> Voice[Newton voice adapter]
  Voice <--> SDK[Deepgram Browser Agent SDK]
  SDK <--> Agent[Deepgram Voice Agent]
  Agent <--> LLM[Managed language model]
  Response --> Voice
  Auth[Supabase Auth] --> Routes[Authenticated Next.js route handlers]
  Routes --> Interpret
  Routes --> DB
  Routes --> Credential[Server: Deepgram auth/grant]
  Credential --> Token[Short-lived browser token]
  Token --> SDK
```

Voice conversation and mathematical analysis are separate responsibilities. Voice transport does not establish mathematical correctness. A suggested action does not authorize an immediate spoken interruption or a database write.

## Frontend

App Router pages and layout remain Server Components by default. Developer B adds client components at browser-dependent boundaries: Excalidraw, MathLive, audio controls, and workspace state. Load drawing/math libraries on the client as their SSR support requires. Keep loading, empty, permission-denied, retry, and disconnected states visible.

Excalidraw owns freehand work; MathLive provides structured input when recognition is unreliable. Capture only the work region after a pause or explicit request, not continuous screenshots. Each edit, undo, and structured-input change gets a new `revisionId`; snapshot export must preserve the revision of the content actually exported. Reject an export if editing continued during capture. `capturedAt` is informational, not a distributed ordering mechanism.

Analysis images are transient data URLs or short-lived references. Source worksheets and editable drawing scenes separately autosave to account-scoped device-local IndexedDB; analysis exports and recognition output do not. Do not put them in learning events, analytics, logs, or durable storage by default. Future handlers enforce content type, payload size, and allowed reference origins; never fetch arbitrary client URLs. Empty snapshots should be rejected before analysis.

### Implemented local workspace (B1)

`/study` mounts `StudentWorkspace`, with a client-only Excalidraw boundary and a dynamically imported MathLive field. B owns one `WorkRevision` clock. Excalidraw's live element IDs, versions, and version nonces identify content changes; selection and viewport state are excluded. Structured edits share the same clock. An export clones the scene and files before asynchronous PNG generation, checks the clock after image encoding, and checks the revision before publishing. Clear, source changes, replacement captures, and unmount invalidate pending work. Clear does not erase persistent history.

Capture exports exactly one selected representation. PNGs cover drawing bounds with padding, exclude exercise/tutor UI, are bounded to 2048 pixels and 2 MiB, and do not embed the editable scene. Structured expressions are trimmed and limited to 500 characters. The supported notation fixture is `2(x+3)=14` from MathLive ASCIIMath, transported as `2*(x+3)=14`. The normalizer accepts only the initial Algebra I notation and rejects unsupported/incomplete syntax without asserting correctness. The local verifier now consumes these normalized fixtures for the bounded linear-expansion slice; server analysis remains future work.

Drawings, worksheets, structured input, source and split width autosave to device-local IndexedDB and restore on reload. Verified account email scopes the records; legacy unscoped records remain guest work. Drawing restoration uses Excalidraw initialData, with debounced saves and board deletion on clear. Transcriptions, checks, hints and snapshot downloads remain transient. Object URLs are revoked on replacement, edits, source changes, clear and unmount. Newton stays behind a small side launcher. Its panel checks structured or explicitly confirmed handwritten work locally. Signed-in local `/study` voice uses an owned session UUID; production/preview voice is disabled. The separate guarded harness retains its capability/demo ID. No learning-history panel or automatic microphone activation is added. Local fonts are copied from installed packages by `scripts/prepare-workspace-assets.mjs` before development/build, with generated assets ignored by Git.

Run `npm run test:e2e` after `npx playwright install chromium` for the credential-free browser checks at desktop and 360px widths. Unit tests cover revision invalidation, concurrent capture, payload limits, notation normalization, and download cleanup.

### Worksheet reference and workspace layout

The study page fills the viewport. Desktop uses a keyboard/pointer-resizable split between the worksheet reference and whiteboard; mobile switches panes without destroying their contents. The tutor opens from a compact side launcher with Escape/close focus restoration. Audio controls use A's existing adapter on the guarded `/dev/study` entry point. Signed-in local `/study` can activate voice after explicit owned-session creation and microphone opt-in; it receives no diagnostic capability. Production/preview voice remains disabled.

`WorksheetPane` accepts one local PDF, PNG, JPEG, or WebP at a time through a file picker, file drop, or screenshot paste. Text paste inside drawing/math editors stays with those editors. Browser files are limited to 20 MiB and validated by signature; image decoding rejects damaged files and images above 32 megapixels. Blob URLs are revoked on replacement, removal, and unmount. A failed replacement preserves the previous worksheet. Request generations discard late file reads. Removing/replacing the reference invalidates pending work captures without clearing the board.

PDF.js is loaded only for PDFs and renders individual pages locally with cancellable render tasks, page navigation, zoom, and an extracted-text reading option. Its worker, fonts, CMaps, and WASM are served locally from generated package assets. There is no remote URL import, document scripting or automatic upload. Validated worksheet files are stored locally in the same account scope. The sample equation and worksheet/whiteboard title bars have been removed to prioritize working space.

Worksheet files are reference material, separate from `WorkSnapshot`, which continues to capture only the student's selected work source. The student selects the active problem explicitly in the tutor panel; worksheet pixels are not interpreted or shared automatically. The user-requested interaction supersedes B1's original permanent tutor/history sidebar layout while preserving capture behavior.

### Paper appearance

Paper Light and graphite Paper Dark share semantic CSS colors across the homepage, workspace, worksheet viewer, tutor controls, and math/drawing tools. Appearance offers Light (default), Dark, and System, plus a screen-only comfort preview for worksheet pixels in dark mode. Excalidraw uses its native theme with Paper toolbar tokens; theme changes do not alter scene elements, revisions, or the white-background capture representation.

Appearance uses `newton-appearance`; account-scoped worksheets and work use IndexedDB. Transcription drafts and tutoring feedback remain transient. A bootstrap script applies the stored theme before hydration, and a subscribed store follows OS changes in System mode and cross-tab preference changes. Blocked storage falls back to a tab-local preference. PDF/image comfort filtering is presentation-only and never changes original files, mathematical content, or exports.

### Compact drawing and focus mode

The default board shows selection, pen, and eraser tools, native undo/redo, and a small zoom control. Pen settings open a compact color/width popover for subsequent strokes. More tools reveals the native advanced tools and editing controls. Focus mode hides the reference and secondary controls without unmounting either pane, preserving work and revision identity. Exit focus or Escape restores the split view. Worksheet replacement controls appear only when a file is loaded; redundant pane labels and the header's local-workspace status are removed.

## Server and AI boundaries

Developer A owns the existing local-only `/api/realtime/token` handler and proposed `/api/work/analyze` handler in `src/app/api/`, plus `src/lib/ai/` and `src/lib/math/`. Developer C owns auth (`/auth/session`), `/api/study-sessions`, and `/api/learning-context`. The workstream guide specifies request/response and error proposals for the first coordinated contract PR. Implemented on this branch: A's local-development token endpoint, C's `/auth/session`, `POST /api/study-sessions`, and `GET /api/learning-context`. `/api/work/analyze` remains proposed. Local authenticated voice uses C's identity/ownership checks; deployed voice remains disabled. `/api/work/transcribe` implements authenticated transient transcription, not server-authorized grading or memory writes. Event writes initially use C's server-only function called by A, not a public event-write route.

Future protected handlers must verify the Supabase session, validate request bodies at runtime, check session ownership, and return bounded errors. TypeScript types are not runtime validation. Keep permanent provider credentials server-side, limit request frequency and payload size, and avoid logging student content. Configure clients lazily within the integration so the homepage and CI do not require secrets.

### Managed voice (Developer A)

The selected path is **Student browser → Newton voice adapter → Deepgram Browser Agent SDK → Deepgram Voice Agent → managed language model**. Deepgram supplies streaming speech input, voice-agent orchestration, conversational turns, speech synthesis, and interruption handling. A owns the SDK connection, microphone capture, playback, and event wiring behind the adapter; B's future integration will consume its methods and state. A1 uses the official core `@deepgram/agents` SDK behind the reusable boundary; the core SDK uses WebSockets. Follow the current [Browser Agent overview](https://developers.deepgram.com/docs/browser-agent-overview) and [JavaScript SDK guide](https://developers.deepgram.com/docs/browser-agent-javascript), not OpenAI-specific session methods.

We intend to fund voice with Deepgram trial credits because the available ChatGPT/Codex credits do not include OpenAI API access. Start with Deepgram-managed `open_ai` / `gpt-4o-mini`, currently listed in the Standard tier, subject to current availability, pricing, and account credits. Omit a custom `think.endpoint`; this is managed inference with no bring-your-own OpenAI endpoint or `OPENAI_API_KEY`. See [Deepgram's managed LLM models](https://developers.deepgram.com/docs/voice-agent-llm-models). This choice does not automatically qualify Newton for the OpenAI hackathon track; eligibility awaits the organizers.

A keeps the existing `/api/realtime/token` route name; its implementation is Deepgram-specific, not an OpenAI Realtime endpoint. The server uses `DEEPGRAM_API_KEY` with **Member-level permissions or higher** to call `POST https://api.deepgram.com/v1/auth/grant`. Return only the temporary token and normalized expiry with `Cache-Control: no-store`; never return the permanent key. Deepgram documents a default 30-second token TTL and bearer authentication for the browser. The token must be valid when connecting; expiry does not terminate an established connection or cap its cost. See [token-based authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication).

C's reusable authenticated-user and owned-session checks (`requireUser()` and `requireOwnedSession()`) are implemented and called by the token handler for ordinary local requests without a harness capability; deployed issuance remains disabled. Require same-origin requests, rate limits, and deployment-wide abuse protection before enabling billable deployed issuance. Until then, production and preview routes fail closed without provider calls, including for unauthenticated requests. Both the authenticated path and the isolated capability harness are loopback-development-only and inaccessible in production/preview. See [A1 and the existing implementation audit](workstreams/A01-ai-tutoring.md#existing-implementation-and-migration-follow-up). C must not create a second token endpoint.

Start only following explicit student input and microphone permission. Represent connecting, listening, speaking, interrupted, stopped, and failed states through the adapter. On stop, navigation, failure, or retry, release media tracks, playback/audio contexts, SDK connections, timers, and listeners. Wire user-speech interruption to immediate playback cancellation; allow the conversation to continue and prevent multiple concurrent sessions. Do not persist raw audio or full transcripts by default. A's later intervention controller passes verified analysis into the adapter only after checking the current revision; C's bounded evidence context can seed future tutoring sessions as quoted facts, never trusted instructions. These are separate integrations, not vision or persistent memory provided by the voice agent.

#### Existing A1 implementation

A1, through `4513f07`, uses `@deepgram/agents` with Nova-3 input (linear16, 16 kHz), managed `gpt-4o-mini`, and `aura-2-thalia-en` output (linear16, 24 kHz). Browser recognition and audible playback were developer-confirmed before this merge; mock validation does not establish acoustic stability. Current account credits and service availability must still be checked for live use. The `realtime-*` module names and `/api/realtime/token` path are historical names; they do not indicate an OpenAI Realtime connection.

`npm run voice:dev` binds loopback and generates ignored `/dev/voice` and `/dev/study` pages plus a random per-run server capability. The token handler requires exact same-origin POST, loopback Host, bounded JSON, and the existing local five-attempt/ten-minute limit. It accepts either the valid generated harness capability or verified login plus an owned study-session UUID. An invalid supplied capability cannot fall back to login. Production, previews and CI fail closed before provider calls. This process-local limit is a development aid, not deployed abuse protection. Do not expose the harness through public tunnels.

The SDK wrapper waits for settings acknowledgement before opening the microphone, handles user-speech playback interruption, and releases late permission results and other resources on stop. Automatic reconnect is disabled. Manual interruption silences/drops the current playback turn; it does not promise cancellation of remote LLM/TTS generation. The application clears transient conversation history on cleanup and does not persist audio/transcripts; provider-side retention follows Deepgram project settings/policies. See [setup and handoff](ai-voice.md).

The provider-independent `VoiceSession` in `src/lib/ai/voice-session.ts` exposes `start({ sessionId }): Promise<void>`, `stop(): Promise<void>`, `interrupt(): void`, `getState()`, `getSnapshot()`, and `subscribe(listener: () => void): () => void`. Subscriptions notify consumers to read the stable state/error snapshot. `WorkspaceTutor` now wires the existing controls to that interface on the guarded development entry point. The additive `sendText(message): boolean` delegates bounded explicit hint context to the active connection's documented SDK text injection, with no new session. Public voice still needs C's real owned study-session ID and auth guards; deployed identity changes must stop/unsubscribe before integration. The harness's local test ID/capability must not become workspace authorization.

The adapter coalesces repeated starts, preserves interrupted-response suppression, waits for browser playback drain independently of server `agent-audio-done`, blocks duplicate diagnostic injection, and ignores closed-session callbacks. Development counters and a bounded sanitized event trace distinguish speech/manual interruption, server audio completion, playback completion, and disconnects. Explicit diagnostic microphone mute isolates possible speaker feedback; capture is never automatically muted during playback. These fixes do not establish the cause of live acoustic cutoffs; see [the voice investigation and manual checks](ai-voice.md#turn-taking-stability-investigation).

Voice tutoring can discuss broad high-school and introductory college mathematics. The distributive-property restriction applies to future automated work analysis/intervention, not conversational topics. General conversation is not verified work, whiteboard vision, or persisted learning history. Explicit structured-check context is supplied in initial voice settings and synchronized silently through `updateContext` (Deepgram `UpdateThink` plus acknowledgement); `sendText` triggers an explicit button hint; general analysis/intervention delivery and bounded persisted learning context remain future work. Local client results never authorize persistence.

### Interpretation and verification (Developer A)

Interpret the current work separately using a vision-capable model. Handwriting **transcription** now uses a free-tier Groq Qwen or Gemma 4 adapter whose output the student confirms (see [the implemented transcription](#implemented-handwriting-transcription-developer-a-integrated-with-b)); a provider for broader automated work analysis remains undecided because we have no funded OpenAI vision API access. Deepgram Voice Agent is the voice pipeline, not a whiteboard vision service; structured-input parsing and independent verification can proceed without one. Keep recognized expression, confidence, and source revision together. Structured input can remove handwriting ambiguity but does not prove correctness. CortexJS checks only supported transformations; an equivalent expression alone does not establish that a particular misconception occurred. Recognition ambiguity, parse failures, unsupported transformations, and conflicting evidence produce `correctness: "uncertain"`, not an incorrect label.

### Intervention controller (Developer A, integrated with B)

Use a small controller, not an orchestration framework. Analyze after a configurable pause or explicit help request. Gate proactive speech on mode, current revision, confidence, student activity, voice state, and cooldown. Student-requested mode does not initiate unsolicited hints. If a new edit arrives, cancel pending work where possible and discard late UI/speech results even if cancellation fails. Recheck freshness before displaying or speaking a response. A verified submitted step may persist as historical practice under its original revision even if a later edit races with server completion; never imply it describes the latest work or establishes a correction. The workstream guide supplies tunable initial pause/cooldown values and duplicate-hint rules.

## Shared contracts

`src/types/tutoring.ts` is coordinated by all three developers:

- `WorkSnapshot`: revision, capture time, optional structured expression and transient image. The caller supplies at least one content representation; future runtime validation enforces that rule.
- `WorkAnalysis`: same source revision, recognized expression, concept, correctness, confidence, and suggested action. Its uncertain variant cannot confirm a misconception or request a corrective hint.
- `TutorMode`: `student-requested` or `proactive`.
- `LearningEventInput`: session, source revision, concept, optional misconception, contextual outcome, and short evidence. No client-controlled ownership field.

Initial shared vocabulary: concept `algebra.distributive-property`; misconception `distribution.missed-term`. The workstream specifications use these identifiers consistently. Keep IDs stable across all workstreams. Types are deliberately small; add fields when an integration needs them, with review from affected owners.

`LearningEventRecord` is currently a local export from `src/lib/learning/events.ts`
matching `LearningEventInput & { id: string; createdAt: string }`, pending the
coordinated shared contract PR.

## Authentication and persistent memory (Developer C)

Supabase Auth owns identity. `requireUser()` creates a fresh cookie-aware client and verifies identity with `auth.getUser()` on each request. `requireOwnedSession(auth, sessionId)` queries under that client and filters by both ID and verified owner, returning the same 404 for missing and foreign sessions. `createStudySession(auth)` generates a server UUID and lets database defaults assign ownership/time. All three helpers are server-only; callers must carry `auth.headers` into success and error responses. There is no service-role bypass. A publishable key is public project configuration, not authorization. Do not use privileged credentials to bypass student policies.

Tables defined by migrations in `supabase/migrations/` (applied to hosted `newton-dev` on 2026-11-14):

| Table | Proposed fields | Responsibility |
| --- | --- | --- |
| `student_profiles` | `user_id`, optional `display_name`, `preferred_tutor_mode`, `created_at` | Minimal preferences keyed to Auth identity |
| `study_sessions` | `id`, `user_id`, `started_at`, nullable `ended_at` | Authenticated study context |
| `learning_events` | `id`, `user_id`, `session_id`, `source_revision_id`, `concept`, nullable `misconception`, `outcome`, `evidence`, `created_at` | Factual observations across sessions |

Server assigns owner and timestamps, checks the referenced session belongs to that owner, and accepts only validated observations. RLS must protect reads, inserts, updates, and deletes for student-owned data, including ownership checks on new rows. Foreign-key/ownership constraints must prevent linking an event to another student's session. Developer C owns migrations, indexes, retry deduplication, and tests using two accounts plus an anonymous caller. The workstream guide defines uniqueness by owner/session/revision/concept/outcome with identical retries returning the original record and conflicting payloads rejected; a revision may legitimately support more than one outcome. Events are append-only in normal student access.

Retrieve a bounded, recent set of events scoped to the authenticated user and relevant concept across sessions. Start with ordinary PostgreSQL queries; no vector store. Retain source session and evidence in retrieved context, distinguish correction with help from independent correction, and never infer lasting ability or mastery from one observation. Uncertain perception should not be saved as a confirmed misconception. Client evidence is untrusted: the server write path must validate it against session analysis rather than blindly trusting a posted claim.

For the first integration, A produces eligible observations inside the server analysis path and calls C's writer; no client event-write route is exposed. User-scoped RLS prevents cross-account access but does not prove that a self-owned row inserted directly through Supabase came from the tutor. Treat all retrieved memory as advisory data. The C01 specification explicitly separates account-isolation testing from tamper-resistant provenance, which remains a requirement to resolve before real-student use.

C's `recordLearningEvent(auth, input)` is implemented and locally tested. It
rejects unknown fields, invalid UUIDs/vocabulary, and empty or over-500-character
trimmed evidence. UUIDs are canonicalized and evidence length counts Unicode
characters consistently with PostgreSQL. Only `practiced` and
`misconception-observed` are enabled; the latter requires the supported
misconception. Correction outcomes wait for A's trustworthy prior/hint evidence.
The writer checks ownership before inserting, relies on database defaults for
owner/ID/time, and handles unique conflicts by reading the full owner-scoped
identity and comparing immutable evidence/misconception. It never upserts or
updates a saved event. Identical retries return the original record; changed
payloads return 409. A must still establish observation eligibility before
calling this helper. Real signed-in hosted C1 acceptance passed; see
[the verification record](backend-testing.md#real-two-account-acceptance--2026-11-14).

`getLearningContext(auth, conceptId)` and `GET /api/learning-context` are now
implemented independently of A/B. The query explicitly filters by verified
owner and supported concept across sessions, orders by `created_at DESC, id
DESC`, and returns at most ten rows. The shared stored-record decoder reads all
four database outcomes while correction creation stays disabled in the writer.
No owner fields reach the response. Empty history returns `events: []` and
`summary: ""`; service failures remain distinct. The summary includes UTC dates,
outcomes and JSON-quoted evidence excerpts, capped at 2,000 UTF-16 units without
splitting Unicode characters or modifying the full source records. It makes no
mastery inference. Evidence remains advisory data; future consumers must escape
it and delimit it separately from instructions. `LearningContext` stays a local
export pending the coordinated shared contract.

Do not persist raw audio, screenshots, full conversations, or unnecessary personal information by default. Agree on retention, deletion, and student-facing memory controls before collecting real student data.

## Environment, deployment, and references

`.env.example` names `DEEPGRAM_API_KEY` (server only, Member-level or higher for token grants), `GROQ_API_KEY` / `GEMINI_API_KEY` (server-only transcription), optional `NEWTON_VISION_PROVIDER`, optional `OPENAI_API_KEY` (separately funded future use), `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public). OpenAI credentials are not required for managed voice. No privileged Supabase key is needed in this scaffold. Next.js bundles `NEXT_PUBLIC_` settings for the browser; never put permanent provider keys or other secrets there.

Target Vercel with Node.js 22 and the npm lockfile. CI runs lint, route type generation/TypeScript, Vitest, and the production build with no credentials. The app uses system fonts plus locally copied drawing/math/PDF assets; predev/prebuild prepares those assets without a font CDN. Developer C will configure Vercel environments, Supabase auth redirect URLs, and RLS before integration deployment. Keep preview and production configuration separate; no hosting resource is created by this scaffold.

Official references checked during initialization (2026-11-13):

- [Deepgram Browser Agent overview](https://developers.deepgram.com/docs/browser-agent-overview) and [core JavaScript SDK](https://developers.deepgram.com/docs/browser-agent-javascript): supported connection and audio lifecycle.
- [Deepgram token-based authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication): server key permissions and temporary browser credentials.
- [Deepgram managed LLM models](https://developers.deepgram.com/docs/voice-agent-llm-models): managed model availability and tier; recheck pricing before live use.
- [Supabase Next.js Auth](https://supabase.com/docs/guides/auth/quickstarts/nextjs) and [API keys](https://supabase.com/docs/guides/getting-started/api-keys): public configuration and identity.
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Vitest setup](https://nextjs.org/docs/app/guides/testing/vitest), and [Tailwind Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs): application tooling.

Recheck current official SDK docs when implementing integrations; `gpt-4o-mini` is the initial candidate, not a permanent model or session-payload contract. Next.js/React, Excalidraw/MathLive, CortexJS, Supabase Auth/PostgreSQL, learning-event persistence, and developer ownership remain unchanged by this pivot.

Current-work synchronization uses one bounded revision-scoped prompt block, preserving the same managed model. Edits clear submitted evidence; ambiguous in-flight replacements close voice and require explicit restart. Only explicit structured or student-confirmed handwritten submissions are shared; uploaded worksheet text is not recognized. See [context delivery and validation](study-tutoring.md).

### Implemented handwriting transcription (Developer A, integrated with B)

Explicit handwriting reads: Read handwriting exports the current whiteboard PNG once, `POST /api/work/transcribe` (verified Supabase user, same origin, bounded PNG, per-user limit) asks a free-tier vision model to copy the work, the student reviews/edits and confirms the transcription, and only then the existing deterministic checker, hints and voice context use it.

`src/lib/vision/providers.ts` is the replaceable server-only adapter boundary: `VisionAdapter.transcribe(image, signal)` returns raw model text. Groq-hosted Qwen vision (`qwen/qwen3.8-27b`, reasoning disabled) is preferred; Gemma 4 (`gemma-4-31b-it`) through the Gemini API is the fallback. Keys stay on the server and are sent in request headers. Requests use temperature 0, a 200-token output cap, a 20-second timeout, no redirects, and a 64 KiB response cap. Provider error bodies are never read or forwarded.

`src/lib/vision/handwriting.ts` instructs the model to copy exactly what is written, including mistakes, without correcting, simplifying, solving, grading or explaining, and to mark unclear symbols with `?`. Output is untrusted: only `{status, text}` survives; prose, extra fields (for example a volunteered answer) and thought parts are discarded. Text must be at most 200 plain math characters without words. Results are `transcribed`, `ambiguous` (contains `?`) or `unreadable`; no confidence score is fabricated. Malformed output, timeouts, rate limits and missing credentials are service errors, never mathematical uncertainty.

The route accepts only `{ revisionId, image }` with a PNG data URL of at most 2 MiB and 2048 pixels per side, checks the PNG header, and echoes the revision. It requires `requireUser()` and same-origin POST before any provider call, applies a process-local limit of 12 reads per user per 10 minutes (not deployment-wide abuse protection), and stores or logs nothing. It does not create study sessions or learning events.

The workspace ties each read to the board revision. Any board, structured-input, source or worksheet change, account teardown or unmount aborts the request and discards pending, reviewed or confirmed text; a late response for an older revision is ignored. Restored drawings can be read again, but drafts and confirmations are never restored from storage. Account changes remount the workspace and stop voice; logout invalidates pending reads before awaiting the server. The transcription is only a draft until the student confirms it, and `?` must be resolved first. Confirmed text passes through `normalizeExpression` and the same `checkDistribution`, hint and `VoiceSession.updateContext` paths as structured input, labelled `confirmed_handwriting`. Voice never receives the image.

`checkDistribution(submission, activeProblem)` now verifies against the student's active problem (default `7(6k + 2)`, changeable in the Newton panel). An equation whose original side is a different distributive expression is unsupported and only proposed as a new active problem; the student must adopt it explicitly. Standalone expansions are compared with the active problem. MathLive structured input remains the fallback.

Free-tier data terms differ: Groq does not retain inference data by default, while Gemini API unpaid-tier inputs may be used to improve Google products and reviewed by humans. Only the whiteboard drawing is sent; review provider terms before real-student use.

Handwriting format handling now supports bounded presentation-only normalization of continued equations inside the JSON transcription field, preserving the existing symbols and student confirmation gate. It rejects prose, ambiguous line joins and extra equations. Fixed development-only error categories distinguish provider-envelope failures from model-content validation without logging work. See [multiline investigation and live-test limits](study-tutoring.md#multiline-handwriting-format-investigation-2026-11-14).

Transcription captures render scene strokes at up to 2× resolution with Excalidraw `getDimensions`, bounded to 2048 pixels per side and 2 MiB. `WhiteboardHandle.capture({ forTranscription: true })` selects this local rendering mode; regular snapshots keep their previous dimensions. Visual digit/letter ambiguities are requested as `?` and resolved in the existing student review, never repaired using mathematical expectations. This is a recognition-quality measure with local rendering tests; model accuracy remains subject to live evaluation.

The developer reported successful authenticated browser acceptance on 2026-11-14 using genuine two-line Excalidraw handwriting: Groq preserved `7(6k+2)=42k+2`, the student confirmed it, and the deterministic checker supplied a hint about `7 × 2`. This manual evidence is distinct from mocked automated tests and does not validate the separate authenticated voice-session integration. See [acceptance record and limits](study-tutoring.md#verified-live-handwriting-acceptance--2026-11-14).
