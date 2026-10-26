import en from "../../../content/ui/en.json";
import type { AgeBand, ScreenContext, ScreenField, ScreenQuestion } from "@/lib/ai/schemas";

/**
 * Context for the GATE classifier (DECISIONS.md 2026-10-22, "Gate classifier reads earlier answers").
 * Question wording comes from the English interface master, keyed by identifier, never from the client.
 * Only the classifier sees this; rules and moderation screen the current text alone.
 */

const ui = en.messages.prepare;

/** The English question for each free-text field (content/ui/en.json). */
export const FIELD_QUESTIONS: Record<ScreenField, string> = {
  who_label: ui.who.labelLabel,
  main_concern: ui.steps.concern.title,
  timing_note: ui.timing.notesLabel,
  changes: ui.steps.changes.title,
  medicines: ui.medicines.medicinesLabel,
  previous_support: ui.medicines.supportLabel,
  worries: ui.steps.worries.title,
};

/** Request values for "When did it start?" -> the interface key that labels them. */
const STARTED_LABEL_KEY = {
  today: "today",
  few_days: "days",
  "1_to_4_weeks": "weeks",
  "1_to_6_months": "months",
  over_6_months: "over_6_months",
  not_sure: "not_sure",
} as const;

/** Every client-held string in the context (answers and follow-up questions), for the route's size limits. */
export function contextTexts(ctx: ScreenContext): string[] {
  const asked = [ctx.question, ...ctx.earlier.map((e) => e.question)].flatMap((q) => (q?.kind === "followup" ? [q.question] : []));
  return [...asked, ...ctx.earlier.map((e) => e.answer)];
}

export type ContextPair = { question: string; answer: string };

/**
 * The earlier answers as English question/answer pairs, in journey order: who it is for (and age band),
 * then the timing picks, then the free-text answers as sent. `redact` is applied to every client-held
 * string (answers and follow-up questions); fixed labels from en.json are trusted.
 */
export function contextPairs(ctx: ScreenContext, ageBand: AgeBand | null, redact: (t: string) => string): ContextPair[] {
  const pairs: ContextPair[] = [];
  const f = ctx.facts;
  if (f.relationship) pairs.push({ question: ui.steps.who.title, answer: ui.who.options[f.relationship] });
  if (ageBand && f.relationship) {
    pairs.push({ question: f.relationship === "parent" ? ui.who.ageLegend : ui.who.ageLegendOther, answer: ui.who.ageBands[ageBand] });
  }
  if (f.started) pairs.push({ question: ui.timing.startedLegend, answer: ui.timing.started[STARTED_LABEL_KEY[f.started]] });
  if (f.pattern) pairs.push({ question: ui.timing.patternLegend, answer: ui.timing.pattern[f.pattern] });
  if (f.noPatternNoticed) pairs.push({ question: ui.steps.changes.title, answer: ui.changes.nonePattern });
  for (const e of ctx.earlier) {
    const q = e.question.kind === "field" ? FIELD_QUESTIONS[e.question.field] : redact(e.question.question);
    pairs.push({ question: q, answer: redact(e.answer) });
  }
  return pairs;
}

/** The English text of the question being answered, or null when none was sent. */
export function currentQuestion(ctx: ScreenContext, redact: (t: string) => string): string | null {
  const q: ScreenQuestion | null = ctx.question;
  if (!q) return null;
  return q.kind === "field" ? FIELD_QUESTIONS[q.field] : redact(q.question);
}
