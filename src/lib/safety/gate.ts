import type { AiDeps } from "@/lib/ai/client";
import type { AgeBand, GateCategory, GateResult, Register, SafetyLevel, ScreenContext } from "@/lib/ai/schemas";
import { env } from "@/lib/config/env";
import { urgentMessageKeyFor } from "@/lib/content";
import { db as defaultDb } from "@/lib/db";
import { log } from "@/lib/log/logger";
import { CLASSIFIER_PROMPT_VERSION, classify, classifyViaEnglish } from "./classifier";
import { contextPairs, currentQuestion } from "./context";
import { mostCautious } from "./levels";
import { moderationLayer } from "./moderation";
import { redact } from "./redact";
import { hasRulesListFor, runRules } from "./rules";

/**
 * The safety gate (FR-05, PRD §9). Redact, then rules + classifier + moderation in parallel,
 * then the most cautious result wins. Every failure is `uncertain` (CLAUDE.md rule 2).
 * Languages without a rules list get the PRD 9.8 extra caution.
 * Optional context (the question and earlier answers) goes to the classifier only, redacted like the
 * text. Rules and moderation screen the current text alone, so context can never cancel their result.
 */

type Layer = GateResult["failedLayers"][number];

export type ScreenOptions = {
  step: string;
  ageBand: AgeBand | null;
  languageHint: string | null;
  endpoint: string;
  requestId?: string;
  context?: ScreenContext | null;
};

export type Screened = GateResult & { redactedText: string };

export async function screen(text: string, opts: ScreenOptions, deps: AiDeps = {}): Promise<Screened> {
  const failedLayers: Layer[] = [];
  const levels: SafetyLevel[] = [];
  const categories: GateCategory[] = [];
  let language = opts.languageHint ?? "en";
  let register: Register = "standard";
  let redactedText = "";

  try {
    redactedText = redact(text);
    const context = opts.context
      ? { question: currentQuestion(opts.context, redact), earlier: contextPairs(opts.context, opts.ageBand, redact) }
      : null;
    const ctx = { step: opts.step, ageBand: opts.ageBand, endpoint: opts.endpoint, requestId: opts.requestId, context };
    const rules = runRules(redactedText, { language: opts.languageHint, ageBand: opts.ageBand });
    const [cls, mod] = await Promise.allSettled([
      classify(redactedText, ctx, deps),
      moderationLayer(redactedText, { endpoint: opts.endpoint, requestId: opts.requestId }, deps),
    ]);

    levels.push(rules.level);
    categories.push(...rules.categories);
    if (rules.failed) failedLayers.push("rules");

    if (cls.status === "fulfilled") {
      levels.push(cls.value.level);
      categories.push(...cls.value.categories);
      language = cls.value.language;
      register = cls.value.register;
    } else failedLayers.push("classifier");

    if (mod.status === "fulfilled") {
      levels.push(mod.value.level);
      if (mod.value.selfHarm) categories.push("self_harm_or_suicide");
    } else failedLayers.push("moderation");

    // PRD 9.8: no hand-written list for this language -> stricter threshold + English second pass.
    if (cls.status === "fulfilled" && !hasRulesListFor(language)) {
      if (cls.value.possibleSignal) levels.push("uncertain");
      if (mostCautious(levels) !== "emergency") {
        try {
          const second = await classifyViaEnglish(redactedText, ctx, deps);
          levels.push(second.level);
          categories.push(...second.categories);
        } catch {
          failedLayers.push("classifier_english");
        }
      }
    }
  } catch {
    // Anything unexpected (including in redaction) fails closed.
    failedLayers.push("rules");
  }

  if (failedLayers.length > 0) levels.push("uncertain");
  const level = mostCautious(levels);
  const result: Screened = {
    level,
    messageKey: urgentMessageKeyFor(level),
    categories: [...new Set(categories)],
    language,
    register,
    failedLayers: [...new Set(failedLayers)],
    promptVersion: CLASSIFIER_PROMPT_VERSION,
    redactedText,
  };
  recordEvent(result, opts, deps);
  return result;
}

function recordEvent(r: GateResult, opts: ScreenOptions, deps: AiDeps) {
  log.info({ requestId: opts.requestId, route: opts.endpoint, step: opts.step, safetyLevel: r.level, languageCode: r.language, status: r.failedLayers.length ? "layer_failed" : "ok" });
  if (r.level === "clear") return;
  try {
    (deps.db ?? defaultDb())
      .prepare("INSERT INTO safety_events (ts, step, level, layer_flags, language, mode) VALUES (?, ?, ?, ?, ?, ?)")
      .run(Date.now(), opts.step, r.level, r.failedLayers.join(","), r.language, env().URGENT_MODE);
  } catch {
    // Counting must never block the urgent message.
    log.error({ requestId: opts.requestId, route: opts.endpoint, errorType: "safety_event_write_failed" });
  }
}

/** Strips server-only fields before a gate result goes to the client. */
export function publicResult(r: Screened): GateResult {
  return {
    level: r.level,
    messageKey: r.messageKey,
    categories: r.categories,
    language: r.language,
    register: r.register,
    failedLayers: r.failedLayers,
    promptVersion: r.promptVersion,
  };
}

/**
 * Whether a generate route may continue after its own re-screen (CLAUDE.md rules 1 and 4).
 * `clear` always proceeds. Anything else proceeds only in continue_after_ack mode AND after the
 * user acknowledged the static message; the result then carries the persistent urgent banner.
 */
export function gateDecision(
  r: GateResult,
  acknowledged: boolean,
  mode = env().URGENT_MODE,
): { proceed: true; urgentAcknowledged: Exclude<SafetyLevel, "clear"> | null } | { proceed: false } {
  if (r.level === "clear") return { proceed: true, urgentAcknowledged: null };
  if (mode === "continue_after_ack" && acknowledged) return { proceed: true, urgentAcknowledged: r.level };
  return { proceed: false };
}
