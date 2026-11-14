# Quiet Ink landing design

Design base created on 2026-11-14 on `codex/landing-ink-motion`.

[Open the Figma design](https://www.figma.com/design/0KbQ5fD5OnoOjtzUWv1DjZ?node-id=5-38).
The file belongs to mphan21's student team. The design is implemented on the same branch for the homepage and sign-in page.
InkBackground replaces the original comet background with local SVG artwork and CSS.

## Frames

| Frame | Size | Figma node |
| --- | --- | --- |
| Desktop, Paper Light | 1440 x 900 | 5:38 |
| iPad, Paper Light | 1024 x 768 | 5:55 |
| Phone, Paper Light | 390 x 844 | 5:72 |
| Desktop, Graphite | 1440 x 900 | 5:89 |

The approved apple N, current Google sign-in action, tagline, and workspace
link remain central. Local components and editable text form the sign-in stack.
The original AppleLogo.tsx paths are preserved as vectors. Paper colors are
bound to a Light/Dark variable collection sourced from globals.css.

Figma's server cannot load the local Arial and Georgia fonts. Its suggested
substitutes, Arimo and Lora, are used for editable design text. The application
fonts are unchanged; use Arial and Georgia when implementing the design.

## Background direction

The full-page background draws from 24 unique motifs: algebra and physics
expressions, handwritten study prompts, a right triangle, sine wave, circle
and radius, number line, overlapping sets, cube, pendulum, fraction bars, and
an orbital arrow. Each location gets different content on its second pass.
Desktop includes 24 unique marks, tablet 16, and phone 12 across two passes.
The sign-in stack stays still and remains clear of the handwriting.

The four frames have native 36-second Figma motion timelines. Play or scrub
the frame timeline to inspect the animation. Each pen segment uses
PATH_TRIM_END, and its containing mark uses OPACITY:

- Draw for approximately 2.4 seconds.
- Hold until 3.6 seconds after the mark starts.
- Fade to zero by 5.4 seconds.
- Stagger independent starts at 0, 0.9, 2.6, 4.3, 5.9, 7.6, 9.1, 10.8, 12.4, 1.9, 6.9, and 11.5 seconds. The second pass uses different motifs with an 18-second offset.
- Use neutral gray #909399 on light paper, with a peak opacity of 65%.
- Use #92969b on graphite paper. Sign-in text colors stay unchanged.

The timeline is deterministic, with several marks active at once. An exported
HTML video preview uses autoplay, muted playback, and loop for continuous replay.
The browser implementation uses a 36-second CSS loop with staggered stroke
reveals. Equations, diagrams, and notes vary in scale, with gentler size changes
on smaller screens. Local ink-artwork.json preserves the exported Figma SVGs;
ink-motion.css contains their deduplicated animation tracks. There are no
remote artwork URLs, video playback, animation dependencies, or animation timers.
Under reduced motion, disable reveals and fades and show only the first pass as static gray ink at 30% opacity.
Decoration must remain hidden from assistive technology and ignore pointers.

## Validation

The frames use editable text, vector paths, and shared component instances;
none contains a flattened UI image. Desktop, phone, and graphite compositions
were reviewed visually. The animation was exported to video for checking the
stroke reveal, hold, and fade phases. iPad remains a layout study, not a claim of
real-device compatibility. Authentication behavior has not changed.
