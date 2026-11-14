---
name: integration-review
description: Review Newton changes that connect workspace, AI voice or analysis, authentication, and learning memory for contract and lifecycle failures.
---

# Review a Newton integration

Read `docs/architecture.md`, `docs/contributing.md`, and the relevant changes. Trace one actual request or event across its boundaries; review proposed behavior as a proposal when not yet implemented.

- Check shared TypeScript contracts and runtime validation; identify every producer and consumer affected.
- Keep browser-only drawing/audio code client-side and permanent service credentials server-side. Verify protected routes derive identity from authenticated sessions, enforce RLS, and check session ownership.
- Follow a snapshot through capture, analysis, display, speech, and memory. New edits invalidate late results; cancellation alone is insufficient. Uncertain recognition must not become a confirmed misconception.
- Check errors, loading states, retries, and duplicate requests. Voice start/stop, interruption, navigation, and disconnect must clean up media and prevent overlapping sessions.
- Verify memory preserves concept, source revision, session, outcome, and short evidence. Check cross-session retrieval is user-scoped, retry writes avoid unintended duplicates, and raw audio/images/transcripts are not persisted by default.
- Identify cross-developer assumptions, mismatched IDs, route shapes, lifecycle ownership, and missing validation. Request focused tests for demonstrated risks, including two-account isolation for persistence changes.

Report actionable findings with file references and severity, then tested paths, unresolved assumptions, and affected owners. Distinguish observed failures from risks. Do not implement another workstream, create commits, push, or open PRs without authorization.
