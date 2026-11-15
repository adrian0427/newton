# Peeking Newton launcher

Implemented on 2026-11-14 in the B frontend workstream.

### Peeking Newton launcher

`TutorLauncher` uses the approved terracotta/sage peeking SVG frames in `public/newton/`, aligned at 56 by 88 pixels against the right viewport edge. The apple remains mostly clipped outside the frame, with its stem, flipped leaf, and one eye visible. A transparent button preserves a usable target and keyboard focus without a circular icon background. Click/Enter opens the existing guidance panel; Escape closes it and restores focus.

`NewtonPeek` uses CSS to cycle open, half-blink, closed, and half-blink frames on a 4.02-second loop. Reduced-motion users see the static open-eye frame. There are no timers or services needed for blinking. The optional presentation prop `indicator` supports `idle`, `question`, and `error`. Yellow question/red exclamation marks are plain, slanted, close to the leaf, and steady through the blink; a status description accompanies non-idle states for screen readers.

### Draggable Newton

Design reference: Figma "Newton / Draggable apple" (`4cwQZyPijv1zaYDWyrlEsj`). Students can drag Newton anywhere on the study page. A press becomes a drag only after 4 px of travel, so clicks and Enter still open guidance; the click that ends a drag is swallowed. While held he renders unclipped (`NewtonApple`) with wide eyes, 12% scale, a tilt, and a lifted shadow, and blinking pauses. A dashed ghost marks the edge spot he left. Releasing with his center within 48 px of the right edge tints that zone and tucks him back into the peek; elsewhere he is placed fully on screen, blinking, with a contact shadow. Escape during a drag cancels it. When focused, arrow keys move him (Shift for 64 px steps), Left pulls him out of the peek, and Home docks him. The guidance panel opens beside him and flips side to stay on screen. Reduced motion drops the scale and tilt and keeps only the shadow change.

Once placed, Newton looks at the center of the working pane (`.work-area`, the whiteboard or structured input), following the Figma "Newton / Gaze toward the whiteboard" board. The gaze is the exact unit vector toward that point: his face shifts up to 2.85 artwork units and his pupils up to 1.05 across and 1.4 down, and the blink frames share the same gaze. Within 70 px of the target, or when the pane is hidden (the mobile worksheet tab), he looks straight ahead. A `ResizeObserver` updates the gaze when the divider, focus mode, tabs, or window change the pane. While held he keeps the wide-eyed face, and docked he keeps the approved left-looking peek. Reduced motion skips the easing.

### Correct-step celebration

Design reference: Figma "Newton / Correct-step celebration". When Check work returns `correct` for the current structured step, `WorkspaceTutor` passes a new celebration token to `TutorLauncher`. Hints, incorrect and unsupported results, and whiteboard or worksheet work never celebrate, and rechecking the same revision does not replay it (`shouldCelebrate` in `celebration.ts`). Over 1.9 s Newton squashes, swells, and pops: a ring and 30 deterministic confetti pieces burst out and drift down, then he reforms with a happy face and settles back to his gaze. Docked, the peek squashes and pops in place and the confetti fans left toward the page; unlike the Figma frame, he does not slide 40 px out, because the peek artwork is clipped. Picking him up cancels the celebration. With reduced motion there is no movement, only the happy face and five still sparkles for 1.2 s, then a fade. The overlay is aria-hidden with no pointer events, sits under the guidance panel, and has no sound. The text feedback still says only that the step is equivalent.

Position logic lives in `apple-position.ts` as viewport fractions, validated at runtime, and is stored only in this browser's `localStorage` (`newton.apple-position.v1`). Server rendering always starts docked, and a saved position applies after hydration. Only the right edge docks, because the peek artwork faces left; docking on other edges needs mirrored or rotated peek frames.

The deployed local workspace supplies no analysis, so its indicator remains idle. A/B integration must supply non-idle states only from current session/revision analysis and clear them on edits or context changes. Input-format errors, export failures, unavailable services, and uncertain recognition must not be presented as confirmed mathematical errors. This presentation component performs no correctness checks or intervention scheduling.


Shared architecture/decision documentation was in an externally started merge during implementation. Fold this note into those documents after that merge is resolved.
