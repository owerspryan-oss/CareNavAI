import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveVersion, isTierA, splitKeys, targetFor } from "@/lib/ai/pipeline/derive";
import { modelFor } from "@/lib/config";
import { postAppointmentDraftSchema, type PostAppointmentDraft } from "@/lib/ai/schemas";
import { openDb, type DB } from "@/lib/db";

const master: PostAppointmentDraft = {
  whatYouWereTold: [{ text: "Your doctor started you on Amlodipine 5mg.", sourceQuote: "started you on Amlodipine 5mg" }],
  whatItMeans: [],
  nextSteps: [{ action: "Book a blood test.", byWhen: "in a few weeks", sourceQuote: "book a blood test with the practice nurse" }],
  medicines: [{ name: "Amlodipine", dose: "5mg", frequency: "once a day", duration: null, instructions: null, sourceQuote: "Amlodipine 5mg, to be taken once a day" }],
  unclearOrMissing: [{ item: "How long to take Amlodipine for", whoToAsk: "pharmacist" }],
};

const pidgin: PostAppointmentDraft = {
  ...master,
  whatYouWereTold: [{ text: "Your doctor don start you on Amlodipine 5mg.", sourceQuote: master.whatYouWereTold[0].sourceQuote }],
  nextSteps: [{ ...master.nextSteps[0], action: "Go book blood test." }],
  unclearOrMissing: [{ item: "How long you go take Amlodipine", whoToAsk: "pharmacist" }],
};

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

/** TRANSLATE calls per attempt: the master is translated in parallel parts (config/models.json). */
const PARTS = splitKeys(master, modelFor("TRANSLATE").parallelParts ?? 1).length;

/** One fake version per attempt; each part's call gets back just the sections it asked for. */
function client(...versions: unknown[]) {
  let n = 0;
  const confidences: string[] = [];
  const parse = vi.fn(async (req: { input: string }) => {
    const v = versions[Math.floor(n / PARTS)] as Record<string, unknown> | undefined;
    const confidence = confidences[n++] ?? "high";
    if (!v) throw new Error("no fake version left");
    const keys = Object.keys(JSON.parse(req.input.split("<english_master>\n")[1].split("\n</english_master>")[0]));
    return { output_parsed: { confidence, version: Object.fromEntries(keys.map((k) => [k, v[k]])) }, usage: { input_tokens: 1, output_tokens: 1 } };
  });
  return { responses: { parse }, moderations: { create: vi.fn() }, confidences };
}

const run = (openai: ReturnType<typeof client>) =>
  deriveVersion(master, postAppointmentDraftSchema, targetFor("pcm", "dialect_or_creole"), ["Amlodipine"], { endpoint: "/api/explain" }, { openai: openai as never, db, capGbp: 50 });

describe("targetFor (v0.3 A5)", () => {
  it("maps languages to their output mode", () => {
    expect(targetFor("pcm", "dialect_or_creole").mode).toBe("dialect_output");
    expect(targetFor("jam", "dialect_or_creole").mode).toBe("simple_english");
    expect(targetFor("hi", "standard").mode).toBe("translation");
    expect(targetFor("xx", "standard").mode).toBe("translation");
    expect(targetFor("en", "informal").mode).toBe("simple_english");
  });
  it("treats nothing as Tier A before sign-off", () => {
    expect(isTierA("pcm")).toBe(false);
  });
});

describe("deriveVersion (T-12)", () => {
  it("accepts a version with matching shape and protected spans, with a notice for non-Tier-A", async () => {
    const r = await run(client(pidgin));
    expect(r.ok).toBe(true);
    expect(r.confidenceNotice).toBe(true);
  });

  it("retries a parity failure, then falls back to English only", async () => {
    const dropped = { ...pidgin, nextSteps: [] };
    const openai = client(dropped, dropped);
    const r = await run(openai);
    expect(r).toMatchObject({ ok: false, reason: "parity", confidenceNotice: true });
    expect(openai.responses.parse).toHaveBeenCalledTimes(2 * PARTS);
  });

  it("splits the master into parts of similar size that cover every section once", () => {
    const groups = splitKeys(master, 2);
    expect(groups).toHaveLength(2);
    expect(groups.flat().sort()).toEqual(Object.keys(master).sort());
    expect(splitKeys(master, 1)).toEqual([expect.arrayContaining(Object.keys(master))]);
  });

  it("joins the parts and keeps the least confident part's confidence", async () => {
    const openai = client(pidgin);
    openai.confidences.push("high", "low");
    const r = await run(openai);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toEqual(pidgin);
      expect(r.confidence).toBe(PARTS > 1 ? "low" : "high");
    }
  });

  it("rejects a version that changes a dose (CLAUDE.md rule 6)", async () => {
    const changed = { ...pidgin, medicines: [{ ...master.medicines[0], dose: "50mg" }] };
    const r = await run(client(changed, changed));
    expect(r).toMatchObject({ ok: false, reason: "protected_spans" });
  });

  it("rejects a version that transliterates a medicine name", async () => {
    const changed = { ...pidgin, whatYouWereTold: [{ ...pidgin.whatYouWereTold[0], text: "Doctor start you on Amlodipin 5mg." }], medicines: [{ ...master.medicines[0], name: "Amlodipin" }] };
    const r = await run(client(changed, changed));
    expect(r).toMatchObject({ ok: false, reason: "protected_spans" });
  });

  it("falls back to English when the call fails", async () => {
    const openai = { responses: { parse: vi.fn().mockRejectedValue(new Error("down")) }, moderations: { create: vi.fn() } };
    const r = await run(openai as never);
    expect(r).toMatchObject({ ok: false, reason: "call_failed" });
  });
});
