# Structured-work tutoring slice

A01 and B01 are connected through the real workspace, `VoiceSession`, and MathLive expression/revision contracts. C01 authentication, study-session and learning-memory modules are implemented and merged. Workspace session creation and memory consumption are not yet wired. Public `/study` therefore supports local checking/hints but keeps voice disabled. A guarded generated `/dev/study` page provides the combined voice demonstration without supplying a local capability to the public study route.

`npm run voice:dev` now prepares workspace assets and generates both `/dev/voice` and `/dev/study`. The same development/loopback/preview/CI checks, per-run capability, same-origin POST validation and issuance limit protect them. Production issuance stays closed. No fake authenticated session or duplicate token endpoint was introduced. Do not expose this server through a public tunnel. Ctrl+C or `npm run voice:dev -- --clean` removes both generated pages and their stale route types.

## Verification and context

`src/lib/math/check-distribution.ts` compares exact rational constant/variable coefficients, never sampled values or model confidence. It supports one-variable linear expressions with integers, decimals, parentheses, unary signs, addition/subtraction, constant multiplication and nonzero constant division. Limits are 500 characters, 150 tokens per side, depth 40 and 12-character numeric tokens. Powers, functions, nonlinear products, variable denominators, mixed variables and ambiguous input stay unsupported. This is a bounded expansion verifier, not a general computer algebra engine or equation solver; `2(x+3)=14` may be a problem to solve and is left unverified.

An equality with an explicit nonzero-scalar-times-linear-binomial reference (with nonzero variable and constant terms) uses that reference as its problem. Otherwise, a standalone expansion is compared against the visible practice expression `7(6k + 2)`; an equality must include a side equivalent to that practice expression. Equivalent reordered, fractional, negative and decimal forms are compared exactly. Unexpanded equivalence is not claimed to complete an assignment or establish mastery. A missed-term tag requires that precise coefficient pattern; other mismatches get a distribution/arithmetic hint. No image-recognition provider is configured, so worksheet/freehand work is never labeled analyzed.

Check work displays the submitted expression and result and silently supplies it to an active voice session. Start voice includes the latest still-current explicit submission in initial agent settings. Ask for a hint does the same, then sends exactly one requested user message after context acknowledgement. Ordinary spoken requests (for example “What did I do wrong?”) use the supplied context without injecting another user turn. Draft typing alone is not a submission. Unsupported input can be shared as explicitly unverified structured text, never as a verified correction.

The provider-independent `VoiceSession.updateContext(context): Promise<boolean>` stores context while idle and awaits provider acknowledgement while connected. Context contains a bounded problem, revision ID, optional structured submission and local result/guiding hint. `VoiceSnapshot.context` reports stored/pending/applied/failed and a sanitized failure code; the local `/dev/study` controls display only its status and revision ID. The existing `sendText(message): boolean` remains the explicit response-triggering path. Neither operation starts a microphone automatically.

Deepgram's initial `agent.think.prompt` contains the base tutoring policy and one current-work block. For live changes, `updateThink()` sends the same managed model/provider with a complete replacement prompt and waits for `think-updated` (`ThinkUpdated`). `updatePrompt()` is deliberately not used: official documentation says it appends rather than replaces. Initial `agent.context.messages` supplies conversation history, not a revision-aware work slot. `injectUserMessage()` generates a response, so it is used only for the explicit hint button, never silent context synchronization. No transcript history is synthesized or replayed on restart.

Feedback is revision/source/input scoped. Edits, clear and worksheet/source changes invalidate both displayed evidence and the voice submission. The explicit practice problem remains `7(6k + 2)` unless a submitted structured equality supplies a different problem. The uploaded worksheet is still only a local image/PDF; Newton cannot extract its problem. To work on another worksheet problem, submit the original expression and step as an equality. A cleared submission instructs voice not to reuse earlier steps from conversation history.

Idle context changes pause audio forwarding until acknowledgement (maximum five seconds); no buffered microphone frames are replayed. New speech or output racing an update, delivery failures, or edits while a turn is pending/playing close the connection and show restart guidance. This is conservative because binary audio has no server response/revision IDs. Start again uses only the latest stored context. Edits arriving during an idle update are coalesced behind its acknowledgement, with no concurrent context requests. Successful idle replacements preserve the connection; the context remains in the prompt across subsequent spoken turns. Closing the panel preserves voice; navigation/pagehide stops it. Natural/manual interruption and existing audio-drain/stale-response guards remain in place.

Checks are transient client-side assistance, not persistence-authorizing learning evidence. No work, audio, transcripts or learning events are logged/persisted by this slice. A future server path must recompute/validate work, and C must enforce identity, ownership and evidence eligibility before writing memory. No worksheet sharing, handwriting analysis, proactive controller, general verification tool, or persistent history is claimed.

## Manual demo

1. Use Node 22, `npm ci`, and `npm run dev`. At `/study`, choose Structured input and enter `7(6k+2)=42k+2`. Open Newton, Check work, then Ask for a hint. Expect non-equivalence and a question about `7 × 2`, without the full expansion being supplied.
2. Edit to `7(6k+2)=42k+14`. Old feedback disappears; checking reports correct equivalence. Also try `14+42k`, `3(2x+5)=6x+5`, a power, and whiteboard-selected work. The different problem must get its own factors; unsupported work must say Not checked. Worksheet viewing, drawing, snapshots, appearance and clear remain available.
3. Stop this checkout's ordinary dev server, set server-only `DEEPGRAM_API_KEY` in `.env.local`, then run `npm run voice:dev`. Open the printed loopback address at `/dev/study`. Enter the incorrect step, open Newton, Start voice, grant microphone permission, and wait for listening. The practice ID is explicitly local testing, not C-owned authorization.
4. Click Check work and wait for Context: applied. Say “Newton, can you give me a hint?” without clicking Ask for a hint: expect guidance about multiplying the constant by seven, without a claim of handwriting recognition. Also say “What did I do wrong?” and then test Ask for a hint as a separate turn. Listen and interrupt naturally. Close/reopen the panel without starting another connection. Edit during a spoken hint: voice should end and feedback disappear. Start again explicitly. End or navigate away and confirm physical microphone release. Missing credits/key, permission denial and network failure must remain recoverable without losing work. Observe the existing five-starts-per-ten-minute limit.
5. Ctrl+C cleans both generated pages. Public `/study` must still have voice disabled even on the local harness server; deployed/preview issuance remains fail-closed.

## Automated validation boundaries

Unit tests cover exact/unsupported mathematics, targeted hints, bounded context, SDK delivery, duplicate guards, errors and cleanup. Playwright uses the real workspace/MathLive at desktop and 360px widths. Its explicit `NEWTON_TEST_DEV_STUDY=1` cases run against `NEWTON_TEST_URL` with mocked credentials/Deepgram WebSocket and a synthetic microphone. These establish browser wiring, not live model behavior, audible human speech or acoustic stability; no billable service calls are required.

## Context-delivery references and regression checks

Official APIs: [Update Think](https://developers.deepgram.com/docs/voice-agent-update-think), [Update Prompt](https://developers.deepgram.com/docs/voice-agent-update-prompt), [Inject User](https://developers.deepgram.com/docs/voice-agent-inject-user-message), [initial History](https://developers.deepgram.com/docs/voice-agent-history), and [browser JavaScript SDK](https://developers.deepgram.com/docs/browser-agent-javascript). Installed `@deepgram/agents` 0.2.0 exposes `updateThink` and `think-updated`; its runtime update storage keeps the latest update of each type. Automatic reconnection remains disabled.

The original missing-context cause was reproducible from the data flow: Check work only set component state, the initial prompt had no workspace data, and only the explicit hint button called sendText/injectUserMessage. The button path did include the correct problem/step/result; ordinary microphone turns had no such delivery. Mocked tests now inspect actual SDK configuration and browser WebSocket payloads for both paths, including acknowledgement gating, clearing revisions, retries, failed updates, and no duplicate injection. These tests prove delivery/lifecycle wiring, not the quality of a live model's hint. Real microphone/model behavior still requires the manual test above.

## Authenticated workspace sessions

`/study` checks `GET /auth/session` and keeps the local whiteboard available to
signed-out visitors. A signed-in student explicitly chooses **Start study
session**. `POST /api/study-sessions` receives no body; the returned UUID stays
in memory for this workspace mount, including panel toggles and voice restarts.
Concurrent start clicks are suppressed. Reloading or leaving the workspace ends
this local attempt; starting again creates a new session. A lost network response
can leave an unused server session; this does not claim exactly-once delivery.

In local development, Start voice uses that UUID with the ordinary credential
provider and no harness capability header. Production/preview issuance remains
disabled by A's existing token route. `/dev/study` retains its isolated capability
and `local-study-test` ID and does not create account sessions.

The workspace exposes Sign out in Matthew’s Settings menu. It stops/cancels voice before requesting
`DELETE /auth/session`, rejects late session responses, and remounts the local
workspace to clear in-memory worksheets, snapshots, tutor state, and work after confirmed
logout. Device-local work is stored separately by verified account email; a different
account or guest cannot restore it through the application. Signing back into the
same account restores its work on this browser. Existing unscoped work remains
guest work; it is not silently assigned to an account. This is local UI separation,
not encrypted storage or protection from someone with access to browser storage. Failed logout preserves work and offers retry. Returning focus rechecks
login; expired or changed accounts invalidate the previous account's session
and workspace. These are browser lifecycle controls; server authentication,
owned-session checks, and RLS remain the actual permission boundaries.

This slice creates study-session metadata in Supabase. Matthew’s local work
persistence remains in IndexedDB, with account separation; it is not cloud-synced.
Validated observation writing/history retrieval are still separate A/C
integration tasks. Local tests mock voice credentials/providers; no paid call is
required to verify the connection.

Verification for this connection: all 411 default tests, ESLint, TypeScript,
and the production build passed on Node 22. The full desktop/mobile suite
initially passed 50 cases and skipped four opt-in harness cases; two worksheet
cases still referenced the renamed Appearance button. After updating those
selectors to Settings, all six worksheet regressions passed, covering the two
failed cases. Across these runs, all 52 applicable browser scenarios were
verified. The built production app separately passed six account/session/local
storage scenarios and kept voice disabled; its four local-voice cases were
intentionally skipped. Local active-voice tests used the real SDK with fake media
and intercepted token/WebSocket responses, proving logout releases microphone
tracks and closes the connection without making paid provider calls. The actual
signed-in Google browser also created a hosted session from the new workspace.
No new Google consent, live Deepgram speech, deployed-host testing, or live
`/dev/study` acceptance was performed in this slice.
