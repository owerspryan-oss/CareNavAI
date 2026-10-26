import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareAnswersSchema } from "@/lib/ai/schemas";
import { isGrounded } from "@/lib/validate/grounding";

const read = (p: string) => fs.readFileSync(new URL(`../../demo/${p}`, import.meta.url), "utf8");

describe("demo assets (T-29)", () => {
  it.each(["marcia-prepare.json", "red-flag.json"])("%s is a valid Journey 1 input", (f) => {
    expect(prepareAnswersSchema.safeParse(JSON.parse(read(`inputs/${f}`))).success).toBe(true);
  });

  it("the letter has the medicine, the blood test and no course length", () => {
    const letter = read("letter/gp-letter.txt");
    expect(isGrounded("Amlodipine 5mg, to be taken once a day in the morning", letter)).toBe(true);
    expect(letter).toContain("in a few weeks");
    expect(letter).not.toMatch(/\bfor \d+ (?:days|weeks|months)\b/);
  });
});
