import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("credential-free homepage", () => {
  it("renders a single main landmark and links to the local workspace", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/study"/);
    expect(html).toContain("Try the workspace");
    expect(html).toContain("Sign in to Newton");
    expect(html).toContain('aria-label="Newton home"');
  });
});
