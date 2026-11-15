import { expect, test } from "@playwright/test";

// Synthetic local fixtures only. No real student documents are persisted.

function pdfFixture(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...["Algebra worksheet: 2(x + 3) = 14", "Practice page two: x + 5 = 9"].map((text) => {
      const content = `BT /F1 18 Tf 40 640 Td (${text.replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj ET`;
      return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    }),
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

test("PDF upload, local rendering, page navigation, zoom and removal", async ({ page }) => {
  const errors: string[] = [];
  const posts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.method() === "POST" && !request.url().includes("__nextjs")) posts.push(request.url()); });
  await page.goto("/study");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Upload worksheet file").setInputFiles({ name: "algebra.pdf", mimeType: "application/pdf", buffer: pdfFixture() });
  await expect(page.getByRole("img", { name: "Worksheet PDF page 1" })).toBeVisible();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await page.getByText("Read page text", { exact: true }).click();
  await expect(page.getByText("Algebra worksheet: 2(x + 3) = 14", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next worksheet page" }).click();
  await expect(page.getByRole("img", { name: "Worksheet PDF page 2" })).toBeVisible();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zoom in worksheet" }).click();
  await expect(page.getByRole("button", { name: "Reset worksheet zoom" })).toHaveText("125%");
  await expect(page.getByRole("img", { name: "Worksheet PDF page 2" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("split-worksheet.png") });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("img", { name: "Worksheet PDF page 2" })).toHaveCSS("filter", /invert/);
  await page.screenshot({ path: test.info().outputPath("paper-dark-worksheet.png") });
  await page.getByRole("button", { name: "Remove worksheet" }).click();
  await expect(page.getByRole("heading", { name: "Bring something to work on." })).toBeVisible();
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test("image drop and clipboard paste, replacement cleanup, and file errors", async ({ page }) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { document.documentElement.dataset.revoked = String(Number(document.documentElement.dataset.revoked || 0) + 1); revoke(url); };
  });
  await page.goto("/study");
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 500; canvas.height = 700;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, 500, 700);
    context.fillStyle = "#233d32"; context.font = "24px Georgia";
    context.fillText("Algebra practice", 40, 70);
    context.font = "20px Georgia"; context.fillText("2(x + 3) = 14", 40, 130);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const pane = page.getByRole("region", { name: "Worksheet", exact: true });
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    return data;
  }, [...png]);
  await pane.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("img", { name: "Worksheet: dropped.png" })).toBeVisible();
  const worksheetTab = page.getByRole("button", { name: "Worksheet", exact: true });
  if (await worksheetTab.isVisible()) await worksheetTab.focus();
  await pane.evaluate((_element, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
    (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(page.getByRole("img", { name: "Worksheet: pasted.png" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-revoked", "1");
  await page.getByLabel("Upload worksheet file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a PDF</html>") });
  await expect(pane.getByRole("alert")).toContainText("Choose a PDF");
  await expect(page.getByRole("img", { name: "Worksheet: pasted.png" })).toBeVisible();
  await page.getByRole("button", { name: "Remove worksheet" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-revoked", "2");
});

test("full-height layout, mobile pane switching, and keyboard resizing", async ({ page }, testInfo) => {
  await page.goto("/study");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your working space" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Worksheet", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Worksheet", exact: true }).click();
    await expect(page.getByRole("region", { name: "Worksheet", exact: true })).toBeVisible();
  } else {
    const divider = page.getByRole("separator", { name: "Resize worksheet and whiteboard" });
    await divider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", "46");
    await page.keyboard.press("Home");
    await expect(divider).toHaveAttribute("aria-valuenow", "30");
    const bounds = (await divider.boundingBox())!;
    await page.mouse.move(bounds.x + 4, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(640, bounds.y + 100);
    await page.mouse.up();
    expect(Number(await divider.getAttribute("aria-valuenow"))).toBeGreaterThan(40);
  }
  await page.screenshot({ path: testInfo.outputPath("empty-workspace.png") });
});
