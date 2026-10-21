/**
 * Number / dose / date tokens (PRD §11.4 number check, protected spans).
 * Extracts digit runs with any attached separator and unit, e.g. "500mg", "2.5", "12/10/2026".
 * Matching is exact after whitespace and decimal-comma normalisation: "500 mg" == "500mg",
 * but "500mg" != "500mcg". A mismatch is fail-safe: the field is flagged as unclear.
 */
const NUMBER_TOKEN = /\d+(?:[.,:/-]\d+)*(?:\s?(?:mg|mcg|µg|g|kg|ml|l|iu|units?|%)(?![\p{L}]))?/giu;

export function numberTokens(text: string): string[] {
  return (text.normalize("NFKC").match(NUMBER_TOKEN) ?? []).map((t) => t.toLowerCase().replace(/\s+/g, "").replace(/,/g, "."));
}

/** True when every number-like token in `value` also appears in `source`. */
export function numbersAppearIn(value: string, source: string): boolean {
  const available = new Set(numberTokens(source));
  return numberTokens(value).every((t) => available.has(t));
}
