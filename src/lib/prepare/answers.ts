import type { PrepareAnswers } from "@/lib/ai/schemas";
import { effectiveAgeBand, initialPrepareState, isFieldActive, type PrepareState, type Started, type TextField } from "./state";

/*
 * Maps the Journey 1 UI state to the `PrepareAnswers` request body (src/lib/ai/schemas/requests.ts)
 * sent to /api/followups and /api/summary. Pure, so it can be unit-tested against the schema.
 */

export type AnsweredFollowUp = PrepareAnswers["followUps"][number];

/** UI "when did it start?" picks -> request enum. The two lists name the same buckets differently. */
export const STARTED_TO_REQUEST: Record<Started, NonNullable<PrepareAnswers["timing"]["started"]>> = {
  today: "today",
  days: "few_days",
  weeks: "1_to_4_weeks",
  months: "1_to_6_months",
  over_6_months: "over_6_months",
  not_sure: "not_sure",
};

/**
 * Static English stand-ins for answers given by ticking a box rather than typing.
 * Interface copy, not user text: product owner to review (see copy.ts).
 */
export const ANSWER_LABELS = {
  /** Sent as `changes` when the user ticked "I haven't noticed any pattern" and typed nothing. */
  noPatternNoticed: "I haven't noticed any pattern.",
} as const;

function text(state: PrepareState, field: TextField): string | null {
  if (!isFieldActive(state, field)) return null;
  const t = state.text[field].trim();
  return t === "" ? null : t;
}

/**
 * Build the request answers. Throws if a required pick is missing: callers only map state that
 * has passed `validateStep` for every step, so a throw here is a programming error, not user input.
 */
export function toPrepareAnswers(state: PrepareState, followUps: readonly AnsweredFollowUp[] = []): PrepareAnswers {
  const { relationship, started, pattern, noPatternNoticed } = state.structured;
  if (!relationship) throw new Error("toPrepareAnswers: relationship not chosen");
  const mainConcern = text(state, "concern");
  if (!mainConcern) throw new Error("toPrepareAnswers: main concern is empty");

  return {
    forWhom: { relationship, label: text(state, "whoLabel"), ageBand: effectiveAgeBand(state) },
    mainConcern,
    timing: {
      started: started ? STARTED_TO_REQUEST[started] : null,
      pattern,
      note: text(state, "timingNotes"),
    },
    changes: text(state, "changes") ?? (noPatternNoticed ? ANSWER_LABELS.noPatternNoticed : null),
    medicines: text(state, "medicines"),
    previousSupport: text(state, "previousSupport"),
    worries: text(state, "worries"),
    followUps: followUps.map((f) => ({ ...f, answer: f.answer?.trim() ? f.answer.trim() : null })),
  };
}

/**
 * The reverse of `toPrepareAnswers`, for demo mode (FR-26): turns a fictional demo input into UI state,
 * so the presenter steps through it and every answer is screened as if typed.
 */
export function fromPrepareAnswers(a: PrepareAnswers): PrepareState {
  const base = initialPrepareState();
  const started = (Object.keys(STARTED_TO_REQUEST) as Started[]).find((k) => STARTED_TO_REQUEST[k] === a.timing.started) ?? null;
  const noPatternNoticed = a.changes === ANSWER_LABELS.noPatternNoticed;
  return {
    ...base,
    structured: {
      relationship: a.forWhom.relationship,
      ageBand: a.forWhom.ageBand,
      started,
      pattern: a.timing.pattern,
      noPatternNoticed,
    },
    text: {
      ...base.text,
      whoLabel: a.forWhom.label ?? "",
      concern: a.mainConcern,
      timingNotes: a.timing.note ?? "",
      changes: noPatternNoticed ? "" : (a.changes ?? ""),
      medicines: a.medicines ?? "",
      previousSupport: a.previousSupport ?? "",
      worries: a.worries ?? "",
    },
  };
}
