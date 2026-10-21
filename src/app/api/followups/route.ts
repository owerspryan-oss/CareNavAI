import { runFollowUps } from "@/lib/ai/pipeline/journeys";
import { followUpsRequestSchema } from "@/lib/ai/schemas";
import { handler, json } from "@/lib/api/route";

export const runtime = "nodejs";

// POST /api/followups (FR-22): re-screens, then up to 3 clarity-only questions.
export const POST = handler("/api/followups", followUpsRequestSchema, async (body, ctx) => json(await runFollowUps(body, ctx)));
