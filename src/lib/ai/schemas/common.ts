import { z } from "zod";

// Our CSP forbids eval (T-28). Without this, Zod probes for it with `Function("")` on first use, which
// the browser reports as a CSP violation (harmless, but noise in every page's reports).
z.config({ jitless: true });

// Shared enums (CONTEXT.md §5, §6). Model-output schemas use `.nullable()`
// rather than `.optional()` so they stay valid for strict structured outputs.

export const SAFETY_LEVELS = ["emergency", "urgent", "crisis", "uncertain", "clear"] as const;
export const safetyLevelSchema = z.enum(SAFETY_LEVELS);
export type SafetyLevel = z.infer<typeof safetyLevelSchema>;

export const REGISTERS = ["standard", "dialect_or_creole", "informal", "mixed"] as const;
export const registerSchema = z.enum(REGISTERS);
export type Register = z.infer<typeof registerSchema>;

// DRAFT age bands for FR-09 child thresholds; the clinical adviser sets the real cut-offs.
export const AGE_BANDS = ["under_1", "1_to_4", "5_to_11", "12_to_17", "adult"] as const;
export const ageBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof ageBandSchema>;

export const RELATIONSHIPS = ["self", "parent", "carer", "other"] as const;
export const relationshipSchema = z.enum(RELATIONSHIPS);

export const languageCodeSchema = z.string().min(2).max(16);

export const outputModeSchema = z.enum(["simple_english", "dialect_output", "translation"]);

/** Server-filled metadata attached to every generated result. Never produced by the model. */
export const resultMetaSchema = z.object({
  detectedLanguage: languageCodeSchema,
  register: registerSchema,
  outputLanguage: languageCodeSchema,
  outputMode: outputModeSchema,
  promptVersion: z.string().min(1),
  confidenceNotice: z.boolean(),
  /** Set when the journey continued after an urgent acknowledgement (v0.3 A2); drives the persistent banner. */
  urgentAcknowledged: safetyLevelSchema.exclude(["clear"]).nullable(),
});
export type ResultMeta = z.infer<typeof resultMetaSchema>;
