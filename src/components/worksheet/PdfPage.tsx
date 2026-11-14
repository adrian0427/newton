"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export default function PdfPage({ file, page, zoom, onPageCount }: {
  file: File; page: number; zoom: number; onPageCount(count: number): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const countCallback = useRef(onPageCount);
  useEffect(() => { countCallback.current = onPageCount; }, [onPageCount]);

  useEffect(() => {
    let disposed = false;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        // Legacy build: bundles polyfills (e.g. Map/WeakMap getOrInsertComputed) that
        // older Safari/iPadOS lacks. The worker copied in prepare-workspace-assets matches.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
        const data = new Uint8Array(await file.arrayBuffer());
        if (disposed) return;
        task = pdfjs.getDocument({ data, enableXfa: false, stopAtErrors: true,
          maxImageSize: 32_000_000, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true,
          standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", wasmUrl: "/vendor/pdfjs/wasm/" });
        const loaded = await task.promise;
        if (disposed) return;
        setDocument(loaded);
        countCallback.current(loaded.numPages);
      } catch {
        if (!disposed) { setError("This PDF could not be opened. It may be damaged or password-protected. Try another file."); setLoading(false); }
      }
    }
    void load();
    return () => { disposed = true; void task?.destroy().catch(() => {}); };
  }, [file]);

  useEffect(() => {
    const host = container.current;
    if (!document || !host) return;
    const target = host;
    let disposed = false;
    let render: RenderTask | undefined;
    let generation = 0;
    // Serialize cancellation before reusing resources. Each render owns its canvas.
    async function draw(width: number) {
      const current = ++generation;
      render?.cancel();
      setLoading(true);
      target.replaceChildren();
      setText("");
      try {
        const pdfPage = await document!.getPage(page);
        if (disposed || current !== generation) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(3, Math.max(0.1, (width - 48) / natural.width * zoom));
        const viewport = pdfPage.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height));
        const canvas = window.document.createElement("canvas");
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Worksheet PDF page ${page}`);
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        render = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await render.promise;
        const content = await pdfPage.getTextContent();
        if (disposed || current !== generation) return;
        target.replaceChildren(canvas);
        setText(content.items.map((item) => "str" in item ? item.str : "").join(" "));
        setError("");
        setLoading(false);
      } catch (reason) {
        if (!disposed && current === generation && !(reason instanceof Error && reason.name === "RenderingCancelledException")) {
          setError("This page could not be rendered. Try another page or replace the worksheet."); setLoading(false);
        }
      }
    }
    let previousWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // Canvas insertion changes height; only width changes require a new render.
      if (width > 0 && Math.abs(width - previousWidth) > 0.5) {
        previousWidth = width;
        void draw(width);
      }
    });
    observer.observe(host);
    return () => { disposed = true; generation++; render?.cancel(); observer.disconnect(); host.replaceChildren(); };
  }, [document, page, zoom]);

  return <>
    {loading && <p className="viewer-status" role="status">Opening worksheet page...</p>}
    {error && <p className="viewer-status input-error" role="alert">{error}</p>}
    <div className="pdf-page-host" ref={container} />
    {text && <details className="page-text"><summary>Read page text</summary><p>{text}</p></details>}
  </>;
}
