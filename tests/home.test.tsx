import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("credential-free homepage", () => {
  it("renders a single main landmark and links to the local workspace", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*aria-describedby="workspace-note"[^>]*href="\/study"/);
    expect(html).toContain('id="workspace-note"');
    expect(html).toContain("Open a local whiteboard.");
    expect(html).toContain("Newton by Twofold");
  });
});
