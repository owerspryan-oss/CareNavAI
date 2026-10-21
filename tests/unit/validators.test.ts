import { describe, expect, it } from "vitest";
import { allStrings, forbiddenHits } from "@/lib/validate/forbidden";
import { numberTokens, numbersAppearIn } from "@/lib/validate/numbers";
import { parityMismatch } from "@/lib/validate/parity";
import { missingProtectedSpans, protectedSpansIntact } from "@/lib/validate/spans";

describe("number check", () => {
  it("extracts doses, decimals and dates", () => {
    expect(numberTokens("Take 2.5 mg twice, from 12/10/2026, 500mg at 08:00")).toEqual(["2.5mg", "12/10/2026", "500mg", "08:00"]);
  });
  it("does not glue a unit letter onto the next word", () => {
    expect(numberTokens("2 large tablets")).toEqual(["2"]);
  });
  it("passes numbers present in the source and fails invented ones", () => {
    const src = "Amlodipine 5 mg once a day. Blood test on 3/11/2026.";
    expect(numbersAppearIn("5mg daily", src)).toBe(true);
    expect(numbersAppearIn("for 28 days", src)).toBe(false);
    expect(numbersAppearIn("5mcg", src)).toBe(false);
  });
});

describe("protected spans (CLAUDE.md rule 6)", () => {
  const master = "Take Amlodipine 5mg once a day from 12/10/2026.";
  it("passes a translation that keeps names and numbers byte-identical", () => {
    expect(protectedSpansIntact(master, "Make you take Amlodipine 5mg one time every day from 12/10/2026.", ["Amlodipine"])).toBe(true);
  });
  it("fails a translation that changes a dose, a date or a medicine name", () => {
    expect(missingProtectedSpans(master, "Take Amlodipin 5 mg daily from 12/10/2026.", ["Amlodipine"])).toEqual(["Amlodipine"]);
    expect(protectedSpansIntact(master, "Take Amlodipine 10mg daily from 12/10/2026.", ["Amlodipine"])).toBe(false);
    expect(protectedSpansIntact(master, "Take Amlodipine 5mg daily from 10/12/2026.", ["Amlodipine"])).toBe(false);
  });
  it("counts repeated numbers", () => {
    expect(protectedSpansIntact("1 tablet, then 1 more", "1 tablet, then more", [])).toBe(false);
  });
});

describe("schema parity", () => {
  const master = { a: "x", list: ["1", "2"], nested: { b: true, c: null } };
  it("accepts identical shape", () => {
    expect(parityMismatch(master, { a: "y", list: ["3", "4"], nested: { b: false, c: null } })).toBeNull();
  });
  it("reports a dropped array item, an extra key and a type change", () => {
    expect(parityMismatch(master, { ...master, list: ["1"] })).toBe("$.list");
    expect(parityMismatch(master, { ...master, extra: 1 })).toBe("$");
    expect(parityMismatch(master, { ...master, nested: { b: "true", c: null } })).toBe("$.nested.b");
  });
});

describe("forbidden content scan", () => {
  it.each([
    "You have high blood pressure.",
    "You should take two tablets.",
    "This means you are diabetic.",
    "It could be a sign of infection.",
    "You’re fine, nothing to worry about.",
  ])("flags %s", (text) => {
    expect(forbiddenHits(text).length).toBeGreaterThan(0);
  });

  it.each([
    "You have been feeling tired for two weeks.",
    "You told us the cough started in September.",
    "You didn't mention how long this has been going on.",
    "What might be causing this, and what tests could help?",
    "Ask the pharmacist if you have any questions.",
  ])("allows %s", (text) => {
    expect(forbiddenHits(text)).toEqual([]);
  });

  it("collects every string in a nested result", () => {
    expect(allStrings({ a: "x", b: ["y", { c: "z" }], d: 1, e: null })).toEqual(["x", "y", "z"]);
  });
});
