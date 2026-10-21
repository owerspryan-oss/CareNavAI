import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePostMaster, groundPostDraft } from "@/lib/ai/pipeline/understand";
import type { PostAppointmentDraft } from "@/lib/ai/schemas";
import { openDb, type DB } from "@/lib/db";

const LETTER = `Following your appointment on 12/10/2026, I have started you on Amlodipine 5mg, to be taken once a day in the morning.
Please book a blood test with the practice nurse in a few weeks' time.
You should take the tablet with water.`;

const good: PostAppointmentDraft = {
  whatYouWereTold: [{ text: "Your doctor started you on a new medicine.", sourceQuote: "I have started you on Amlodipine 5mg" }],
  whatItMeans: [{ clinicianWords: "practice nurse", plainMeaning: "A nurse who works at your GP surgery." }],
  nextSteps: [
    { action: "Book a blood test with the practice nurse.", byWhen: "in a few weeks' time", sourceQuote: "Please book a blood test with the practice nurse" },
  ],
  medicines: [
    {
      name: "Amlodipine",
      dose: "5mg",
      frequency: "once a day in the morning",
      duration: null,
      instructions: "You should take the tablet with water.",
      sourceQuote: "Amlodipine 5mg, to be taken once a day in the morning",
    },
  ],
  unclearOrMissing: [{ item: "How long to take Amlodipine for", whoToAsk: "pharmacist" }],
};

describe("groundPostDraft (AC-02.1-02.3)", () => {
  it("keeps grounded items untouched", () => {
    const r = groundPostDraft(good, LETTER);
    expect(r.ungrounded).toEqual([]);
    expect(r.medicines).toEqual(good.medicines);
  });

  it("moves a planted invented next step and medicine to ungrounded", () => {
    const r = groundPostDraft(
      {
        ...good,
        nextSteps: [...good.nextSteps, { action: "See a cardiologist.", byWhen: null, sourceQuote: "refer you to a cardiologist" }],
        medicines: [...good.medicines, { ...good.medicines[0], name: "Ramipril", sourceQuote: "started you on Ramipril 10mg" }],
        whatYouWereTold: [...good.whatYouWereTold, { text: "Your kidneys are fine.", sourceQuote: "your kidney function is normal" }],
      },
      LETTER,
    );
    expect(r.nextSteps).toHaveLength(1);
    expect(r.medicines.map((m) => m.name)).toEqual(["Amlodipine"]);
    expect(r.whatYouWereTold).toHaveLength(1);
    expect(r.ungrounded.map((u) => u.section).sort()).toEqual(["medicines", "nextSteps", "whatYouWereTold"]);
  });

  it("rejects a medicine whose name is not in the source even if the quote is", () => {
    const r = groundPostDraft({ ...good, medicines: [{ ...good.medicines[0], name: "Amlodipine besilate" }] }, LETTER);
    expect(r.medicines).toEqual([]);
  });

  it("nulls an invented duration and flags it as unclear", () => {
    const r = groundPostDraft({ ...good, medicines: [{ ...good.medicines[0], duration: "28 days" }] }, LETTER);
    expect(r.medicines[0].duration).toBeNull();
    expect(r.unclearOrMissing.some((u) => u.item.includes("duration") && u.whoToAsk === "pharmacist")).toBe(true);
  });

  it("nulls an invented numeric byWhen", () => {
    const r = groundPostDraft({ ...good, nextSteps: [{ ...good.nextSteps[0], byWhen: "within 14 days" }] }, LETTER);
    expect(r.nextSteps[0].byWhen).toBeNull();
  });
});

describe("generatePostMaster (T-14)", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
  });
  afterEach(() => db.close());

  const openai = (...outs: PostAppointmentDraft[]) => {
    const parse = vi.fn();
    for (const o of outs) parse.mockResolvedValueOnce({ output_parsed: o, usage: { input_tokens: 1, output_tokens: 1 } });
    return { responses: { parse }, moderations: { create: vi.fn() } } as never;
  };

  it("allows wording the letter itself uses, but retries on added advice", async () => {
    const advice = { ...good, whatItMeans: [{ clinicianWords: "Amlodipine", plainMeaning: "This means you have high blood pressure." }] };
    const client = openai(advice, good);
    const r = await generatePostMaster(LETTER, { followUps: [] }, {}, { openai: client, db, capGbp: 50 });
    expect(r.promptVersion).toBe("post-master@v1");
    expect(r.result.medicines[0].instructions).toBe("You should take the tablet with water.");
    expect((client as { responses: { parse: { mock: { calls: unknown[] } } } }).responses.parse.mock.calls).toHaveLength(2);
  });
});
