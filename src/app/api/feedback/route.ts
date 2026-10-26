import { handler, json } from "@/lib/api/route";
import { saveUserFeedback, userFeedbackSchema } from "@/lib/feedback/user";

export const runtime = "nodejs";

// POST /api/feedback (FR-16): the two anonymous answers after a result. Stores no content.
export const POST = handler("/api/feedback", userFeedbackSchema, async (body) => {
  saveUserFeedback(body);
  return json({ ok: true });
});
