import { z } from "zod";
import { notRestyled, postAppointmentResultSchema, preAppointmentResultSchema } from "@/lib/ai/schemas";

/**
 * POST /api/pdf body (FR-10). Guests are stateless, so the client sends back the result it already
 * holds: the `english` and `user` fields of a `kind: "result"` response from /api/summary
 * (flow "prepare") or /api/explain (flow "understand"). Other keys (kind, userFallback) are ignored.
 * Restyled (playful) text is rejected outright (ADR-010, AC-10.4, AC-23.4).
 */
export const pdfRequestSchema = notRestyled(
  z.discriminatedUnion("flow", [
    z.object({ flow: z.literal("prepare"), english: preAppointmentResultSchema, user: preAppointmentResultSchema.nullable() }),
    z.object({ flow: z.literal("understand"), english: postAppointmentResultSchema, user: postAppointmentResultSchema.nullable() }),
  ]),
);
export type PdfRequest = z.infer<typeof pdfRequestSchema>;
