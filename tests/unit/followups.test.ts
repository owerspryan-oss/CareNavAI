import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFollowUps, validateFollowUps } from "@/lib/ai/pipeline/followups";
import { openDb, type DB } from "@/lib/db";

describe("validateFollowUps (AC-22.3, AC-22.4)", () => {
  const ok = { intent: "clarify_duration", question: "Roughly how long has the cough been going on?" };

  it("keeps valid clarity questions", () => {
    expect(validateFollowUps("prepare", [ok])).toEqual([ok]);
  });

  it.each([
    ["an off-list intent", { intent: "assess_severity", question: "How long has it been?" }],
    ["the other journey's intent", { intent: "clarify_missing_dose", question: "What dose is on the label?" }],
    ["a severity score", { intent: "clarify_wording", question: "On a scale of 1 to 10, how bad is the pain?" }],
    ["a new symptom (U-16)", { intent: "clarify_change", question: "Have you also noticed any fever or weight loss?" }],
    ["a new symptom, other phrasing", { intent: "clarify_change", question: "Do you also have a headache?" }],
    ["20+ words", { intent: "clarify_duration", question: "Could you please tell me in a little more detail exactly how many days or weeks this has been going on for you?" }],
    ["a diagnosis", { intent: "clarify_wording", question: "Has anyone given you a diagnosis for this?" }],
  ])("falls back to none when given %s", (_label, bad) => {
    expect(validateFollowUps("prepare", [ok, bad])).toEqual([]);
  });

  it("drops duplicates by falling back", () => {
    expect(validateFollowUps("prepare", [ok, ok])).toEqual([]);
  });
});

describe("generateFollowUps (T-10)", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
  });
  afterEach(() => db.close());

  it("returns no follow-ups when the model call fails (AC-22.2)", async () => {
    const openai = { responses: { parse: vi.fn().mockRejectedValue(new Error("down")) }, moderations: { create: vi.fn() } };
    const r = await generateFollowUps("prepare", "main_concern: cough", {}, { openai: openai as never, db, capGbp: 50 });
    expect(r.questions).toEqual([]);
  });
});
