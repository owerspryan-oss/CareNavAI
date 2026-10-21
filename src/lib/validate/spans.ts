import { numberTokens } from "./numbers";

/**
 * Protected spans (CLAUDE.md rule 6): medicine names, doses, numbers and dates must be
 * byte-identical across translation and restyle. Returns the spans missing from `derived`.
 */
export function missingProtectedSpans(master: string, derived: string, medicineNames: string[]): string[] {
  const missing: string[] = [];
  for (const name of medicineNames) {
    if (name && !derived.includes(name)) missing.push(name);
  }
  const derivedNumbers = numberTokens(derived);
  const pool = [...derivedNumbers];
  for (const n of numberTokens(master)) {
    const i = pool.indexOf(n);
    if (i === -1) missing.push(n);
    else pool.splice(i, 1);
  }
  return missing;
}

export function protectedSpansIntact(master: string, derived: string, medicineNames: string[]): boolean {
  return missingProtectedSpans(master, derived, medicineNames).length === 0;
}
