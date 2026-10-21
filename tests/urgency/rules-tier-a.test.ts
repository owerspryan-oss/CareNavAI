import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgeBand, SafetyLevel } from "@/lib/ai/schemas";
import { LEVEL_RANK } from "@/lib/safety/levels";
import { redact } from "@/lib/safety/redact";
import { runRules } from "@/lib/safety/rules";

// T-33 (FR-05, v0.3 A4, AC-28.4): rules lists for every Tier A target language.
// Every non-English phrasing in this file and in the TW-/HI-/HT-/KRI-/GYN-/TRF-
// scenarios is a DRAFT written without a native speaker and NEEDS NATIVE-SPEAKER REVIEW.

type Expected = SafetyLevel | "clear_or_uncertain";
type Scenario = { id: string; text: string; language: string; ageBand: AgeBand | null; expected: Expected };

const TIER_A = ["jam", "pcm", "tw", "hi", "ht", "kri", "gyn", "trf"];
const NEW_LANGS = ["tw", "hi", "ht", "kri", "gyn", "trf"];

const { scenarios } = JSON.parse(readFileSync(join(process.cwd(), "tests/urgency/scenarios.json"), "utf8")) as { scenarios: Scenario[] };
const tierAScenarios = scenarios.filter((s) => NEW_LANGS.includes(s.language));

const screen = (text: string, language: string, ageBand: AgeBand | null = null) =>
  runRules(redact(text), { language, ageBand: ageBand === "adult" ? null : ageBand });

/** Same pass rule as the matrix runner, applied to the rules layer alone. */
function meets(expected: Expected, got: SafetyLevel): boolean {
  if (expected === "clear_or_uncertain") return got === "clear" || got === "uncertain";
  if (expected === "clear") return got === "clear";
  if (expected === "crisis") return got === "crisis" || got === "emergency";
  return LEVEL_RANK[got] >= LEVEL_RANK[expected];
}

describe("Tier A scenario sets (PRD Appendix B minimum shape)", () => {
  it.each(NEW_LANGS)("%s has 3 emergency, 1 crisis, 1 child, 2 negative controls and 1 ambiguous scenario", (lang) => {
    const set = scenarios.filter((s) => s.language === lang);
    const count = (pred: (s: Scenario) => boolean) => set.filter(pred).length;
    expect(count((s) => s.expected === "emergency")).toBeGreaterThanOrEqual(3);
    expect(count((s) => s.expected === "crisis")).toBeGreaterThanOrEqual(1);
    expect(count((s) => s.ageBand !== null && s.ageBand !== "adult")).toBeGreaterThanOrEqual(1);
    expect(count((s) => s.expected === "clear")).toBeGreaterThanOrEqual(2);
    expect(count((s) => s.expected === "clear_or_uncertain")).toBeGreaterThanOrEqual(1);
  });

  it.each(tierAScenarios.map((s) => [s.id, s] as const))("%s: the rules layer alone meets the expected level", (_id, s) => {
    const r = screen(s.text, s.language, s.ageBand);
    expect(r.failed).toBe(false);
    expect(r.hasRulesList).toBe(true);
    expect(meets(s.expected, r.level), `expected ${s.expected}, got ${r.level} (${r.ruleIds.join(", ")})`).toBe(true);
  });

  it("U-17 (Hindi) reaches emergency from the rules layer", () => {
    const r = screen("मेरे सीने में दर्द है और मैं सांस नहीं ले पा रहा हूँ", "hi");
    expect(r.level).toBe("emergency");
    expect(r.ruleIds).toContain("hi.breathing.cannot_breathe");
  });
});

// Further DRAFT variants: other red-flag categories, other spellings (romanised Hindi,
// Twi/Krio/Kreyòl typed without special letters), and the child-subject words.
const MORE_ROUTE_UP: [text: string, lang: string, ageBand: AgeBand | null, min: SafetyLevel][] = [
  // Twi
  ["Me koko mu ye me ya na mentumi nhome", "tw", null, "emergency"],
  ["Me maame tɔɔ ase na ɔnnyane", "tw", null, "emergency"],
  ["Abofra no ano ahon na ɔntumi nhome", "tw", null, "emergency"],
  ["Mɛkum me ho", "tw", null, "crisis"],
  ["Me ba no ho yɛ hyew na ɔnnom nufu", "tw", "under_1", "urgent"],
  // Hindi: Devanagari and Hinglish
  ["मेरी साँस नहीं आ रही, दम घुट रहा है", "hi", null, "emergency"],
  ["Mere seene me dard hai aur bahut pasina aa raha hai", "hi", null, "emergency"],
  ["सीने में दर्द है", "hi", null, "urgent"],
  ["Papa ka chehra ek taraf latak gaya hai", "hi", "adult", "emergency"],
  ["Khoon ruk nahi raha", "hi", null, "emergency"],
  ["दादी बेहोश पड़ी हैं और होश में नहीं आ रहीं", "hi", null, "emergency"],
  ["उसे दौरे पड़ रहे हैं", "hi", null, "emergency"],
  ["Uske honth sooj gaye hain", "hi", null, "emergency"],
  ["Main ab jeena nahi chahti, khud ko khatam karna chahti hoon", "hi", null, "crisis"],
  ["Mujhe aatmahatya ke khayal aa rahe hain", "hi", null, "crisis"],
  ["Mere 2 mahine ke bachche ko bukhar hai", "hi", null, "urgent"],
  ["Bachcha doodh nahi pee raha", "hi", null, "urgent"],
  // Haitian Creole
  ["Mwen pa ka respire", "ht", null, "emergency"],
  ["Pwatrin mwen ap fe m mal epi m ap swe anpil", "ht", null, "emergency"],
  ["San an pa vle sispann", "ht", null, "emergency"],
  ["Li ap fè yon kriz epi li pa reveye", "ht", null, "emergency"],
  ["Gòj mwen ap fèmen", "ht", null, "emergency"],
  ["Mwen vle touye tèt mwen", "ht", null, "crisis"],
  ["Timoun nan pa vle manje epi kò li mou", "ht", null, "emergency"],
  // Krio
  ["A no able blow", "kri", null, "emergency"],
  ["Mi mama fɔdɔm ɛn i nɔ de wek", "kri", null, "emergency"],
  ["Fit de kech am", "kri", null, "emergency"],
  ["In mɔt dɔn swɛl", "kri", null, "emergency"],
  ["A tayad fɔ liv", "kri", null, "crisis"],
  ["Di pikin bodi hot an i no de dring", "kri", "1_to_4", "urgent"],
  // Guyanese Creole
  ["She ain breathin", "gyn", null, "emergency"],
  ["De blood na stop", "gyn", null, "emergency"],
  ["She throat swell up", "gyn", null, "emergency"],
  ["Me nah want live no more", "gyn", null, "crisis"],
  ["Me chest tight up", "gyn", null, "urgent"],
  // Trinidadian Creole
  ["He fall down and he eh wakin up", "trf", null, "emergency"],
  ["She havin ah fit", "trf", null, "emergency"],
  ["One side ah he body gone dead", "trf", "adult", "emergency"],
  ["Meh lips swellin up", "trf", null, "emergency"],
  ["I go kill mehself", "trf", null, "crisis"],
  ["I tired of living", "trf", null, "crisis"],
];

describe("Tier A rules: further DRAFT variants route up", () => {
  it.each(MORE_ROUTE_UP)("%s [%s]", (text, lang, ageBand, min) => {
    const r = screen(text, lang, ageBand);
    expect(LEVEL_RANK[r.level] >= LEVEL_RANK[min], `got ${r.level} (${r.ruleIds.join(", ")})`).toBe(true);
  });

  it("matches Devanagari nukta letters typed precomposed or decomposed", () => {
    const precomposed = "चेहरा टेढ़ा हो गया"; // ढ़ as one code point
    const decomposed = "चेहरा टेढ़ा हो गया"; // ढ + nukta
    expect(precomposed).not.toBe(decomposed);
    for (const t of [precomposed, decomposed]) expect(screen(t, "hi").level, t).toBe("emergency");
  });
});

// Negative controls for wording that the new patterns could plausibly mis-fire on.
const MORE_CLEAR: [text: string, lang: string][] = [
  ["A nɔ ebul blo mi nos", "kri"], // blo = breathe, but also blow (your nose)
  ["A nɔ wan liv na Landan", "kri"], // not wanting to live somewhere
  ["I had a chest X-ray at the hospital", "en"],
  ["Lestomak mwen fè m mal apre m fin manje", "ht"], // lestomak = chest, but also stomach
  ["Mwen travay san pa kanpe", "ht"], // san = blood, but also "without"
  ["Mwen pa vle viv Miami", "ht"],
  ["Meri saas nahi aa rahi aaj", "hi"], // saas = mother-in-law
  ["मेरी सास नहीं आ रही आज", "hi"],
  ["मुझे पिछले साल दिल का दौरा पड़ा था, अब मैं ठीक हूँ", "hi"],
  ["डॉक्टर का दौरा कल है", "hi"], // daura = visit
  ["I no wake up early these days", "pcm"], // Krio 'i nɔ de wek' must not catch Pidgin first person
  ["Mujhe 2019 mein lakwa hua tha, dawai ke baare mein poochna hai", "hi"],
  ["Mujhe apni BP ki dawai ke baare mein poochna hai", "hi"],
  ["Main marna nahi chahta, bas report samajhna hai", "hi"],
  ["Mepɛ sɛ mebisa dɔkta no asɛm bi", "tw"],
  ["Mempɛ sɛ mewu", "tw"],
  ["I trying to get fit", "trf"],
  ["Me tired fuh walk up de hill", "gyn"],
];

describe("Tier A rules: negative controls stay clear", () => {
  it.each(MORE_CLEAR)("%s [%s]", (text, lang) => {
    const r = screen(text, lang);
    expect(r.level, r.ruleIds.join(", ")).toBe("clear");
  });
});

describe("Tier A coverage", () => {
  it("every Tier A target has its own rules list", async () => {
    const { hasRulesListFor } = await import("@/lib/safety/rules");
    for (const lang of TIER_A) expect(hasRulesListFor(lang), lang).toBe(true);
  });
});

/** Copy content/ to a temp project root, let `mutate` change it, and load fresh modules from there. */
async function withContentCopy(mutate: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "carenav-content-"));
  cpSync(join(process.cwd(), "content"), join(root, "content"), { recursive: true });
  mutate(root);
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
  const rules = await import("@/lib/safety/rules");
  const content = await import("@/lib/content");
  return { root, rules, content };
}

describe("loading from content files (AC-28.4)", () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  it("picks up a new language's rules and urgent messages from content files alone", async () => {
    const { root, rules, content } = await withContentCopy((root) => {
      const dir = join(root, "content");
      const ruleFile = { ...JSON.parse(readFileSync(join(dir, "urgency-rules/jam.json"), "utf8")), language: "zz" };
      ruleFile.rules = [{ id: "zz.test.word", level: "emergency", category: "other", patterns: ["zzredflag"] }];
      writeFileSync(join(dir, "urgency-rules/zz.json"), JSON.stringify(ruleFile));
      const urgent = { ...JSON.parse(readFileSync(join(dir, "urgent-messages/jam.json"), "utf8")), language: "zz" };
      writeFileSync(join(dir, "urgent-messages/zz.json"), JSON.stringify(urgent));
    });
    roots.push(root);
    expect(rules.RULES_LANGUAGES).toContain("zz");
    expect(rules.hasRulesListFor("zz")).toBe(true);
    expect(rules.runRules("zzredflag", { language: "zz" })).toMatchObject({ level: "emergency", ruleIds: ["zz.test.word"], failed: false });
    expect(content.getUrgentMessage("emergency", "zz")).toMatchObject({ servedLanguage: "zz", fellBack: false });
  });

  it.each([
    ["malformed JSON", (dir: string) => writeFileSync(join(dir, "ht.json"), "{ not json")],
    ["a schema violation", (dir: string) => writeFileSync(join(dir, "ht.json"), JSON.stringify({ language: "ht", kind: "language", rules: [] }))],
    ["a bad regular expression", (dir: string) => {
      const f = JSON.parse(readFileSync(join(dir, "ht.json"), "utf8"));
      f.rules[0].patterns.push("(unclosed");
      writeFileSync(join(dir, "ht.json"), JSON.stringify(f));
    }],
    ["a file naming another language", (dir: string) => {
      const f = JSON.parse(readFileSync(join(dir, "ht.json"), "utf8"));
      writeFileSync(join(dir, "ht.json"), JSON.stringify({ ...f, language: "jam" }));
    }],
    ["a missing English list", (dir: string) => rmSync(join(dir, "en.json"))],
    ["a missing child list", (dir: string) => rmSync(join(dir, "child.json"))],
  ])("fails closed to uncertain on %s, never skipping the file", async (_name, mutate) => {
    const { root, rules } = await withContentCopy((root) => mutate(join(root, "content", "urgency-rules")));
    roots.push(root);
    // Even text that is clearly clear must come back uncertain: the layer did not run.
    expect(rules.runRules("I want to ask about my tablets", { language: "en" })).toMatchObject({ level: "uncertain", failed: true });
    expect(rules.runRules("I can't breathe", { language: "ht" })).toMatchObject({ level: "uncertain", failed: true });
  });

  it("fails closed when the rules directory is missing", async () => {
    const { root, rules } = await withContentCopy((root) => rmSync(join(root, "content", "urgency-rules"), { recursive: true }));
    roots.push(root);
    expect(rules.RULES_LANGUAGES).toEqual([]);
    expect(rules.runRules("hello", { language: "en" })).toMatchObject({ level: "uncertain", failed: true, hasRulesList: false });
  });

  it("serves the English urgent message, flagged as a fallback, when a translation file is malformed", async () => {
    const { root, content } = await withContentCopy((root) => writeFileSync(join(root, "content", "urgent-messages", "ht.json"), "{ broken"));
    roots.push(root);
    const served = content.getUrgentMessage("emergency", "ht");
    expect(served).toMatchObject({ servedLanguage: "en", fellBack: true, key: "emergency" });
    expect(served.message.actions.map((a) => a.href)).toEqual(["tel:999"]);
    expect(content.getUrgentContent("ht").language).toBe("en");
  });

  it("throws if the English urgent-message master is malformed (a deploy bug, caught by tests)", async () => {
    const { root, content } = await withContentCopy((root) => writeFileSync(join(root, "content", "urgent-messages", "en.json"), "{}"));
    roots.push(root);
    expect(() => content.getUrgentMessage("emergency", "en")).toThrow();
  });
});
