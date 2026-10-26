import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import { postAppointmentDraftSchema, type ExplainRequest, type PostAppointmentDraft } from "@/lib/ai/schemas";
import type { z } from "zod";
import { ungroundedItemSchema } from "@/lib/ai/schemas";
import { allStrings, forbiddenHits } from "@/lib/validate/forbidden";
import { isGrounded } from "@/lib/validate/grounding";
import { numbersAppearIn } from "@/lib/validate/numbers";
import { ValidationFailed } from "./prepare";

export const POST_MASTER_PROMPT = { name: "post-master", version: "v1" } as const;

type Ungrounded = z.infer<typeof ungroundedItemSchema>;
export type GroundedPost = PostAppointmentDraft & { ungrounded: Ungrounded[] };

const MED_FIELDS = ["dose", "frequency", "duration", "instructions"] as const;

/**
 * Grounding + number check (CLAUDE.md rule 7, PRD §11.4, AC-02.1-02.3). Pure and deterministic.
 * Items whose quote is not in the confirmed source move to `ungrounded` and are never shown as fact.
 * A medicine field or `byWhen` whose numbers are not in the source is nulled and flagged as unclear.
 */
export function groundPostDraft(draft: PostAppointmentDraft, source: string): GroundedPost {
  const ungrounded: Ungrounded[] = [];
  const unclearOrMissing = [...draft.unclearOrMissing];

  const whatYouWereTold = draft.whatYouWereTold.filter((i) => {
    if (isGrounded(i.sourceQuote, source)) return true;
    ungrounded.push({ section: "whatYouWereTold", text: i.text, sourceQuote: i.sourceQuote });
    return false;
  });

  const nextSteps = draft.nextSteps.flatMap((s) => {
    if (!isGrounded(s.sourceQuote, source)) {
      ungrounded.push({ section: "nextSteps", text: s.action, sourceQuote: s.sourceQuote });
      return [];
    }
    if (s.byWhen && !numbersAppearIn(s.byWhen, source)) {
      unclearOrMissing.push({ item: `When to: ${s.action}`, whoToAsk: "gp_surgery" });
      return [{ ...s, byWhen: null }];
    }
    return [s];
  });

  const medicines = draft.medicines.flatMap((m) => {
    if (!isGrounded(m.sourceQuote, source) || !source.toLowerCase().includes(m.name.toLowerCase())) {
      ungrounded.push({ section: "medicines", text: m.name, sourceQuote: m.sourceQuote });
      return [];
    }
    const fixed = { ...m };
    for (const f of MED_FIELDS) {
      const v = fixed[f];
      if (v && !numbersAppearIn(v, source)) {
        fixed[f] = null;
        unclearOrMissing.push({ item: `The ${f} for ${m.name}`, whoToAsk: "pharmacist" });
      }
    }
    return [fixed];
  });

  return { ...draft, whatYouWereTold, nextSteps, medicines, unclearOrMissing, ungrounded };
}

function contextBlock(req: Pick<ExplainRequest, "followUps">): string {
  const fu = req.followUps.map((f) => `Q: ${f.question} A: ${f.answer ?? "skipped"}`).join("\n");
  return fu ? `\n${wrapUserData("follow_ups", fu)}` : "";
}

/**
 * Journey 2 English master (FR-02, T-14). Caller MUST have a `clear` (or acknowledged) gate result
 * on the redacted confirmed text first — see /api/explain. `redactedSource` is also the grounding source.
 */
export async function generatePostMaster(
  redactedSource: string,
  req: Pick<ExplainRequest, "followUps">,
  opts: { requestId?: string },
  deps?: AiDeps,
): Promise<{ result: GroundedPost; promptVersion: string }> {
  const prompt = loadPrompt(POST_MASTER_PROMPT.name, POST_MASTER_PROMPT.version);
  let lastFailure: ValidationFailed | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await callStructured(
      {
        role: "DRAFT",
        endpoint: "/api/explain",
        requestId: opts.requestId,
        schema: postAppointmentDraftSchema,
        schemaName: "post_appointment_explanation",
        instructions: prompt.text,
        input: `${wrapUserData("source_text", redactedSource)}${contextBlock(req)}`,
      },
      deps,
    );
    // A pattern the clinician's own text uses (e.g. "you should take") is restatement, not added advice.
    const inSource = new Set(forbiddenHits(redactedSource));
    const added = allStrings(draft).flatMap(forbiddenHits).filter((h) => !inSource.has(h));
    if (added.length > 0) {
      lastFailure = new ValidationFailed("forbidden_content");
      continue;
    }
    return { result: groundPostDraft(draft, redactedSource), promptVersion: prompt.version };
  }
  throw lastFailure;
}
