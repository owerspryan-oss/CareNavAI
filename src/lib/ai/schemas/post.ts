import { z } from "zod";
import { resultMetaSchema } from "./common";

const sourceQuote = z.string().min(1);

/** What the DRAFT model returns for Journey 2 (PRD §11.2). Grounding runs on it before anything is shown. */
export const postAppointmentDraftSchema = z.object({
  whatYouWereTold: z.array(z.object({ text: z.string().min(1), sourceQuote })),
  whatItMeans: z.array(z.object({ clinicianWords: z.string().min(1), plainMeaning: z.string().min(1) })),
  nextSteps: z.array(
    z.object({
      action: z.string().min(1),
      /** The clinician's own wording, e.g. "in two weeks". No date maths in this build. */
      byWhen: z.string().nullable(),
      sourceQuote,
    }),
  ),
  medicines: z.array(
    z.object({
      name: z.string().min(1),
      dose: z.string().nullable(),
      frequency: z.string().nullable(),
      duration: z.string().nullable(),
      instructions: z.string().nullable(),
      sourceQuote,
    }),
  ),
  unclearOrMissing: z.array(
    z.object({ item: z.string().min(1), whoToAsk: z.enum(["clinician", "pharmacist", "gp_surgery"]) }),
  ),
});
export type PostAppointmentDraft = z.infer<typeof postAppointmentDraftSchema>;

export const ungroundedItemSchema = z.object({
  section: z.enum(["whatYouWereTold", "nextSteps", "medicines"]),
  text: z.string(),
  sourceQuote: z.string(),
});

export const postAppointmentResultSchema = postAppointmentDraftSchema.extend({
  ungrounded: z.array(ungroundedItemSchema),
  disclaimer: z.array(z.string()),
  meta: resultMetaSchema,
});
export type PostAppointmentResult = z.infer<typeof postAppointmentResultSchema>;
