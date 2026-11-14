# A01 Deepgram voice foundation

A1 now uses Deepgram Voice Agent because OpenAI API credits are unavailable. The voice provider changed; developer ownership, UI lifecycle interface, shared tutoring types, Socratic instruction, and future math/memory boundaries remain intact. Live microphone/audio acceptance is pending: no Deepgram key is configured in this implementation environment.

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

## Credential security

`POST /api/realtime/token` retains its established path. The server exchanges `DEEPGRAM_API_KEY` for a JWT at `https://api.deepgram.com/v1/auth/grant` using `Authorization: Token ...` and `ttl_seconds: 30`. It returns only `{ clientSecret, expiresAt }` with `Cache-Control: no-store`; `clientSecret` is the existing neutral transport field containing a temporary bearer token. The SDK receives it through `auth.tokenFactory`, never `auth.apiKey`.

Until C's auth integration, issuance requires local development, no preview/CI environment markers, a loopback Host, exact same-origin POST, the random harness capability, a small validated session body, and a process-local issuance limit. Ordinary `npm run dev` has no generated capability and cannot mint tokens. The capability is intentionally delivered only to the guarded loopback page and is not a Deepgram API key or a deployed authentication mechanism. Production/preview restrictions apply even when an API key and capability are configured.

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

B's default credential provider has no local capability and remains unavailable until C's protected flow lands. Only the diagnostic harness injects the local request header. B does not need to import any Deepgram types or rebuild its controls when another provider is selected.

The lifecycle coalesces starts, bounds connection setup, ignores stale attempts/events, closes late factory results, and cancels pending waits. The Deepgram wrapper releases SDK microphone, playback contexts, socket, timers, listeners, and transient history. A pending browser permission prompt cannot be dismissed programmatically; its late stream is stopped when SDK startup settles.

## Dependency on Developer C and future context

C provides verified identity and owned-study-session checks plus deployment-wide abuse controls. A will wire those into the existing handler before enabling production/preview issuance; remove the local capability requirement for authenticated student requests, not the security checks. Never accept a client user ID as ownership. The local process limit is not production protection.

Future whiteboard work still flows through `WorkSnapshot` → separate vision/math validation → `WorkAnalysis` → intervention decision. The voice adapter will receive only approved current-revision context/delivery via a reviewed additive interface. C's bounded evidence-backed memory can be supplied with the base Socratic instructions through Deepgram prompt updates/context; it remains data, not privileged instructions. Neither flow is implemented here. Existing `src/types/tutoring.ts` remains unchanged.

Next integrations: verify A1 live, connect C's auth/token guard to B's controls, then add current-revision work/context delivery and later memory retrieval. No Excalidraw, verification engine, proactive controller, Supabase auth, migrations, or learning persistence is implemented in this change.
