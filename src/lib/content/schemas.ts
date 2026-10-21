import { z } from "zod";
import { languageCodeSchema, urgentMessageKeySchema } from "@/lib/ai/schemas";

// Zod schemas for the static content files in content/ (FR-01, FR-05, FR-29, ADR-004).

export const CONTENT_STATUSES = ["DRAFT_NOT_CLINICALLY_APPROVED", "APPROVED"] as const;

const contentHeader = {
  $comment: z.string().optional(),
  language: languageCodeSchema,
  status: z.enum(CONTENT_STATUSES),
  reviewed: z.boolean(),
  /** null for the English master; "en" for every derived translation. */
  derivedFrom: z.literal("en").nullable(),
};

const hrefSchema = z.string().regex(/^(tel:\d+|https:\/\/\S+)$/, "href must be tel:<digits> or an https URL");

export const URGENT_ACTION_IDS = ["call_999", "call_111", "nhs_111_online", "call_samaritans"] as const;

export const urgentActionSchema = z.object({
  id: z.enum(URGENT_ACTION_IDS),
  label: z.string().min(1),
  href: hrefSchema,
});

/**
 * The extra step before continuing past a crisis message (product owner, 2026-10-21: "yes, but make it
 * hard to"): a quiet link opens it, and the button stays off until the person ticks `confirm`.
 */
const continueCheckSchema = z.object({
  link: z.string().min(1),
  title: z.string().min(1),
  body: z.array(z.string().min(1)).min(1),
  confirm: z.string().min(1),
  button: z.string().min(1),
});

export const urgentMessageSchema = z.object({
  title: z.string().min(1),
  body: z.array(z.string().min(1)).min(1),
  /** Persistent notice on the result and PDF after acknowledgement (v0.3 A2). */
  banner: z.string().min(1),
  actions: z.array(urgentActionSchema).min(1),
  continueCheck: continueCheckSchema.optional(),
  /** Emergency only: the Samaritans line shown when self-harm was detected alongside an emergency. */
  selfHarmLine: z.string().min(1).optional(),
});
export type UrgentMessage = z.infer<typeof urgentMessageSchema>;

const messagesShape = {
  ...(Object.fromEntries(urgentMessageKeySchema.options.map((k) => [k, urgentMessageSchema])) as Record<
    z.infer<typeof urgentMessageKeySchema>,
    typeof urgentMessageSchema
  >),
  /** Every language must carry the crisis check, so no language can continue past crisis in one tap. */
  crisis: urgentMessageSchema.required({ continueCheck: true }),
  emergency: urgentMessageSchema.required({ selfHarmLine: true }),
};

export const urgentMessagesFileSchema = z
  .object({
    ...contentHeader,
    labels: z.object({ acknowledge: z.string().min(1), startAgain: z.string().min(1) }),
    messages: z.object(messagesShape),
  })
  .strict();
export type UrgentMessagesFile = z.infer<typeof urgentMessagesFileSchema>;

export const SERVICE_ROUTE_IDS = ["gp_surgery", "pharmacy", "nhs_111", "emergency_999", "samaritans"] as const;
const serviceRouteIdSchema = z.enum(SERVICE_ROUTE_IDS);

export const serviceRoutesFileSchema = z
  .object({
    ...contentHeader,
    routes: z.array(
      z.object({
        id: serviceRouteIdSchema,
        name: z.string().min(1),
        description: z.string().min(1),
        contacts: z.array(z.object({ label: z.string().min(1), href: hrefSchema })),
      }),
    ),
    sets: z.object({
      preAppointment: z.array(serviceRouteIdSchema).min(1),
      postAppointment: z.array(serviceRouteIdSchema).min(1),
    }),
  })
  .strict()
  .refine((f) => [...f.sets.preAppointment, ...f.sets.postAppointment].every((id) => f.routes.some((r) => r.id === id)), {
    message: "a route set names a route that is not defined",
  });
export type ServiceRoutesFile = z.infer<typeof serviceRoutesFileSchema>;

export const disclaimersFileSchema = z
  .object({
    ...contentHeader,
    draftLabel: z.string().min(1),
    preAppointment: z.array(z.string().min(1)).min(1),
    postAppointment: z.array(z.string().min(1)).min(1),
    guestProviderNotice: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type DisclaimersFile = z.infer<typeof disclaimersFileSchema>;
