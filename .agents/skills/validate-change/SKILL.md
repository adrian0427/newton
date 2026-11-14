---
name: validate-change
description: Validate a Newton repository change before review, including affected tests, lint, types, builds, secrets, and shared contract impacts.
---

# Validate a Newton change

1. Inspect `git status --short`, `git diff`, and staged changes. Include untracked files; on an initial scaffold there may be no commit to compare against.
2. Identify affected modules and owners using `docs/contributing.md`; check relevant product and architecture constraints.
3. Run focused tests for changed behavior, then `npm test` where appropriate. Do not require live service credentials in default tests.
4. Run `npm run lint` and `npm run typecheck`. Typechecking includes contract assertions that Vitest alone does not enforce.
5. Run `npm run build` for app, configuration, dependency, and integration changes. Record any justified omission.
6. Inspect the diff for credentials, student data, generated output, local environment files, and unrelated changes. Verify ignore rules without printing secrets.
7. If `src/types/tutoring.ts` or an integration interface changed, identify consumers and ensure affected owners can integrate it. Check lockfile consistency for dependency changes.
8. Report checks and outcomes, changed areas, failures, assumptions, and remaining risks. Do not label a skipped or failed check as passing. Fix issues within the authorized scope; this skill does not authorize commits, pushes, or PR creation.
