import { describe, expect, it } from "vitest";
import { isGrounded } from "@/lib/validate/grounding";

// Fictional letter (T-29 style): one new medicine, a dose and frequency, a blood test "in a few weeks", no course length.
const LETTER = `Dear Ms Campbell,
Following your appointment on 12/10/2026, I have started you on Amlodipine 5mg, to be taken once a day in the morning.
Please book a blood test with the practice nurse in a few weeks' time.
If you notice ankle swelling, please let us know.
Yours sincerely, Dr A. Mensah`;

describe("grounding validator (CLAUDE.md rule 7)", () => {
  it("accepts an exact quote", () => {
    expect(isGrounded("Amlodipine 5mg, to be taken once a day", LETTER)).toBe(true);
  });

  it("accepts a quote that differs only in case, punctuation, curly quotes and whitespace", () => {
    expect(isGrounded("please BOOK a blood   test with the practice nurse in a few weeks’ time", LETTER)).toBe(true);
  });

  it("tolerates a single-word slip in a long quote (OCR noise)", () => {
    expect(isGrounded("book a blood test with the practise nurse in a few weeks", LETTER)).toBe(true);
  });

  it("rejects quotes under 3 words", () => {
    expect(isGrounded("Amlodipine 5mg", LETTER)).toBe(false);
  });

  it.each([
    ["an invented medicine", "started you on Ramipril 10mg"],
    ["an invented course length", "to be taken once a day for 28 days"],
    ["an invented instruction", "stop taking your other tablets"],
    ["an invented follow-up", "book an appointment with the cardiologist"],
    ["a changed dose", "started you on Amlodipine 10mg"],
  ])("catches a planted invented item: %s", (_label, quote) => {
    expect(isGrounded(quote, LETTER)).toBe(false);
  });

  it.each([
    ["a changed dose", "I have started you on Amlodipine 10mg, to be taken once a day in the morning"],
    ["a swapped medicine", "I have started you on Ramipril 5mg, to be taken once a day in the morning"],
    ["a changed date", "Following your appointment on 12/11/2026, I have started you on Amlodipine 5mg"],
    ["a changed frequency word", "Amlodipine 5mg, to be taken twice a day in the morning please"],
    ["an inserted negation", "If you notice ankle swelling, please do not let us know"],
    ["a single inserted not", "If you notice ankle swelling, please not let us know"],
    ["an inserted don't", "If you notice ankle swelling please don't let us know"],
  ])("catches %s hidden in a long, otherwise-exact quote", (_label, quote) => {
    expect(isGrounded(quote, LETTER)).toBe(false);
  });

  it("tolerates a dropped filler word in a long quote", () => {
    expect(isGrounded("Please book blood test with the practice nurse in a few weeks", LETTER)).toBe(true);
  });

  it("does not let fuzziness swallow a short quote's only distinguishing word", () => {
    expect(isGrounded("once a week", LETTER)).toBe(false);
  });
});
