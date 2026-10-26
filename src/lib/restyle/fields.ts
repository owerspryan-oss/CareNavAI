import { z } from "zod";
import type { PostAppointmentResult, PreAppointmentResult } from "@/lib/ai/schemas";
import type { LanguageNames } from "@/lib/result/view";
import { parityMismatch } from "@/lib/validate/parity";

/*
 * FR-23 playful dialect mode: which fields may be restyled, and how a restyle is laid over a version for
 * the screen only. Pure and client-safe. Only user-facing explanatory text is listed here: never urgent
 * text, service routes, the disclaimer, medicine names or doses, the medicines table, source quotes,
 * the clinician's own words, `byWhen`, or items not found in the letter (PRD 2.1 guardrail 1, AC-23.2).
 */

/** Journey 1 fields the STYLE model may restyle, flattened so the model sees only plain text. */
export const preStyleSchema = z.object({
  mainConcern: z.string(),
  duration: z.string(),
  frequencyAndPattern: z.string(),
  changesAndTriggers: z.array(z.string()),
  previousSupport: z.array(z.string()),
  worriesAndBarriers: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
  whatToBring: z.array(z.string()),
  notMentioned: z.array(z.string()),
});
export type PreStyleFields = z.infer<typeof preStyleSchema>;

/** Journey 2 fields: each item's own explanatory text only. */
export const postStyleSchema = z.object({
  whatYouWereTold: z.array(z.string()),
  whatItMeans: z.array(z.string()),
  nextSteps: z.array(z.string()),
  unclearOrMissing: z.array(z.string()),
});
export type PostStyleFields = z.infer<typeof postStyleSchema>;

export function prePlayfulFields(v: PreAppointmentResult): PreStyleFields {
  return {
    mainConcern: v.mainConcern,
    duration: v.duration.text,
    frequencyAndPattern: v.frequencyAndPattern,
    changesAndTriggers: v.changesAndTriggers,
    previousSupport: v.medicationAndSupport.previousSupport,
    worriesAndBarriers: v.worriesAndBarriers,
    questionsToAsk: v.questionsToAsk,
    whatToBring: v.whatToBring,
    notMentioned: v.notMentioned,
  };
}

export function postPlayfulFields(v: PostAppointmentResult): PostStyleFields {
  return {
    whatYouWereTold: v.whatYouWereTold.map((x) => x.text),
    whatItMeans: v.whatItMeans.map((x) => x.plainMeaning),
    nextSteps: v.nextSteps.map((x) => x.action),
    unclearOrMissing: v.unclearOrMissing.map((x) => x.item),
  };
}

/** A version with playful text laid over it. Screen only: the PDF and saved-record schemas reject the tag. */
export type Playful<T extends { meta: object }> = T & { meta: T["meta"] & { restyled: true } };

/**
 * The person's version with the restyled fields laid over it, or null if the shapes don't line up
 * (then the plain version stays: never a partial or mismatched one, CLAUDE.md rule 6).
 */
export function applyPrePlayful(v: PreAppointmentResult, f: PreStyleFields): Playful<PreAppointmentResult> | null {
  if (parityMismatch(prePlayfulFields(v), f) !== null) return null;
  return {
    ...v,
    mainConcern: f.mainConcern,
    duration: { ...v.duration, text: f.duration },
    frequencyAndPattern: f.frequencyAndPattern,
    changesAndTriggers: f.changesAndTriggers,
    medicationAndSupport: { ...v.medicationAndSupport, previousSupport: f.previousSupport },
    worriesAndBarriers: f.worriesAndBarriers,
    questionsToAsk: f.questionsToAsk,
    whatToBring: f.whatToBring,
    notMentioned: f.notMentioned,
    meta: { ...v.meta, restyled: true },
  };
}

export function applyPostPlayful(v: PostAppointmentResult, f: PostStyleFields): Playful<PostAppointmentResult> | null {
  if (parityMismatch(postPlayfulFields(v), f) !== null) return null;
  return {
    ...v,
    whatYouWereTold: v.whatYouWereTold.map((x, i) => ({ ...x, text: f.whatYouWereTold[i] })),
    whatItMeans: v.whatItMeans.map((x, i) => ({ ...x, plainMeaning: f.whatItMeans[i] })),
    nextSteps: v.nextSteps.map((x, i) => ({ ...x, action: f.nextSteps[i] })),
    unclearOrMissing: v.unclearOrMissing.map((x, i) => ({ ...x, item: f.unclearOrMissing[i] })),
    meta: { ...v.meta, restyled: true },
  };
}

type Versions = { english: { meta: PreAppointmentResult["meta"] }; user: { meta: PreAppointmentResult["meta"] } | null };

/**
 * The dialect the playful toggle offers for a result, or null when it isn't offered (AC-23.1, AC-23.3):
 * never on a result with an urgent notice, never without a user version (the clinician's English is
 * never restyled), and only when the detected language, or else the chosen output language, has
 * `playful: true` in config/languages.json.
 */
export function playfulLanguage({ english, user }: Versions, languages: LanguageNames): string | null {
  if (english.meta.urgentAcknowledged !== null || !user || user.meta.urgentAcknowledged !== null) return null;
  return [english.meta.detectedLanguage, user.meta.outputLanguage].find((code) => languages[code]?.playful) ?? null;
}
