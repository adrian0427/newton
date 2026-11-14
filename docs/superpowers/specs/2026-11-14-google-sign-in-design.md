# Google-only sign-in

User selected Google OAuth through Supabase, replacing password UI and app password handling. Use existing Supabase SSR clients and cookie sessions; keep verified identity, logout, RLS, and learning helpers unchanged. No custom password registration/recovery or new auth service. Google setup is external and requires a team Google Cloud OAuth web client.

POST /auth/session starts Google OAuth with PKCE and an exact configured NEWTON_SITE_URL callback. GET /auth/callback exchanges the code with its verifier cookie and redirects to the sign-in screen, which shows verified identity and a workspace link. Fixed destinations avoid open redirects; malformed, cancelled, expired, and unavailable flows show generic recoverable errors. Never log OAuth codes/tokens or provider errors. Request origin must match configured site. No migrations or A/B implementation changes.

Existing hosted persistence tests retain disposable password accounts only as SDK test fixtures, installing real SSR cookies in isolated test HTTP contexts. They do not claim to test Google consent. Real Google round-trip and two Google-account isolation require provider configuration and manual verification.
