import type { ScreenField } from "@/lib/ai/schemas";
import { followUpContext, type ScreenContextInput } from "@/lib/client/screen";
import { STARTED_TO_REQUEST, type AnsweredFollowUp } from "./answers";
import { FIELD_STEP, STEP_IDS, TEXT_FIELDS, isFieldActive, type PrepareState, type StepId, type TextField } from "./state";

/*
 * Context for the urgency classifier (DECISIONS.md 2026-10-22): which question an answer belongs to and
 * what was answered before it, so a short answer like "stabbing pain" is read with the earlier "my knee".
 * Questions are sent by identifier only; the server supplies their English wording. Pure, for unit tests.
 */

export const SCREEN_FIELD: Record<TextField, ScreenField> = {
  whoLabel: "who_label",
  concern: "main_concern",
  timingNotes: "timing_note",
  changes: "changes",
  medicines: "medicines",
  previousSupport: "previous_support",
  worries: "worries",
};

const reached = (step: StepId, upTo: StepId) => STEP_IDS.indexOf(step) <= STEP_IDS.indexOf(upTo);

/** The given free-text answers (non-empty, active) and the picks from steps up to `upTo`, in journey order. */
function answers(state: PrepareState, fields: readonly TextField[], upTo: StepId): ScreenContextInput {
  const { relationship, started, pattern, noPatternNoticed } = state.structured;
  return {
    facts: {
      relationship,
      started: started && reached("timing", upTo) ? STARTED_TO_REQUEST[started] : null,
      pattern: reached("timing", upTo) ? pattern : null,
      noPatternNoticed: noPatternNoticed && reached("changes", upTo),
    },
    earlier: fields
      .filter((f) => isFieldActive(state, f) && state.text[f].trim() !== "")
      .map((f) => ({ question: { kind: "field" as const, field: SCREEN_FIELD[f] }, answer: state.text[f].trim() })),
  };
}

/** Context for one guided-step field: its question, the fields before it, and the picks up to its step. */
export function fieldScreenContext(state: PrepareState, field: TextField): ScreenContextInput {
  const before = TEXT_FIELDS.slice(0, TEXT_FIELDS.indexOf(field));
  return { ...answers(state, before, FIELD_STEP[field]), question: { kind: "field", field: SCREEN_FIELD[field] } };
}

/** Context for follow-up answer `index`: every guided answer, then the follow-ups answered before it. */
export function followUpScreenContext(state: PrepareState, followUps: readonly AnsweredFollowUp[], index: number): ScreenContextInput {
  return followUpContext(followUps, index, answers(state, TEXT_FIELDS, "review"));
}
