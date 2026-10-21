import { z } from "zod";
import { ageBandSchema, relationshipSchema, resultMetaSchema } from "./common";

export const MAX_QUESTIONS_TO_ASK = 8;

/** What the DRAFT model returns for Journey 1 (PRD §11.1). Static fields are added by the server. */
export const preAppointmentDraftSchema = z.object({
  forWhom: z.object({
    relationship: relationshipSchema,
    label: z.string(),
    ageBand: ageBandSchema.nullable(),
  }),
  mainConcern: z.string().min(1),
  duration: z.object({ text: z.string(), stated: z.boolean() }),
  frequencyAndPattern: z.string(),
  changesAndTriggers: z.array(z.string()),
  medicationAndSupport: z.object({
    provided: z.boolean(),
    medicines: z.array(z.object({ name: z.string().min(1), dose: z.string().nullable() })),
    previousSupport: z.array(z.string()),
  }),
  worriesAndBarriers: z.array(z.string()),
  questionsToAsk: z.array(z.string().min(1)).max(MAX_QUESTIONS_TO_ASK),
  whatToBring: z.array(z.string()),
  notMentioned: z.array(z.string()),
});
export type PreAppointmentDraft = z.infer<typeof preAppointmentDraftSchema>;

/** Static service route, copied from content/service-routes (never model-written). */
export const serviceRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  contacts: z.array(z.object({ label: z.string(), href: z.string() })),
});

export const preAppointmentResultSchema = preAppointmentDraftSchema.extend({
  serviceRoutes: z.array(serviceRouteSchema),
  disclaimer: z.array(z.string()),
  meta: resultMetaSchema,
});
export type PreAppointmentResult = z.infer<typeof preAppointmentResultSchema>;
