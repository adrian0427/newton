# Bounded request input and learning context

Two authorized Developer C checkpoints on `feat/backend-memory`; no A/B wiring.

## 1. Close request buffering finding

- Preserve existing Origin/auth ordering, error envelopes, empty session bodies,
  password whitespace/Unicode, refresh headers and 8192/1024 UTF-16 text limits.
- Add a shared incremental UTF-8 reader. Stop on decoded text overflow; enforce
  an independent byte ceiling of three times the character limit plus three
  optional BOM bytes (UTF-8 needs at most three bytes per UTF-16 code unit).
  Never retain oversized chunks.
- Cancel rejected streams without awaiting untrusted cancellation; release locks.
- Test chunked/misdeclared lengths, byte/character boundaries, Unicode splits,
  pending/rejecting cancellation, malformed input and normal sign-in/session use.
- Independent pre-patch investigation, focused RED→GREEN tests, then one fresh
  bypass/regression review and relevant project checks before the fix commit.

## 2. Implement C01 recent learning context

- `getLearningContext(auth, conceptId)` uses the request's authenticated client,
  explicit owner/concept filters, `created_at DESC, id DESC`, maximum ten rows.
- Share the stored-record decoder with the event writer; read all four database
  outcomes while the writer continues rejecting correction creation.
- Return local `LearningContext = { conceptId, events, summary }`; preserve source
  records and generate a deterministic ≤2000 UTF-16-unit factual summary with
  dates/outcomes and quoted evidence excerpts. Empty history returns empty arrays/text.
- `GET /api/learning-context` verifies identity on every request, accepts exactly
  one supported conceptId and no ownership/session parameters, preserves refresh
  headers and private/no-store responses, and sanitizes failures.
- Test user isolation, cross-session history, tied dates/order/limit, summary
  escaping/bounds, malformed rows, input/auth/config/database failures and account
  switching. Use unit tests plus actual PostgreSQL with the existing test transport.
- Full tests/lint/typecheck/build, scoped diff/secret review and branch backup.

Hosted two-account signed-in HTTP acceptance remains a separate verification
requirement. No new schema, service-role credentials, provider calls or A/B integration.

Both checkpoints implemented. Body fix: 12 failing assertions → green, 197-test
suite, lint/typecheck/build and independent security review passed (including
4,000 reviewer differential decoding cases). Retrieval: 29 RED→GREEN cases and
four PostgreSQL/SDK integration cases; final230-test suite, lint/typecheck/build
and independent feature review passed. Built-app streaming sign-in rejected
before body completion; anonymous context/session requests returned401/no-store.
