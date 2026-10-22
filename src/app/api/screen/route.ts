import { screenRequestSchema } from "@/lib/ai/schemas";
import { assertTextLimit, handler, json } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { contextTexts } from "@/lib/safety/context";
import { publicResult, screen } from "@/lib/safety/gate";

export const runtime = "nodejs";

// POST /api/screen (FR-05): one free-text input -> gate level + static message key. Never generates content.
// Optional `context` (the question and earlier answers) is read by the classifier only.
export const POST = handler("/api/screen", screenRequestSchema, async (body, { requestId }) => {
  const e = env();
  assertTextLimit([body.text], body.step === "letter_text" || body.step === "transcript" ? e.MAX_LETTER_CHARS : e.MAX_TEXT_CHARS);
  if (body.context) {
    const texts = contextTexts(body.context);
    assertTextLimit(texts);
    assertTextLimit([texts.join("")], e.MAX_SCREEN_CONTEXT_CHARS);
  }
  const r = await screen(body.text, { step: body.step, ageBand: body.ageBand, languageHint: body.languageHint, endpoint: "/api/screen", requestId, context: body.context });
  return json(publicResult(r));
});
