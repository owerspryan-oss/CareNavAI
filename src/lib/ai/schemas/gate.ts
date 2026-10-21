import { z } from "zod";
import { ageBandSchema, languageCodeSchema, registerSchema, safetyLevelSchema } from "./common";

export const GATE_CATEGORIES = [
  "chest_pain",
  "breathing",
  "stroke_signs",
  "severe_bleeding",
  "loss_of_consciousness",
  "seizure",
  "severe_allergic_reaction",
  "severe_pain",
  "child_concern",
  "pregnancy_concern",
  "self_harm_or_suicide",
  "safeguarding",
  "urgent_wording_in_letter",
  "other",
] as const;
export const gateCategorySchema = z.enum(GATE_CATEGORIES);
export type GateCategory = z.infer<typeof gateCategorySchema>;

/** Layer 2 — what the LLM classifier must return (strict structured output). */
export const gateClassifierOutputSchema = z.object({
  level: safetyLevelSchema,
  categories: z.array(gateCategorySchema),
  /** A weak or possible signal. For languages without a rules list this alone routes to `uncertain` (PRD 9.8). */
  possibleSignal: z.boolean(),
  language: languageCodeSchema,
  register: registerSchema,
});
export type GateClassifierOutput = z.infer<typeof gateClassifierOutputSchema>;

export const GATE_LAYERS = ["rules", "classifier", "classifier_english", "moderation"] as const;
export const gateLayerSchema = z.enum(GATE_LAYERS);

/** Static content keys for urgent messages (content/urgent-messages). `uncertain` uses the urgent message. */
export const urgentMessageKeySchema = z.enum(["emergency", "urgent", "crisis"]);
export type UrgentMessageKey = z.infer<typeof urgentMessageKeySchema>;

export const screenStepSchema = z.enum([
  "step_text",
  "followup_answer",
  "combined",
  "letter_text",
  "transcript",
]);

/** Input to POST /api/screen and to the in-route re-screen. */
export const screenRequestSchema = z.object({
  text: z.string().min(1),
  step: screenStepSchema,
  ageBand: ageBandSchema.nullable().default(null),
  languageHint: languageCodeSchema.nullable().default(null),
});
export type ScreenRequest = z.infer<typeof screenRequestSchema>;

/** Combined gate decision returned to the client. Carries no user text and no model text. */
export const gateResultSchema = z.object({
  level: safetyLevelSchema,
  messageKey: urgentMessageKeySchema.nullable(),
  categories: z.array(gateCategorySchema),
  language: languageCodeSchema,
  register: registerSchema,
  /** Layers that errored and were treated as `uncertain` (fail closed). */
  failedLayers: z.array(gateLayerSchema),
});
export type GateResult = z.infer<typeof gateResultSchema>;
