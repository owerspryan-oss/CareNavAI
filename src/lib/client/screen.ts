import type { z } from "zod";
import { LEVEL_RANK } from "@/lib/safety/levels";
import {
  gateResultSchema,
  screenRequestSchema,
  type AgeBand,
  type GateResult,
  type screenContextSchema,
  type ScreenQuestion,
  type screenStepSchema,
} from "@/lib/ai/schemas";

export type ScreenStep = z.infer<typeof screenStepSchema>;
/** What a caller sends as context: the question being answered and the earlier answers, in order. */
export type ScreenContextInput = z.input<typeof screenContextSchema>;

/** Client-side network budget for one screen call. A timeout fails closed like any other error. */
const SCREEN_TIMEOUT_MS = 20_000;

/**
 * The result used whenever screening could not complete (CLAUDE.md rule 2: fail closed).
 * `uncertain` routes up exactly like `urgent`, and uses the urgent static message.
 */
export function failClosedResult(): GateResult {
  return {
    level: "uncertain",
    messageKey: "urgent",
    categories: [],
    language: "und",
    register: "standard",
    failedLayers: [],
  };
}

/**
 * Screen one piece of free text with the urgency gate (POST /api/screen).
 * Never throws. Any network error, timeout, non-2xx status or malformed body
 * returns a `uncertain` result, so callers can only proceed on an explicit `clear`.
 */
export async function screenText(
  text: string,
  step: ScreenStep,
  ageBand: AgeBand | null,
  context: ScreenContextInput | null = null,
): Promise<GateResult> {
  const request = screenRequestSchema.safeParse({ text, step, ageBand, languageHint: null, context });
  if (!request.success) return failClosedResult();

  try {
    const res = await fetch("/api/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.data),
      signal: AbortSignal.timeout(SCREEN_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return failClosedResult();
    const parsed = gateResultSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : failClosedResult();
  } catch {
    return failClosedResult();
  }
}

/**
 * Pick the result to act on when one step screened several fields, carrying the categories of every
 * non-clear result (so e.g. self-harm in one field still shows on an emergency from another).
 * Returns null only when every result is `clear` (and there was at least one).
 */
export function mostCautious(results: readonly GateResult[]): GateResult | null {
  let worst: GateResult | null = null;
  for (const r of results) {
    if (r.level === "clear") continue;
    if (!worst || LEVEL_RANK[r.level] > LEVEL_RANK[worst.level]) worst = r;
  }
  if (!worst) return null;
  const categories = [...new Set(results.filter((r) => r.level !== "clear").flatMap((r) => r.categories))];
  return { ...worst, categories };
}

const askedChars = (q: ScreenQuestion | null | undefined) => (q?.kind === "followup" ? q.question.length : 0);

/**
 * Keep the context within MAX_SCREEN_CONTEXT_CHARS (passed down from server config), in order:
 * an earlier answer that would go over the budget is left out rather than cut, and the rest still go.
 * Leaving context out only gives the classifier less to go on; the current text is always screened.
 */
export function fitContext(context: ScreenContextInput, maxChars: number): ScreenContextInput {
  let used = askedChars(context.question);
  const earlier = (context.earlier ?? []).filter((e) => {
    const n = e.answer.length + askedChars(e.question);
    if (used + n > maxChars) return false;
    used += n;
    return true;
  });
  return { ...context, earlier };
}

type AskedFollowUp = { intent: string; question: string; answer: string | null };

/**
 * Context for follow-up answer `index`: its own question, plus the earlier answers in `base`
 * followed by the follow-ups answered before it.
 */
export function followUpContext(followUps: readonly AskedFollowUp[], index: number, base: ScreenContextInput = {}): ScreenContextInput {
  const asked = (f: AskedFollowUp) => ({ kind: "followup" as const, intent: f.intent, question: f.question });
  const before = followUps
    .slice(0, index)
    .filter((f) => f.answer !== null && f.answer.trim() !== "")
    .map((f) => ({ question: asked(f), answer: f.answer as string }));
  return { ...base, question: asked(followUps[index]), earlier: [...(base.earlier ?? []), ...before] };
}
