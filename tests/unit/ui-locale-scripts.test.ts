import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceHash as appHash } from "@/lib/i18n/locale";
// @ts-expect-error plain .mjs script helpers, no type declarations
import { flatten, fromCsv, problem, sourceHash, toCsv, unflatten } from "../../scripts/lib/ui-locales.mjs";

// T-32: the translate / review-sheet scripts share these helpers with the app's rules.

const en = JSON.parse(readFileSync("content/ui/en.json", "utf8")).messages;

describe("interface locale script helpers", () => {
  it("flattens and rebuilds the English master exactly", () => {
    expect(unflatten(flatten(en), en)).toEqual(en);
  });

  it("hashes English the same way as the app", () => {
    for (const s of ["Next", "Step {n} of {total}", "Mi nuh know — ünïcode"]) expect(sourceHash(s)).toBe(appHash(s));
  });

  it("rejects translations that change placeholders, numbers or product names", () => {
    expect(problem("Step {n} of {total}", "Paso {n} de {total}")).toBeNull();
    expect(problem("Step {n} of {total}", "Paso {n}")).toBe("placeholders differ");
    expect(problem("18 or over", "१८ या उससे ज़्यादा")).toBe("numbers differ");
    expect(problem("1 to 4", "4 to 1")).toBeNull(); // order may change with grammar
    expect(problem("Too many people are using CareNav AI", "Kuna watu wengi sana")).toBe('"CareNav AI" missing');
    expect(problem("Next", "  ")).toBe("empty");
  });

  it("round-trips CSV with commas, quotes, new lines and non-Latin text", () => {
    const rows = [
      ["key", "english", "translation"],
      ["a", 'Say "hi", then go', "اگلا\nدوسری لائن"],
      ["b", "", "ok"],
    ];
    expect(fromCsv(toCsv(rows))).toEqual(rows);
  });
});
