import type { SafetyLevel } from "@/lib/ai/schemas";

/**
 * Caution order for combining gate results (PRD 9.2: "the highest level any
 * layer returns"). `uncertain` sits just under `urgent` because it shows the
 * urgent message. emergency outranks crisis because the emergency message is
 * the one that says "call 999 now"; the crisis message also carries 999.
 * DRAFT ordering: emergency-vs-crisis precedence is an open clinical question.
 */
export const LEVEL_RANK: Record<SafetyLevel, number> = {
  clear: 0,
  uncertain: 1,
  urgent: 2,
  crisis: 3,
  emergency: 4,
};

export function mostCautious(levels: readonly SafetyLevel[]): SafetyLevel {
  return levels.reduce<SafetyLevel>((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), "clear");
}
