import { z } from "zod";
import {
  AGE_BANDS,
  gateCategorySchema,
  type AgeBand,
  type GateCategory,
  type SafetyLevel,
} from "@/lib/ai/schemas";
import { contentLanguage } from "@/lib/content";
import childRulesJson from "../../../content/urgency-rules/child.json";
import enRulesJson from "../../../content/urgency-rules/en.json";
import jamRulesJson from "../../../content/urgency-rules/jam.json";
import pcmRulesJson from "../../../content/urgency-rules/pcm.json";
import strokeRulesJson from "../../../content/urgency-rules/stroke.json";
import { mostCautious } from "./levels";

// Gate layer 1: deterministic red-flag rules (FR-05, PRD 9.1, 9.4). Pure, offline,
// and never throws: any internal error returns `uncertain` (fail closed).
// Input must already be redacted (see redact.ts).

/** Language rule lists. A language is "with a rules list" (PRD 9.8) only if it is here. */
const LANGUAGE_RULE_FILES = { en: enRulesJson, jam: jamRulesJson, pcm: pcmRulesJson } as const;
export const RULES_LANGUAGES = Object.keys(LANGUAGE_RULE_FILES) as (keyof typeof LANGUAGE_RULE_FILES)[];

const RULE_LEVELS = ["emergency", "urgent", "crisis"] as const;
const ruleLevelSchema = z.enum(RULE_LEVELS);

/** Whole-word match on normalised text: letters, combining marks and digits count as word characters. */
export function compilePattern(pattern: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${pattern})(?![\\p{L}\\p{M}\\p{N}])`, "u");
}

const patternSchema = z.string().min(1).refine((p) => {
  try {
    compilePattern(p);
    return true;
  } catch {
    return false;
  }
}, "pattern is not a valid regular expression");

const patternsSchema = z.array(patternSchema).min(1);
const ruleMatchShape = {
  id: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/),
  category: gateCategorySchema,
  patterns: patternsSchema,
  /** Every group must also match at least one pattern. */
  requiresAlso: z.array(patternsSchema).min(1).optional(),
};
const fileHeader = {
  $comment: z.string().optional(),
  status: z.enum(["DRAFT_NOT_CLINICALLY_APPROVED", "APPROVED"]),
  reviewed: z.boolean(),
};

export const languageRulesFileSchema = z
  .object({
    ...fileHeader,
    language: z.string().min(1),
    kind: z.enum(["language", "stroke"]),
    rules: z.array(z.object({ ...ruleMatchShape, level: ruleLevelSchema }).strict()).min(1),
  })
  .strict();

const childBandSchema = z.enum(["under_1", "1_to_4", "5_to_11", "12_to_17"]);
type ChildBand = z.infer<typeof childBandSchema>;

export const childRulesFileSchema = z
  .object({
    ...fileHeader,
    language: z.literal("*"),
    kind: z.literal("child"),
    subjectPatterns: z.partialRecord(childBandSchema, patternsSchema),
    rules: z
      .array(
        z
          .object({ ...ruleMatchShape, levelByAgeBand: z.partialRecord(childBandSchema, ruleLevelSchema) })
          .strict()
          .refine((r) => Object.keys(r.levelByAgeBand).length > 0, "levelByAgeBand is empty"),
      )
      .min(1),
  })
  .strict();

interface CompiledRule {
  id: string;
  category: GateCategory;
  patterns: RegExp[];
  requiresAlso: RegExp[][];
}

interface Compiled {
  general: (CompiledRule & { level: SafetyLevel })[];
  child: (CompiledRule & { levelByAgeBand: Partial<Record<ChildBand, SafetyLevel>> })[];
  subjects: [ChildBand, RegExp[]][];
}

let compiled: Compiled | undefined;

function compileRule<T extends z.infer<typeof languageRulesFileSchema>["rules"][number] | z.infer<typeof childRulesFileSchema>["rules"][number]>(rule: T) {
  return {
    ...rule,
    patterns: rule.patterns.map(compilePattern),
    requiresAlso: (rule.requiresAlso ?? []).map((g) => g.map(compilePattern)),
  };
}

function getCompiled(): Compiled {
  if (compiled) return compiled;
  const languageFiles = [...Object.values(LANGUAGE_RULE_FILES), strokeRulesJson].map((f) =>
    languageRulesFileSchema.parse(f),
  );
  const childFile = childRulesFileSchema.parse(childRulesJson);
  compiled = {
    general: languageFiles.flatMap((f) => f.rules.map(compileRule)),
    child: childFile.rules.map(compileRule),
    subjects: childBandSchema.options.map((b) => [b, (childFile.subjectPatterns[b] ?? []).map(compilePattern)]),
  };
  return compiled;
}

/**
 * Lower case, NFKC, apostrophes removed ("can't" -> "cant"), "&" -> " and ",
 * every other punctuation mark -> space, whitespace collapsed. Rule patterns
 * are written against this form.
 */
export function normaliseForRules(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['‘’ʼ`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(rule: CompiledRule, text: string): boolean {
  return rule.patterns.some((p) => p.test(text)) && rule.requiresAlso.every((g) => g.some((p) => p.test(text)));
}

/** True when `lang` has its own hand-written rules list (PRD 9.8 / ADR-014). */
export function hasRulesListFor(lang: string | null | undefined): boolean {
  if (!lang || !lang.trim()) return false;
  return Object.hasOwn(LANGUAGE_RULE_FILES, contentLanguage(lang));
}

const BAND_ORDER: readonly AgeBand[] = AGE_BANDS; // youngest first
const youngest = (bands: AgeBand[]) => bands.sort((a, b) => BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b))[0];

export interface RulesOptions {
  language?: string | null;
  ageBand?: AgeBand | null;
}

export interface RulesResult {
  level: SafetyLevel;
  categories: GateCategory[];
  /** Ids of the rules that fired. Identifiers only, never user text, so safe to log. */
  ruleIds: string[];
  /** Whether the requested language has its own rules list. Feeds PRD 9.8 extra caution. */
  hasRulesList: boolean;
  /** The age band child rules were applied for, if any (given, or inferred from the text). */
  childBand: AgeBand | null;
  /** True when the layer errored and returned `uncertain` (fail closed). */
  failed: boolean;
}

/**
 * Run every rules list on already-redacted text. All language lists run on every
 * input (people code-switch, and the language hint may be wrong); `language` only
 * decides `hasRulesList`. Child patterns run when the subject is a child, either
 * from `ageBand` or because the text mentions a baby or young child; the youngest
 * band wins. Never throws.
 */
export function runRules(redactedText: string, options: RulesOptions = {}): RulesResult {
  let hasRulesList = false;
  try {
    hasRulesList = hasRulesListFor(options.language);
    const rules = getCompiled();
    const text = normaliseForRules(redactedText);

    const hits: { id: string; level: SafetyLevel; category: GateCategory }[] = [];
    for (const rule of rules.general) {
      if (matches(rule, text)) hits.push({ id: rule.id, level: rule.level, category: rule.category });
    }

    const bands: AgeBand[] = options.ageBand ? [options.ageBand] : [];
    for (const [band, patterns] of rules.subjects) if (patterns.some((p) => p.test(text))) bands.push(band);
    const band = bands.length ? youngest(bands) : null;
    const childBand = band && band !== "adult" ? band : null;

    if (childBand) {
      const veryYoung = childBand === "under_1" || childBand === "1_to_4";
      for (const rule of rules.child) {
        const level = rule.levelByAgeBand[childBand];
        if (!level || !matches(rule, text)) continue;
        // PRD 9.4: babies and very young children always route to at least `urgent`.
        hits.push({ id: rule.id, level: veryYoung ? mostCautious([level, "urgent"]) : level, category: rule.category });
      }
    }

    return {
      level: mostCautious(hits.map((h) => h.level)),
      categories: [...new Set(hits.map((h) => h.category))],
      ruleIds: hits.map((h) => h.id),
      hasRulesList,
      childBand,
      failed: false,
    };
  } catch {
    return { level: "uncertain", categories: [], ruleIds: [], hasRulesList, childBand: null, failed: true };
  }
}
