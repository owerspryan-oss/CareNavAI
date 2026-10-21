import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { languagesConfig } from "@/lib/config";
import { getUiLocale, matchUiLanguage, resolveUiLanguage, uiLanguages } from "@/lib/i18n/locale";
import { format, formatList, formatNumber, mergeOverMaster, placeholders } from "@/lib/i18n/messages";
// @ts-expect-error plain .mjs script helpers, no type declarations
import { problem } from "../../scripts/lib/ui-locales.mjs";

// FR-27 / T-31, T-32: interface locale files, English master, picker resolution.

const DIR = join(process.cwd(), "content", "ui");
const read = (f: string) => JSON.parse(readFileSync(join(DIR, f), "utf8"));
const en = read("en.json");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

function leaves(tree: unknown, prefix = ""): [string, unknown][] {
  if (tree && typeof tree === "object") {
    return Object.entries(tree).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [[prefix, tree]];
}

describe("helpers", () => {
  it("finds and fills placeholders", () => {
    expect(placeholders("Step {n} of {total}")).toEqual(["n", "total"]);
    expect(format("Step {n} of {total}", { n: 2, total: 7 })).toBe("Step 2 of 7");
    expect(format("Hi {who}", {})).toBe("Hi {who}");
  });

  it("formats numbers with Western digits in every interface language", () => {
    expect(formatNumber(2000, "en")).toBe("2,000");
    for (const { code } of languagesConfig.languages) expect(formatNumber(1234, code), code).toMatch(/^1\D?234$/);
  });

  it("joins lists", () => {
    expect(formatList(["medicines", "worries"], "en")).toBe("medicines, worries");
  });
});

describe("mergeOverMaster", () => {
  const master = { a: "Hello", b: { c: "Step {n} of {total}" }, list: ["one", "two"] };

  it("takes usable translations and falls back to English string by string", () => {
    const { merged, fallbacks } = mergeOverMaster(master, { a: "Hola", b: { c: "Paso {n}" }, list: ["uno"] });
    expect(merged).toEqual({ a: "Hola", b: { c: "Step {n} of {total}" }, list: ["uno", "two"] });
    expect(fallbacks.sort()).toEqual(["b.c", "list.1"]);
  });

  it("never returns a blank or a non-string, and ignores unknown keys", () => {
    const { merged } = mergeOverMaster(master, { a: "  ", b: { c: 3 }, extra: "x" });
    expect(merged).toEqual(master);
  });
});

describe("language resolution (AC-27.1)", () => {
  it("prefers the cookie, then Accept-Language by q, then English", () => {
    expect(resolveUiLanguage(undefined, null)).toBe("en");
    expect(resolveUiLanguage("en", "fr;q=0.9")).toBe("en");
    expect(resolveUiLanguage("not-a-language", "en-GB,en;q=0.9")).toBe("en");
    expect(resolveUiLanguage(undefined, "xx-YY, en;q=0.5")).toBe("en");
  });

  it("maps common browser tags onto registry codes when those files exist", () => {
    const has = (c: string) => uiLanguages().includes(c);
    if (has("zh-Hans")) expect(matchUiLanguage("zh-CN")).toBe("zh-Hans");
    if (has("zh-Hant")) expect(matchUiLanguage("zh-HK")).toBe("zh-Hant");
    if (has("pa-Arab")) expect(matchUiLanguage("pa-PK")).toBe("pa-Arab");
    if (has("pa-Guru")) expect(matchUiLanguage("pa")).toBe("pa-Guru");
    if (has("ur")) expect(resolveUiLanguage(undefined, "ur-PK,en;q=0.8")).toBe("ur");
  });

  it("serves English for a code without a file", () => {
    expect(getUiLocale("xx")).toMatchObject({ language: "en", dir: "ltr", reviewed: true });
  });
});

describe("locale files", () => {
  it("English is the reviewed master with no blank strings", () => {
    expect(en).toMatchObject({ language: "en", derivedFrom: null, reviewed: true });
    for (const [path, v] of leaves(en.messages)) expect(typeof v === "string" && v.trim() !== "", path).toBe(true);
  });

  it("every file is a registry language, and right-to-left languages are served right-to-left", () => {
    const codes = languagesConfig.languages.map((l) => l.code);
    for (const f of files) {
      const code = f.slice(0, -5);
      expect(codes, f).toContain(code);
      const rtl = languagesConfig.languages.find((l) => l.code === code)?.dir === "rtl";
      expect(getUiLocale(code)).toMatchObject({ language: code, dir: rtl ? "rtl" : "ltr" });
    }
  });

  it.each(files.filter((f) => f !== "en.json"))("%s: derived from English, unreviewed unless marked, same keys and placeholders", (f) => {
    const file = read(f);
    expect(file.language).toBe(f.slice(0, -5));
    expect(file.derivedFrom).toBe("en");
    expect(typeof file.reviewed).toBe("boolean");
    const master = new Map(leaves(en.messages));
    for (const [path, v] of leaves(file.messages)) {
      expect(master.has(path), `${f}: unknown key ${path}`).toBe(true);
      expect(typeof v, `${f}: ${path}`).toBe("string");
      expect(placeholders(v as string), `${f}: ${path}`).toEqual(placeholders(master.get(path) as string));
      // Same checks the translate and import scripts apply: numbers and product names unchanged.
      expect(problem(master.get(path), v), `${f}: ${path}`).toBeNull();
      expect(typeof file.sourceHashes?.[path], `${f}: no source hash for ${path}`).toBe("string");
    }
  });
});
