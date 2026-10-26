/**
 * Forbidden-content scan (PRD §11.4). English master only: phrases that diagnose, prescribe,
 * reassure or predict. DRAFT list, to be extended with the clinical adviser.
 */
export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\byou have (?:a |an )?(?!been\b|told\b|said\b|mentioned\b|not\b|asked\b|had\b|to\b|any\b|questions?\b)\w+/,
  /\byou (?:should|must|need to) (?:take|stop|start|increase|reduce|double)\b/,
  /\bthis means you (?:are|have)\b/,
  /\b(?:it|this) (?:is|sounds like|could be|might be|may be) (?:probably |likely )?(?:a |an )?(?:sign|symptom)s? of\b/,
  /\byou(?:'re| are) (?:fine|ok|okay|safe|not at risk)\b/,
  /\bnothing to worry about\b/,
];

function prepare(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
}

/** Indexes of FORBIDDEN_PATTERNS that match. Empty means clean. */
export function forbiddenHits(text: string): number[] {
  const t = prepare(text);
  return FORBIDDEN_PATTERNS.flatMap((re, i) => (re.test(t) ? [i] : []));
}

/** Collects every string in a JSON-like value, for scanning a whole result. */
export function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}
