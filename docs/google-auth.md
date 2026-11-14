# Google sign-in setup

Newton uses Supabase Google OAuth with PKCE. The app no longer accepts email/password submissions. Existing database ownership, verified-session and logout behavior is unchanged; no migrations are needed.

## One-time team configuration

1. In [Google Cloud Console](https://console.cloud.google.com/), select/create a team-owned project. Configure Google Auth Platform branding, audience and contact details for Newton. For testing, use External / Testing and add the adult team test accounts as test users. Create an OAuth client of type **Web application**. Use only basic identity scopes (openid, email, profile); no Google API billing or Gmail/Drive access is needed for this feature.
2. Add this **Google authorized redirect URI** exactly:

   ```text
   https://ltoyfshczgknmhwjtogh.supabase.co/auth/v1/callback
   ```

   This is Google's return address to Supabase, not Newton's app callback. In Supabase's `newton-dev` project, open Authentication → Sign In / Providers → Google, enable it, and paste the Google client ID and client secret there. Keep the secret out of chat, Git, screenshots and browser application code. Leave nonce checking enabled.
3. Set Supabase Authentication → URL Configuration → Site URL to the app origin. Add the exact app callback to Redirect URLs. For the usual local dev server:

   ```text
   http://localhost:3000/auth/callback
   ```

   Add `http://127.0.0.1:3107/auth/callback` only if using the documented acceptance-test server. Set `NEWTON_SITE_URL=http://localhost:3000` in each developer's ignored `.env.local`, and open that exact origin in the browser. For deployment, use the exact HTTPS site origin in NEWTON_SITE_URL and add its `/auth/callback` to Supabase's allowlist. Do not use broad wildcard redirects.

The existing Supabase URL/publishable key still belongs in `.env.local`. Google credentials belong only in Supabase's provider settings. See [Supabase's Google guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## Behavior and verification

`POST /auth/session` with no body starts Google OAuth. It rejects cross-origin requests, password payloads, mismatched configured site origins and unexpected provider destinations. Supabase SSR persists the PKCE verifier in cookies. `GET /auth/callback` exchanges the one-use code, verifies identity and returns to `/auth/sign-in`; it ignores arbitrary next destinations. Cancellation/expired/missing codes return a generic retry message. Session GET and local sign-out DELETE remain available and no-store.

After configuration, run `npm run dev`, open `http://localhost:3000/auth/sign-in`, select Continue with Google and complete consent. Verify your identity is shown, reload preserves it, and Sign out removes access to protected APIs. Test cancellation and retry. Repeat in a separate browser profile with a second adult Google account and verify account isolation and later-session history. Google consent and provider settings cannot be verified by mocks.

The explicit hosted persistence harness uses pre-created password accounts solely as test fixtures. It obtains real Supabase SSR cookies through SDK login and installs them into isolated HTTP contexts; it does not exercise the Google UI or OAuth callback. Email authentication must stay enabled in this disposable test project for that harness. For a Google-only production project, disable the Email provider after successful Google verification; use manual Google-account acceptance or a separate password-enabled test project for that harness. No hosted provider settings are changed automatically by the app.

A/B continue using verified identity/session helpers and do not need Google tokens or provider secrets. New Google accounts have their own Auth IDs unless Supabase links an existing identity; do not assume old test history transfers. Test the actual resulting account IDs/history rather than copying records.

## Code checkpoint — 2026-11-14

Tests cover start restrictions, fixed redirects, rejected password payloads, cancelled/expired callbacks, verified identity, no-store responses and logout recovery. Independent code review found no blockers. The built app produced a real Supabase Google authorization URL, PKCE challenge/verifier cookie, and fixed cancellation redirect without contacting Google. The adapted hosted persistence scenario passed with two real test accounts. Desktop/mobile auth checks passed after scoping their alert locators to the form (Next also supplies an alert-based route announcer); all 20 existing workspace checks passed. Google consent and the successful provider-configured callback remain unverified pending team setup.

## Live session regression — 2026-11-14

The user reported a successful real Google sign-in, sign-out/sign-in and reload after configuring the provider. This is manual user evidence, not an automated Google-consent test.

`tests/hosted/auth.hosted.ts` independently passed against the running app and hosted Supabase using an isolated Chromium browser and a disposable SDK-authenticated fixture. It verified identity after reload and workspace navigation, real UI sign-out, signed-out reload, 401/no-store for identity/history after logout, and restored UI after fresh SDK authentication. It does not touch the user's browser or automate Google account selection/consent. The separate hosted two-account persistence/isolation scenario and four desktop/mobile auth UI checks also passed. Both live scenarios run with `npm run test:hosted`; Chromium must be installed for the browser scenario (`npx playwright install chromium`).

A second real Google-account acceptance check and deployed HTTPS testing remain outstanding.

## Integration with latest main — 2026-11-14

Resolved four textual conflicts with main `6ffee9a`: README, architecture status, sign-in page and form. Retained main's SignInScreen, logo, comet background and stylesheet; threaded callback failure feedback through the screen and retained Google behavior in the styled form. Adapted password-specific expectations in the sign-in and landing browser tests while preserving layout, reduced motion, retry and navigation coverage. Voice, workspace, landing source and dependency manifests are identical to latest main.

Verification: 336 unit/database/voice tests passed, plus lint, TypeScript, the normal production build, both live hosted scenarios and all 28 desktop/mobile browser scenarios (26 on the initial run; the two obsolete password-field expectations passed after updating to Google). Independent merge review found no code blockers. No provider secrets or database migrations were added.
