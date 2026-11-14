import type { CSSProperties } from "react";
import artwork from "./ink-artwork.json";
import "./ink-motion.css";

// Larger equations anchor the composition; smaller notes leave breathing room.
const sizes = [1.45, .95, 1.15, 1.4, .9, 1.35, 1.6, .85, 1.3, 1.2, .9, .9];

/** Trusted, local SVG exports from the approved Figma frames. No user HTML. */
export function InkBackground() {
  return <div className="sign-in-ink" aria-hidden="true">
    {artwork.map((mark, index) => <div
      key={mark.nodeId}
      className={`ink-drawing ${mark.motionClass}${mark.tablet ? " ink-tablet" : ""}${mark.mobile ? " ink-mobile" : ""}${index < 12 ? " ink-first-pass" : ""}`}
      data-motif={mark.name}
      style={{
        "--ink-x": `${mark.x}%`, "--ink-y": `${mark.y}%`,
        "--ink-width": `${mark.width}px`, "--ink-height": `${mark.height}px`,
        "--ink-angle": `${mark.rotation}deg`,
        "--ink-scale": sizes[index % sizes.length],
        "--compact-scale": 1 + (sizes[index % sizes.length] - 1) * .5,
        "--tablet-x": `${mark.tablet?.x ?? 0}%`, "--tablet-y": `${mark.tablet?.y ?? 0}%`,
        "--tablet-scale": mark.tablet?.scale ?? 1,
        "--mobile-x": `${mark.mobile?.x ?? 0}%`, "--mobile-y": `${mark.mobile?.y ?? 0}%`,
        "--mobile-scale": mark.mobile?.scale ?? 1,
      } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: mark.svg }}
    />)}
  </div>;
}
