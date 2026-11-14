# Local authenticated voice authorization

Approved scope: connect existing C identity/session checks before Adrian's Deepgram token call. Preserve the explicit local capability harness and all deployment/preview/CI restrictions. No deployment enablement, new rate-limit policy, frontend wiring, provider changes or schema changes.

- Add route tests using actual auth/ownership helpers and mocked Supabase/provider boundaries; observe failure before implementation.
- Accept an owned C study-session UUID on the no-capability local path; retain isolated capability behavior and reject invalid capabilities without fallback.
- Propagate refreshed private/no-store headers for success and auth/ownership/provider/quota failures.
- Run focused/full tests, lint/types/build, independent review, and document the exact integration boundary. Save a feature-branch checkpoint for Adrian to review.
