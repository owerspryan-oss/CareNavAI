import type { z } from "zod";
import {
  gateResultSchema,
  screenRequestSchema,
  type AgeBand,
  type GateResult,
  type SafetyLevel,
  type screenStepSchema,
} from "@/lib/ai/schemas";

export type ScreenStep = z.infer<typeof screenStepSchema>;

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
): Promise<GateResult> {
  const request = screenRequestSchema.safeParse({ text, step, ageBand, languageHint: null });
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

/** Most cautious first. `uncertain` is treated as urgent (CONTEXT.md §5), so it never outranks a definite level. */
const CAUTION_ORDER: readonly SafetyLevel[] = ["emergency", "crisis", "urgent", "uncertain", "clear"];

/**
 * Pick the result to act on when one step screened several fields.
 * Returns null only when every result is `clear` (and there was at least one).
 */
export function mostCautious(results: readonly GateResult[]): GateResult | null {
  let worst: GateResult | null = null;
  for (const r of results) {
    if (r.level === "clear") continue;
    if (!worst || CAUTION_ORDER.indexOf(r.level) < CAUTION_ORDER.indexOf(worst.level)) worst = r;
  }
  return worst;
}
