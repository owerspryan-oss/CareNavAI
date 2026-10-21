import { z } from "zod";
import { ageBandSchema, relationshipSchema } from "./common";
import { POST_INTENTS, PRE_INTENTS } from "./followups";

// Request bodies shared by the UI and the API routes. Length limits are applied by the route
// (MAX_TEXT_CHARS from env), not here, so they stay configuration.

const freeText = z.string().trim();

export const STARTED_OPTIONS = ["today", "few_days", "1_to_4_weeks", "1_to_6_months", "over_6_months", "not_sure"] as const;
export const PATTERN_OPTIONS = ["constant", "comes_and_goes", "changing", "not_sure"] as const;

export const answeredFollowUpSchema = <T extends readonly [string, ...string[]]>(intents: T) =>
  z.object({ intent: z.enum(intents), question: z.string(), answer: freeText.nullable() });

/** Journey 1 answers (PRD §3.2 steps 1-7). Structured picks are never sent to the classifier. */
export const prepareAnswersSchema = z.object({
  forWhom: z.object({
    relationship: relationshipSchema,
    label: freeText.max(60).nullable(),
    ageBand: ageBandSchema.nullable(),
  }),
  mainConcern: freeText.min(1),
  timing: z.object({
    started: z.enum(STARTED_OPTIONS).nullable(),
    pattern: z.enum(PATTERN_OPTIONS).nullable(),
    note: freeText.nullable(),
  }),
  changes: freeText.nullable(),
  medicines: freeText.nullable(),
  worries: freeText.nullable(),
  followUps: z.array(answeredFollowUpSchema(PRE_INTENTS)).max(3),
});
export type PrepareAnswers = z.infer<typeof prepareAnswersSchema>;

export const summaryRequestSchema = z.object({
  answers: prepareAnswersSchema,
  /** Set when the user acknowledged an urgent message earlier in the journey (continue_after_ack). */
  acknowledgedUrgent: z.boolean().default(false),
  outputLanguage: z.string().min(2).max(16).nullable().default(null),
});
export type SummaryRequest = z.infer<typeof summaryRequestSchema>;

/** Journey 2 (PRD §3.3). `confirmedText` is what the user checked after typing, speaking or photographing. */
export const explainRequestSchema = z.object({
  confirmedText: freeText.min(1),
  source: z.enum(["typed", "voice", "photo"]),
  followUps: z.array(answeredFollowUpSchema(POST_INTENTS)).max(3),
  acknowledgedUrgent: z.boolean().default(false),
  outputLanguage: z.string().min(2).max(16).nullable().default(null),
});
export type ExplainRequest = z.infer<typeof explainRequestSchema>;

/** Every free-text field in Journey 1, in step order. This is what the combined re-screen reads. */
export function prepareFreeText(a: PrepareAnswers): { step: string; text: string }[] {
  const parts: { step: string; text: string | null }[] = [
    { step: "main_concern", text: a.mainConcern },
    { step: "timing_note", text: a.timing.note },
    { step: "changes", text: a.changes },
    { step: "medicines", text: a.medicines },
    { step: "worries", text: a.worries },
    ...a.followUps.map((f) => ({ step: `followup_${f.intent}`, text: f.answer })),
  ];
  return parts.filter((p): p is { step: string; text: string } => !!p.text && p.text.length > 0);
}
