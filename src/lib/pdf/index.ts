import { env } from "@/lib/config/env";
import { draftLabelEnabled } from "@/lib/content";
import { db as defaultDb, type DB } from "@/lib/db";
import { clinicianUrl, newRef, qrSvg } from "./qr";
import { htmlToPdf } from "./render";
import type { PdfRequest } from "./schema";
import { buildPdfHtml, footerHtml } from "./template";

export { pdfRequestSchema, type PdfRequest } from "./schema";

/** The only thing an export stores (PRD §12.2): no content, no user id, no IP. */
export type PdfExportRow = { ref: string; ts: number; flow: PdfRequest["flow"]; language_pair: string };

/** "en" or "en+pcm": the English master plus the user version's language, when there is one. */
export function languagePair(req: PdfRequest): string {
  return req.user ? `${req.english.meta.outputLanguage}+${req.user.meta.outputLanguage}` : req.english.meta.outputLanguage;
}

export function exportRow(req: PdfRequest, ref: string, ts: number): PdfExportRow {
  return { ref, ts, flow: req.flow, language_pair: languagePair(req) };
}

export function recordExport(database: DB, row: PdfExportRow): void {
  database.prepare("INSERT INTO pdf_exports (ref, ts, flow, language_pair) VALUES (?, ?, ?, ?)").run(row.ref, row.ts, row.flow, row.language_pair);
}

export type PdfDeps = { db?: DB; now?: Date; render?: typeof htmlToPdf };

/** Renders the PDF (FR-10), then records the export. Nothing from the request body is stored. */
export async function createPdf(req: PdfRequest, deps: PdfDeps = {}): Promise<{ ref: string; pdf: Buffer }> {
  const now = deps.now ?? new Date();
  const ref = newRef();
  const feedbackUrl = clinicianUrl(env().PUBLIC_BASE_URL, ref);
  const html = buildPdfHtml(req, { feedbackUrl, qrSvg: await qrSvg(feedbackUrl), now, showDraftLabel: draftLabelEnabled() });
  const pdf = await (deps.render ?? htmlToPdf)(html, footerHtml(now));
  recordExport(deps.db ?? defaultDb(), exportRow(req, ref, now.getTime()));
  return { ref, pdf };
}
