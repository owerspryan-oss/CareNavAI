import { moderate, type AiDeps } from "@/lib/ai/client";
import type { SafetyLevel } from "@/lib/ai/schemas";

/**
 * Layer 3. Extra signal for self-harm only (PRD §9.1); never a sole decider for `clear`.
 * DRAFT thresholds, not clinically approved. Throws on failure; the combiner fails closed.
 */
const SELF_HARM_KEYS = ["self-harm", "self-harm/intent", "self-harm/instructions"] as const;
export const POSSIBLE_SELF_HARM_SCORE = 0.2;

export type ModerationSignal = { level: SafetyLevel; selfHarm: boolean };

export function interpretModeration(r: {
  categories: object;
  scores: object;
}): ModerationSignal {
  const cats = r.categories as Record<string, boolean | undefined>;
  const scores = r.scores as Record<string, number | undefined>;
  if (SELF_HARM_KEYS.some((k) => cats[k])) return { level: "crisis", selfHarm: true };
  if (SELF_HARM_KEYS.some((k) => (scores[k] ?? 0) >= POSSIBLE_SELF_HARM_SCORE)) return { level: "uncertain", selfHarm: true };
  return { level: "clear", selfHarm: false };
}

export async function moderationLayer(
  redactedText: string,
  opts: { endpoint: string; requestId?: string },
  deps?: AiDeps,
): Promise<ModerationSignal> {
  return interpretModeration(await moderate(redactedText, opts, deps));
}
