import { runExplain } from "@/lib/ai/pipeline/journeys";
import { explainRequestSchema, postAppointmentResultSchema } from "@/lib/ai/schemas";
import { handler, json } from "@/lib/api/route";
import { signMaster } from "@/lib/security/master-token";
import { autoSave } from "@/lib/summaries/autosave";

export const runtime = "nodejs";

// POST /api/explain (FR-02, FR-03): re-screens the confirmed text, then grounds every quote.
// A signed-in person's result is saved, encrypted, after generation (FR-14); guests are untouched.
export const POST = handler("/api/explain", explainRequestSchema, async (body, ctx, req) => {
  const res = await runExplain(body, ctx);
  const out = autoSave(req, "understand", res, { forWhom: "not_asked", ageBand: null }, { requestId: ctx.requestId, route: "/api/explain" });
  // The token lets "Change language" re-derive this master only (/api/translate). Not saved with the result.
  return json(out.kind === "result" ? { ...out, masterToken: signMaster("understand", postAppointmentResultSchema.parse(out.english)) } : out);
});
