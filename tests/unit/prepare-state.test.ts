import { describe, expect, it } from "vitest";
import {
  REVIEW_INDEX,
  STEP_IDS,
  currentStep,
  effectiveAgeBand,
  initialPrepareState,
  isSkippable,
  prepareReducer,
  unscreenedFields,
  validateStep,
  type PrepareAction,
  type PrepareState,
} from "@/lib/prepare/state";

const msg = {
  chooseOne: "choose",
  chooseAge: "age",
  required: "required",
  changesRequired: "changes",
  tooLong: (max: number, len: number) => `long ${len}/${max}`,
};

const run = (actions: PrepareAction[], from: PrepareState = initialPrepareState()) =>
  actions.reduce(prepareReducer, from);

describe("prepareReducer navigation", () => {
  it("starts on step 1 (who)", () => {
    expect(currentStep(initialPrepareState())).toBe("who");
  });

  it("advances through every step in order and stops at review", () => {
    let s = initialPrepareState();
    const seen = [currentStep(s)];
    for (let i = 0; i < STEP_IDS.length + 2; i++) {
      s = prepareReducer(s, { type: "advance", screened: {} });
      seen.push(currentStep(s));
    }
    expect(seen.slice(0, STEP_IDS.length)).toEqual([...STEP_IDS]);
    expect(currentStep(s)).toBe("review");
  });

  it("Back goes to the previous step and keeps entered text (AC-21.1)", () => {
    const s = run([
      { type: "advance", screened: {} },
      { type: "setText", field: "concern", value: "pain in my belly" },
      { type: "back" },
    ]);
    expect(currentStep(s)).toBe("who");
    expect(s.text.concern).toBe("pain in my belly");
    expect(currentStep(prepareReducer(s, { type: "advance", screened: {} }))).toBe("concern");
  });

  it("Back on the first step stays put", () => {
    expect(run([{ type: "back" }]).stepIndex).toBe(0);
  });

  it("edit from review returns to review on the next submit", () => {
    let s = { ...initialPrepareState(), stepIndex: REVIEW_INDEX };
    s = prepareReducer(s, { type: "editFromReview", step: "timing" });
    expect(currentStep(s)).toBe("timing");
    expect(s.returnToReview).toBe(true);
    s = prepareReducer(s, { type: "advance", screened: {} });
    expect(currentStep(s)).toBe("review");
    expect(s.returnToReview).toBe(false);
  });

  it("records screened text on advance", () => {
    const s = run([{ type: "advance", screened: { concern: "abc" } }]);
    expect(s.screened.concern).toBe("abc");
  });

  it("advanceAfterUrgent advances and remembers the first acknowledged level", () => {
    let s = run([{ type: "advanceAfterUrgent", screened: { whoLabel: "x" }, level: "urgent" }]);
    expect(currentStep(s)).toBe("concern");
    expect(s.urgentAcknowledged).toBe("urgent");
    s = prepareReducer(s, { type: "advanceAfterUrgent", screened: {}, level: "emergency" });
    expect(s.urgentAcknowledged).toBe("urgent");
  });

  it("reset clears everything", () => {
    const s = run([
      { type: "setText", field: "concern", value: "x" },
      { type: "setStructured", patch: { relationship: "self" } },
      { type: "advance", screened: { concern: "x" } },
      { type: "reset" },
    ]);
    expect(s).toEqual(initialPrepareState());
  });

  it("keeps structured and free-text answers separate", () => {
    const s = run([
      { type: "setStructured", patch: { started: "weeks", pattern: "comes_and_goes" } },
      { type: "setText", field: "timingNotes", value: "worse at night" },
    ]);
    expect(s.structured.started).toBe("weeks");
    expect(s.text.timingNotes).toBe("worse at night");
    expect(Object.keys(s.text)).not.toContain("started");
  });
});

describe("unscreenedFields", () => {
  it("lists non-empty text that hasn't been screened in its current form", () => {
    let s = run([{ type: "setText", field: "concern", value: "tired all the time" }]);
    expect(unscreenedFields(s)).toEqual(["concern"]);
    s = prepareReducer(s, { type: "advance", screened: { concern: "tired all the time" } });
    expect(unscreenedFields(s)).toEqual([]);
    // Editing after screening makes it unscreened again.
    s = prepareReducer(s, { type: "setText", field: "concern", value: "tired all the time and dizzy" });
    expect(unscreenedFields(s)).toEqual(["concern"]);
  });

  it("ignores blank text", () => {
    expect(unscreenedFields(run([{ type: "setText", field: "worries", value: "   " }]))).toEqual([]);
  });

  it("only includes the who label when it's someone else", () => {
    let s = run([{ type: "setText", field: "whoLabel", value: "my mum" }]);
    expect(unscreenedFields(s)).toEqual([]);
    s = prepareReducer(s, { type: "setStructured", patch: { relationship: "carer" } });
    expect(unscreenedFields(s)).toEqual(["whoLabel"]);
  });
});

describe("effectiveAgeBand", () => {
  it("applies only for 'my child' (AC-09.3)", () => {
    const s = run([{ type: "setStructured", patch: { relationship: "parent", ageBand: "5_to_11" } }]);
    expect(effectiveAgeBand(s)).toBe("5_to_11");
    expect(effectiveAgeBand(prepareReducer(s, { type: "setStructured", patch: { relationship: "self" } }))).toBeNull();
  });
});

describe("validateStep", () => {
  const base = initialPrepareState();

  it("who: requires a choice, and an age band for a child", () => {
    expect(validateStep(base, "who", 2000, msg)).toEqual({ relationship: "choose" });
    const child = run([{ type: "setStructured", patch: { relationship: "parent" } }]);
    expect(validateStep(child, "who", 2000, msg)).toEqual({ ageBand: "age" });
    const self = run([{ type: "setStructured", patch: { relationship: "self" } }]);
    expect(validateStep(self, "who", 2000, msg)).toEqual({});
  });

  it("concern: required, whitespace doesn't count", () => {
    expect(validateStep(run([{ type: "setText", field: "concern", value: "  " }]), "concern", 2000, msg)).toEqual({
      concern: "required",
    });
  });

  it("timing: both pickers required, notes optional", () => {
    expect(validateStep(base, "timing", 2000, msg)).toEqual({ started: "choose", pattern: "choose" });
    const ok = run([{ type: "setStructured", patch: { started: "not_sure", pattern: "not_sure" } }]);
    expect(validateStep(ok, "timing", 2000, msg)).toEqual({});
  });

  it("changes: text or 'no pattern noticed'", () => {
    expect(validateStep(base, "changes", 2000, msg)).toEqual({ changes: "changes" });
    const none = run([{ type: "setStructured", patch: { noPatternNoticed: true } }]);
    expect(validateStep(none, "changes", 2000, msg)).toEqual({});
  });

  it("medicines and worries are optional (AC-21.2)", () => {
    expect(validateStep(base, "medicines", 2000, msg)).toEqual({});
    expect(validateStep(base, "worries", 2000, msg)).toEqual({});
    expect(isSkippable(base, "medicines")).toBe(true);
    expect(isSkippable(base, "worries")).toBe(true);
    expect(isSkippable(base, "concern")).toBe(false);
    expect(isSkippable(run([{ type: "setText", field: "previousSupport", value: "GP" }]), "medicines")).toBe(false);
  });

  it("rejects over-limit text rather than truncating it (AC-06.2)", () => {
    const long = "a".repeat(11);
    const s = run([{ type: "setText", field: "concern", value: long }]);
    expect(validateStep(s, "concern", 10, msg)).toEqual({ concern: "long 11/10" });
    expect(s.text.concern).toBe(long);
    expect(validateStep(s, "concern", 11, msg)).toEqual({});
  });

  it("only validates the step's own fields", () => {
    const s = run([{ type: "setText", field: "worries", value: "a".repeat(50) }]);
    expect(validateStep(s, "medicines", 10, msg)).toEqual({});
  });
});
