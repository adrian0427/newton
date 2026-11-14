import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("credential-free homepage", () => {
  it("renders a single main landmark and a clearly unavailable workspace", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="workspace-note"/);
    expect(html).toContain('id="workspace-note"');
    expect(html).toContain("Coming soon.");
    expect(html).toContain("Newton by Twofold");
  });
});
