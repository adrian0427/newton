import { describe, expect, it } from "vitest";
import { MAX_WORKSHEET_BYTES, worksheetKind } from "@/components/worksheet/files";

describe("local worksheet file validation", () => {
  it("recognizes supported content independently of MIME metadata", async () => {
    await expect(worksheetKind(new Blob(["%PDF-1.7\n"]))).resolves.toBe("pdf");
    await expect(worksheetKind(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "text/plain" }))).resolves.toBe("image");
    await expect(worksheetKind(new Blob([new Uint8Array([255, 216, 255, 224])]))).resolves.toBe("image");
    await expect(worksheetKind(new Blob(["RIFFxxxxWEBP"]))).resolves.toBe("image");
  });
  it("rejects misleading MIME, active document formats, empty and oversized files", async () => {
    await expect(worksheetKind(new Blob(["<script>alert(1)</script>"], { type: "application/pdf" }))).rejects.toThrow("Choose a PDF");
    await expect(worksheetKind(new Blob(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"]))).rejects.toThrow("Choose a PDF");
    await expect(worksheetKind(new Blob([]))).rejects.toThrow("empty");
    await expect(worksheetKind(new Blob([new Uint8Array(MAX_WORKSHEET_BYTES + 1)]))).rejects.toThrow("20 MiB");
  });
});
