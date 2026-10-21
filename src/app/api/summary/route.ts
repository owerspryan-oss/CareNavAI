import { runSummary } from "@/lib/ai/pipeline/journeys";
import { summaryRequestSchema } from "@/lib/ai/schemas";
import { handler, json } from "@/lib/api/route";

export const runtime = "nodejs";

// POST /api/summary (FR-01, FR-03): re-screens the combined answers before any generation.
export const POST = handler("/api/summary", summaryRequestSchema, async (body, ctx) => json(await runSummary(body, ctx)));
