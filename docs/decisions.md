# Architecture decisions

Accepted for the foundation on **2026-11-13**. Entries record accepted designs; see the architecture status for what is implemented versus still awaiting integration.

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 001 | Next.js App Router with strict TypeScript | One application for UI and server routes, shared contracts, and straightforward Vercel hosting. Use npm, Tailwind, ESLint, and Vitest. |
| 002 | OpenAI Realtime for voice, through OpenAI Agents SDK — **superseded for the hackathon by 013** | Original rationale: natural conversation and interruption; isolate voice transport from work interpretation and verification. Permanent API keys stay server-side. The funding constraint changes the provider, not those boundaries. |
| 003 | Excalidraw with MathLive fallback | Preserve freehand work while allowing structured math when handwriting is ambiguous. These dependencies are installed with the local workspace feature. |
| 004 | Supabase Auth and PostgreSQL | Managed identity and relational cross-session history. RLS and session ownership are required; Developer C owns schema implementation. |
| 005 | Analyze after student pauses or explicitly requests help | Reduce cost and interruptions. Version every snapshot, discard stale results, and tune timing during the MVP. |
| 006 | Persistent, evidence-backed learning events | Personalization should reference observed work, not unsupported ability labels. No default storage of raw audio, screenshots, or full conversations. |
| 007 | Algebra I distributive property first | A narrow, demonstrable end-to-end loop fits November 13–15. This constrains automated work analysis and proactive intervention; conversational math tutoring is broader and does not create verified learning events. |
| 008 | Three-developer ownership | A owns AI/voice/tutoring, B owns student UI, C owns auth/memory/backend. Coordinate shared contracts and configuration to reduce merge conflicts. |

Add a short dated entry when a meaningful decision changes. Keep rationale and implementation consequences explicit; avoid speculative infrastructure.

## 2026-11-14 — Bounded inputs and factual context

Auth/session POSTs enforce the existing UTF-16 text limits incrementally while
also bounding incoming UTF-8 bytes (`3 * character limit + 3` for an optional
BOM). This closes unbounded buffering while preserving valid Unicode input.
Cancellation is initiated without waiting on untrusted cleanup; headers and
auth/Origin ordering remain unchanged.

C01 retrieval uses the authenticated user's client, explicit owner/concept
filters, latest-ten deterministic ordering and the shared database-record
decoder. Summaries quote source evidence and shorten excerpts to fit 2,000
UTF-16 units; full records are preserved. Reading four stored outcomes does not
enable correction writes or establish AI provenance. A/B integration and real
signed-in hosted acceptance remain separate milestones.

## 2026-11-14 — Server-only learning event writer

C01's writer validates a strict field allowlist, canonical UUIDs, supported
vocabulary and trimmed evidence of 1–500 Unicode characters. It checks session
ownership and inserts under the verified user's client with database defaults.
Uniqueness arbitrates retries: read the full owner/session/revision/concept/
outcome identity only after insert conflict, return the original record for an
identical payload, and reject changed evidence/misconception with 409. Never
upsert over history. Correction outcomes remain disabled until A supplies
trustworthy earlier-step and delivered-hint evidence. No public write route or
provenance claim is added; `LearningEventRecord` stays a local export pending
the team's shared contract review.

## 2026-11-14 — Local database foundation

Two migrations create C01's tables, then constraints and owner-scoped access.
The schema enables RLS and revokes legacy grants before any access is added.
Column privileges prevent choosing owners/creation times; learning events have
no normal update/delete grants. A composite session/owner FK and unique event
identity enforce boundaries even under concurrent writers. Defaults derive
ownership from `auth.uid()` and time from PostgreSQL.

Development-only PGlite executes the migrations and SQL policy tests without
hosted secrets or Docker. Its Auth boundary is simulated; hosted two-account
HTTP/direct-client acceptance remains separate and incomplete. These migrations
have not been applied to the team's hosted project.

Verified-user and owned-session helpers use a fresh cookie client per request.
Session creation accepts no client ownership/time fields and relies on database
defaults under that user's context. Auth and session POSTs share the existing
Origin/Host check. `AuthContext` and `StudySession` stay local exports until A/B
review the additive shared contract; existing tutoring types are unchanged.

## 2026-11-13 — Workstream implementation baseline

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 009 | Concrete A/B/C modules and additive interface proposals in the [workstream guide](workstreams/README.md) | Each developer can start independently; route ownership and shared type authorship are explicit. Existing tutoring contracts are unchanged. |
| 010 | Fail-closed deployed voice credential issuance | Until C's auth/session checks and abuse controls are connected, no provider credential is issued by deployed routes, including previews. Originally specified a Node-only local issuer; 013 allows a strictly development-only loopback harness while retaining the deployed restriction. |
| 011 | Database event deduplication and historical revision evidence | Unique owner/session/revision/concept/outcome prevents duplicate retries. A verified old step can remain historical evidence without triggering current UI/speech or implying correction. |
| 012 | Test-data-only memory baseline with user-context RLS | A verifies observations in the application path, C enforces ownership, and B displays factual context. RLS does not establish AI provenance of self-owned records; stronger provenance and real-student retention remain explicit pre-release questions. |

## 2026-11-13 — Deepgram voice pivot

**013 — Accepted: Deepgram Voice Agent for the hackathon voice pipeline; supersedes 002.** ChatGPT/Codex credits do not provide funded OpenAI API access. We intend to use Deepgram trial credits and prefer a Deepgram-managed OpenAI model. The initial candidate is `gpt-4o-mini`, currently listed under Standard, subject to availability, account credits, and current pricing. Managed configuration omits a custom `think.endpoint` and requires no separately billed OpenAI API key. See [managed LLM models](https://developers.deepgram.com/docs/voice-agent-llm-models).

The browser communicates through Newton's provider-independent voice adapter and the official [Deepgram Browser Agent SDK](https://developers.deepgram.com/docs/browser-agent-overview). Deepgram handles the voice conversation pipeline. A owns SDK integration and the existing `/api/realtime/token` route; C supplies shared authentication/session-ownership helpers; B renders controls/state without importing provider networking. Short-lived grants use `/v1/auth/grant` with a server-only Member-level-or-higher `DEEPGRAM_API_KEY`, per [Deepgram authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication). No unauthenticated production/preview issuance; authenticated deployment also waits for abuse controls. No duplicate token endpoint or voice-driven database schema change.

Mathematical work interpretation, CortexJS verification, intervention gating, and evidence persistence remain separate. The handwritten-work analysis provider is **undecided** because funded OpenAI vision API access is unavailable. Structured-input verification can proceed independently. Next.js/React, Excalidraw/MathLive, Supabase Auth/PostgreSQL, existing tutoring contracts, and A/B/C ownership remain unchanged. Verified analysis will reach voice through A's freshness-checked controller; C will supply bounded evidence as contextual facts for future sessions.

Using a managed OpenAI model through Deepgram does **not** establish OpenAI Challenge eligibility. Ask the organizers; no eligibility claim is made. Remaining implementation choices include confirming funded model/voice availability, a separate funded vision provider, and deployment-wide abuse controls.

A's initial implementation `1f7b031`, preserved and extended through `4513f07`, uses `@deepgram/agents`, managed `gpt-4o-mini`, and `/v1/auth/grant`. The developer subsequently confirmed browser recognition and audible playback; the latest lifecycle/stability changes require fresh manual acoustic checks. See [the A01 handoff](ai-voice.md). `npm run voice:dev` uses loopback-only, capability-protected, same-origin temporary-token issuance with a process-local limit. It replaces the old Node-only/pasted-credential procedure without enabling production/preview issuance. These local controls are not a substitute for C's authenticated deployment controls.

The merge initially placed B's workspace and A's voice implementation side by side; decision 021 records the first bounded structured-work integration. Public voice still awaits C's owned sessions. Server analysis, whiteboard/worksheet context, proactive intervention, and memory remain separate future integrations. No developer ownership or shared tutoring contract changes are made by combining the workstreams.

## 2026-11-13 - Local student workspace (B1)

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 014 | One workspace revision clock guards transient captures | Content edits, undo/redo, and clear invalidate exports. Source changes and unmount also invalidate pending capture. Selection and viewport state do not identify new work. |
| 015 | Restrict structured exports to explicit Algebra I notation | MathLive ASCIIMath is normalized to numbers, single-letter variables, parentheses, arithmetic operators, powers, and one equality. Unsupported or incomplete notation stays editable and blocks capture. This is notation validation, not mathematical verification. A must review the syntax fixture before integration. |
| 016 | Serve drawing and math fonts from local package assets | Predev/prebuild copies installed fonts into ignored `public/vendor/`. Homepage and workspace need no service credentials or external font CDN. Explicit JSON/PNG downloads are the only persistence supplied by B1. |

## 2026-11-13 - Workspace-first interaction

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 017 | Full-viewport worksheet/whiteboard split with on-demand Newton | Student work takes priority. The divider supports pointer and keyboard resizing; mobile switches panes while preserving local work. Permanent support/history panels are removed. Workspace audio activation awaits wiring A's existing adapter, C's authenticated sessions, and microphone opt-in; local voice diagnostics are separate. |
| 018 | Local worksheet reference with PDF.js page rendering | PDF/image upload, drag-and-drop, and screenshot paste stay in-browser. Signature/size checks, cancellable rendering, generation checks, and Blob URL cleanup bound the lifecycle. No worksheet context is sent to tutoring until an explicit-help integration contract is agreed with A. |

## 2026-11-13 - Paper appearance

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 019 | Paper Light and revised graphite Paper Dark with Light/Dark/System preference | Applies the approved Figma palette to existing product components. Local preference storage contains no work or document content. Theme and optional worksheet comfort preview affect presentation only, preserving revision identity and canonical capture data. |

## 2026-11-13 - Compact study controls

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 020 | Compact drawing controls and reversible focus mode | Collapse pen settings and advanced tools by default, retain accessible zoom and undo/redo, and let students expand the board without unmounting local work. Remove redundant pane title bars, sample equation, and local-workspace header label. |

## 2026-11-14 — Google-only user-facing authentication

The user selected Supabase Google OAuth for public sign-in instead of password registration. Keep existing SSR cookies, verified Auth IDs and user-scoped RLS. Replace the password form/POST handler with Google start and a PKCE callback, using a configured application origin and fixed redirects. Google secrets stay in Supabase provider settings. No A/B consumer or database schema changes are required. The developer has configured the hosted Google provider and reported successful manual Google sign-in, logout/relogin and reload. Automated live fixture-session and database isolation checks passed; a second actual Google-account and deployed HTTPS acceptance remain pending. Password fixtures are retained only in the explicit disposable-project database acceptance harness.

## 2026-11-14 — First structured-work tutoring slice

**021 — Exact local linear-expansion checking and guarded workspace voice.** Use a bounded exact-rational coefficient verifier for structured distributive expressions, without adding a general math dependency or labeling images as understood. Checks and hints use the current expression/revision and stay transient; a future server must revalidate before C can persist evidence. This is a deliberately narrower implementation than the planned CortexJS/server analysis path.

C01's auth/session implementation is absent, so public voice issuance stays closed. The existing loopback harness adds a generated `/dev/study` entry point for the real workspace, preserving `/study` without a development capability. Existing A01 `start`/`stop`/`interrupt`/subscriptions own one connection; additive `sendText` uses the SDK's actual `injectUserMessage` method for explicit, bounded quoted check context. No proposed `deliver` method is assumed.

Edits invalidate visible feedback. Editing while a work hint is pending/playing ends its voice session conservatively because binary audio has no server response ID; explicit restart is required. No proactive speech, handwriting recognition, auth bypass, memory write, or duplicated voice lifecycle is added. See [scope and manual acceptance](study-tutoring.md).


## 2026-11-14 — ADR 022: Current submitted work in voice context

**Decision:** Supply current explicitly checked structured work in initial voice settings and replace it silently on an idle active connection using SDK `updateThink()` with the unchanged managed provider/model. Await `ThinkUpdated` before forwarding more microphone audio or sending an explicit hint request. Deepgram documents `UpdatePrompt` as additive; it would accumulate obsolete instructions. `InjectUserMessage` remains reserved for an explicit response request, and history is not fabricated as a context workaround.

**Reason:** Check work previously updated only React feedback; spoken hint requests had no problem or submitted step. The button already sent those fields, but general voice questions did not. One current context block carries the revision, explicit problem, structured source and deterministic result without claiming handwriting recognition or persistent memory.

**Lifecycle:** Edits remove stale evidence. Busy, racing or failed updates close voice rather than playing unlabelled audio for an obsolete revision; explicit restart restores only the latest context. Successful idle updates keep the connection. Local diagnostics expose status/revision/fixed error codes only. C's production authentication dependency, local credential restrictions and developer ownership remain unchanged.

## 2026-11-14 — ADR 023: Student-confirmed handwriting transcription

**Decision:** Add explicit, student-requested whiteboard transcription through a small server-only vision adapter. Use Groq-hosted Qwen vision on its free tier when `GROQ_API_KEY` is configured; otherwise Gemma 4 through the Gemini API free tier. No paid dependency or OpenAI credit is assumed. The model only transcribes; the student confirms or edits the text, and the existing deterministic checker grades it.

**Reason:** In the team's proof of concept both models transcribed `4(x+3)=4x+12`, `-4(x+3)=-4x+-12` and the incorrect `4(x+3)=4x+3` faithfully, but Qwen also volunteered the correct answer. Discarding everything except a bounded transcription, plus student confirmation, prevents model grading or answers from reaching students. Submitted equations must now start from the active problem instead of trusting an arbitrary left-hand side.

**Consequences:** Reads require a verified Supabase user and stay transient; nothing is persisted or logged. Board edits invalidate pending and confirmed transcriptions. Structured input remains the fallback. Public voice, authenticated voice issuance and learning-event writes are unchanged. This supersedes the "provider undecided" status for handwriting transcription only; general work analysis and proactive intervention remain planned.

### ADR 023 follow-up — bounded multiline normalization and failure categories

The 2026-11-14 original-image diagnostic reproduced a successful Groq HTTP response followed by a local math-format rejection. Strengthen the transcription-only prompt for line continuations and accept a small set of presentation-only wrappers within the existing bounded JSON text field. Never recover an equation by stripping explanatory prose, inserting symbols or grading/correcting work. Reject extra equations and ambiguous line joins. Retain only fixed development failure categories to distinguish provider envelope failures from model-text validation; no raw output/image logging. Authentication, confirmation, revision guards, provider selection and rate limits are unchanged. Subsequent developer-performed live handwriting acceptance succeeded; see [investigation record](study-tutoring.md#multiline-handwriting-format-investigation-2026-11-14).

### ADR 023 follow-up — render handwriting from strokes at bounded higher resolution

Use Excalidraw's `getDimensions` for transcription captures to render at up to 2×, capped proportionally at 2048 pixels per side; retain the 2 MiB payload limit and ordinary snapshot behavior. The installed SDK ignores `getDimensions` when `maxWidthOrHeight` is present, so use only the former for this path. Avoid raster filters or mathematical repairs that might alter symbol evidence. Prompt for visual digit/letter separation and uncertainty markers without providing the target answer. Confident misreads remain student-editable; a single successful developer-performed real-handwriting acceptance is recorded separately from string-policy and mocked tests and does not measure general accuracy. No additional provider requests or retry/failover paths are introduced.

**Live acceptance (developer-reported, 2026-11-14):** genuine two-line Excalidraw work `7(6k+2)=42k+2` was faithfully transcribed by Groq, including the mathematical error, explicitly confirmed, and checked with the targeted `7 × 2` hint. Mocked tests establish contracts/lifecycle; this manual example establishes the real recognition journey only. Matthew's voice authorization/workspace integration is separate.
