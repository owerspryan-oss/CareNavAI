import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import {
  MAX_FOLLOWUP_WORDS,
  MAX_FOLLOWUPS,
  POST_INTENTS,
  PRE_INTENTS,
  postFollowUpsOutputSchema,
  preFollowUpsOutputSchema,
} from "@/lib/ai/schemas";
import { forbiddenHits } from "@/lib/validate/forbidden";
import { log } from "@/lib/log/logger";

export const FOLLOWUPS_PROMPT = { name: "followups", version: "v1" } as const;

export type Journey = "prepare" | "understand";
export type FollowUp = { intent: string; question: string };

// Words that would make a question probe the condition rather than clarify (AC-22.4). DRAFT list.
const PROBING = /\b(?:scale of|out of 10|how (?:bad|severe|strong)|severity|rate (?:the|your)|any other symptoms?|do you also (?:have|feel)|have you (?:also )?(?:noticed|had) (?:any )?(?:fever|bleeding|blood|vomit|rash|pain|weight)|diagnos)/i;

/**
 * Server-side intent validator (AC-22.3, AC-22.4). Anything off-list, too long, probing or
 * duplicated is discarded. If the model returned anything invalid at all, fall back to no
 * follow-ups rather than a partial set (AC-22.3).
 */
export function validateFollowUps(journey: Journey, questions: FollowUp[]): FollowUp[] {
  const allowed: readonly string[] = journey === "prepare" ? PRE_INTENTS : POST_INTENTS;
  const seen = new Set<string>();
  for (const q of questions) {
    const words = q.question.trim().split(/\s+/).filter(Boolean);
    const ok =
      allowed.includes(q.intent) &&
      words.length > 0 &&
      words.length < MAX_FOLLOWUP_WORDS &&
      !PROBING.test(q.question) &&
      forbiddenHits(q.question).length === 0 &&
      !seen.has(q.question.trim().toLowerCase());
    if (!ok) return [];
    seen.add(q.question.trim().toLowerCase());
  }
  return questions.slice(0, MAX_FOLLOWUPS);
}

/**
 * Up to 3 clarity-only questions (FR-22, T-10). Caller MUST have screened the input first.
 * Any failure returns no follow-ups: skipping them still produces a summary (AC-22.2).
 */
export async function generateFollowUps(
  journey: Journey,
  redactedData: string,
  opts: { requestId?: string },
  deps?: AiDeps,
): Promise<{ questions: FollowUp[]; promptVersion: string }> {
  const prompt = loadPrompt(FOLLOWUPS_PROMPT.name, FOLLOWUPS_PROMPT.version);
  const tag = journey === "prepare" ? "answers" : "source_text";
  try {
    const out = await callStructured(
      {
        role: "DRAFT",
        endpoint: "/api/followups",
        requestId: opts.requestId,
        schema: journey === "prepare" ? preFollowUpsOutputSchema : postFollowUpsOutputSchema,
        schemaName: `${journey}_followups`,
        instructions: prompt.text,
        input: `<context>\njourney: ${journey === "prepare" ? "pre-appointment" : "post-appointment"}\n</context>\n${wrapUserData(tag, redactedData)}`,
      },
      deps,
    );
    return { questions: validateFollowUps(journey, out.questions), promptVersion: prompt.version };
  } catch {
    log.warn({ requestId: opts.requestId, route: "/api/followups", step: "followups", status: "fallback_none" });
    return { questions: [], promptVersion: prompt.version };
  }
}
