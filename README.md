# Newton

**A little guidance. Your own discovery.**

Newton is an AI study companion that works alongside students as they solve
mathematics problems. Students can write naturally, review what Newton read,
and ask for guidance grounded in their own work—without composing an elaborate
AI prompt.

**Website: [newton-weld-gamma.vercel.app](https://newton-weld-gamma.vercel.app)**

Developed by **Team Twofold** for the
[**CPVC × OCOB × CPE AI Hackathon**](https://www.calpolyvibecoding.com/hackathon),
**November 13–15, 2026**, at **Cal Poly San Luis Obispo**.
Our hackathon focus is **Best Use of AI**: connecting visual recognition,
independent mathematical verification, conversational tutoring, and learning
context into one study experience.

**Team Twofold:** Adrian Valenzuela · Giovanni Peila · Matthew Phan

## Why we built Newton

Access to personalized tutoring is unequal. We wanted students to receive
meaningful help while working through a problem, even if they do not know how
to turn their confusion into a sophisticated AI prompt. Neal Stephenson's
*The Diamond Age*, especially the Young Lady's Illustrated Primer, inspired our
vision of an interactive educational companion: patient, responsive, and close
to the learner's experience.

## How the AI works with student work

Newton connects four distinct capabilities, with explicit boundaries between
recognizing work, checking mathematics, teaching, and remembering:

1. **AI handwriting recognition.** Groq-hosted Qwen vision transcribes the
   student's Excalidraw handwriting. Students compare the draft with their
   drawing, edit misread symbols, and confirm it before mathematical analysis.
   The model is instructed to preserve mistakes rather than solve or repair them.
2. **Deterministic mathematical verification.** A separate symbolic checker
   compares supported distributive expansions using exact rational arithmetic.
   Correctness does not depend exclusively on a language model's judgment.
   Structured MathLive input uses the same checker when handwriting is unclear.
3. **Conversational AI tutoring — local development only.** Deepgram Voice Agent
   combines speech recognition, a managed language model (`gpt-4o-mini`), and
   speech synthesis. Current confirmed work, verification results, and available
   learning context inform concise Socratic explanations and guiding questions.
   Students can interrupt naturally. **Voice is disabled on the production
   website and preview deployments.**
4. **Personalized learning memory.** In an authenticated study session, the
   server rechecks eligible submitted text and saves short, derived learning
   observations in Supabase PostgreSQL. Later sessions retrieve relevant past
   observations as bounded tutoring context. Memory records supported practice
   and observed errors; it does not infer mastery from one step or retain a
   complete conversation.

For example, a student writes `7(6k+2)=42k+2`. After transcription review and
confirmation, the checker identifies the missed distribution to the constant
and offers a hint about multiplying `7 × 2`. Recognition preserves the student's
incorrect answer; verification supplies the evidence for guidance and memory.
The developer verified this real-handwriting journey with Groq; automated tests
cover mocked provider responses separately. See [the integration and validation record](docs/study-tutoring.md).

## What you can use today

| Website | Local development adds |
| --- | --- |
| `/study`: PDF/image worksheet reference, Excalidraw whiteboard, and MathLive structured input | Real-time Deepgram voice conversations and interruption |
| Google sign-in; student-reviewed handwriting transcription; supported checks and targeted text hints | Current-work and retrieved-memory context in spoken tutoring |
| Owned study sessions, derived learning observations, and cross-session history retrieval | Guarded `/dev/voice` diagnostics and `/dev/study` harness via `voice:dev` |

On the website, sign in, open `/study`, and choose **Start study session** to
enable learning-history saves and retrieval. Use **Read handwriting**, review
and confirm the draft, then open Newton for **Check work** or **Ask for a hint**.
The whiteboard and structured checker also work locally without an account.

Verification currently targets **Algebra I distributive-property expansions**,
not arbitrary mathematical proofs or a full curriculum. Conversational tutoring
can discuss broader mathematics, but those explanations are not independently
verified. Handwriting can be misread; confirmation and editable input remain
essential. Worksheet pixels are reference material and are not automatically
interpreted. Proactive intervention and deployed voice remain future work.

## Getting started

Use **Node.js 22.14 or newer within Node 22** and npm:

```sh
git clone https://github.com/adrian0427/newton.git
cd newton
nvm use
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) or `/study`. The homepage, local
workspace, structured checker, and default tests need no service credentials.
For connected features, copy `.env.example` to `.env.local` and configure only
the services you intend to use:

| Environment variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public project settings for Google authentication and owner-scoped learning memory; migrations and RLS are required |
| `NEWTON_SITE_URL` | Exact trusted app origin for OAuth; `http://localhost:3000` locally |
| `GROQ_API_KEY` | Server-only Groq handwriting transcription |
| `DEEPGRAM_API_KEY` | Server-only local voice; Member-level or higher for temporary browser-token grants |

`NEWTON_VISION_PROVIDER` and `GROQ_VISION_MODEL` optionally select the provider
and override its model. The existing alternative uses `GEMINI_API_KEY` and
optional `GEMINI_VISION_MODEL`; see [architecture and provider boundaries](docs/architecture.md).
Managed Deepgram voice does not require `OPENAI_API_KEY`. Google OAuth secrets
belong in Supabase provider settings, not browser configuration.

For voice diagnostics, run `npm run voice:dev` and use the printed loopback URL.
Adding a key does **not** enable production voice. See [local voice setup](docs/ai-voice.md)
and [Google authentication setup](docs/google-auth.md).

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run test:e2e` runs browser checks after `npx playwright install chromium`.
`npm run test:vision` and `npm run test:hosted` are separate, opt-in live-service
checks; they are not part of the default test suite. The build prepares local
drawing/math fonts and PDF.js assets through its `prebuild` hook.

## Technical foundation and data boundaries

Next.js App Router, React, TypeScript, and Tailwind power the Vercel-hosted app.
Excalidraw, MathLive, and PDF.js support the workspace; Groq/Qwen handles visual
transcription; the exact-arithmetic checker independently verifies supported
work; Deepgram supplies local conversational AI; Supabase supplies Google Auth
and PostgreSQL with row-level security.

Permanent provider keys stay server-side. Protected handlers verify identity
and session ownership. Explicit handwriting reads send only the whiteboard PNG
for transient transcription. Source drawings and worksheets persist in
account-scoped browser storage, not cloud work autosave. Learning memory stores
derived observations, not raw audio, screenshots, or full conversations.
Owner-scoped access does not prove observation provenance; retrieved history
remains advisory context.

- [Product intent](docs/product.md) · [Architecture](docs/architecture.md) · [Decisions](docs/decisions.md)
- [Tutoring workflow and limitations](docs/study-tutoring.md) · [Backend testing](docs/backend-testing.md)
- [Contributing](docs/contributing.md) · [Developer workstreams](docs/workstreams/README.md)
