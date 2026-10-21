import { screenRequestSchema } from "@/lib/ai/schemas";
import { assertTextLimit, handler, json } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { publicResult, screen } from "@/lib/safety/gate";

export const runtime = "nodejs";

// POST /api/screen (FR-05): one free-text input -> gate level + static message key. Never generates content.
export const POST = handler("/api/screen", screenRequestSchema, async (body, { requestId }) => {
  assertTextLimit([body.text], body.step === "letter_text" || body.step === "transcript" ? env().MAX_LETTER_CHARS : env().MAX_TEXT_CHARS);
  const r = await screen(body.text, { step: body.step, ageBand: body.ageBand, languageHint: body.languageHint, endpoint: "/api/screen", requestId });
  return json(publicResult(r));
});
