import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import { preAppointmentDraftSchema, type PreAppointmentDraft, type PrepareAnswers } from "@/lib/ai/schemas";
import { allStrings, forbiddenHits } from "@/lib/validate/forbidden";
import { numbersAppearIn } from "@/lib/validate/numbers";

export const PRE_MASTER_PROMPT = { name: "pre-master", version: "v2" } as const;

export class ValidationFailed extends Error {
  constructor(readonly check: "forbidden_content" | "numbers") {
    super(check);
    this.name = "ValidationFailed";
  }
}

/** Answers as the model sees them: structured picks as labels, free text verbatim (already redacted). */
export function answersBlock(a: PrepareAnswers): string {
  const lines = [
    `relationship: ${a.forWhom.relationship}`,
    `age_band: ${a.forWhom.ageBand ?? "not_stated"}`,
    `label: ${a.forWhom.label ?? ""}`,
    `main_concern: ${a.mainConcern}`,
    `started: ${a.timing.started ?? "not_stated"}`,
    `pattern: ${a.timing.pattern ?? "not_stated"}`,
    `timing_note: ${a.timing.note ?? ""}`,
    `changes: ${a.changes ?? ""}`,
    `medicines: ${a.medicines ?? ""}`,
    `previous_support: ${a.previousSupport ?? ""}`,
    `worries: ${a.worries ?? ""}`,
    ...a.followUps.map((f) => `follow_up (${f.intent}) Q: ${f.question} A: ${f.answer ?? "skipped"}`),
  ];
  return wrapUserData("answers", lines.join("\n"));
}

/** Deterministic checks on the English master (PRD §11.4). Returns the first failure, or null. */
export function checkPreDraft(draft: PreAppointmentDraft, answers: PrepareAnswers): ValidationFailed | null {
  if (allStrings(draft).some((s) => forbiddenHits(s).length > 0)) return new ValidationFailed("forbidden_content");
  const said = [answers.mainConcern, answers.timing.note, answers.changes, answers.medicines, answers.previousSupport, answers.worries, ...answers.followUps.map((f) => f.answer)]
    .filter(Boolean)
    .join("\n");
  const doses = draft.medicationAndSupport.medicines.map((m) => `${m.name} ${m.dose ?? ""}`).join("\n");
  if (!numbersAppearIn(doses, said)) return new ValidationFailed("numbers");
  return null;
}

/**
 * Journey 1 English master (FR-01, T-11). Caller MUST have a `clear` (or acknowledged) gate
 * result on the combined, redacted answers first — see the /api/summary route.
 * One retry on a failed deterministic check, then the error propagates (friendly error upstream).
 */
export async function generatePreMaster(
  redactedAnswers: PrepareAnswers,
  opts: { requestId?: string },
  deps?: AiDeps,
): Promise<{ draft: PreAppointmentDraft; promptVersion: string }> {
  const prompt = loadPrompt(PRE_MASTER_PROMPT.name, PRE_MASTER_PROMPT.version);
  let lastFailure: ValidationFailed | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await callStructured(
      {
        role: "DRAFT",
        endpoint: "/api/summary",
        requestId: opts.requestId,
        schema: preAppointmentDraftSchema,
        schemaName: "pre_appointment_summary",
        instructions: prompt.text,
        input: answersBlock(redactedAnswers),
      },
      deps,
    );
    lastFailure = checkPreDraft(draft, redactedAnswers);
    if (!lastFailure) return { draft, promptVersion: prompt.version };
  }
  throw lastFailure;
}
