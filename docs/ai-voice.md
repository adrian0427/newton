# A01 Deepgram voice foundation

A1 now uses Deepgram Voice Agent because OpenAI API credits are unavailable. The voice provider changed; developer ownership, UI lifecycle interface, shared tutoring types, Socratic instruction, and future math/memory boundaries remain intact. The developer has confirmed live browser speech recognition, mathematical responses, and audible playback after the audio-discard fix. The turn-taking changes below still require new manual acoustic acceptance. Earlier server-side probes established managed text/audio transport independently of browser capture or playback.

## Selected SDK and managed services

Official core Browser Agent SDK: `@deepgram/agents` 0.2.0. Its framework-neutral `AgentSession`, `AgentMicrophone`, and `AgentPlayer` fit the existing adapter without coupling Developer B's UI to provider hooks. It is pre-1.0, so the lockfile and mock tests matter when upgrading.

- Listen: Deepgram Nova-3, PCM linear16 at 16 kHz.
- Think: managed `open_ai` / `gpt-4o-mini`, listed in Deepgram's Standard tier.
- Speak: Deepgram `aura-2-thalia-en`, PCM linear16 at 24 kHz.

There is no BYO endpoint and no `OPENAI_API_KEY` requirement. Billing/access comes from the Deepgram project. Trial credits and model availability must be checked on that account. Deepgram-managed OpenAI usage does **not** automatically establish OpenAI Challenge or other hackathon-track eligibility; confirm organizer rules separately.

Official references: [Browser Agent SDK](https://developers.deepgram.com/docs/browser-agent-javascript), [token authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication), and [managed model list](https://developers.deepgram.com/docs/voice-agent-llm-models).

## Local setup and manual acceptance

1. Use Node 22.14+, run `npm ci`, and copy `.env.example` to `.env.local` if needed. Set `DEEPGRAM_API_KEY` only in the server environment. The key needs at least Member permissions for `/auth/grant` plus a project with Voice Agent access and credits. Do not paste keys into the app or chat.
2. Run `npm run voice:dev`. It generates an ignored `/dev/voice` route, starts Next.js bound to `127.0.0.1`, and creates a random per-run capability in the server process. Open the printed loopback URL with `/dev/voice` appended. No second terminal or token-pasting step is needed.
3. Click **Start Conversation**, grant microphone permission, and speak: “Can you help me understand the distributive property?” The server mints a 30-second JWT on demand. The wrapper waits for `SettingsApplied` before starting the microphone.
4. Speak over Newton during playback, then continue the conversation. Deepgram detects the new speech; the wrapper calls SDK `player.interrupt()` and drops the interrupted turn's remaining audio. The optional **Interrupt playback** button also silences/drops the current playback turn; it does not claim to cancel server-side LLM/TTS generation. Speak to naturally change the conversational turn.
5. Click **End Conversation**. Check that the browser microphone indicator turns off. Restart, deny microphone permission, stop during pending permission/connection, navigate away, and disconnect the network. Each retry is explicit and obtains a fresh token; auto-reconnect is disabled.
6. Inspect network responses: permanent keys must never appear; only temporary bearer credentials should reach the browser. Do not save or screenshot credentials. The local server permits five issuance attempts per ten minutes; provider errors count toward that limit.
7. Stop with Ctrl+C. The generated route and stale Next route-type artifacts are removed. After a crash, use `npm run voice:dev -- --clean`. A leftover route is still guarded against production, preview, CI, and nonlocal hosts. Do not expose this server through public tunnels.

Use a modern browser with microphone/Web Audio/AudioWorklet and WebSocket support, preferably headphones. SDK playback state is an indication, not proof that audio reached the speaker. Live voice, natural interruption, audible playback, and physical microphone cleanup must be recorded as manual results; mocks cannot establish them.

## Diagnosing a session that stays listening

Restart `npm run voice:dev` after updating the code, open the printed loopback address at `/dev/voice`, then click **Start Conversation**. Verify the browser's selected microphone and permission. The local-only **Pipeline checkpoints** panel displays SDK connection, Welcome/SettingsApplied, microphone startup/mute/input level, captured/forwarded frame and byte counts, speech detections, user/agent transcript counts, thinking events, received/dropped agent audio, player mute/volume/output level, queued playback seconds, injections, and sanitized error/warning codes. Counters reset on Start and remain visible after End; timers stop during cleanup. Codes are allowlisted or fixed labels; provider descriptions, identifiers, credentials, raw audio, and transcript content are never displayed or logged by these diagnostics.

1. Wait until **Welcome / SettingsApplied** are both `true`. Microphone status `capturing` means the SDK startup promise resolved, not proof of frames or usable speech. Speak for a few seconds, then pause. **Frames captured / forwarded** should both rise. `NO_CAPTURED_FRAMES` appears after three seconds of successful startup without a frame callback; `CAPTURE_STALLED` means frames arrived and then stopped for three seconds while the SDK was unmuted. Inspect browser/OS microphone selection, permission, device mute, and Web Audio capture. The mute value is the SDK's mute flag, not a physical-device status. Input RMS is a scalar computed from the captured linear16 frame; sample data is not retained.
2. Once SettingsApplied is true, click **Inject test question** while Newton is idle. This calls the SDK's documented `injectUserMessage("Can you explain the distributive property?")`. It bypasses microphone capture/STT, while using the same managed agent and playback path. Do not speak during this isolation test. The button is disabled before settings, during reported agent thinking/speech, and after cleanup; an `INJECTION_REFUSED` code means the server declined it, not that the LLM failed.
3. Use the table below to locate the first missing checkpoint. Try speech and injected text separately, then End, restart, interrupt naturally, and check the physical microphone indicator. Forwarded counts mean `sendAudio()` was called without throwing; they are not a server acknowledgment. Received/queued audio and nonzero output levels are not proof of audible sound. A missing `agent-thinking` event alone does not prove LLM failure if text/audio arrive.

| Observed checkpoints | Investigation |
| --- | --- |
| No Welcome or SettingsApplied | Connection/settings failure; inspect sanitized SDK/provider codes |
| Captured frames rise but forwarded frames do not | Adapter forwarding/settings/connection; `AUDIO_FORWARD_FAILED` marks a thrown send |
| Forwarded frames rise, input level stays zero, no speech/transcripts | Wrong/silent input or capture graph; check device/browser/OS, configured PCM format, and SDK mute |
| Forwarded frames and input level rise, but no user speech/transcripts; injected text responds | Audio transport/STT/turn detection; inspect `USER_AUDIO_FORMAT`, `ASR_DRIVER_TIMEOUT`, and listen-related codes |
| User transcript or injected question arrives but no agent text | Managed response path; inspect `THINK_REQUEST_FAILED`, `SLOW_THINK_REQUEST`, or `FAILED_TO_THINK` |
| Agent text arrives but no audio | TTS path; inspect `SPEAK_REQUEST_FAILED`, `SLOW_SPEAK_REQUEST`, or `FAILED_TO_SPEAK` |
| Agent audio arrives but guard drops rise | Check whether a response was actually interrupted; the fixed adapter resumes on new user/assistant messages without requiring `agent-started-speaking` |
| Audio is queued but inaudible | Browser/tab/OS output mute, selected speaker, SDK player volume/mute, or suspended AudioContext; compare queued seconds and output level |

The configured rates agree: capture/input are linear16 at 16 kHz; output/player are linear16 at 24 kHz. Capture is never muted automatically during playback; the local diagnostic mute control requires an explicit click. Errors already stopped the lifecycle but had only generic UI messages; warnings were previously unobserved. The diagnostics now expose allowlisted warning/error codes and classify capture/forwarding/playback failures without forwarding raw error text. Unknown provider codes become generic labels. A verified playback-state defect was fixed: the old wall-clock timeout could report listening while a suspended audio clock still had queued output. Playback completion now rechecks the SDK queue until it drains, and stop/interruption cancels that check. This makes playback state accurate; it does not itself bypass browser autoplay restrictions or establish the reported silence's root cause. No provider-independent lifecycle interface or authentication guard changed.

Diagnostic evidence from this investigation: a short server-side SDK probe using the configured managed model received Welcome, SettingsApplied, an injected user turn, four agent text events, and 884 PCM chunks (848,640 bytes) before the bounded 18-second probe ended. A second live probe streamed 165 frames of synthetic speech/silence at the configured input format and received a speech-detection event, a user transcript event, an agent text event, and 10 output audio chunks (9,600 bytes) before stopping. This verifies responding managed text and speech-input paths for those runs, not the physical browser microphone, audible playback, or complete response termination. An isolated Chrome synthetic audio-graph probe produced callbacks both without and with a destination connection; a missing destination is therefore not a confirmed explanation and the SDK capture graph was not patched. The reported browser's physical microphone/STT/playback path still needs the checkpoints above.

Official references: [SDK methods and event names](https://developers.deepgram.com/docs/browser-agent-javascript), [Voice Agent message flow](https://developers.deepgram.com/docs/voice-agent-message-flow), and [error/warning codes](https://developers.deepgram.com/docs/voice-agent-errors-warnings). Diagnostics and the fixed text injection callback are enabled only for development; production renders no harness UI, and the existing loopback/capability/preview credential restrictions remain in place.

## Confirmed audio-discard defect — 2026-11-14

The developer's active browser session received and discarded all 1,278 audio chunks despite five assistant text events, an empty playback queue, player mute off, and no errors. The application rejected these chunks **before** `AgentPlayer.queue()`. The old `user-started-speaking` handler set `dropCurrentTurn = true` even while idle; only `agent-started-speaking` cleared it. Assistant text could not reopen playback. An idle ambient-speech detection therefore suppressed later responses indefinitely. Mock reproductions failed before the fix and pass afterward.

Idle detection now leaves future playback enabled. Real pending responses, streaming audio, and queued playback still yield immediately to user speech/manual interruption. After a real interruption, trailing audio stays blocked until the ordered stream acknowledges new user `conversation-text`, followed by assistant text or an optional started-speaking marker. Late old metadata alone cannot reopen playback. No timeout releases the guard. `agent-audio-done` drains rather than flushes the player and does not release suppression. Cleanup removes listeners, flushes/disposes playback, and ignores late callbacks. The interface, PCM formats, model configuration, and auth guards are unchanged.

Binary PCM has no response ID; this relies on ordered protocol messages, not invented per-chunk generation IDs. See [ConversationText](https://developers.deepgram.com/docs/voice-agent-conversation-text), [UserStartedSpeaking](https://developers.deepgram.com/docs/voice-agent-user-started-speaking), and [AgentAudioDone](https://developers.deepgram.com/docs/voice-agent-agent-audio-done).

The panel separates received chunks, successful unmuted queue calls, interrupted-response guard drops, muted queue calls, queue errors, suppression state, started-speaking events, response interruptions, and cleanup flushes. SDK flushes are call counts: the SDK does not expose how many buffered chunks they discard. They are not application guard drops. Late post-close callbacks are ignored without publishing stale diagnostics. No public AudioContext-state getter exists in the installed SDK; private fields are not accessed.

**Post-fix manual acceptance:**

1. Restart `npm run voice:dev`, open `/dev/voice` at the printed loopback address, and start a fresh session. With headphones and quiet input, stay silent and inject one question after SettingsApplied. Before ending, received and queued-unmuted counts should rise, suppression should remain false without an actual interruption, and guard drops should stay zero. Playback must work even if started-speaking events remain zero.
2. Ask a spoken question, then speak over Newton's response. Playback should stop; trailing interrupted audio may increase guard drops. Finish the new question and verify its response plays without restarting.
3. Try manual interruption followed by another spoken or injected question. Old audio must remain silent; the new response must queue and play. End/restart and verify microphone release, one cleanup flush, and no replay of old audio.
4. If queued counts rise but sound remains absent, inspect browser/tab/OS output and AudioContext restrictions separately. If active received/dropped counts match again, report suppression state, transcript counts, started-speaking events, and interruption counts without transcript/audio content or credentials.

Regression tests cover normal/injected responses without started-speaking events, idle noise, natural/manual interruption, subsequent responses, stale audio/metadata, pending-TTS interruption, muted accounting, queue drain, and cleanup. Audible browser playback and acoustic interruption after this fix remain manual acceptance checks; mocks do not verify them.

## Conversational tutoring scope and manual behavior checks

Voice conversation can cover broad high-school and introductory college mathematics. The distributive-property MVP limits automated work analysis and proactive intervention, not the student's conversational topics. General explanations are not tool-verified work and do not create verified learning-memory events. Whiteboard vision, verification tools, and persistent learning history remain unavailable in A1.

After updating the prompt, end any existing conversation and start a fresh one with `npm run voice:dev` at `/dev/voice`. Ask these in sequence to check natural topic changes:

| Question | Expected behavior |
| --- | --- |
| "Can you explain the distributive property?" | A clear explanation or example of multiplying across parentheses; a useful guiding question if appropriate |
| "How do quadratic equations work?" | Relevant tutoring about squared terms, parabolas, or ways to solve quadratics, adjusted to the student's level |
| "What is a derivative?" | An accessible explanation of instantaneous rate of change or tangent slope, with a concrete example |
| "Can you explain the Pythagorean theorem?" | Explain the relationship between sides of a right triangle, such as a 3-4-5 example |

For each, verify concise, relevant tutoring without redirecting to the distributive property, repeating specialization disclaimers, or forcing a question into every answer. Follow up with an ambiguous question to check clarification, and ask whether Newton can see the board or recall an earlier session to check honest limits. It must not claim tool verification, saved observations, or mastery from this conversation. Prompt-policy assertions and mocked SDK prompt-delivery tests do not establish actual model behavior or mathematical accuracy; these live behavior checks remain manual acceptance work.

## Credential security

`POST /api/realtime/token` retains its established path. The server exchanges `DEEPGRAM_API_KEY` for a JWT at `https://api.deepgram.com/v1/auth/grant` using `Authorization: Token ...` and `ttl_seconds: 30`. It returns only `{ clientSecret, expiresAt }` with `Cache-Control: no-store`; `clientSecret` is the existing neutral transport field containing a temporary bearer token. The SDK receives it through `auth.tokenFactory`, never `auth.apiKey`.

Issuance requires local development, no preview/CI environment markers, a loopback Host, exact same-origin POST, a small validated session body and a process-local issuance limit. Ordinary authenticated local requests verify identity and session ownership. The separate harness instead requires its random per-run capability; ordinary `npm run dev` does not generate that capability. The capability is intentionally delivered only to the guarded loopback page and is not a Deepgram API key or a deployed authentication mechanism. Production/preview restrictions apply even when an API key and capability are configured.

The issuer validates temporary JWT shape/TTL, enforces a 15-second request timeout, and never logs or forwards provider error bodies. A 30-second token lifetime limits opening a connection, not the duration/cost of an established session. Temporary Deepgram grants cover multiple inference APIs and do not lock the browser to one model; keep them private and short-lived. No auth-grant functionality is exposed publicly.

No application audio/transcript persistence or transcript logging is added. The SDK retains transient conversation history; cleanup clears it. Provider-side processing/retention follows Deepgram's project settings and policies and must be reviewed before real-student use.

## Interface for Developer B

```ts
const voice = createVoiceSession({ createConnection: createSdkVoiceConnection });
const unsubscribe = voice.subscribe(() => render(voice.getSnapshot()));
await voice.start({ sessionId });
voice.interrupt();
await voice.stop();
unsubscribe();
```

Import these factories from `src/lib/ai/voice-session.ts` and `src/lib/ai/sdk-voice-connection.ts`. In React, use `useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getSnapshot)`. Instantiate once; stop/unsubscribe on unmount/pagehide and identity/session changes. Connected states remain `listening`, `speaking`, and `interrupted`; other states are `idle`, `connecting`, `stopping`, `error`, and reserved `unavailable`. `start` rejects with a sanitized error on failure and resolves when intentionally cancelled. Stop before changing study sessions.

B's default credential provider has no local capability; authenticated local `/study` uses it with the owned session UUID. Only the diagnostic harness injects the local request header. B does not need to import any Deepgram types or rebuild its controls when another provider is selected.

The lifecycle coalesces starts, bounds connection setup, ignores stale attempts/events, closes late factory results, and cancels pending waits. The Deepgram wrapper releases SDK microphone, playback contexts, socket, timers, listeners, and transient history. A pending browser permission prompt cannot be dismissed programmatically; its late stream is stopped when SDK startup settles.

## Turn-taking stability investigation

The installed `@deepgram/agents` 0.2.0 queues each supplied PCM chunk once and flushes its AudioContext on `player.interrupt()`. Core session events do not automatically interrupt the player; Newton's speech-event handler does. Startup is single-flight, subscriptions are registered once per connection, and automatic reconnection is disabled. Assistant text can contain multiple segments of one explanation; transcript/event counts alone do not establish duplicate questions or duplicate model responses. Binary audio has no response IDs, so local stream numbers cannot prove which server generation a chunk belongs to.

Three defects were reproduced with SDK mocks before correction:

- Assistant metadata arriving after `agent-audio-done` cleared the scheduled queue-drain check. Audio could finish while the UI remained speaking. Metadata no longer cancels this check; actual new audio, interruption, and cleanup still invalidate it. Repeated done markers do not publish duplicate playback completions or replay audio. An empty utterance can also produce a repeated-marker indicator, so it is not automatically discarded.
- Rapid diagnostic question clicks could call `injectUserMessage()` repeatedly before React or the provider reported thinking. A synchronous in-flight guard now blocks duplicate injection until playback drains, refusal/failure, interruption, or cleanup. It does not retry automatically; End/Start recovers a probe that never receives a response or failure.
- Retained non-audio callbacks from a closed connection could still publish obsolete diagnostics after restart. All SDK event handlers now ignore closed connections. Audio already had this guard. Cleanup remains idempotent and releases listeners, microphone, playback, socket, timers, and temporary history.

These fixes do **not** establish the physical cause of the reported cutoffs/repeated explanations. Echo or background speech triggering `user-started-speaking` remains a hypothesis. Capture already requests browser echo cancellation and noise suppression; no new VAD, audio thresholds, transcript-based delay, automatic microphone muting, or provider configuration changes were added. Natural speech interrupts immediately, including while TTS is pending or browser audio remains queued. Manual interruption and cleanup are counted separately. The client cannot infer student intent from this event; it must not ignore genuine barge-in to hide false detections. See Deepgram's [speech-event contract](https://developers.deepgram.com/docs/voice-agent-user-started-speaking), [audio-done/playback distinction](https://developers.deepgram.com/docs/voice-agent-agent-audio-done), and [echo/barge-in guidance](https://developers.deepgram.com/voice-agent/optimize/audio-preprocessing-barge-in).

The local panel adds speech-during-queued-playback and repeated-speech-before-user-text counters; speech/manual/cleanup interruption counts; local audio stream starts; server audio-done versus browser queue-drain completions; repeated done indicators; connected/reconnecting/unexpected-disconnect counts; pending/blocked injections; and the last 40 timestamped events. Trace rows include only an event label, sequence, elapsed milliseconds, local stream number, input/output levels, and queued seconds. Queue depth is seconds from the SDK, not a fabricated buffered-chunk count. Input levels reflect the most recent captured frame, not proof of intentional speech. No transcript content, raw audio, credentials, provider error descriptions, or server identifiers are recorded. Production/preview credential guards and the provider-neutral interface are unchanged.

**Manual acoustic acceptance for this change (not yet performed):**

1. Restart `npm run voice:dev`, open the printed loopback URL at `/dev/voice`, and use headphones first. Start once, wait for SettingsApplied and capturing, and expand **Recent event trace**. Ask “How do quadratic equations work?” Stay silent through the full response. Expected: no speech interruption, queued seconds eventually zero, a `playback-complete` event after `server-audio-done`, and listening state. Multiple text segments are normal; audio stream counts describe local utterance streams, not complete explanations.
2. Ask a second question, then say “Wait, explain that more simply” during playback. Expected: `user-speech` then `speech-interrupt` immediately; old audio stays suppressed; the acknowledged new question/response restores playback. Try **Interrupt playback** separately and ask another question. Its cause must be `manual-interrupt`, without reconnecting or replaying old audio.
3. While idle, click **Mute microphone (isolate feedback)** and inject the fixed question once. Try a rapid second click: at most one injection is sent while pending. The SDK keeps the microphone device open but suppresses new frame callbacks; captured/forwarded counts should stop rising after mute, while playback continues. Already-forwarded input may still produce delayed server events. No initial/stalled-capture warning should be caused merely by remaining muted. Unmute before testing spoken questions or natural interruption.
4. Compare a normal unmuted session using speakers with headphones and the explicitly muted injected-text run. A cutoff aligned with `speech-interrupt`, queued output, and rising input/transcript counters while the student is silent supports echo/background detection. Stable muted playback alone does not prove echo. A cutoff without an interruption suggests the stream/output/browser path; compare done events, queue depth, output level, and sanitized codes. If explanations repeat, compare user-text, injection, stream-start, and connection counts; metadata counts alone cannot establish that words or audio were duplicated.
5. End, confirm the physical microphone indicator turns off, then Start and confirm counters reset with no old audio replay. Disconnect the network during playback: expect an unexpected-disconnect event, cleanup, and error state; reconnect attempts should stay zero. Restore the network and explicitly Start for a fresh connection/token. Observe the existing five-starts-per-ten-minutes issuance limit when planning runs.

Mock regressions cover uninterrupted and subsequent responses, legitimate/manual interruption, repeated metadata/settings/done events, duplicate injection, delayed playback completion and suspended clocks, explicit microphone control, late events after close/restart, and unexpected disconnect followed by a single explicit retry. Browser audibility, actual AEC performance, natural acoustic stability, and physical microphone release still require the manual steps above.

## Structured workspace integration

The [first structured-work slice](study-tutoring.md) now provides exact local linear-expansion checks and hints in the real `/study` guidance panel. `npm run voice:dev` also generates a guarded `/dev/study` page using the same workspace and the same local issuance controls. Public `/study` receives no local capability. In local development, its signed-in workspace can now create a real study-session UUID and use the ordinary authenticated token path; the separate `/dev/study` harness retains its capability and demo ID. See [authenticated workspace sessions](study-tutoring.md#authenticated-workspace-sessions).

The additive provider-independent `VoiceSession.sendText(message): boolean` submits explicit bounded work-hint context through the existing connection's SDK `injectUserMessage()`, using the diagnostic probe's pending/duplicate guards. It does not create another session or claim provider receipt, audible playback or persisted evidence. Unsupported work is not submitted as verified context. Changing work during a pending/playing hint ends voice conservatively; closing the guidance panel does not. See the integration guide for exact scope, demo and mocked-browser versus live-test boundaries.

## Dependency on Developer C and future context

C provides verified identity and owned-study-session checks, now used by ordinary authenticated local requests. Deployment-wide abuse controls still need team agreement before enabling production/preview issuance; the capability remains only for the isolated harness. Never accept a client user ID as ownership. The local process limit is not production protection.

Future whiteboard work still flows through `WorkSnapshot` → separate vision/math validation → `WorkAnalysis` → intervention decision. The voice adapter will receive only approved current-revision context/delivery via a reviewed additive interface. C's bounded evidence-backed memory can be supplied with the base Socratic instructions through Deepgram prompt updates/context; it remains data, not privileged instructions. Confirmed handwriting now uses the existing context interface after deterministic checking; general intervention and persisted learning-memory context remain unimplemented. Existing `src/types/tutoring.ts` remains unchanged.

Next integrations: deployment-wide abuse controls before deployed voice, then general server analysis/intervention and evidence-memory paths. Local owned-session voice and student-confirmed handwriting transcription are implemented. B1 now supplies Excalidraw/MathLive and the first slice supplies a bounded local exact-rational checker and explicit voice context; neither is a server-authorized memory writer, general verification engine, or proactive controller.


### Submitted work for spoken hints

On authenticated local `/study` and the isolated `/dev/study` harness, Check work sends the current explicit structured or confirmed-handwriting submission to voice silently. Wait for **Context: applied** before asking aloud for a hint. The local-only diagnostic shows status and revision ID, never work/transcripts/tokens. Initial settings include any checked submission from before Start. The hint button awaits the same context acknowledgement, then triggers one response. See [context synchronization, invalidation and manual checks](study-tutoring.md). Edits clear old verification; if an update races a turn or fails, voice closes with a sanitized error and explicit restart guidance. Voice receives confirmed text only. Explicit Read handwriting can send the whiteboard PNG to the separate transcription service for student review; uploaded worksheet images remain local and unrecognized.

Handwriting acceptance is now distinct from voice acceptance: on 2026-11-14 the developer reported that a real authenticated browser read faithfully preserved `7(6k+2)=42k+2`, then confirmation and the deterministic checker produced the `7 × 2` hint. This does not validate authenticated voice-session wiring. See [manual handwriting evidence and mocked coverage](study-tutoring.md#verified-live-handwriting-acceptance--2026-11-14).

## C integration: authenticated local issuance

`POST /api/realtime/token` still accepts only `{ sessionId }`. On a local development server, omit `X-Newton-Voice-Dev` to use authenticated access: sign in through Google, create a session via `POST /api/study-sessions`, then submit the returned UUID. The handler calls `requireUser()` and `requireOwnedSession()` before checking provider configuration, consuming the existing issuance allowance, or requesting a Deepgram token. Anonymous requests return 401; foreign/missing sessions return the same 404; invalid UUID/ownership fields return 400. Cookie refresh/private-no-store headers survive authorization, provider and quota outcomes.

The existing generated capability remains a separate, isolated harness authorization path and accepts its demo IDs without login. Bad supplied capabilities are rejected, never silently retried as user authorization. Production, preview, CI and non-loopback issuance remain disabled even with valid login. The original process-wide five-attempts/ten-minute development limit is unchanged, not a production per-user policy.

The workspace creates owned sessions explicitly and passes their UUIDs to ordinary local voice. Public/deployed issuance stays disabled. Adrian's provider/voice code is retained. Automated tests use real auth/ownership helpers with mocked SDK/provider boundaries and prove rejected requests make no Deepgram call; no provider credits are needed.

## Speech output and artifact diagnostics — 2026-11-14

Assistant replies are spoken verbatim by Aura-2, so the tutor instructions and work context now ask for plain spoken sentences with mathematics in words. In one later live authenticated session the earlier stray letters did not recur; the original cause is not established.

For a recurrence, run `npm run voice:dev`, open `/dev/voice`, mute the microphone and use Speech artifact probes. The two TTS-only probes send fixed text as an agent message, bypassing the language model. Inject test question is a model turn without math context. Install sample checked step followed by Ask hint about sample step is a model turn with a fixed synthetic verified step. Each assistant-text trace row lists only fixed hazard categories; text, audio and transcripts are never shown, stored or logged. A sound on a TTS-only probe points to TTS or playback. A sound on a model turn whose row lists a hazard points to the model's text. A sound with no hazard listed leaves the source open.
