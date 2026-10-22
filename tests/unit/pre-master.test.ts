import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePreMaster, ValidationFailed } from "@/lib/ai/pipeline/prepare";
import type { PreAppointmentDraft, PrepareAnswers } from "@/lib/ai/schemas";
import { openDb, type DB } from "@/lib/db";

const answers: PrepareAnswers = {
  forWhom: { relationship: "self", label: null, ageBand: null },
  mainConcern: "Mi foot dem swell up an hurt from mi start di new tablet",
  timing: { started: "1_to_4_weeks", pattern: "constant", note: null },
  changes: "worse inna di evening",
  medicines: "amlodipine 5mg every morning", previousSupport: null,
  worries: null,
  followUps: [],
};

const draft = (over: Partial<PreAppointmentDraft> = {}): PreAppointmentDraft => ({
  forWhom: { relationship: "self", label: "Me", ageBand: null },
  mainConcern: "Swollen, painful feet since starting a new tablet.",
  duration: { text: "1 to 4 weeks", stated: true },
  frequencyAndPattern: "Constant",
  changesAndTriggers: ["Worse in the evening"],
  medicationAndSupport: { provided: true, medicines: [{ name: "amlodipine", dose: "5mg" }], previousSupport: [] },
  worriesAndBarriers: [],
  questionsToAsk: ["What could be causing the swelling, and how will we find out?"],
  whatToBring: ["Your medicine box"],
  notMentioned: ["You didn't mention any earlier help."],
  ...over,
});

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

function openaiReturning(...outputs: PreAppointmentDraft[]) {
  const parse = vi.fn();
  for (const o of outputs) parse.mockResolvedValueOnce({ output_parsed: o, usage: { input_tokens: 1, output_tokens: 1 } });
  return { responses: { parse }, moderations: { create: vi.fn() } };
}

describe("generatePreMaster (T-11)", () => {
  it("returns a validated draft and records the prompt version", async () => {
    const openai = openaiReturning(draft());
    const r = await generatePreMaster(answers, {}, { openai: openai as never, db, capGbp: 50 });
    expect(r.promptVersion).toBe("pre-master@v2");
    expect(r.draft.medicationAndSupport.medicines[0].dose).toBe("5mg");
    const input = (openai.responses.parse.mock.calls[0][0] as { input: string }).input;
    expect(input.startsWith("<answers>")).toBe(true);
  });

  it("retries once when the output diagnoses, then accepts a clean retry", async () => {
    const openai = openaiReturning(draft({ mainConcern: "You have a reaction to amlodipine." }), draft());
    const r = await generatePreMaster(answers, {}, { openai: openai as never, db, capGbp: 50 });
    expect(openai.responses.parse).toHaveBeenCalledTimes(2);
    expect(r.draft.mainConcern).toMatch(/Swollen/);
  });

  it("rejects an invented dose after one retry", async () => {
    const bad = draft({ medicationAndSupport: { provided: true, medicines: [{ name: "amlodipine", dose: "10mg" }], previousSupport: [] } });
    const openai = openaiReturning(bad, bad);
    const err = await generatePreMaster(answers, {}, { openai: openai as never, db, capGbp: 50 }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationFailed);
    expect(err.check).toBe("numbers");
  });
});
