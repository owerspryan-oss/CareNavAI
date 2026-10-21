import type { AgeBand, SafetyLevel } from "@/lib/ai/schemas";
import { RELATIONSHIPS } from "@/lib/ai/schemas";

/*
 * Journey 1 guided-step state (FR-21, PRD §3.2 steps 1–6 + 8).
 * Browser memory only: guests are stateless (CLAUDE.md rule 9), so nothing here is persisted.
 * Follow-ups (FR-22), the summary call and the result (T-13) run after "review" and are held in
 * PrepareFlow's local state; this reducer stays on the review step meanwhile, so "Not quite" returns there.
 */

export const STEP_IDS = ["who", "concern", "timing", "changes", "medicines", "worries", "review"] as const;
export type StepId = (typeof STEP_IDS)[number];

/** AC-21.2: only steps 5 and 6 can be skipped. */
export const OPTIONAL_STEPS: ReadonlySet<StepId> = new Set(["medicines", "worries"]);

export type Relationship = (typeof RELATIONSHIPS)[number];

export const STARTED_OPTIONS = ["today", "days", "weeks", "months", "over_6_months", "not_sure"] as const;
export type Started = (typeof STARTED_OPTIONS)[number];

export const PATTERN_OPTIONS = ["constant", "comes_and_goes", "changing", "not_sure"] as const;
export type Pattern = (typeof PATTERN_OPTIONS)[number];

/** Free-text fields. Every one is screened by the urgency gate before the journey moves on. */
export const TEXT_FIELDS = [
  "whoLabel",
  "concern",
  "timingNotes",
  "changes",
  "medicines",
  "previousSupport",
  "worries",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** Which step owns each free-text field. */
export const FIELD_STEP: Record<TextField, StepId> = {
  whoLabel: "who",
  concern: "concern",
  timingNotes: "timing",
  changes: "changes",
  medicines: "medicines",
  previousSupport: "medicines",
  worries: "worries",
};

/** Structured answers (pickers), kept apart from free text. */
export interface StructuredAnswers {
  relationship: Relationship | null;
  ageBand: AgeBand | null;
  started: Started | null;
  pattern: Pattern | null;
  noPatternNoticed: boolean;
}

export interface PrepareState {
  stepIndex: number;
  /** Set when the user jumps to a step from Review; the next submit returns them there. */
  returnToReview: boolean;
  structured: StructuredAnswers;
  text: Record<TextField, string>;
  /** The exact text that last screened `clear` (or was acknowledged) per field. */
  screened: Partial<Record<TextField, string>>;
  /** Set when the user continued past an urgent message (v0.3 A2); drives the persistent banner later. */
  urgentAcknowledged: Exclude<SafetyLevel, "clear"> | null;
}

export function initialPrepareState(): PrepareState {
  return {
    stepIndex: 0,
    returnToReview: false,
    structured: { relationship: null, ageBand: null, started: null, pattern: null, noPatternNoticed: false },
    text: {
      whoLabel: "",
      concern: "",
      timingNotes: "",
      changes: "",
      medicines: "",
      previousSupport: "",
      worries: "",
    },
    screened: {},
    urgentAcknowledged: null,
  };
}

export type PrepareAction =
  | { type: "setStructured"; patch: Partial<StructuredAnswers> }
  | { type: "setText"; field: TextField; value: string }
  /** Move on after validation and a clear screen. `screened` records the exact texts that passed. */
  | { type: "advance"; screened: Partial<Record<TextField, string>> }
  /** Move on after the user acknowledged an urgent message (continue_after_ack). */
  | { type: "advanceAfterUrgent"; screened: Partial<Record<TextField, string>>; level: Exclude<SafetyLevel, "clear"> }
  /** The user acknowledged an urgent message after review (follow-ups or summary re-screen). Stays set. */
  | { type: "acknowledgeUrgent"; level: Exclude<SafetyLevel, "clear"> }
  | { type: "back" }
  | { type: "editFromReview"; step: StepId }
  | { type: "reset" };

export const REVIEW_INDEX = STEP_IDS.indexOf("review");

export function currentStep(state: PrepareState): StepId {
  return STEP_IDS[state.stepIndex];
}

function nextIndex(state: PrepareState): number {
  if (state.returnToReview) return REVIEW_INDEX;
  return Math.min(state.stepIndex + 1, REVIEW_INDEX);
}

export function prepareReducer(state: PrepareState, action: PrepareAction): PrepareState {
  switch (action.type) {
    case "setStructured":
      return { ...state, structured: { ...state.structured, ...action.patch } };
    case "setText":
      return { ...state, text: { ...state.text, [action.field]: action.value } };
    case "advance": {
      const stepIndex = nextIndex(state);
      return {
        ...state,
        stepIndex,
        returnToReview: stepIndex === REVIEW_INDEX ? false : state.returnToReview,
        screened: { ...state.screened, ...action.screened },
      };
    }
    case "advanceAfterUrgent": {
      const advanced = prepareReducer(state, { type: "advance", screened: action.screened });
      return { ...advanced, urgentAcknowledged: state.urgentAcknowledged ?? action.level };
    }
    case "acknowledgeUrgent":
      return { ...state, urgentAcknowledged: state.urgentAcknowledged ?? action.level };
    case "back":
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
    case "editFromReview":
      return { ...state, stepIndex: STEP_IDS.indexOf(action.step), returnToReview: true };
    case "reset":
      return initialPrepareState();
  }
}

/** Child thresholds only apply when the user said this is for their child (AC-09.3). */
export function effectiveAgeBand(state: PrepareState): AgeBand | null {
  return state.structured.relationship === "parent" ? state.structured.ageBand : null;
}

/** Fields that count for the current answers (e.g. the "who" label only when it's someone else). */
export function isFieldActive(state: PrepareState, field: TextField): boolean {
  if (field === "whoLabel") {
    const r = state.structured.relationship;
    return r === "carer" || r === "other";
  }
  return true;
}

/**
 * Non-empty active text that hasn't passed the gate in its current form.
 * The flow screens all of these before moving on, so the invariant is:
 * no unscreened free text survives past any submit, whichever path the user took.
 */
export function unscreenedFields(state: PrepareState): TextField[] {
  return TEXT_FIELDS.filter(
    (f) => isFieldActive(state, f) && state.text[f].trim() !== "" && state.screened[f] !== state.text[f],
  );
}

/** `PrepareAnswers.forWhom.label` is capped at 60 characters by the request schema. */
export const WHO_LABEL_MAX = 60;

/** Per-field character limit: MAX_TEXT_CHARS, or less where the request schema is stricter. */
export function fieldMax(field: TextField, maxChars: number): number {
  return field === "whoLabel" ? Math.min(maxChars, WHO_LABEL_MAX) : maxChars;
}

export type StepErrors = Partial<Record<TextField | keyof StructuredAnswers, string>>;

export interface ValidationMessages {
  chooseOne: string;
  chooseAge: string;
  required: string;
  changesRequired: string;
  tooLong: (max: number, length: number) => string;
}

/** Validate one step before screening. Over-limit text is rejected, never truncated (AC-06.2). */
export function validateStep(
  state: PrepareState,
  step: StepId,
  maxChars: number,
  msg: ValidationMessages,
): StepErrors {
  const errors: StepErrors = {};
  const s = state.structured;
  const t = state.text;

  for (const field of TEXT_FIELDS) {
    const max = fieldMax(field, maxChars);
    if (FIELD_STEP[field] === step && isFieldActive(state, field) && t[field].length > max) {
      errors[field] = msg.tooLong(max, t[field].length);
    }
  }

  switch (step) {
    case "who":
      if (!s.relationship) errors.relationship = msg.chooseOne;
      else if (s.relationship === "parent" && !s.ageBand) errors.ageBand = msg.chooseAge;
      break;
    case "concern":
      if (!t.concern.trim()) errors.concern = msg.required;
      break;
    case "timing":
      if (!s.started) errors.started = msg.chooseOne;
      if (!s.pattern) errors.pattern = msg.chooseOne;
      break;
    case "changes":
      if (!t.changes.trim() && !s.noPatternNoticed) errors.changes ??= msg.changesRequired;
      break;
    default:
      break;
  }
  return errors;
}

/** An optional step with nothing entered: the primary action reads "Skip" rather than "Next". */
export function isSkippable(state: PrepareState, step: StepId): boolean {
  if (!OPTIONAL_STEPS.has(step)) return false;
  return TEXT_FIELDS.every((f) => FIELD_STEP[f] !== step || state.text[f].trim() === "");
}
