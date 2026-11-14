# Google Sign-in Implementation Plan

**Goal:** Google-only user-facing authentication through existing Supabase SSR.
**Architecture:** Same-origin OAuth start; configured callback origin; PKCE code exchange; existing verified session/logout and RLS.
**Tech Stack:** Next.js, Supabase SSR, Vitest, Playwright.
**Spec:** ../specs/2026-11-14-google-sign-in-design.md

- [x] Write route regression tests and observe failures for Google start/callback and password rejection.
- [x] Implement origin configuration and PKCE routes; simplify sign-in UI without touching workspace.
- [x] Adapt hosted persistence harness to real SDK test login/SSR cookies, preserving account isolation coverage.
- [x] Document Google Cloud/Supabase setup and limits; run tests, lint, types, build and browser checks.
- [x] Independent review, scoped commit/push; no automatic merge of this new feature.
