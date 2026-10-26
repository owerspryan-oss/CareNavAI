// The progress feed's sequences (ProgressFeed.tsx). Pure, so it can be tested without a browser.
// Every line is static interface text from content/ui/<language>.json (common.progress), never model text.

import type { LanguageNames } from "@/lib/result/view";
import { format, type UiMessages } from "@/lib/i18n/messages";

export type ProgressCopy = UiMessages["common"]["progress"];

/** A short wait (a gate check, follow-up questions, a language change): about one line every 2 s. */
export const PROGRESS_INTERVAL_MS = 2000;
/** A long wait (a summary, an explanation, reading a photo): slower, so the lines don't run ahead of the work. */
export const PROGRESS_LONG_INTERVAL_MS = 3500;

/**
 * Show line 0 now, then the next line every `intervalMs`, and stop on the last one: it never loops
 * back and never runs past the end. Returns a function that stops it early.
 */
export function runSequence(count: number, intervalMs: number, onIndex: (index: number) => void): () => void {
  if (count <= 1) return () => {};
  let index = 0;
  const id = setInterval(() => {
    index += 1;
    onIndex(index);
    if (index >= count - 1) clearInterval(id);
  }, intervalMs);
  return () => clearInterval(id);
}

/** The output language's own name for "Putting it into {language}…", or null when the output is English. */
export function outputLanguageName(code: string | null, languages: LanguageNames): string | null {
  if (!code || code === "en" || code.startsWith("en-")) return null;
  return languages[code]?.nativeName ?? null;
}

/** Journey 1 summary: re-check -> write -> (translate) -> check medicines and numbers. */
export function summaryLines(p: ProgressCopy, languageName: string | null): string[] {
  return [p.summary.check, p.summary.write, ...translated(p, languageName), p.verify];
}

/** Journey 2 explanation: re-check -> explain -> match to the letter -> (translate) -> check medicines and numbers. */
export function explainLines(p: ProgressCopy, languageName: string | null): string[] {
  return [p.explain.check, p.explain.write, p.explain.match, ...translated(p, languageName), p.verify];
}

/** Journey 2 "Change language": only the translation is redone. */
export function changeLanguageLines(p: ProgressCopy, languageName: string): string[] {
  return [format(p.translate, { language: languageName }), p.verify];
}

function translated(p: ProgressCopy, languageName: string | null): string[] {
  return languageName ? [format(p.translate, { language: languageName })] : [];
}
