# Architecture decisions

Accepted for the foundation on **2026-11-13**. Integration decisions describe planned implementation, not completed features.

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 001 | Next.js App Router with strict TypeScript | One application for UI and server routes, shared contracts, and straightforward Vercel hosting. Use npm, Tailwind, ESLint, and Vitest. |
| 002 | OpenAI Realtime for voice, through Agents SDK | Natural conversation and interruption; isolate voice transport from work interpretation and verification. Permanent API keys stay server-side. |
| 003 | Excalidraw with MathLive fallback | Preserve freehand work while allowing structured math when handwriting is ambiguous. Add these dependencies with the workspace feature. |
| 004 | Supabase Auth and PostgreSQL | Managed identity and relational cross-session history. RLS and session ownership are required; Developer C owns schema implementation. |
| 005 | Analyze after student pauses or explicitly requests help | Reduce cost and interruptions. Version every snapshot, discard stale results, and tune timing during the MVP. |
| 006 | Persistent, evidence-backed learning events | Personalization should reference observed work, not unsupported ability labels. No default storage of raw audio, screenshots, or full conversations. |
| 007 | Algebra I distributive property first | A narrow, demonstrable end-to-end loop fits November 13–15. Other curriculum waits until this loop works. |
| 008 | Three-developer ownership | A owns AI/voice/tutoring, B owns student UI, C owns auth/memory/backend. Coordinate shared contracts and configuration to reduce merge conflicts. |

Add a short dated entry when a meaningful decision changes. Keep rationale and implementation consequences explicit; avoid speculative infrastructure.

## 2026-11-13 — Workstream implementation baseline

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 009 | Concrete A/B/C modules and additive interface proposals in the [workstream guide](workstreams/README.md) | Each developer can start independently; route ownership and shared type authorship are explicit. Existing tutoring contracts are unchanged. |
| 010 | Fail-closed deployed Realtime credential issuance | Until C's auth/session checks and abuse controls are connected, no provider credential is issued by deployed routes. A can test real voice locally using a Node-only issuer. |
| 011 | Database event deduplication and historical revision evidence | Unique owner/session/revision/concept/outcome prevents duplicate retries. A verified old step can remain historical evidence without triggering current UI/speech or implying correction. |
| 012 | Test-data-only memory baseline with user-context RLS | A verifies observations in the application path, C enforces ownership, and B displays factual context. RLS does not establish AI provenance of self-owned records; stronger provenance and real-student retention remain explicit pre-release questions. |

## 2026-11-13 - Local student workspace (B1)

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 013 | One workspace revision clock guards transient captures | Content edits, undo/redo, and clear invalidate exports. Source changes and unmount also invalidate pending capture. Selection and viewport state do not identify new work. |
| 014 | Restrict structured exports to explicit Algebra I notation | MathLive ASCIIMath is normalized to numbers, single-letter variables, parentheses, arithmetic operators, powers, and one equality. Unsupported or incomplete notation stays editable and blocks capture. This is notation validation, not mathematical verification. A must review the syntax fixture before integration. |
| 015 | Serve drawing and math fonts from local package assets | Predev/prebuild copies installed fonts into ignored `public/vendor/`. Homepage and workspace need no service credentials or external font CDN. Explicit JSON/PNG downloads are the only persistence supplied by B1. |

## 2026-11-13 - Workspace-first interaction

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 016 | Full-viewport worksheet/whiteboard split with on-demand Newton | Student work takes priority. The divider supports pointer and keyboard resizing; mobile switches panes while preserving local work. Permanent support/history panels are removed. Audio activation awaits real services and opt-in. |
| 017 | Local worksheet reference with PDF.js page rendering | PDF/image upload, drag-and-drop, and screenshot paste stay in-browser. Signature/size checks, cancellable rendering, generation checks, and Blob URL cleanup bound the lifecycle. No worksheet context is sent to tutoring until an explicit-help integration contract is agreed with A. |

## 2026-11-13 - Paper appearance

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 018 | Paper Light and revised graphite Paper Dark with Light/Dark/System preference | Applies the approved Figma palette to existing product components. Local preference storage contains no work or document content. Theme and optional worksheet comfort preview affect presentation only, preserving revision identity and canonical capture data. |

## 2026-11-13 - Compact study controls

| ID | Decision | Rationale and consequence |
| --- | --- | --- |
| 019 | Compact drawing controls and reversible focus mode | Collapse pen settings and advanced tools by default, retain accessible zoom and undo/redo, and let students expand the board without unmounting local work. Remove redundant pane title bars, sample equation, and local-workspace header label. |
