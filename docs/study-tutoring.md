# Structured-work tutoring slice

A01 and B01 share the real workspace, voice adapter, deterministic checker and versioned work. C01 supplies authenticated identity and owned study sessions. Signed-in students can explicitly read and confirm handwriting; local development `/study` voice uses the real owned session UUID. Production/preview voice remains disabled. Learning-memory consumption and observation writing are not connected to tutoring. The generated `/dev/study` page remains a separate capability-guarded demonstration.

`npm run voice:dev` now prepares workspace assets and generates both `/dev/voice` and `/dev/study`. The same development/loopback/preview/CI checks, per-run capability, same-origin POST validation and issuance limit protect them. Production issuance stays closed. No fake authenticated session or duplicate token endpoint was introduced. Do not expose this server through a public tunnel. Ctrl+C or `npm run voice:dev -- --clean` removes both generated pages and their stale route types.

## Verification and context

`src/lib/math/check-distribution.ts` compares exact rational constant/variable coefficients, never sampled values or model confidence. It supports one-variable linear expressions with integers, decimals, parentheses, unary signs, addition/subtraction, constant multiplication and nonzero constant division. Limits are 500 characters, 150 tokens per side, depth 40 and 12-character numeric tokens. Powers, functions, nonlinear products, variable denominators, mixed variables and ambiguous input stay unsupported. This is a bounded expansion verifier, not a general computer algebra engine or equation solver; `2(x+3)=14` may be a problem to solve and is left unverified.

Work is checked against the active problem, initially the practice expression `7(6k + 2)` and changeable in the Newton panel to any nonzero constant times a one-variable linear binomial. An equality must have the active problem itself on one side; an equality that starts from a different distributive expression is reported as not checked and offered as a new active problem, which the student must adopt explicitly. A standalone expansion is compared against the active problem. (Earlier versions adopted any written left-hand side; ADR 023 replaced that.) Equivalent reordered, fractional, negative and decimal forms are compared exactly. Unexpanded equivalence is not claimed to complete an assignment or establish mastery. A missed-term tag requires that precise coefficient pattern; other mismatches get a distribution/arithmetic hint. Handwriting transcription is available after an explicit request and student confirmation; the reading model does not verify mathematics. Uploaded worksheet content is not recognized.

Check work displays the submitted expression and result and silently supplies it to an active voice session. Start voice includes the latest still-current explicit submission in initial agent settings. Ask for a hint does the same, then sends exactly one requested user message after context acknowledgement. Ordinary spoken requests (for example “What did I do wrong?”) use the supplied context without injecting another user turn. Draft typing alone is not a submission. Unsupported input can be shared as explicitly unverified structured text, never as a verified correction.

The provider-independent `VoiceSession.updateContext(context): Promise<boolean>` stores context while idle and awaits provider acknowledgement while connected. Context contains a bounded problem, revision ID, optional structured submission and local result/guiding hint. `VoiceSnapshot.context` reports stored/pending/applied/failed and a sanitized failure code; development controls display only its status and revision ID. The existing `sendText(message): boolean` remains the explicit response-triggering path. Neither operation starts a microphone automatically.

Deepgram's initial `agent.think.prompt` contains the base tutoring policy and one current-work block. For live changes, `updateThink()` sends the same managed model/provider with a complete replacement prompt and waits for `think-updated` (`ThinkUpdated`). `updatePrompt()` is deliberately not used: official documentation says it appends rather than replaces. Initial `agent.context.messages` supplies conversation history, not a revision-aware work slot. `injectUserMessage()` generates a response, so it is used only for the explicit hint button, never silent context synchronization. No transcript history is synthesized or replayed on restart.

Feedback is revision/source/input scoped. Edits, clear and worksheet/source changes invalidate both displayed evidence and the voice submission. The active problem starts as `7(6k + 2)`; changing it requires Set problem or explicit adoption of a proposed problem from a submitted equation. The uploaded worksheet is still only a local image/PDF; Newton cannot extract its problem. To work on another worksheet problem, set it explicitly or submit its expression and step as an equality and adopt the proposed problem. A cleared submission instructs voice not to reuse earlier steps from conversation history.

Idle context changes pause audio forwarding until acknowledgement (maximum five seconds); no buffered microphone frames are replayed. New speech or output racing an update, delivery failures, or edits while a turn is pending/playing close the connection and show restart guidance. This is conservative because binary audio has no server response/revision IDs. Start again uses only the latest stored context. Edits arriving during an idle update are coalesced behind its acknowledgement, with no concurrent context requests. Successful idle replacements preserve the connection; the context remains in the prompt across subsequent spoken turns. Closing the panel preserves voice; navigation/pagehide stops it. Natural/manual interruption and existing audio-drain/stale-response guards remain in place.

Checks are transient client-side assistance, not persistence-authorizing learning evidence. Recognition output, checks, audio, transcripts and learning events are not logged or persisted by tutoring. The workspace separately saves source drawings, worksheets and structured drafts in account-scoped device-local IndexedDB. A future server path must recompute/validate work, and C must enforce identity, ownership and evidence eligibility before writing memory. No worksheet sharing, model-based grading, proactive controller, general verification tool, or persistent tutoring history is claimed.

## Manual demo

1. Use Node 22, `npm ci`, and `npm run dev`. At `/study`, choose Structured input and enter `7(6k+2)=42k+2`. Open Newton, Check work, then Ask for a hint. Expect non-equivalence and a question about `7 × 2`, without the full expansion being supplied.
2. Edit to `7(6k+2)=42k+14`. Old feedback disappears; checking reports correct equivalence. Also try `14+42k`, `3(2x+5)=6x+5`, a power, and whiteboard-selected work. The different problem must get its own factors; unsupported work must say Not checked. Worksheet viewing, drawing, snapshots, appearance and clear remain available.
3. Stop this checkout's ordinary dev server, set server-only `DEEPGRAM_API_KEY` in `.env.local`, then run `npm run voice:dev`. Open the printed loopback address at `/dev/study`. Enter the incorrect step, open Newton, Start voice, grant microphone permission, and wait for listening. The practice ID is explicitly local testing, not C-owned authorization.
4. Click Check work and wait for Context: applied. Say “Newton, can you give me a hint?” without clicking Ask for a hint: expect guidance about multiplying the constant by seven, without a claim of handwriting recognition. Also say “What did I do wrong?” and then test Ask for a hint as a separate turn. Listen and interrupt naturally. Close/reopen the panel without starting another connection. Edit during a spoken hint: voice should end and feedback disappear. Start again explicitly. End or navigate away and confirm physical microphone release. Missing credits/key, permission denial and network failure must remain recoverable without losing work. Observe the existing five-starts-per-ten-minute limit.
5. Ctrl+C cleans both generated pages. Public `/study` must still have voice disabled even on the local harness server; deployed/preview issuance remains fail-closed.

## Automated validation boundaries

Unit tests cover exact/unsupported mathematics, targeted hints, bounded context, SDK delivery, duplicate guards, errors and cleanup. Playwright uses the real workspace/MathLive at desktop and 360px widths. Its explicit `NEWTON_TEST_DEV_STUDY=1` cases run against `NEWTON_TEST_URL` with mocked credentials/Deepgram WebSocket and a synthetic microphone. These establish browser wiring, not live model behavior, audible human speech or acoustic stability; no billable service calls are required. Playwright's default server is `npm run dev`, so ordinary owned-session voice cases (mocked token and Deepgram socket) run by default. When `NEWTON_TEST_URL` points at an existing server, set `NEWTON_TEST_SERVER_MODE=development` or `production`; production mode asserts that Start voice stays disabled and skips only the development voice-connection cases. To also run the isolated harness cases, use a separate loopback `voice:dev` server with `NEWTON_TEST_DEV_STUDY=1`. Tests intercept token, transcription, auth/session and Deepgram WebSocket boundaries; no provider key is needed for these mocked checks.

## Context-delivery references and regression checks

Official APIs: [Update Think](https://developers.deepgram.com/docs/voice-agent-update-think), [Update Prompt](https://developers.deepgram.com/docs/voice-agent-update-prompt), [Inject User](https://developers.deepgram.com/docs/voice-agent-inject-user-message), [initial History](https://developers.deepgram.com/docs/voice-agent-history), and [browser JavaScript SDK](https://developers.deepgram.com/docs/browser-agent-javascript). Installed `@deepgram/agents` 0.2.0 exposes `updateThink` and `think-updated`; its runtime update storage keeps the latest update of each type. Automatic reconnection remains disabled.

The original missing-context cause was reproducible from the data flow: Check work only set component state, the initial prompt had no workspace data, and only the explicit hint button called sendText/injectUserMessage. The button path did include the correct problem/step/result; ordinary microphone turns had no such delivery. Mocked tests now inspect actual SDK configuration and browser WebSocket payloads for both paths, including acknowledgement gating, clearing revisions, retries, failed updates, and no duplicate injection. These tests prove delivery/lifecycle wiring, not the quality of a live model's hint. Real microphone/model behavior still requires the manual test above.

## Handwriting transcription

Explicit handwriting reads: Read handwriting exports the current whiteboard PNG once, `POST /api/work/transcribe` (verified Supabase user, same origin, bounded PNG, per-user limit) asks a free-tier vision model to copy the work, the student reviews/edits and confirms the transcription, and only then the existing deterministic checker, hints and voice context use it. See [ADR 023](decisions.md#2026-11-14--adr-023-student-confirmed-handwriting-transcription) and the [architecture](architecture.md#implemented-handwriting-transcription-developer-a-integrated-with-b).

Configure one free-tier key in the ignored `.env.local`: `GROQ_API_KEY` (preferred, Qwen vision) or `GEMINI_API_KEY` (Gemma 4). Supabase settings and a signed-in account are also required. Without a key the route returns 503 and the panel says recognition is not configured; structured input keeps working.

Manual demo: sign in, open `/study`, set the active problem to `4(x+3)` in the Newton panel, write `4(x+3)=4x+3` on the whiteboard and choose Read handwriting. Confirm the transcription matches, including the error, then Check work and Ask for a hint: expect "Check your expansion" and a question about `4 × (3)` without the corrected expansion. Edit the board and confirm the transcription disappears. Try `4x+12` (standalone), `-4(x+3)=-4x+-12` (offered as a new active problem), unclear writing (`?` must be resolved), and blank or illegible work.

Automated coverage: Vitest uses mocked provider HTTP for accurate, incorrect, ambiguous, unreadable and malformed output, volunteered answers, missing keys, timeouts, rate limits and route validation/auth. Playwright drives the real Excalidraw export, review UI and checker at desktop and 360px with a mocked transcription endpoint, including stale responses. `npm run test:vision` is the only real-model check; it renders the three proof-of-concept equations in Excalidraw's handwriting font and is skipped without a key.

## Multiline handwriting format investigation (2026-11-14)

A bounded live probe using the developer's original two-line Excalidraw PNG reproduced the 502: Groq HTTP 200, finish reason `stop`, valid JSON, `status: transcribed`, a multiline string, then Newton's `invalid-response` at `model-math-format`. The safe probe retained only format metadata, not model text; the exact rejected symbols/prose cannot be reconstructed. No claim is made that Markdown, LaTeX, or line breaks alone caused this particular rejection. Plain JSON-string line breaks were already accepted. The original image was inspected as complete, and the export code includes all scene elements with padding rather than cropping to the viewport.

The prompt now explicitly requests one text string for a continued equation, including an existing equals sign on the second line, preserving incorrect work. Within the JSON text field, presentation-only normalization supports whole math fences/delimiters, paired aligned environments, existing multiplication/division commands and line continuations at explicit operator boundaries. It never inserts an equals sign, merges split numbers, extracts math from explanatory text, or repairs a student's arithmetic. Unconnected lines, extra equations, prose, unknown commands and malformed output remain rejected. Student confirmation and revision invalidation remain required.

Development error responses include a fixed `error.diagnostic` category: `provider-json`, `provider-shape`, `provider-size`, `provider-truncated`, `model-json`, `model-shape`, `model-size`, or `model-math-format`. These distinguish upstream HTTP failures (`upstream-unavailable`) from invalid content following a successful upstream response. Production responses omit diagnostics. No image, transcript, provider body, private work or key is logged. Rate limits remain 429 with Retry-After and there are no automatic provider retries.

Tests cover mocked successful Groq output for `7(6k+2)` followed by `=42k+2`, normalized to `7(6k+2)=42k+2`, with the deterministic missed-term hint about `7 × 2`. Browser regression draws two lines with actual Excalidraw freedraw pointer strokes and exercises PNG export, review, confirmation and checking with a mocked transcription endpoint. These are synthetic strokes, not a live model test. Correct/negative/standalone/ambiguous/stale cases remain covered. The diagnostic reproduced the pre-fix failure; subsequent developer-performed authenticated browser acceptance succeeded as recorded below.

### Symbol recognition reliability

The developer's post-format-fix authenticated browser test reached confirmation but read adjacent digit/letter strokes as `b`. That is a visual-recognition error, not a parser rejection. Syntax checks cannot distinguish a genuine `b` from a confident model misread; never replace it using the active problem or an expected solution.

Handwriting reads now render directly from the original Excalidraw scene at up to 2× scene resolution, proportionally capped at 2048 pixels on either side and still limited to 2 MiB. Ordinary snapshot exports retain their existing size. The installed SDK's `maxWidthOrHeight` is a cap, not a request to enlarge small scenes: it previously left a 445×334 drawing at 1×. The handwriting path instead supplies `getDimensions` without that overriding option. No raster upscaling, thresholding, sharpening, line segmentation or symbol replacement is applied. These filters could change the small strokes that distinguish adjacent symbols; extra image requests would also consume quota.

The prompt asks for a visual symbol-boundary recheck and `?` for uncertain touching groups, without preferring `6k` over a genuine `b` or supplying the target equation/answer as a visual template. The existing review field remains mandatory and editable; unresolved `?` blocks confirmation. A student can correct a misread transcription while retaining incorrect mathematical work for the checker.

Automated tests verify export dimensions with actual Excalidraw freedraw strokes, unchanged misread output, explicit student edits, ambiguity, negative signs, standalone expressions and stale-result protection. These are local/mocked checks. Codex made no new live provider calls for the reliability change. The developer subsequently verified the complete real-handwriting flow; that single successful example does not establish a general accuracy improvement or quantify the contribution of scaling versus prompting. Vector rerendering provides more pixels but cannot resolve inherently ambiguous or touching handwriting by itself.


## Verified live handwriting acceptance — 2026-11-14

**Performed by the developer in an authenticated Newton browser session; reported to Codex.** Genuine Excalidraw handwriting spanning two lines (`7(6k+2)` then `=42k+2`) was correctly transcribed by Groq as `7(6k+2)=42k+2` after the format, export-resolution and visual-prompt changes. The incorrect constant was preserved, the confirmation screen appeared without the previous 502, and after explicit student confirmation the deterministic checker identified the incorrect expansion and supplied the targeted hint about multiplying 7 by 2. No private screenshot or provider response is committed. This verifies this one manual journey, not arbitrary handwriting accuracy, Gemini, performance under load, or voice-session authorization.

**Automated coverage is separate.** Vitest mocks provider HTTP/auth; Playwright draws synthetic pointer strokes using real Excalidraw export but mocks transcription and voice transport. It verifies image dimensions, editing/confirmation, ambiguity, error/rate-limit fallback, active-problem selection, source-switch cancellation and stale-result suppression. `npm run test:vision` uses real provider calls for rendered handwriting-font fixtures and is opt-in; it is not the genuine freehand browser acceptance above. Do not run it as part of default validation or as an unbounded retry loop.

**Voice integration boundary.** This feature changes only the provenance of submitted text (`confirmed_handwriting`) and its use by the existing checker/context interface. Voice transport, microphone/playback lifecycle, token issuance and Supabase authorization are outside this PR. Main's token authorization and owned-workspace/session changes are now integrated. Signed-in local `/study` uses the real owned UUID; the separate harness retains its demo ID. Account-scoped drawing persistence coexists with transient recognition; no voice transport or server authorization policy was replaced. The live handwriting test does not establish authenticated voice readiness.

**Known limits.** VLMs can confidently misread symbols; confirmation stays mandatory. The checker supports bounded single-variable linear expansion, not general algebra or equation solving. Images are bounded to 2048 pixels per side and 2 MiB. The per-user limiter is process-local; provider free-tier quotas can still return 429. `Retry-After` is returned, but the client does not enforce a cooldown. Recognized text is not persisted; proactive intervention and recognition of uploaded worksheets remain unimplemented.

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

## Integration acceptance after merging main

Device-local persisted drawings restore before recognition and remain unchanged by Read handwriting, confirmation and checking. Recognition drafts/results and active tutor feedback are not persisted. An unavailable initial sign-in check leaves the guest board usable with an error/retry state and voice disabled. Account teardown cancels pending reads and clears confirmed work before logout; successful logout or a changed identity remounts the workspace. Switching back restores only that account's drawing, never its old transcription or voice context. Main's drawing load/save and worksheet behavior are retained. On small screens the work/drawing controls reserve space beside the fixed tutor launcher, avoiding overlaps introduced by account status and the extra handwriting action. WebKit Blob/File persistence requires a persistent profile in this local test build; ephemeral-profile errors are a test environment limitation, not evidence of successful Safari persistence. Combined automated evidence and remaining live checks are recorded in the PR; no live Groq or Deepgram calls are part of this merge validation.

Final integration validation on 2026-11-14: ESLint, TypeScript, all 530 unit tests (34 files), and the credential-free webpack production build passed. The complete Chromium desktop/360px suite passed all 86 cases in a serial run, including the owned-session and isolated harness voice cases. Additional desktop/iPad WebKit checks passed 38 cases using fresh persistent profiles; two opt-in voice cases were skipped there and covered in Chromium. WebKit checks reused the committed scenarios through a temporary local persistent-profile fixture. Earlier parallel runs had loading/audio-drain timeouts; final serial validation had no failures. These are mocked provider/auth/transport checks, not post-merge live model, acoustic or physical iPad acceptance. No live provider calls were made.

This final validation includes main through PR #17 (`b7766c2`), preserving draggable/dockable Newton, gaze, reduced-motion celebrations and confirmed-handwriting checking together. The explicit correct Check work path celebrates once for a confirmed handwritten submission; unread drafts and hint requests do not.

## Live acceptance and reliability fixes — 2026-11-14 (fix/live-handwriting-voice)

### Live manual observations

Performed by the developer in the authenticated local `/study` workspace with real providers; reported, not automated.

- Signed in with Google and started an owned study session.
- Wrote `42k+2` with genuine Excalidraw freehand strokes and chose Read handwriting. Groq (`qwen/qwen3.8-27b`) returned `42k+2` exactly, with no `?` markers. The review showed the captured drawing beside the text.
- After confirmation the expression normalized to `42*k+2`. With the active problem `7(6k + 2)`, Check work reported an incorrect expansion and Ask for a hint gave the targeted question about multiplying 7 by 2 without revealing the answer.
- Authenticated Deepgram voice started with the owned session and answered questions about the submitted work, including several follow-ups with numbers and expressions. The earlier stray spoken letters (for example "v") did not recur in this session.

This is one successful journey. It does not establish general handwriting accuracy, two-line equation reliability, deployed voice readiness or acoustic stability.

### Voice: what changed and what is still unknown

- **Confirmed gap, fixed:** the tutoring prompt had no rules for speech output, while Deepgram documents that its TTS reads characters literally. The tutor instructions now require plain spoken sentences with mathematics in words, and the current-work context and hint request say the same. The context still carries written notation such as `7*(6*k+2)` and `7 × (2)`.
- **Not established:** the cause of the earlier stray letters. The prompt change, model variability or TTS behavior could each explain the earlier sound and its absence in one session. Treat a recurrence as an open defect.
- **Development-only diagnostics** (`npm run voice:dev`, `/dev/voice`): fixed category counts of possible speech hazards in assistant text (markdown, latex, math or operator symbols, emoji, stray letter at a sentence end), with no text retained; two TTS-only probes that bypass the model; and a fixed synthetic checked step for comparing responses with and without math context. Ordinary `/study` and production builds do not classify text or expose probes.

### Handwriting review layout

The review places the exact image read beside the editable transcription, with Confirm transcription and Read again directly under the field, so all four are visible together at laptop, small-laptop, iPad-portrait and phone widths. Only very small screens (about 320×568) scroll, and then only inside the review, which brings Confirm into view automatically; the page and Newton panel are not moved or covered. Enter in the field still confirms. Automated layout checks use real Excalidraw strokes with a mocked transcription.

### Recommended demonstration

Leave the active problem as `7(6k + 2)`, write only `42k+2` on one line, read and confirm it, then Check work, Ask for a hint and ask the voice tutor a follow-up. This shorter expression avoids the parentheses, equals sign and line continuation that make longer handwriting harder to read. Keep Structured input as the fallback, and if a symbol is misread, correcting it in the review is part of the intended design.

### Automated coverage versus remaining limits

Automated tests (mocked providers): speech-hazard classification and prompt policy; development-only diagnostics and agent-message probes; the exact read image and its development-only download; correction of a misread without silent repair; the single-line demo verdict and hint; and the responsive review layout. No provider was called by automated tests.

Remaining limits: VLMs can still misread symbols, so confirmation stays mandatory; only one live handwriting journey and one voice session are recorded; voice remains local-development only; the stray-letter cause is unconfirmed.
