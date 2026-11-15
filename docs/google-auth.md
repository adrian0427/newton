# Google sign-in with Supabase

This guide describes Google OAuth setup for a web application using Supabase Auth.
Replace all example values with the settings for your own application and project.

## Configure Google

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Configure Google Auth Platform branding, audience and contact details. If the
   application is in testing mode, add the accounts that will test sign-in.
3. Configure the basic identity scopes: `openid`, email and profile. Request
   additional scopes only when the application needs them.
4. Create an OAuth client with application type **Web application**.
5. For **Authorized JavaScript origins**, enter the application origin, such as
   `https://app.example.com` or `http://localhost:3000`. An origin must not include
   a path, query, fragment or trailing slash.
6. For **Authorized redirect URIs**, copy the callback URL shown in your Supabase
   project's Google provider settings. A default hosted-project example is:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   Use the actual dashboard value, especially if using a custom auth domain.
   This is the provider callback to Supabase, not your application's callback.
7. Save the client ID and client secret privately.

## Configure Supabase

1. Open your project's Authentication provider settings and enable Google.
2. Enter the matching Google client ID and client secret. A client ID is an OAuth
   identifier, not your email address. Keep nonce checking enabled for the normal
   web OAuth flow.
3. Set the Site URL to your application's origin.
4. Add the application's implemented callback route to the allowed Redirect URLs.
   For example, if the application handles OAuth returns at `/auth/callback`:

   ```text
   https://app.example.com/auth/callback
   http://localhost:3000/auth/callback
   ```

   These app redirects are distinct from the Supabase callback registered with
   Google. Use exact destinations and avoid broad wildcard redirects.

## Configure the application

Use your framework's Supabase integration to start Google OAuth and handle the
return flow. For server-side PKCE authentication, exchange the returned code for
a session in the callback handler and verify identity on protected requests.

Keep the project URL and publishable key in the application's configuration.
They are public client settings; authorization still requires appropriate database
policies and verified identity. If using Next.js, these settings commonly use
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Configure any application-specific trusted-origin setting to match the address
used in the browser. Use HTTPS for deployed origins and keep development and
production redirect lists appropriate to their environments.

The Google client secret belongs in Supabase's provider settings. Never put it in
browser code, public environment variables, committed files, screenshots or logs.
Keep local environment files ignored by Git. Do not derive post-login redirects
from arbitrary request parameters.

## Check the setup

- Complete Google sign-in and confirm the expected account is shown.
- Refresh the page, sign out, and confirm protected requests require sign-in.
- Check cancellation and retry behavior.
- Use a second account to verify that private records remain isolated.
- Test deployed HTTPS redirects separately from local development.

See [Supabase's Google sign-in documentation](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
for current provider and framework instructions.
