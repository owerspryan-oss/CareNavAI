import { words } from "./normalise";

/**
 * Grounding (CLAUDE.md rule 7, PRD §11.4). A quote is grounded when it has at least
 * MIN_WORDS words and appears in the confirmed source after normalisation, with a small
 * fuzzy tolerance for OCR-style slips only:
 *  - a word may differ from its source word by 1-2 characters ("practise" ~ "practice"),
 *  - a short filler word (<= 3 letters, not a negation or dosing term) may be added or dropped,
 *  - nothing containing a digit may differ at all, and no other word may be swapped,
 * with at most MAX_EDIT_RATIO of the quote's words edited. So an invented medicine, dose,
 * date or instruction is never grounded, however long the surrounding quote is.
 */
export const MIN_WORDS = 3;
const MAX_EDIT_RATIO = 0.15;
const BLOCKED = Number.POSITIVE_INFINITY;

const hasDigit = (w: string) => /\p{N}/u.test(w);
// Short words that change meaning; never treated as droppable filler.
const MEANINGFUL_SHORT = new Set(["not", "no", "nor", "t", "don", "won", "can", "isn", "off", "max", "min", "per", "day", "am", "pm", "iv", "od", "bd", "tds", "qds", "prn"]);

function charDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (hasDigit(a) || hasDigit(b)) return BLOCKED;
  const allowed = Math.min(a.length, b.length) <= 5 ? 1 : 2;
  return Math.min(a.length, b.length) >= 4 && charDistance(a, b) <= allowed ? 1 : BLOCKED;
}

function gapCost(w: string): number {
  return w.length <= 3 && !hasDigit(w) && !MEANINGFUL_SHORT.has(w) ? 1 : BLOCKED;
}

/** Word-level edit distance with the restricted costs above. */
function wordDistance(q: string[], s: string[]): number {
  let prev = [0];
  for (let j = 1; j <= s.length; j++) prev[j] = prev[j - 1] + gapCost(s[j - 1]);
  for (let i = 1; i <= q.length; i++) {
    const cur = [prev[0] + gapCost(q[i - 1])];
    for (let j = 1; j <= s.length; j++) {
      cur[j] = Math.min(
        prev[j - 1] + substitutionCost(q[i - 1], s[j - 1]),
        prev[j] + gapCost(q[i - 1]),
        cur[j - 1] + gapCost(s[j - 1]),
      );
    }
    prev = cur;
  }
  return prev[s.length];
}

export function isGrounded(quote: string, source: string): boolean {
  const q = words(quote);
  if (q.length < MIN_WORDS) return false;
  const s = words(source);
  if (` ${s.join(" ")} `.includes(` ${q.join(" ")} `)) return true;

  const budget = Math.floor(q.length * MAX_EDIT_RATIO);
  if (budget === 0) return false;
  for (let len = Math.max(1, q.length - budget); len <= q.length + budget; len++) {
    for (let start = 0; start + len <= s.length; start++) {
      if (wordDistance(q, s.slice(start, start + len)) <= budget) return true;
    }
  }
  return false;
}
