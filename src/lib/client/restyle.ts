import { z } from "zod";
import type { PostAppointmentResult, PreAppointmentResult } from "@/lib/ai/schemas";
import { postStyleSchema, preStyleSchema, type PostStyleFields, type PreStyleFields } from "@/lib/restyle/fields";
import { post } from "./call";

/*
 * FR-23: ask /api/restyle for a playful version of the English master. Never throws. Anything but a
 * well-formed `restyled` response is null, and the result view keeps the plain version.
 */

export type RestyleBody =
  | { flow: "prepare"; language: string; english: PreAppointmentResult }
  | { flow: "understand"; language: string; english: PostAppointmentResult };

const responseSchema = z.discriminatedUnion("flow", [
  z.object({ kind: z.literal("restyled"), restyled: z.literal(true), flow: z.literal("prepare"), fields: preStyleSchema }),
  z.object({ kind: z.literal("restyled"), restyled: z.literal(true), flow: z.literal("understand"), fields: postStyleSchema }),
]);

export async function requestRestyle(body: RestyleBody & { flow: "prepare" }, timeoutMs?: number): Promise<PreStyleFields | null>;
export async function requestRestyle(body: RestyleBody & { flow: "understand" }, timeoutMs?: number): Promise<PostStyleFields | null>;
export async function requestRestyle(body: RestyleBody, timeoutMs = 30_000): Promise<PreStyleFields | PostStyleFields | null> {
  const res = await post("/api/restyle", body, timeoutMs);
  if (!res.ok) return null;
  const parsed = responseSchema.safeParse(res.body);
  return parsed.success && parsed.data.flow === body.flow ? parsed.data.fields : null;
}
