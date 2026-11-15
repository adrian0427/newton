import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import HandwritingReview from "@/components/whiteboard/HandwritingReview";

afterEach(() => vi.unstubAllEnvs());
const image = "data:image/png;base64,iVBORw0KGgo=";
const handlers = { onDraft: () => {}, onConfirm: () => {}, onEdit: () => {}, onReadAgain: () => {}, onDismiss: () => {} };

it("shows the exact image read beside the editable draft", () => {
  vi.stubEnv("NODE_ENV", "production");
  const html = renderToStaticMarkup(<HandwritingReview state={{ revisionId: "r1", phase: "review", ambiguous: false, draft: "426+2", image }} {...handlers} />);
  expect(html).toContain(`src="${image}"`);
  expect(html).toContain('alt="The drawing Newton read"');
  expect(html).toContain('value="426+2"');
  expect(html).toContain("k, b, 6 and 2 are easy to confuse");
  expect(html).not.toContain("download=");
});
it("offers the exact-image download only in local development", () => {
  vi.stubEnv("NODE_ENV", "development");
  const html = renderToStaticMarkup(<HandwritingReview state={{ revisionId: "r1", phase: "unreadable", image }} {...handlers} />);
  expect(html).toContain('download="newton-read-image.png"');
});
it("renders no image when none was captured", () => {
  const html = renderToStaticMarkup(<HandwritingReview state={{ revisionId: "r1", phase: "review", ambiguous: false, draft: "" }} {...handlers} />);
  expect(html).not.toContain("<img");
});
