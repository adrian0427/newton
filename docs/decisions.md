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

B's workspace and A's voice implementation coexist after this merge, but `/study` has not been wired to the adapter. B2 will consume A's provider-independent lifecycle and C's owned sessions; analysis, whiteboard/worksheet context, intervention delivery, and memory remain separate future integrations. No developer ownership or shared tutoring contract changes are made by combining the workstreams.

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
