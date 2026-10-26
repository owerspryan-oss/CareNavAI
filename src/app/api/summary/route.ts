import { runSummary } from "@/lib/ai/pipeline/journeys";
import { summaryRequestSchema } from "@/lib/ai/schemas";
import { handler, json } from "@/lib/api/route";
import { autoSave } from "@/lib/summaries/autosave";

export const runtime = "nodejs";

// POST /api/summary (FR-01, FR-03): re-screens the combined answers before any generation.
// A signed-in person's result is saved, encrypted, after generation (FR-14); guests are untouched.
export const POST = handler("/api/summary", summaryRequestSchema, async (body, ctx, req) => {
  const res = await runSummary(body, ctx);
  const who = { forWhom: body.answers.forWhom.relationship, ageBand: body.answers.forWhom.ageBand };
  return json(autoSave(req, "prepare", res, who, { requestId: ctx.requestId, route: "/api/summary" }));
});
