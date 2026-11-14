# Peeking Newton launcher

Implemented on 2026-11-14 in the B frontend workstream.

### Peeking Newton launcher

`TutorLauncher` uses the approved terracotta/sage peeking SVG frames in `public/newton/`, aligned at 56 by 88 pixels against the right viewport edge. The apple remains mostly clipped outside the frame, with its stem, flipped leaf, and one eye visible. A transparent button preserves a usable target and keyboard focus without a circular icon background. Click/Enter opens the existing guidance panel; Escape closes it and restores focus.

`NewtonPeek` uses CSS to cycle open, half-blink, closed, and half-blink frames on a 4.02-second loop. Reduced-motion users see the static open-eye frame. There are no timers or services needed for blinking. The optional presentation prop `indicator` supports `idle`, `question`, and `error`. Yellow question/red exclamation marks are plain, slanted, close to the leaf, and steady through the blink; a status description accompanies non-idle states for screen readers.

The deployed local workspace supplies no analysis, so its indicator remains idle. A/B integration must supply non-idle states only from current session/revision analysis and clear them on edits or context changes. Input-format errors, export failures, unavailable services, and uncertain recognition must not be presented as confirmed mathematical errors. This presentation component performs no correctness checks or intervention scheduling.


Shared architecture/decision documentation was in an externally started merge during implementation. Fold this note into those documents after that merge is resolved.
