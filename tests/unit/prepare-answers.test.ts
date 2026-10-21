import { describe, expect, it } from "vitest";
import { prepareAnswersSchema } from "@/lib/ai/schemas";
import { ANSWER_LABELS, STARTED_TO_REQUEST, toPrepareAnswers } from "@/lib/prepare/answers";
import {
  STARTED_OPTIONS,
  WHO_LABEL_MAX,
  initialPrepareState,
  prepareReducer,
  validateStep,
  type PrepareState,
} from "@/lib/prepare/state";
import marcia from "../../demo/inputs/marcia-prepare.json";

function stateWith(patch: {
  structured?: Partial<PrepareState["structured"]>;
  text?: Partial<PrepareState["text"]>;
}): PrepareState {
  const s = initialPrepareState();
  return { ...s, structured: { ...s.structured, ...patch.structured }, text: { ...s.text, ...patch.text } };
}

/** The demo input as the user would have typed it into the guided steps. */
const marciaState = stateWith({
  structured: { relationship: "self", started: "months", pattern: "comes_and_goes" },
  text: {
    concern: marcia.mainConcern,
    timingNotes: marcia.timing.note,
    changes: marcia.changes,
    medicines: marcia.medicines,
    worries: marcia.worries,
  },
});

const msg = {
  chooseOne: "choose",
  chooseAge: "age",
  required: "required",
  changesRequired: "changes",
  tooLong: (max: number, len: number) => `long ${len}/${max}`,
};

describe("toPrepareAnswers", () => {
  it("maps the Marcia demo state to exactly the demo request body", () => {
    const { $comment: _ignored, ...expected } = marcia;
    void _ignored;
    const answers = toPrepareAnswers(marciaState);
    expect(answers).toEqual(expected);
    expect(prepareAnswersSchema.parse(answers)).toEqual(answers);
  });

  it("maps every UI start option to a value the request schema accepts", () => {
    for (const started of STARTED_OPTIONS) {
      const answers = toPrepareAnswers({ ...marciaState, structured: { ...marciaState.structured, started } });
      expect(answers.timing.started).toBe(STARTED_TO_REQUEST[started]);
      expect(prepareAnswersSchema.safeParse(answers).success).toBe(true);
    }
  });

  it("sends blank optional answers as null, never as empty strings", () => {
    const answers = toPrepareAnswers(
      stateWith({ structured: { relationship: "self" }, text: { concern: "  a cough  ", worries: "   ", medicines: "" } }),
    );
    expect(answers.mainConcern).toBe("a cough");
    expect(answers.timing).toEqual({ started: null, pattern: null, note: null });
    expect(answers.changes).toBeNull();
    expect(answers.medicines).toBeNull();
    expect(answers.worries).toBeNull();
    expect(prepareAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it("sends help already had in its own field, separate from medicines", () => {
    const both = toPrepareAnswers(
      stateWith({ structured: { relationship: "self" }, text: { concern: "x", medicines: "ibuprofen", previousSupport: "saw a pharmacist" } }),
    );
    expect(both).toMatchObject({ medicines: "ibuprofen", previousSupport: "saw a pharmacist" });
  });

  it("sends 'no pattern noticed' only when nothing was typed", () => {
    const ticked = stateWith({ structured: { relationship: "self", noPatternNoticed: true }, text: { concern: "x" } });
    expect(toPrepareAnswers(ticked).changes).toBe(ANSWER_LABELS.noPatternNoticed);
    expect(toPrepareAnswers({ ...ticked, text: { ...ticked.text, changes: "worse at night" } }).changes).toBe("worse at night");
  });

  it("only sends the who-label and age band where they apply", () => {
    const self = stateWith({ structured: { relationship: "self", ageBand: "1_to_4" }, text: { concern: "x", whoLabel: "stale" } });
    expect(toPrepareAnswers(self).forWhom).toEqual({ relationship: "self", label: null, ageBand: null });

    const child = stateWith({ structured: { relationship: "parent", ageBand: "1_to_4" }, text: { concern: "x" } });
    expect(toPrepareAnswers(child).forWhom).toEqual({ relationship: "parent", label: null, ageBand: "1_to_4" });

    const carer = stateWith({ structured: { relationship: "carer" }, text: { concern: "x", whoLabel: " my mum " } });
    expect(toPrepareAnswers(carer).forWhom).toEqual({ relationship: "carer", label: "my mum", ageBand: null });
  });

  it("includes follow-ups, with skipped or blank answers as null", () => {
    const answers = toPrepareAnswers(marciaState, [
      { intent: "clarify_medicines", question: "How often do you take it?", answer: " most days " },
      { intent: "clarify_change", question: "What makes it better?", answer: "  " },
      { intent: "clarify_duration", question: "When did it start?", answer: null },
    ]);
    expect(answers.followUps.map((f) => f.answer)).toEqual(["most days", null, null]);
    expect(prepareAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it("throws on state that never passed validation", () => {
    expect(() => toPrepareAnswers(initialPrepareState())).toThrow();
    expect(() => toPrepareAnswers(stateWith({ structured: { relationship: "self" } }))).toThrow();
  });
});

describe("who-label limit", () => {
  it("rejects (never truncates) a who-label longer than the request schema allows", () => {
    const s = stateWith({ structured: { relationship: "other" }, text: { whoLabel: "x".repeat(WHO_LABEL_MAX + 1) } });
    expect(validateStep(s, "who", 2000, msg).whoLabel).toBe(`long ${WHO_LABEL_MAX + 1}/${WHO_LABEL_MAX}`);
    expect(validateStep({ ...s, text: { ...s.text, whoLabel: "x".repeat(WHO_LABEL_MAX) } }, "who", 2000, msg)).toEqual({});
  });
});

describe("acknowledgeUrgent", () => {
  it("records the first acknowledged level and keeps it", () => {
    let s = prepareReducer(initialPrepareState(), { type: "acknowledgeUrgent", level: "uncertain" });
    expect(s.urgentAcknowledged).toBe("uncertain");
    s = prepareReducer(s, { type: "acknowledgeUrgent", level: "emergency" });
    expect(s.urgentAcknowledged).toBe("uncertain");
    expect(s.stepIndex).toBe(0);
  });
});
