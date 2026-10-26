import { runRestyle } from "@/lib/ai/pipeline/restyle";
import { restyleRequestSchema } from "@/lib/ai/schemas";
import { handler, json } from "@/lib/api/route";
import { env } from "@/lib/config/env";

export const runtime = "nodejs";

/**
 * POST /api/restyle (FR-23, ADR-010): a playful patois or pidgin version of a result's user-facing text,
 * derived from the English master the client holds. Screened by the full gate first; protected spans
 * checked in code. Never saved and never sent to the PDF: the response is tagged `restyled`.
 */
const restyle = handler("/api/restyle", restyleRequestSchema, async (body, ctx) => json(await runRestyle(body, ctx)));

export async function POST(req: Request): Promise<Response> {
  // The body is one result, smaller than the two-version PDF body, so the PDF limit bounds it too.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > env().MAX_PDF_REQUEST_KB * 1024) return json({ error: "request_too_large" }, 413);
  return restyle(req);
}
