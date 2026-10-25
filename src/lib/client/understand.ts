import { z } from "zod";
import type { ExplainResponse } from "@/lib/ai/pipeline/journeys";
import {
  MAX_FOLLOWUPS,
  POST_INTENTS,
  postAppointmentResultSchema,
  type ExplainRequest,
  type GateResult,
} from "@/lib/ai/schemas";
import { SAVE_STATUSES, type SaveStatus } from "@/lib/summaries/status";
import { isUrgent, post, urgentGate, type CallError } from "./call";

/*
 * Client calls for Journey 2 (PRD §3.3; FR-08, FR-22, FR-02, FR-03). Never throw. Every response
 * is validated before use; an `urgent` response routes up even when its gate is malformed.
 */

/** `saved` is set only for a signed-in person (FR-14). */
export type ExplainResult = Extract<ExplainResponse, { kind: "result" }> & { saved?: SaveStatus; masterToken?: string };
export type PostFollowUpQuestion = { intent: (typeof POST_INTENTS)[number]; question: string };
export type PostAnsweredFollowUp = ExplainRequest["followUps"][number];
export type MedicineCandidate = { name: string; dose: string | null };

/** Why a photo produced no text. `retake` is AC-08.4 (poor legibility): never continue with it. */
export type ExtractProblem = "retake" | "invalid" | "too_large" | "rate_limited" | "busy" | "failed";

export type ExtractOutcome =
  | { kind: "extracted"; text: string; medicineCandidates: MedicineCandidate[] }
  | { kind: "problem"; problem: ExtractProblem };

export type PostFollowUpsOutcome =
  | { kind: "followups"; questions: PostFollowUpQuestion[] }
  | { kind: "urgent"; gate: GateResult }
  | { kind: "error"; error: CallError };

export type ExplainOutcome = ExplainResult | { kind: "urgent"; gate: GateResult } | { kind: "error"; error: CallError };

/** One VISION call on a resized photo. */
const EXTRACT_TIMEOUT_MS = 60_000;
const FOLLOWUPS_TIMEOUT_MS = 30_000;
/** Two model calls (English master + derived version) plus the re-screen. */
const EXPLAIN_TIMEOUT_MS = 90_000;

const extractBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("extracted"),
    text: z.string(),
    medicineCandidates: z.array(z.object({ name: z.string().min(1), dose: z.string().nullable() })),
  }),
  z.object({ kind: z.literal("retake") }),
]);

const followUpsBodySchema = z.object({
  kind: z.literal("followups"),
  questions: z.array(z.object({ intent: z.enum(POST_INTENTS), question: z.string().min(1) })).max(MAX_FOLLOWUPS),
});

const explainBodySchema = z.object({
  kind: z.literal("result"),
  english: postAppointmentResultSchema,
  user: postAppointmentResultSchema.nullable(),
  userFallback: z.enum(["parity", "protected_spans", "call_failed"]).nullable(),
  saved: z.enum(SAVE_STATUSES).optional(),
  masterToken: z.string().optional(),
});

export function extractProblemFor(status: number): ExtractProblem {
  if (status === 400) return "invalid";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status === 503) return "busy";
  return "failed";
}

/** POST /api/extract (multipart, field `image`). The photo is sent once and not kept by the server. */
export async function extractLetter(image: Blob): Promise<ExtractOutcome> {
  try {
    const form = new FormData();
    form.append("image", image, "letter.jpg");
    const res = await fetch("/api/extract", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { kind: "problem", problem: extractProblemFor(res.status) };
    const parsed = extractBodySchema.safeParse(await res.json());
    if (!parsed.success) return { kind: "problem", problem: "failed" };
    // Nothing readable is the same as poor legibility: ask for a retake, never continue (AC-08.4).
    if (parsed.data.kind === "retake" || parsed.data.text.trim() === "") return { kind: "problem", problem: "retake" };
    return parsed.data;
  } catch {
    return { kind: "problem", problem: "failed" };
  }
}

export async function fetchLetterFollowUps(confirmedText: string, acknowledgedUrgent: boolean): Promise<PostFollowUpsOutcome> {
  const raw = await post("/api/followups", { journey: "understand", confirmedText, acknowledgedUrgent }, FOLLOWUPS_TIMEOUT_MS);
  if (!raw.ok) return { kind: "error", error: raw.error };
  if (isUrgent(raw.body)) return { kind: "urgent", gate: urgentGate(raw.body.gate) };
  const parsed = followUpsBodySchema.safeParse(raw.body);
  if (!parsed.success) return { kind: "error", error: "failed" };
  return { kind: "followups", questions: parsed.data.questions };
}

/**
 * "Change language": re-derive the signed English master only (/api/translate), which skips the
 * re-screen and re-draft. The result keeps the original token. Any failure is an error: the caller
 * then falls back to a full fetchExplain.
 */
export async function fetchTranslation(current: ExplainResult, outputLanguage: string | null): Promise<ExplainOutcome> {
  if (!current.masterToken) return { kind: "error", error: "failed" };
  const raw = await post("/api/translate", { english: current.english, masterToken: current.masterToken, outputLanguage }, EXPLAIN_TIMEOUT_MS);
  if (!raw.ok) return { kind: "error", error: raw.error };
  const parsed = explainBodySchema.safeParse(raw.body);
  if (!parsed.success) return { kind: "error", error: "failed" };
  return { ...parsed.data, masterToken: current.masterToken };
}

export async function fetchExplain(req: ExplainRequest): Promise<ExplainOutcome> {
  const raw = await post("/api/explain", req, EXPLAIN_TIMEOUT_MS);
  if (!raw.ok) return { kind: "error", error: raw.error };
  if (isUrgent(raw.body)) return { kind: "urgent", gate: urgentGate(raw.body.gate) };
  const parsed = explainBodySchema.safeParse(raw.body);
  if (!parsed.success) return { kind: "error", error: "failed" };
  const result: ExplainResult = parsed.data;
  return result;
}
