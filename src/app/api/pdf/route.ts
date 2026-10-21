import { handler, json } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { createPdf, pdfRequestSchema } from "@/lib/pdf";

export const runtime = "nodejs";

/**
 * POST /api/pdf (FR-10): renders the result the client already holds. Stateless for content:
 * the body is validated, rendered and dropped; only the `pdf_exports` row (ref, ts, flow,
 * language pair) is written, so the clinician QR link has something to point at.
 */
const render = handler("/api/pdf", pdfRequestSchema, async (body) => {
  const { pdf } = await createPdf(body);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="carenav-ai.pdf"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export async function POST(req: Request): Promise<Response> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > env().MAX_PDF_REQUEST_KB * 1024) return json({ error: "request_too_large" }, 413);
  return render(req);
}
