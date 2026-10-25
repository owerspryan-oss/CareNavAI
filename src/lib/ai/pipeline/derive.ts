import { z } from "zod";
import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import { languagesConfig, modelFor, type Language } from "@/lib/config";
import { allStrings } from "@/lib/validate/forbidden";
import { parityMismatch } from "@/lib/validate/parity";
import { missingProtectedSpansByField } from "@/lib/validate/spans";

export const DERIVE_PROMPT = { name: "derive", version: "v2" } as const;

export type OutputMode = Language["outputMode"];
export type Target = { code: string; name: string; script: string; mode: OutputMode };

/** Which user-facing version a detected language gets (PRD §10.5, v0.3 A5). Unknown languages are translated. */
export function targetFor(languageCode: string, register: string): Target {
  const lang = languagesConfig.languages.find((l) => l.code === languageCode);
  if (!lang) return { code: languageCode, name: languageCode, script: "", mode: "translation" };
  // Unlisted English-based dialects and informal English read as simple English (AC-04.2).
  const mode = lang.code === "en" && register !== "standard" ? "simple_english" : lang.outputMode;
  return { code: lang.code, name: lang.englishName, script: lang.script, mode };
}

/** Tier A only when every sign-off flag is true (AC-28.2). Nothing is Tier A until reviewers sign off. */
export function isTierA(code: string): boolean {
  const s = languagesConfig.languages.find((l) => l.code === code)?.signoff;
  return !!s && s.interfaceReviewed && s.urgentMessagesReviewed && s.rulesListPresent && s.testScenariosPassed && (s.sttTested || s.voiceDisabled) && s.pdfFontVerified;
}

/** The master's top-level keys in `parts` groups of similar JSON size (largest first, into the lightest group). */
export function splitKeys(master: Record<string, unknown>, parts: number): string[][] {
  const groups: { keys: string[]; size: number }[] = Array.from({ length: Math.max(1, parts) }, () => ({ keys: [], size: 0 }));
  const bySize = Object.keys(master).sort((a, b) => JSON.stringify(master[b] ?? null).length - JSON.stringify(master[a] ?? null).length);
  for (const k of bySize) {
    const g = groups.reduce((lo, x) => (x.size < lo.size ? x : lo));
    g.keys.push(k);
    g.size += JSON.stringify(master[k] ?? null).length;
  }
  return groups.map((g) => g.keys).filter((k) => k.length > 0);
}

export type Derived<T> =
  | { ok: true; version: T; confidence: "high" | "medium" | "low"; confidenceNotice: boolean; promptVersion: string }
  | { ok: false; reason: "parity" | "protected_spans" | "call_failed"; confidenceNotice: true; promptVersion: string };

/**
 * User-language version derived from the English master (CLAUDE.md rule 5, FR-03, T-12).
 * Parity and protected-span checks run in code; one retry, then English only with a notice
 * (rule 6: never show a mismatched value).
 */
export async function deriveVersion<S extends z.ZodType>(
  master: z.infer<S>,
  schema: S,
  target: Target,
  medicineNames: string[],
  opts: { endpoint: string; requestId?: string },
  deps?: AiDeps,
): Promise<Derived<z.infer<S>>> {
  const prompt = loadPrompt(DERIVE_PROMPT.name, DERIVE_PROMPT.version);
  const targetBlock = `<target>\nmode: ${target.mode}\nlanguage: ${target.name} (${target.code})\nscript: ${target.script || "same as the language normally uses"}\n</target>`;
  const masterFields = allStrings(master);
  const groups = splitKeys(master as Record<string, unknown>, modelFor("TRANSLATE").parallelParts ?? 1);
  let reason: "parity" | "protected_spans" | "call_failed" = "call_failed";

  // One call per group of sections, all at the same time; the checks below run on the joined result.
  const translatePart = async (keys: string[]) => {
    const part = Object.fromEntries(keys.map((k) => [k, (master as Record<string, unknown>)[k]]));
    const partSchema = groups.length === 1 ? schema : (schema as unknown as z.ZodObject).pick(Object.fromEntries(keys.map((k) => [k, true])) as never);
    return (await callStructured(
      {
        role: "TRANSLATE",
        endpoint: opts.endpoint,
        requestId: opts.requestId,
        schema: z.object({ confidence: z.enum(["high", "medium", "low"]), version: partSchema }),
        schemaName: "derived_version",
        instructions: prompt.text,
        input: `${targetBlock}\n${wrapUserData("english_master", JSON.stringify(part))}`,
      },
      deps,
    )) as { confidence: "high" | "medium" | "low"; version: Record<string, unknown> };
  };
  const RANK = { high: 2, medium: 1, low: 0 } as const;

  for (let attempt = 0; attempt < 2; attempt++) {
    let out: { confidence: "high" | "medium" | "low"; version: z.infer<S> };
    try {
      const parts = await Promise.all(groups.map(translatePart));
      out = {
        confidence: parts.reduce((lo, p) => (RANK[p.confidence] < RANK[lo] ? p.confidence : lo), "high" as "high" | "medium" | "low"),
        version: Object.fromEntries(Object.keys(master as object).map((k) => [k, parts.find((p) => k in p.version)?.version[k]])) as z.infer<S>,
      };
    } catch {
      reason = "call_failed";
      break; // callStructured already retried once
    }
    if (parityMismatch(master, out.version) !== null) {
      reason = "parity";
      continue;
    }
    if (missingProtectedSpansByField(masterFields, allStrings(out.version), medicineNames).length > 0) {
      reason = "protected_spans";
      continue;
    }
    return {
      ok: true,
      version: out.version,
      confidence: out.confidence,
      confidenceNotice: !isTierA(target.code) || out.confidence !== "high",
      promptVersion: prompt.version,
    };
  }
  return { ok: false, reason, confidenceNotice: true, promptVersion: prompt.version };
}
