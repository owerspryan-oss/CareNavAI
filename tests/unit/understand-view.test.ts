import { describe, expect, it } from "vitest";
import { postAppointmentResultSchema, type PostAppointmentResult } from "@/lib/ai/schemas";
import { fitWithin } from "@/lib/client/image";
import { doseAndDateTerms } from "@/lib/result/view";
import { buildUnderstandView, groundedIn, letterTerms } from "@/lib/understand/view";
import fixture from "../fixtures/gp-letter-explain.json";

const english = postAppointmentResultSchema.parse(fixture.explainDefault.english);
const simple = postAppointmentResultSchema.parse(fixture.explainDefault.user);
const pcm = postAppointmentResultSchema.parse(fixture.explainPcm.user);
const letter = fixture.letter;
const clone = (v: PostAppointmentResult): PostAppointmentResult => structuredClone(v);

describe("fitWithin (AC-08.1)", () => {
  it("scales the longest side down to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(5000, 5000, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("never scales up", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it("rounds to whole pixels and never goes below 1px or over the limit", () => {
    const out = fitWithin(4001, 3, 1600);
    expect(out).toEqual({ width: 1600, height: 1 });
    const odd = fitWithin(3001, 2001, 1000);
    expect(Number.isInteger(odd.width) && Number.isInteger(odd.height)).toBe(true);
    expect(Math.max(odd.width, odd.height)).toBeLessThanOrEqual(1000);
  });

  it("rejects nonsense sizes", () => {
    expect(() => fitWithin(0, 100, 1600)).toThrow(RangeError);
    expect(() => fitWithin(100, 100, 0)).toThrow(RangeError);
    expect(() => fitWithin(Number.NaN, 100, 1600)).toThrow(RangeError);
  });
});

describe("doseAndDateTerms (AC-02.5, AC-08.3)", () => {
  it("finds doses and dates exactly as written", () => {
    expect(doseAndDateTerms(letter)).toEqual(["21 October 2026", "14/10/2026", "5mg"]);
    expect(doseAndDateTerms("Take 2.5 ml twice, 10 units at night, from March 3, 2027.")).toEqual(["2.5 ml", "10 units", "March 3, 2027"]);
  });

  it("ignores plain numbers and words that only start like a unit", () => {
    expect(doseAndDateTerms("Room 12, 3 gloves, 2 grams")).toEqual([]);
    expect(doseAndDateTerms("call 111 or 999")).toEqual([]);
  });
});

describe("letterTerms (AC-08.3)", () => {
  it("highlights the photo's medicine candidates that are in the text, plus doses and dates", () => {
    expect(letterTerms(letter, [{ name: "Amlodipine", dose: "5mg" }])).toEqual(["Amlodipine", "5mg", "21 October 2026", "14/10/2026"]);
  });

  it("drops candidates the person has edited out of the text", () => {
    expect(letterTerms("Take ramipril daily.", [{ name: "Amlodipine", dose: "5mg" }])).toEqual([]);
  });
});

describe("buildUnderstandView: grounded items and the ungrounded split (CLAUDE.md rule 7)", () => {
  it("shows every grounded item, with the English master's quote", () => {
    const v = buildUnderstandView(simple, english, letter);
    expect(v.told.map((t) => t.text)).toEqual(simple.whatYouWereTold.map((t) => t.text));
    expect(v.told.map((t) => t.sourceQuote)).toEqual(english.whatYouWereTold.map((t) => t.sourceQuote));
    expect(v.steps).toHaveLength(3);
    expect(v.medicines.map((m) => m.name)).toEqual(["Amlodipine"]);
    expect(v.means).toHaveLength(2);
    expect(v.unclear).toEqual(simple.unclearOrMissing);
  });

  it("puts the server's ungrounded items in notFound, never in a fact section", () => {
    const v = buildUnderstandView(simple, english, letter);
    expect(v.notFound).toEqual([{ section: "nextSteps", text: "Check your blood pressure at home every week." }]);
    const facts = JSON.stringify([v.told, v.means, v.steps, v.medicines]);
    expect(facts).not.toContain("at home every week");
  });

  it("re-checks grounding in the browser: an item whose quote isn't in the letter moves to notFound", () => {
    const bad = clone(english);
    bad.whatYouWereTold[1].sourceQuote = "I have started you on Ramipril 10mg";
    bad.medicines[0].sourceQuote = "Amlodipine 10mg twice a day";
    bad.nextSteps[0].sourceQuote = "book a scan at the hospital";
    const v = buildUnderstandView(simple, bad, letter);
    expect(v.told).toHaveLength(1);
    expect(v.medicines).toHaveLength(0);
    expect(v.steps).toHaveLength(2);
    expect(v.notFound.map((n) => n.section)).toEqual(["nextSteps", "whatYouWereTold", "nextSteps", "medicines"]);
    // notFound always carries the English master's wording.
    expect(v.notFound).toContainEqual({ section: "whatYouWereTold", text: "Your doctor has started you on Amlodipine 5mg." });
    expect(v.notFound).toContainEqual({ section: "medicines", text: "Amlodipine" });
  });

  it("drops a medicine whose name is not in the letter even if its quote is", () => {
    const bad = clone(english);
    bad.medicines[0].name = "Amlodipine besilate";
    expect(buildUnderstandView(english, bad, letter).medicines).toHaveLength(0);
  });

  it("only explains clinician words that appear in the letter", () => {
    const bad = clone(english);
    bad.whatItMeans[1].clinicianWords = "hypertension";
    const v = buildUnderstandView(english, bad, letter);
    expect(v.means.map((m) => m.clinicianWords)).toEqual(["blood pressure readings"]);
    expect(v.notFound).toContainEqual({ section: "whatItMeans", text: `hypertension: ${english.whatItMeans[1].plainMeaning}` });
  });

  it("uses the master's quote even if the derived version altered it", () => {
    const altered = clone(pcm);
    altered.whatYouWereTold[0].sourceQuote = "Doctor talk say make I come";
    const v = buildUnderstandView(altered, english, letter);
    expect(v.told[0]).toEqual({ text: pcm.whatYouWereTold[0].text, sourceQuote: english.whatYouWereTold[0].sourceQuote });
  });

  it("grounds against the redacted letter too, which is what the server saw", () => {
    const withNhs = `${letter}\nNHS number: 943 476 5919`;
    expect(groundedIn("Thank you for coming to see me", withNhs)).toBe(true);
    expect(groundedIn("NHS number: [NHS-NUMBER]", withNhs)).toBe(true);
    expect(groundedIn("NHS number: 123 456 7890", withNhs)).toBe(false);
  });

  it("highlights medicine names, doses and byWhen wording", () => {
    const v = buildUnderstandView(pcm, english, letter);
    expect(v.terms).toEqual(["Amlodipine", "5mg", "in a few weeks' time", "from tomorrow"]);
  });
});
