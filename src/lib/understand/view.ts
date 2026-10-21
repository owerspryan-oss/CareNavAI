import type { PostAppointmentResult } from "@/lib/ai/schemas";
import { doseAndDateTerms } from "@/lib/result/view";
import { redact } from "@/lib/safety/redact";
import { isGrounded } from "@/lib/validate/grounding";
import { normalise } from "@/lib/validate/normalise";

/*
 * Pure mapping from a Journey 2 result to what the result view shows (FR-02, CLAUDE.md rule 7).
 * No React, so it is unit-tested directly.
 *
 * The server has already grounded every item. This re-checks, in the browser, against the text the
 * person confirmed, and anything that fails joins `notFound`: belt and braces, so an ungrounded item
 * can never reach the "fact" sections even if a server change regressed.
 */

type Version = PostAppointmentResult;
export type WhoToAsk = Version["unclearOrMissing"][number]["whoToAsk"];

export type NotFoundSection = "whatYouWereTold" | "whatItMeans" | "nextSteps" | "medicines";

export interface UnderstandView {
  /** Each grounded item keeps the English master's quote: the derived version may not alter a quote. */
  told: { text: string; sourceQuote: string }[];
  means: { clinicianWords: string; plainMeaning: string }[];
  steps: { action: string; byWhen: string | null; sourceQuote: string }[];
  medicines: (Version["medicines"][number] & { sourceQuote: string })[];
  unclear: { item: string; whoToAsk: WhoToAsk }[];
  /** Items not found in the letter. Never shown as fact. Always the English master's wording. */
  notFound: { section: NotFoundSection; text: string }[];
  /** Medicine names, doses and `byWhen` wording to highlight (AC-02.5). Dates are found per text. */
  terms: string[];
}

/** True when `quote` is grounded in the letter as confirmed, or in its redacted form (what the server saw). */
export function groundedIn(quote: string, letter: string): boolean {
  return isGrounded(quote, letter) || isGrounded(quote, redact(letter));
}

/** A clinician's term is shown only if it appears in the letter (short terms, so a plain normalised match). */
function termIn(term: string, letter: string): boolean {
  const t = normalise(term);
  return t !== "" && (normalise(letter).includes(t) || normalise(redact(letter)).includes(t));
}

/**
 * Build the result view for the version on screen (`shown`), checked against the English master
 * (`english`, same shape and order by schema parity) and the confirmed letter text.
 */
export function buildUnderstandView(shown: Version, english: Version, letter: string): UnderstandView {
  const notFound: UnderstandView["notFound"] = english.ungrounded.map((u) => ({ section: u.section, text: u.text }));

  const told: UnderstandView["told"] = [];
  shown.whatYouWereTold.forEach((item, i) => {
    const master = english.whatYouWereTold[i];
    if (master && groundedIn(master.sourceQuote, letter)) told.push({ text: item.text, sourceQuote: master.sourceQuote });
    else notFound.push({ section: "whatYouWereTold", text: master?.text ?? item.text });
  });

  const means: UnderstandView["means"] = [];
  shown.whatItMeans.forEach((item, i) => {
    const master = english.whatItMeans[i];
    if (master && termIn(master.clinicianWords, letter)) means.push(item);
    else notFound.push({ section: "whatItMeans", text: master ? `${master.clinicianWords}: ${master.plainMeaning}` : item.plainMeaning });
  });

  const steps: UnderstandView["steps"] = [];
  shown.nextSteps.forEach((item, i) => {
    const master = english.nextSteps[i];
    if (master && groundedIn(master.sourceQuote, letter)) steps.push({ ...item, sourceQuote: master.sourceQuote });
    else notFound.push({ section: "nextSteps", text: master?.action ?? item.action });
  });

  const medicines: UnderstandView["medicines"] = [];
  shown.medicines.forEach((item, i) => {
    const master = english.medicines[i];
    if (master && groundedIn(master.sourceQuote, letter) && termIn(master.name, letter)) {
      medicines.push({ ...item, sourceQuote: master.sourceQuote });
    } else {
      notFound.push({ section: "medicines", text: master?.name ?? item.name });
    }
  });

  const terms = [
    ...medicines.flatMap((m) => [m.name, m.dose]),
    ...steps.map((s) => s.byWhen),
  ].filter((t): t is string => !!t);

  return { told, means, steps, medicines, unclear: shown.unclearOrMissing, notFound, terms };
}

/**
 * What to highlight in the letter on the confirm step (AC-08.3): the medicine names and doses the
 * photo reader found, plus any dose or date in the text itself. Recomputed as the person edits.
 */
export function letterTerms(text: string, candidates: readonly { name: string; dose: string | null }[]): string[] {
  const lower = text.toLocaleLowerCase();
  const fromPhoto = candidates
    .flatMap((c) => [c.name, c.dose])
    .filter((t): t is string => !!t && lower.includes(t.toLocaleLowerCase()));
  return [...new Set([...fromPhoto, ...doseAndDateTerms(text)])];
}
