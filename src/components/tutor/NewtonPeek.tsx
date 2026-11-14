import "./newton-peek.css";

/** Presentation only. A's freshness-checked analysis must drive non-idle states. */
export type NewtonIndicator = "idle" | "question" | "error";

export const indicatorDescriptions: Record<NewtonIndicator, string> = {
  idle: "",
  question: "Newton has a question about this step.",
  error: "Newton noticed an error in this step.",
};

export default function NewtonPeek({ indicator = "idle" }: { indicator?: NewtonIndicator }) {
  return <span className="newton-peek" data-indicator={indicator} aria-hidden="true">
    {(["open", "half", "closed"] as const).map((frame) => (
      // These small, local SVG frames are rendered at their authored pixel size.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={frame} className={`newton-frame newton-frame-${frame}`} src={`/newton/${indicator}-${frame}.svg`} alt="" width={56} height={88} draggable={false} />
    ))}
  </span>;
}
