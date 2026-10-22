import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runExplain, runFollowUps, runSummary } from "@/lib/ai/pipeline/journeys";
import { prepareAnswersSchema, type PostAppointmentDraft, type PreAppointmentDraft } from "@/lib/ai/schemas";
import { HttpError } from "@/lib/api/route";
import { openDb, type DB } from "@/lib/db";

const demo = (f: string) => prepareAnswersSchema.parse(JSON.parse(fs.readFileSync(new URL(`../../demo/${f}`, import.meta.url), "utf8")));
const LETTER = fs.readFileSync(new URL("../../demo/letter/gp-letter.txt", import.meta.url), "utf8");

const clearGate = { level: "clear", categories: [], possibleSignal: false, language: "jam", register: "dialect_or_creole" };

const preDraft: PreAppointmentDraft = {
  forWhom: { relationship: "self", label: "Me", ageBand: null },
  mainConcern: "Knee pain for about two months, mostly the right knee.",
  duration: { text: "About two months", stated: true },
  frequencyAndPattern: "Comes and goes, worse in the morning",
  changesAndTriggers: ["Worse when rain is coming"],
  medicationAndSupport: { provided: true, medicines: [{ name: "paracetamol", dose: null }], previousSupport: ["Cream from the pharmacy"] },
  worriesAndBarriers: ["Worried about being told to stop work"],
  questionsToAsk: ["What could be causing this, and how will we find out?"],
  whatToBring: ["Your paracetamol and the cream"],
  notMentioned: ["You didn't mention earlier help from a GP."],
};

const postDraft: PostAppointmentDraft = {
  whatYouWereTold: [{ text: "Your doctor started you on a new medicine.", sourceQuote: "I have started you on Amlodipine 5mg" }],
  whatItMeans: [],
  nextSteps: [{ action: "Book a blood test.", byWhen: "in a few weeks' time", sourceQuote: "Please book a blood test with the practice nurse" }],
  medicines: [
    { name: "Amlodipine", dose: "5mg", frequency: "once a day in the morning", duration: null, instructions: null, sourceQuote: "Amlodipine 5mg, to be taken once a day in the morning" },
    { name: "Ramipril", dose: "10mg", frequency: null, duration: null, instructions: null, sourceQuote: "started you on Ramipril 10mg" },
  ],
  unclearOrMissing: [{ item: "How long to take Amlodipine for", whoToAsk: "pharmacist" }],
};

function fakeOpenAI(gate = clearGate) {
  const parse = vi.fn(async (body: { text: { format: { name: string } } }) => {
    const name = body.text.format.name;
    const out =
      name === "gate_classification" ? gate
      : name === "gate_classification_english" ? { ...gate, englishRendering: "x" }
      : name === "pre_appointment_summary" ? preDraft
      : name === "post_appointment_explanation" ? postDraft
      : name === "prepare_followups" ? { questions: [{ intent: "clarify_duration", question: "When did the knee pain start?" }] }
      : name === "derived_version" ? { confidence: "high", version: JSON.parse((body as unknown as { input: string }).input.split("<english_master>\n")[1].split("\n</english_master>")[0]) }
      : null;
    return { output_parsed: out, usage: { input_tokens: 10, output_tokens: 10 } };
  });
  const create = vi.fn(async () => ({ results: [{ flagged: false, categories: {}, category_scores: {} }] }));
  return { responses: { parse }, moderations: { create } };
}

const calledSchemas = (o: ReturnType<typeof fakeOpenAI>) => o.responses.parse.mock.calls.map((c) => (c[0] as { text: { format: { name: string } } }).text.format.name);

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

const ctx = { requestId: "t" };

describe("server-side re-screen in generate routes (T-08)", () => {
  it("/api/summary refuses a red-flag input and never calls the generation model", async () => {
    const openai = fakeOpenAI();
    const r = await runSummary({ answers: demo("inputs/red-flag.json"), acknowledgedUrgent: false, outputLanguage: null }, ctx, { openai: openai as never, db });
    expect(r).toMatchObject({ kind: "urgent", gate: { level: "emergency", messageKey: "emergency" } });
    expect(calledSchemas(openai)).not.toContain("pre_appointment_summary");
    expect(JSON.stringify(r)).not.toMatch(/tight|numb|sweat/i);
  });

  it("continues after acknowledgement in continue_after_ack mode, carrying the urgent banner level", async () => {
    const r = await runSummary({ answers: demo("inputs/red-flag.json"), acknowledgedUrgent: true, outputLanguage: null }, ctx, { openai: fakeOpenAI() as never, db, capGbp: 50 });
    expect(r.kind).toBe("result");
    if (r.kind === "result") expect(r.english.meta.urgentAcknowledged).toBe("emergency");
  });

  it("/api/followups refuses a red-flag input", async () => {
    const openai = fakeOpenAI();
    const r = await runFollowUps({ journey: "prepare", answers: demo("inputs/red-flag.json"), acknowledgedUrgent: false }, ctx, { openai: openai as never, db });
    expect(r.kind).toBe("urgent");
    expect(calledSchemas(openai)).not.toContain("prepare_followups");
  });

  it("/api/explain routes 'urgent referral' letter wording up (AC-05.9)", async () => {
    const r = await runExplain({ confirmedText: "I have made an urgent referral to the hospital team.", source: "typed", followUps: [], acknowledgedUrgent: false, outputLanguage: null }, ctx, { openai: fakeOpenAI({ ...clearGate, language: "en", register: "standard" }) as never, db });
    expect(r.kind).toBe("urgent");
  });

  it("rejects over-long text with 413 before any model call", async () => {
    const openai = fakeOpenAI();
    const answers = { ...demo("inputs/marcia-prepare.json"), mainConcern: "x".repeat(2001) };
    await expect(runSummary({ answers, acknowledgedUrgent: false, outputLanguage: null }, ctx, { openai: openai as never, db })).rejects.toBeInstanceOf(HttpError);
    expect(openai.responses.parse).not.toHaveBeenCalled();
  });
});

describe("full pipelines on demo inputs", () => {
  it("Marcia's Patois input yields an English master and a simple-English user version (v0.3 A5)", async () => {
    const openai = fakeOpenAI();
    const r = await runSummary({ answers: demo("inputs/marcia-prepare.json"), acknowledgedUrgent: false, outputLanguage: null }, ctx, { openai: openai as never, db, capGbp: 50 });
    expect(r.kind).toBe("result");
    if (r.kind !== "result") return;
    expect(calledSchemas(openai)).toEqual(["gate_classification", "pre_appointment_summary", "derived_version"]);
    expect(r.user?.meta).toMatchObject({ outputLanguage: "jam", outputMode: "simple_english", confidenceNotice: true });
    expect(r.english.serviceRoutes.length).toBeGreaterThan(0);
    expect(r.english.disclaimer.join(" ")).toMatch(/not medical advice/);
  });

  it("the GP letter explained in Pidgin moves the planted medicine to ungrounded (v0.3 A6)", async () => {
    const r = await runExplain({ confirmedText: LETTER, source: "photo", followUps: [], acknowledgedUrgent: false, outputLanguage: "pcm" }, ctx, { openai: fakeOpenAI({ ...clearGate, language: "en", register: "standard" }) as never, db, capGbp: 50 });
    expect(r.kind).toBe("result");
    if (r.kind !== "result") return;
    expect(r.english.medicines.map((m) => m.name)).toEqual(["Amlodipine"]);
    expect(r.english.ungrounded).toEqual([expect.objectContaining({ section: "medicines", text: "Ramipril" })]);
    expect(r.user?.meta.outputMode).toBe("dialect_output");
    expect(r.user?.ungrounded).toEqual(r.english.ungrounded);
  });
});

describe("daily session cap (FR-15, AC-15.2/15.4)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const fillToday = (n: number) => {
    for (let i = 0; i < n; i++) {
      db.prepare("INSERT INTO usage_ledger (ts, endpoint, role, model, est_cost_gbp, request_id) VALUES (?, '/api/summary', 'DRAFT', 'm', 0, ?)").run(Date.now(), `earlier-${i}`);
    }
  };

  it("refuses new generation once today's sessions reach the cap", async () => {
    vi.stubEnv("DAILY_SESSION_CAP", "2");
    vi.resetModules();
    const { runSummary } = await import("@/lib/ai/pipeline/journeys");
    fillToday(2);
    const openai = fakeOpenAI();
    await expect(runSummary({ answers: demo("inputs/marcia-prepare.json"), acknowledgedUrgent: false, outputLanguage: null }, ctx, { openai: openai as never, db, capGbp: 50 })).rejects.toMatchObject({ type: "cap_reached" });
    expect(calledSchemas(openai)).not.toContain("pre_appointment_summary");
  });

  it("still screens and returns the static urgent message when the cap is reached", async () => {
    vi.stubEnv("DAILY_SESSION_CAP", "1");
    vi.resetModules();
    const { runSummary } = await import("@/lib/ai/pipeline/journeys");
    fillToday(1);
    const r = await runSummary({ answers: demo("inputs/red-flag.json"), acknowledgedUrgent: false, outputLanguage: null }, ctx, { openai: fakeOpenAI() as never, db });
    expect(r).toMatchObject({ kind: "urgent", gate: { level: "emergency" } });
  });
});
