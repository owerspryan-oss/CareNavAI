/**
 * Schema parity (PRD §11.4): a derived (translated/restyled) object has exactly the same keys,
 * array lengths and value kinds as the English master. Returns the first mismatching path, or null.
 */
export function parityMismatch(master: unknown, derived: unknown, path = "$"): string | null {
  if (Array.isArray(master)) {
    if (!Array.isArray(derived) || derived.length !== master.length) return path;
    for (let i = 0; i < master.length; i++) {
      const m = parityMismatch(master[i], derived[i], `${path}[${i}]`);
      if (m) return m;
    }
    return null;
  }
  if (master !== null && typeof master === "object") {
    if (derived === null || typeof derived !== "object" || Array.isArray(derived)) return path;
    const mk = Object.keys(master).sort();
    const dk = Object.keys(derived).sort();
    if (mk.join("\u0000") !== dk.join("\u0000")) return path;
    for (const k of mk) {
      const m = parityMismatch((master as Record<string, unknown>)[k], (derived as Record<string, unknown>)[k], `${path}.${k}`);
      if (m) return m;
    }
    return null;
  }
  return typeof master === typeof derived ? null : path;
}
