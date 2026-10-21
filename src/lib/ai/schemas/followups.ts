import { z } from "zod";

// CONTEXT.md §6 / PRD §11.3 — the only intents a follow-up may carry.
export const PRE_INTENTS = [
  "clarify_duration",
  "clarify_frequency",
  "clarify_change",
  "clarify_medicines",
  "clarify_previous_support",
  "clarify_impact_on_daily_life",
  "clarify_wording",
] as const;

export const POST_INTENTS = [
  "clarify_unclear_term",
  "clarify_missing_dose",
  "clarify_missing_date",
  "clarify_who_to_contact",
  "clarify_wording",
] as const;

export const MAX_FOLLOWUPS = 3;
export const MAX_FOLLOWUP_WORDS = 20;

function followUpsSchema<T extends readonly [string, ...string[]]>(intents: T) {
  return z.object({
    questions: z
      .array(z.object({ intent: z.enum(intents), question: z.string().min(1) }))
      .max(MAX_FOLLOWUPS),
  });
}

export const preFollowUpsOutputSchema = followUpsSchema(PRE_INTENTS);
export const postFollowUpsOutputSchema = followUpsSchema(POST_INTENTS);
export type FollowUpsOutput = z.infer<typeof preFollowUpsOutputSchema> | z.infer<typeof postFollowUpsOutputSchema>;
