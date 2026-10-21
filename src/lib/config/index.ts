import { z } from "zod";
import languagesJson from "@config/languages.json";
import modelsJson from "@config/models.json";
import pricingJson from "@config/pricing.json";

// Models, prices and languages are configuration, never hard-coded (CLAUDE.md rule 10).

export const MODEL_ROLES = ["GATE", "DRAFT", "TRANSLATE", "STYLE", "STT", "VISION", "MODERATION"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

const roleConfigSchema = z.object({
  model: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().nonnegative(),
  selection: z.object({ testedOn: z.string().nullable(), result: z.string() }),
});

export const modelsConfigSchema = z.object({
  roles: z.object(Object.fromEntries(MODEL_ROLES.map((r) => [r, roleConfigSchema])) as Record<ModelRole, typeof roleConfigSchema>),
});

const priceSchema = z.object({
  inputPer1M: z.number().nonnegative().optional(),
  cachedInputPer1M: z.number().nonnegative().optional(),
  outputPer1M: z.number().nonnegative().optional(),
  perAudioMinute: z.number().nonnegative().optional(),
});

export const pricingConfigSchema = z.object({
  checkedOn: z.string().nullable(),
  verified: z.boolean(),
  gbpPerUsd: z.number().positive(),
  models: z.record(z.string(), priceSchema),
});

export const OUTPUT_MODES = ["simple_english", "dialect_output", "translation"] as const;

export const languageSchema = z.object({
  code: z.string().min(2),
  englishName: z.string().min(1),
  nativeName: z.string().min(1),
  script: z.string().length(4),
  dir: z.enum(["ltr", "rtl"]),
  outputMode: z.enum(OUTPUT_MODES),
  tierATarget: z.boolean(),
  signoff: z.object({
    interfaceReviewed: z.boolean(),
    urgentMessagesReviewed: z.boolean(),
    rulesListPresent: z.boolean(),
    testScenariosPassed: z.boolean(),
    sttTested: z.boolean(),
    voiceDisabled: z.boolean(),
    pdfFontVerified: z.boolean(),
  }),
});

export const languagesConfigSchema = z
  .object({ languages: z.array(languageSchema).min(1) })
  .refine((c) => new Set(c.languages.map((l) => l.code)).size === c.languages.length, {
    message: "duplicate language code",
  });

export type Language = z.infer<typeof languageSchema>;

export const modelsConfig = modelsConfigSchema.parse(modelsJson);
export const pricingConfig = pricingConfigSchema.parse(pricingJson);
export const languagesConfig = languagesConfigSchema.parse(languagesJson);

export function modelFor(role: ModelRole) {
  return modelsConfig.roles[role];
}
