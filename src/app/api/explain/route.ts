import { runExplain } from "@/lib/ai/pipeline/journeys";
import { explainRequestSchema } from "@/lib/ai/schemas";
import { handler, json } from "@/lib/api/route";

export const runtime = "nodejs";

// POST /api/explain (FR-02, FR-03): re-screens the confirmed text, then grounds every quote.
export const POST = handler("/api/explain", explainRequestSchema, async (body, ctx) => json(await runExplain(body, ctx)));
