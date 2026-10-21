import type { PreAppointmentResult, ResultMeta } from "@/lib/ai/schemas";

/* Pure helpers for the result view (FR-01, FR-03, AC-04.4). No React, so they are unit-tested directly. */

export type LanguageNames = Record<string, { englishName: string; nativeName: string; dir: "ltr" | "rtl" }>;

export type Segment = { text: string; mark: boolean };

/**
 * Split `text` into plain and highlighted runs, marking every case-insensitive occurrence of a term
 * (medicine names and doses). Longer terms win where terms overlap. Rendered as React text only.
 */
export function highlightSegments(text: string, terms: readonly (string | null | undefined)[]): Segment[] {
  const wanted = [...new Set(terms.map((t) => t?.trim()).filter((t): t is string => !!t && t.length > 1))].sort(
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0 || text === "") return text === "" ? [] : [{ text, mark: false }];

  const lower = text.toLocaleLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of wanted) {
    const needle = term.toLocaleLowerCase();
    for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + needle.length)) {
      if (marked.slice(i, i + needle.length).some(Boolean)) continue;
      marked.fill(true, i, i + needle.length);
    }
  }

  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.mark === marked[i]) last.text += text[i];
    else out.push({ text: text[i], mark: marked[i] });
  }
  return out;
}

/** The medicine names and doses in one version: the spans the result view highlights. */
export function medicineTerms(version: PreAppointmentResult): string[] {
  return version.medicationAndSupport.medicines.flatMap((m) => (m.dose ? [m.name, m.dose] : [m.name]));
}

/** "Paracetamol, two tablets" — name and dose, as one line. */
export function medicineLine(m: { name: string; dose: string | null }): string {
  return m.dose ? `${m.name}, ${m.dose}` : m.name;
}

/** Language name for the "We read this as" line (AC-04.4). Null when the language is unknown. */
export function detectedLanguageName(code: string, languages: LanguageNames): string | null {
  if (!code || code === "und") return null;
  return languages[code]?.englishName ?? languages[code.split("-")[0]]?.englishName ?? null;
}

/**
 * Label for the user-version tab: "Simple English" for English-based dialects and English input
 * (AC-04.2), otherwise the language's own name, so the user recognises it (AC-04.3).
 */
export function userTabLabel(meta: ResultMeta, languages: LanguageNames, simpleEnglish: string): string {
  if (meta.outputMode === "simple_english") return simpleEnglish;
  const lang = languages[meta.outputLanguage];
  return lang?.nativeName ?? lang?.englishName ?? meta.outputLanguage;
}

/** Text direction for a version's generated text (Urdu, Arabic and Farsi are right-to-left). */
export function versionDir(meta: ResultMeta, languages: LanguageNames): "ltr" | "rtl" {
  return meta.outputMode === "translation" ? (languages[meta.outputLanguage]?.dir ?? "ltr") : "ltr";
}

/** Service-route links come from static content; render only tel: and https: links, as the content schema allows. */
export function safeHref(href: string): string | null {
  return /^(tel:\d+|https:\/\/\S+)$/.test(href) ? href : null;
}
