import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TutorLauncher from "@/components/tutor/TutorLauncher";

describe("Newton indicator presentation", () => {
  it.each(["idle", "question", "error"] as const)("provides aligned blink frames for %s", (indicator) => {
    const html = renderToStaticMarkup(<TutorLauncher indicator={indicator} />);
    expect(html).toContain('aria-label="Open Newton"');
    expect(html).not.toContain('role="dialog"');
    for (const frame of ["open", "half", "closed"]) {
      const asset = `/newton/${indicator}-${frame}.svg`;
      expect(html).toContain(asset);
      const svg = readFileSync(join(process.cwd(), "public", asset), "utf8");
      expect(svg).toContain('viewBox="0 0 56 88"');
      if (indicator !== "idle") {
        expect(svg).toContain('transform="translate(4 12) rotate(-16 28 12)"');
        expect(svg).not.toContain('r="9"');
      }
    }
    if (indicator === "idle") expect(html).not.toContain("noticed an error");
    else expect(html).toContain('aria-describedby="newton-move-hint newton-indicator-status"');
    // Server render always starts docked at the edge; a saved position applies after hydration.
    expect(html).toContain('data-mode="dock"');
  });
});
