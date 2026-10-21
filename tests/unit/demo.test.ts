import { describe, expect, it } from "vitest";
import { prepareAnswersSchema } from "@/lib/ai/schemas";
import { parseEnv } from "@/lib/config/env";
import { demoLetterPresets, demoPreparePresets } from "@/lib/demo/presets";
import { fromPrepareAnswers, toPrepareAnswers } from "@/lib/prepare/answers";
import { initialPrepareState, prepareReducer, unscreenedFields, validateStep } from "@/lib/prepare/state";

// FR-26 / AC-26.1: demo mode loads the fictional inputs; it never bypasses the gate.

describe("demo mode config", () => {
  it("is off unless DEMO_MODE=true", () => {
    expect(parseEnv({}).DEMO_MODE).toBe(false);
    expect(parseEnv({ DEMO_MODE: "true" }).DEMO_MODE).toBe(true);
  });
});

describe("demo presets", () => {
  it("loads every demo/inputs file as valid request answers", () => {
    const presets = demoPreparePresets();
    expect(presets.map((p) => p.id)).toEqual(["marcia-prepare", "red-flag"]);
    for (const p of presets) expect(prepareAnswersSchema.safeParse(p.answers).success, p.id).toBe(true);
  });

  it("offers the demo letter as a photo and as typed text", () => {
    const letters = demoLetterPresets();
    expect(letters.map((l) => `${l.id}:${l.kind}`)).toEqual(["gp-letter:photo", "gp-letter:text"]);
    const text = letters.find((l) => l.kind === "text");
    expect(text?.kind === "text" && text.text).toContain("Amlodipine 5mg");
    const photo = letters.find((l) => l.kind === "photo");
    expect(photo?.kind === "photo" && photo.dataUrl).toMatch(/^data:image\/png;base64,iVBOR/);
  });
});

describe("fromPrepareAnswers", () => {
  it.each(demoPreparePresets())("round-trips $id exactly", ({ answers }) => {
    expect(toPrepareAnswers(fromPrepareAnswers(answers))).toEqual(answers);
  });

  it("restores the 'no pattern' tick rather than its stand-in text", () => {
    const [marcia] = demoPreparePresets();
    const s = fromPrepareAnswers({ ...marcia.answers, changes: "I haven't noticed any pattern." });
    expect(s.structured.noPatternNoticed).toBe(true);
    expect(s.text.changes).toBe("");
  });
});

describe("load action", () => {
  it("starts at step 1 with nothing counted as screened, so the gate checks every answer again", () => {
    const [marcia] = demoPreparePresets();
    const before = { ...initialPrepareState(), stepIndex: 4, screened: { concern: "old" }, urgentAcknowledged: "urgent" as const };
    const s = prepareReducer(before, { type: "load", state: fromPrepareAnswers(marcia.answers) });
    expect(s.stepIndex).toBe(0);
    expect(s.screened).toEqual({});
    expect(s.urgentAcknowledged).toBeNull();
    expect(unscreenedFields(s)).toEqual(expect.arrayContaining(["concern", "timingNotes", "changes", "medicines", "worries"]));
    expect(validateStep(s, "who", 2000, { chooseOne: "x", chooseAge: "x", required: "x", tooLong: () => "x" } as never)).toEqual({});
  });
});
