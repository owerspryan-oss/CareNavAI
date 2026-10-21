import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import {
  gateClassifierOutputSchema,
  postAppointmentDraftSchema,
  postFollowUpsOutputSchema,
  preAppointmentDraftSchema,
  preFollowUpsOutputSchema,
  screenRequestSchema,
} from "@/lib/ai/schemas";

const modelOutputSchemas = {
  gate_classifier: gateClassifierOutputSchema,
  pre_followups: preFollowUpsOutputSchema,
  post_followups: postFollowUpsOutputSchema,
  pre_draft: preAppointmentDraftSchema,
  post_draft: postAppointmentDraftSchema,
};

describe("model-output schemas", () => {
  it.each(Object.entries(modelOutputSchemas))("%s converts to a strict structured-output format", (name, schema) => {
    const format = zodTextFormat(schema, name);
    expect(format.strict).toBe(true);
    expect(JSON.stringify(format.schema)).not.toContain('"optional"');
  });
});

describe("follow-up intents (FR-22)", () => {
  it("rejects an intent outside the allowed list", () => {
    const r = preFollowUpsOutputSchema.safeParse({
      questions: [{ intent: "assess_severity", question: "How bad is the pain out of 10?" }],
    });
    expect(r.success).toBe(false);
  });

  it("does not let post-appointment intents into the pre-appointment list", () => {
    const r = preFollowUpsOutputSchema.safeParse({
      questions: [{ intent: "clarify_missing_dose", question: "What dose?" }],
    });
    expect(r.success).toBe(false);
  });

  it("allows at most 3 questions", () => {
    const q = { intent: "clarify_duration", question: "How long has this been going on?" };
    expect(preFollowUpsOutputSchema.safeParse({ questions: [q, q, q] }).success).toBe(true);
    expect(preFollowUpsOutputSchema.safeParse({ questions: [q, q, q, q] }).success).toBe(false);
  });
});

describe("screen request", () => {
  it("defaults optional context to null", () => {
    expect(screenRequestSchema.parse({ text: "hello", step: "step_text" })).toEqual({
      text: "hello",
      step: "step_text",
      ageBand: null,
      languageHint: null,
    });
  });
});
