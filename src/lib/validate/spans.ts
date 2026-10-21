import { numberTokens } from "./numbers";

/**
 * Protected spans (CLAUDE.md rule 6): medicine names, doses, numbers and dates must be
 * byte-identical across translation and restyle. Returns the spans missing from `derived`,
 * counting repeats, so each occurrence in the master must survive.
 */
export function missingProtectedSpans(master: string, derived: string, medicineNames: string[]): string[] {
  const missing: string[] = [];
  const count = (text: string, s: string) => text.split(s).length - 1;
  for (const name of new Set(medicineNames.filter(Boolean))) {
    const short = count(master, name) - count(derived, name);
    for (let i = 0; i < short; i++) missing.push(name);
  }
  const pool = numberTokens(derived);
  for (const n of numberTokens(master)) {
    const i = pool.indexOf(n);
    if (i === -1) missing.push(n);
    else pool.splice(i, 1);
  }
  return missing;
}

/**
 * Field-by-field check for two parity-checked values (same shape): every string field of the
 * derived version must keep the protected spans of the matching master field.
 */
export function missingProtectedSpansByField(masterFields: string[], derivedFields: string[], medicineNames: string[]): string[] {
  if (masterFields.length !== derivedFields.length) return ["<shape>"];
  return masterFields.flatMap((m, i) => missingProtectedSpans(m, derivedFields[i], medicineNames));
}

export function protectedSpansIntact(master: string, derived: string, medicineNames: string[]): boolean {
  return missingProtectedSpans(master, derived, medicineNames).length === 0;
}
