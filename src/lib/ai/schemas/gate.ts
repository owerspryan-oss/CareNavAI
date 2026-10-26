import { z } from "zod";
import { ageBandSchema, languageCodeSchema, registerSchema, relationshipSchema, safetyLevelSchema } from "./common";
import { MAX_FOLLOWUPS, POST_INTENTS, PRE_INTENTS } from "./followups";
import { PATTERN_OPTIONS, STARTED_OPTIONS } from "./requests";

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

/**
 * Free-text questions a screened answer can belong to, by identifier. The server maps each one to its
 * English question text (content/ui/en.json), so question wording is never taken from the client.
 */
export const SCREEN_FIELDS = ["who_label", "main_concern", "timing_note", "changes", "medicines", "previous_support", "worries"] as const;
export type ScreenField = (typeof SCREEN_FIELDS)[number];

const FOLLOW_UP_INTENTS = [...new Set([...PRE_INTENTS, ...POST_INTENTS])] as [string, ...string[]];

/**
 * A question by identifier. A follow-up question is generated per person, so it can only be sent as
 * text; it goes to the classifier inside a delimited data block like any other user-held text.
 */
export const screenQuestionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), field: z.enum(SCREEN_FIELDS) }),
  z.object({ kind: z.literal("followup"), intent: z.enum(FOLLOW_UP_INTENTS), question: z.string().trim().min(1) }),
]);
export type ScreenQuestion = z.infer<typeof screenQuestionSchema>;

/** Every free-text field plus the follow-ups: the most answers a journey can hold. */
export const MAX_CONTEXT_ANSWERS = SCREEN_FIELDS.length + MAX_FOLLOWUPS;

/**
 * Optional context for the GATE classifier only (rules and moderation never see it): the question being
 * answered and the earlier answers in this journey, in order. Character limits are applied by the route
 * (MAX_TEXT_CHARS per answer, MAX_SCREEN_CONTEXT_CHARS in total), so they stay configuration.
 */
export const screenContextSchema = z.object({
  question: screenQuestionSchema.nullable().default(null),
  /** Structured picks from earlier steps, sent as plain facts and rendered from the English labels. */
  facts: z
    .object({
      relationship: relationshipSchema.nullable().default(null),
      started: z.enum(STARTED_OPTIONS).nullable().default(null),
      pattern: z.enum(PATTERN_OPTIONS).nullable().default(null),
      noPatternNoticed: z.boolean().default(false),
    })
    .default({ relationship: null, started: null, pattern: null, noPatternNoticed: false }),
  earlier: z
    .array(z.object({ question: screenQuestionSchema, answer: z.string().trim().min(1) }))
    .max(MAX_CONTEXT_ANSWERS)
    .default([]),
});
export type ScreenContext = z.infer<typeof screenContextSchema>;

/** Input to POST /api/screen and to the in-route re-screen. */
export const screenRequestSchema = z.object({
  text: z.string().min(1),
  step: screenStepSchema,
  ageBand: ageBandSchema.nullable().default(null),
  languageHint: languageCodeSchema.nullable().default(null),
  /** Optional, so callers without context keep working unchanged. */
  context: screenContextSchema.nullable().default(null),
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
  /** The classifier prompt the server used. Absent on the client's own fail-closed result. */
  promptVersion: z.string().optional(),
});
export type GateResult = z.infer<typeof gateResultSchema>;
