import { z } from "zod";
import type { SummaryResponse } from "@/lib/ai/pipeline/journeys";
import {
  PRE_INTENTS,
  MAX_FOLLOWUPS,
  preAppointmentResultSchema,
  type GateResult,
  type PrepareAnswers,
} from "@/lib/ai/schemas";
import { isUrgent, post, urgentGate, type CallError } from "./call";

export { urgentGate, type CallError };

/*
 * Client calls for Journey 1 steps 7-9 (FR-22, FR-01, FR-03). Never throw.
 * Every response is validated before use; an `urgent` response whose gate is malformed still
 * routes up, as `uncertain` (CLAUDE.md rule 2).
 */

export type FollowUpQuestion = { intent: (typeof PRE_INTENTS)[number]; question: string };
export type SummaryResult = Extract<SummaryResponse, { kind: "result" }>;

export type FollowUpsOutcome =
  | { kind: "followups"; questions: FollowUpQuestion[] }
  | { kind: "urgent"; gate: GateResult }
  | { kind: "error"; error: CallError };

export type SummaryOutcome = SummaryResult | { kind: "urgent"; gate: GateResult } | { kind: "error"; error: CallError };

const FOLLOWUPS_TIMEOUT_MS = 30_000;
/** Two model calls (English master + derived version) plus the re-screen. */
const SUMMARY_TIMEOUT_MS = 90_000;

const followUpsBodySchema = z.object({
  kind: z.literal("followups"),
  questions: z.array(z.object({ intent: z.enum(PRE_INTENTS), question: z.string().min(1) })).max(MAX_FOLLOWUPS),
});

const summaryBodySchema = z.object({
  kind: z.literal("result"),
  english: preAppointmentResultSchema,
  user: preAppointmentResultSchema.nullable(),
  userFallback: z.enum(["parity", "protected_spans", "call_failed"]).nullable(),
});

export async function fetchFollowUps(answers: PrepareAnswers, acknowledgedUrgent: boolean): Promise<FollowUpsOutcome> {
  const raw = await post("/api/followups", { journey: "prepare", answers, acknowledgedUrgent }, FOLLOWUPS_TIMEOUT_MS);
  if (!raw.ok) return { kind: "error", error: raw.error };
  if (isUrgent(raw.body)) return { kind: "urgent", gate: urgentGate(raw.body.gate) };
  const parsed = followUpsBodySchema.safeParse(raw.body);
  if (!parsed.success) return { kind: "error", error: "failed" };
  return { kind: "followups", questions: parsed.data.questions };
}

export async function fetchSummary(
  answers: PrepareAnswers,
  acknowledgedUrgent: boolean,
  outputLanguage: string | null = null,
): Promise<SummaryOutcome> {
  const raw = await post("/api/summary", { answers, acknowledgedUrgent, outputLanguage }, SUMMARY_TIMEOUT_MS);
  if (!raw.ok) return { kind: "error", error: raw.error };
  if (isUrgent(raw.body)) return { kind: "urgent", gate: urgentGate(raw.body.gate) };
  const parsed = summaryBodySchema.safeParse(raw.body);
  if (!parsed.success) return { kind: "error", error: "failed" };
  const result: SummaryResult = parsed.data;
  return result;
}
