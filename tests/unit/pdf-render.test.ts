import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { afterAll, describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { createPdf, pdfRequestSchema, type PdfRequest } from "@/lib/pdf";
import { closeBrowser, htmlToPdf } from "@/lib/pdf/render";

/**
 * Real Chromium render (FR-10, ADR-008). Skipped only when no Chromium is installed
 * (set CHROMIUM_PATH or PLAYWRIGHT_BROWSERS_PATH). Set PDF_SAMPLES_DIR to keep the PDFs.
 */
const browserPath = process.env.CHROMIUM_PATH || chromium.executablePath();
const hasBrowser = fs.existsSync(browserPath);
const has = (bin: string) => {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const fixture = (name: string) => JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const outDir = process.env.PDF_SAMPLES_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "carenav-pdf-"));

async function render(name: string, req: PdfRequest) {
  const db = openDb(":memory:");
  try {
    const { ref, pdf } = await createPdf(req, { db, now: new Date("2026-10-21T10:00:00Z") });
    const file = path.join(outDir, `${name}.pdf`);
    fs.writeFileSync(file, pdf);
    return { ref, pdf, file };
  } finally {
    db.close();
  }
}

/** Page text, lower-cased (headings are upper-cased by CSS) with whitespace collapsed so wrapped lines still match. */
function text(file: string): string {
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).replace(/\s+/g, " ").toLowerCase();
}

function pageCount(pdf: Buffer, file: string): number {
  if (has("pdfinfo")) return Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [file], { encoding: "utf8" }))![1]);
  return pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

describe.skipIf(!hasBrowser)("PDF rendering with headless Chromium", () => {
  afterAll(() => closeBrowser());

  it("renders the Journey 1 PDF from the Marcia fixture", async () => {
    const { pdf, file, ref } = await render("marcia-summary", pdfRequestSchema.parse({ flow: "prepare", ...fixture("marcia-summary.json") }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf, file)).toBeGreaterThanOrEqual(2);
    if (has("pdftotext")) {
      const t = text(file);
      expect(t).toContain("Appointment summary".toLowerCase());
      expect(t).toContain("Pain in both knees for about two months".toLowerCase());
      expect(t).toContain("paracetamol, two tablets, sometimes".toLowerCase());
      expect(t).toContain("DRAFT, NOT CLINICALLY APPROVED".toLowerCase());
      expect(t).toContain(`/c/${ref}`.toLowerCase());
      expect(t).toContain("Your summary: Simple English".toLowerCase());
      expect(t).toContain("Where to get help".toLowerCase());
    }
  }, 60_000);

  it("renders the Journey 2 PDF with the Pidgin version and the ungrounded section", async () => {
    const { pdf, file } = await render("gp-letter-pcm", pdfRequestSchema.parse({ flow: "understand", ...fixture("gp-letter-explain-pcm.json") }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf, file)).toBeGreaterThanOrEqual(2);
    if (has("pdftotext")) {
      const t = text(file);
      expect(t).toContain("Letter explanation".toLowerCase());
      expect(t).toContain("Amlodipine 5mg, to be taken once a day in the morning".toLowerCase());
      expect(t).toContain("What your letter means: Naijá".toLowerCase());
      expect(t).toContain("Di doctor don start you on new medicine".toLowerCase());
      expect(t).toContain("We couldn't find this in your letter".toLowerCase());
    }
  }, 60_000);

  it("renders the persistent urgent banner (v0.3 A2)", async () => {
    const req = pdfRequestSchema.parse({ flow: "understand", ...fixture("gp-letter-explain-pcm.json") });
    req.english.meta.urgentAcknowledged = "urgent";
    const { file } = await render("gp-letter-pcm-urgent", req);
    if (has("pdftotext")) expect(text(file)).toContain("contact NHS 111 or your GP surgery".toLowerCase());
  }, 60_000);

  it("blocks every outbound request from the document (CONTEXT.md §13)", async () => {
    let hits = 0;
    const server = http.createServer((_, res) => {
      hits++;
      res.end("x");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as { port: number };
    try {
      // No CSP here, so only the renderer's own request blocking stands between the page and the server.
      const html = `<html><head><link rel="stylesheet" href="http://127.0.0.1:${port}/a.css"></head><body><img src="http://127.0.0.1:${port}/b.png"><iframe src="http://127.0.0.1:${port}/c"></iframe><p>hello</p></body></html>`;
      const pdf = await htmlToPdf(html, "<span></span>");
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  }, 60_000);
});
