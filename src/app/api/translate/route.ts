import { runTranslate } from "@/lib/ai/pipeline/journeys";
import { translateRequestSchema } from "@/lib/ai/schemas";
import { handler, HttpError, json } from "@/lib/api/route";
import { verifyMaster } from "@/lib/security/master-token";

export const runtime = "nodejs";

// POST /api/translate (FR-03, Journey 2 "Change language"): re-derives the person's version from an
// English master this server signed after a clear gate, so it neither re-screens nor re-drafts.
// An unknown or stale token (e.g. after a restart) is refused; the client then asks /api/explain.
export const POST = handler("/api/translate", translateRequestSchema, async (body, ctx) => {
  if (!verifyMaster("understand", body.english, body.masterToken)) throw new HttpError(403, "invalid_master");
  return json(await runTranslate(body.english, body.outputLanguage, ctx));
});
