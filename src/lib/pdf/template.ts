import type { PostAppointmentResult, PreAppointmentResult, ResultMeta } from "@/lib/ai/schemas";
import { languagesConfig } from "@/lib/config";
import { getDisclaimers, getUrgentMessage } from "@/lib/content";
import { highlightSegments, userTabLabel, versionDir, type LanguageNames } from "@/lib/result/view";
import { pdfCopy as c } from "./copy";
import type { PdfRequest } from "./schema";

/**
 * HTML template for the bilingual PDF (FR-10, ADR-008). Pure: no browser, no DB.
 * Every dynamic string goes through `esc`; model text is never injected as HTML.
 * Always plain (ADR-010): only the English master and the derived user version are rendered.
 */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export const LANGUAGE_NAMES: LanguageNames = Object.fromEntries(
  languagesConfig.languages.map((l) => [l.code, { englishName: l.englishName, nativeName: l.nativeName, dir: l.dir }]),
);

export type TemplateOptions = {
  /** Clinician form link encoded in the QR code: `${PUBLIC_BASE_URL}/c/<ref>`. */
  feedbackUrl: string;
  /** SVG markup from the `qrcode` package for `feedbackUrl`. Embedded as a data: URL, never inline. */
  qrSvg: string;
  now: Date;
  showDraftLabel: boolean;
};

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

const marked = (text: string, terms: readonly (string | null)[]) =>
  highlightSegments(text, terms)
    .map((s) => (s.mark ? `<mark>${esc(s.text)}</mark>` : esc(s.text)))
    .join("");

const section = (title: string, body: string) => (body ? `<section><h2>${esc(title)}</h2>${body}</section>` : "");
const para = (text: string, terms: readonly (string | null)[] = []) => (text.trim() ? `<p>${marked(text, terms)}</p>` : "");
const list = (items: readonly string[], terms: readonly (string | null)[] = []) =>
  items.length ? `<ul>${items.map((i) => `<li>${marked(i, terms)}</li>`).join("")}</ul>` : "";
const quote = (q: string) => `<blockquote><span class="q-label">${esc(c.understand.fromSource)}</span> “${esc(q)}”</blockquote>`;

// ---- Journey 1 --------------------------------------------------------------

function preBody(r: PreAppointmentResult, clinician: boolean): string {
  const s = c.prepare.sections;
  const terms = r.medicationAndSupport.medicines.flatMap((m) => [m.name, m.dose]);
  const who = [r.forWhom.label, c.relationship[r.forWhom.relationship], r.forWhom.ageBand ? c.ageBand[r.forWhom.ageBand] : null]
    .filter(Boolean)
    .join(" · ");
  const meds = r.medicationAndSupport.medicines.map((m) => (m.dose ? `${m.name}, ${m.dose}` : m.name));
  return [
    section(s.forWhom, para(who)),
    section(s.mainConcern, para(r.mainConcern, terms)),
    section(s.duration, para(r.duration.stated ? r.duration.text : c.prepare.durationNotStated)),
    section(s.frequency, para(r.frequencyAndPattern, terms)),
    section(s.changes, list(r.changesAndTriggers, terms)),
    section(s.medicines, meds.length ? list(meds, terms) : r.medicationAndSupport.provided ? "" : para(c.prepare.noMedicines)),
    section(s.previousSupport, list(r.medicationAndSupport.previousSupport, terms)),
    section(s.worries, list(r.worriesAndBarriers, terms)),
    section(s.questions, r.questionsToAsk.length ? `<ol>${r.questionsToAsk.map((q) => `<li>${marked(q, terms)}</li>`).join("")}</ol>` : ""),
    section(s.whatToBring, list(r.whatToBring, terms)),
    section(s.notMentioned, list(r.notMentioned)),
    // Service routes are static content (ADR-004) and are for the patient, not the clinician page.
    clinician
      ? ""
      : section(
          s.serviceRoutes,
          `<ul class="routes">${r.serviceRoutes
            .map((route) => {
              const contacts = route.contacts.map((ct) => esc(ct.label) + (ct.href.startsWith("https:") ? ` (${esc(ct.href.replace(/^https:\/\//, ""))})` : "")).join(" · ");
              return `<li><strong class="route-name">${esc(route.name)}</strong>${esc(route.description)}${contacts ? `<br><span class="contacts">${contacts}</span>` : ""}</li>`;
            })
            .join("")}</ul>`,
        ),
  ].join("");
}

// ---- Journey 2 --------------------------------------------------------------

function postBody(r: PostAppointmentResult): string {
  const u = c.understand;
  const s = u.sections;
  const terms = r.medicines.flatMap((m) => [m.name, m.dose]);
  const field = (label: string, v: string | null) => (v ? `<div class="kv"><span>${esc(label)}</span> ${marked(v, terms)}</div>` : "");

  const told = r.whatYouWereTold.map((i) => `<li>${marked(i.text, terms)}${quote(i.sourceQuote)}</li>`).join("");
  const means = r.whatItMeans.map((i) => `<li><strong>${esc(i.clinicianWords)}</strong>: ${marked(i.plainMeaning, terms)}</li>`).join("");
  const steps = r.nextSteps
    .map((i) => `<li>${marked(i.action, terms)}${field(u.byWhen, i.byWhen)}${quote(i.sourceQuote)}</li>`)
    .join("");
  const meds = r.medicines
    .map(
      (m) =>
        `<li class="medicine"><strong><mark>${esc(m.name)}</mark></strong>${field(u.dose, m.dose)}${field(u.frequency, m.frequency)}${field(u.duration, m.duration)}${field(u.instructions, m.instructions)}${quote(m.sourceQuote)}</li>`,
    )
    .join("");
  const unclear = r.unclearOrMissing.map((i) => `<li>${esc(i.item)} <span class="who">${esc(u.whoToAsk[i.whoToAsk])}</span></li>`).join("");
  // Rule 7: ungrounded items appear only here, labelled, never as fact.
  const ungrounded = r.ungrounded.length
    ? `<section class="ungrounded"><h2>${esc(u.ungroundedTitle)}</h2><p class="lead">${esc(u.ungroundedLead)}</p><ul>${r.ungrounded
        .map((i) => `<li>${esc(i.text)}</li>`)
        .join("")}</ul></section>`
    : "";

  return [
    section(s.whatYouWereTold, told && `<ul class="items">${told}</ul>`),
    section(s.whatItMeans, means && `<ul>${means}</ul>`),
    section(s.nextSteps, steps && `<ul class="items">${steps}</ul>`),
    section(s.medicines, meds && `<p class="check">${esc(u.checkMedicines)}</p><ul class="items">${meds}</ul>`),
    section(s.unclearOrMissing, unclear && `<ul>${unclear}</ul>`),
    ungrounded,
  ].join("");
}

// ---- Page shell -------------------------------------------------------------

type Version = { result: PreAppointmentResult | PostAppointmentResult; clinician: boolean };

const WARNING_ICON =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function versionPage(req: PdfRequest, v: Version, opts: TemplateOptions, urgentLevel: ResultMeta["urgentAcknowledged"]): string {
  const meta = v.result.meta;
  const lang = v.clinician ? "en" : meta.outputLanguage;
  const dir = v.clinician ? "ltr" : versionDir(meta, LANGUAGE_NAMES);
  const copy = req.flow === "prepare" ? c.prepare : c.understand;
  const title = v.clinician ? copy.clinicianTitle : `${copy.userTitle}: ${userTabLabel(meta, LANGUAGE_NAMES, "Simple English")}`;

  const draft = opts.showDraftLabel ? `<div class="draft">${esc(getDisclaimers(lang).content.draftLabel)}</div>` : "";
  // v0.3 A2: static banner, never model text, in the page's language where a file exists.
  const banner = urgentLevel ? `<div class="urgent" role="alert">${WARNING_ICON}<p>${esc(getUrgentMessage(urgentLevel, lang).message.banner)}</p></div>` : "";
  const confidence = !v.clinician && meta.confidenceNotice ? `<p class="notice">${esc(c.confidenceNotice)}</p>` : "";
  const body = req.flow === "prepare" ? preBody(v.result as PreAppointmentResult, v.clinician) : postBody(v.result as PostAppointmentResult);
  const qr = v.clinician
    ? `<aside class="qr"><img src="data:image/svg+xml;base64,${Buffer.from(opts.qrSvg).toString("base64")}" alt=""><div><h2>${esc(c.qr.title)}</h2><p>${esc(c.qr.body)}</p><p class="link">${esc(opts.feedbackUrl)}</p><p class="small">${esc(c.qr.privacy)}</p></div></aside>`
    : "";

  return `<article class="version" lang="${esc(lang)}" dir="${dir}">
<header class="top"><div class="wordmark">CareNav <span>AI</span></div><div class="date">${esc(c.madeOn(formatDate(opts.now)))}</div></header>
${draft}${banner}
<h1>${esc(title)}</h1>
${v.clinician ? `<p class="lead">${esc(copy.clinicianLead)}</p>` : ""}${confidence}
<div class="body">${body}</div>
<section class="about"><h2>${esc(c.aboutThis)}</h2>${list(v.result.disclaimer)}</section>
${qr}
</article>`;
}

/** The full HTML document. English clinician page first (AC-10.1), then the user version when one exists. */
export function buildPdfHtml(req: PdfRequest, opts: TemplateOptions): string {
  const urgentLevel = req.english.meta.urgentAcknowledged ?? req.user?.meta.urgentAcknowledged ?? null;
  const versions: Version[] = [{ result: req.english, clinician: true }];
  if (req.user) versions.push({ result: req.user, clinician: false });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${esc(c.brand)}</title><style>${CSS}</style></head>
<body>${versions.map((v) => versionPage(req, v, opts, urgentLevel)).join("\n")}</body></html>`;
}

/** Playwright footer template (its own isolated document, so styles are inline). */
export function footerHtml(now: Date): string {
  return `<div style="width:100%;font-family:Inter,'DejaVu Sans',Arial,sans-serif;font-size:8px;color:#5B6670;padding:0 16mm;display:flex;justify-content:space-between">
<span>${esc(c.brand)} · ${esc(formatDate(now))}</span><span>${esc(c.pageOf)} <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

// Values mirror design/tokens.css (DESIGN_SYSTEM.md). Print sizes are in pt; the PDF has no
// user text-size setting. Latin fonts only for now; other scripts are T-34.
const CSS = `
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Inter, "Segoe UI", "DejaVu Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #0B1216; }
h1, h2, p, ul, ol, blockquote { margin: 0; }
.version + .version { break-before: page; }
.top { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8pt; border-bottom: 1px solid #E4DED3; margin-bottom: 12pt; }
.wordmark { font-weight: 800; font-size: 14pt; letter-spacing: -0.01em; }
.wordmark span { color: #F2654B; }
.date { font-size: 9pt; color: #5B6670; }
.draft { display: inline-block; border: 1.5px solid #E8543E; color: #0B1216; font-weight: 700; font-size: 9pt; letter-spacing: 0.04em; padding: 3pt 8pt; border-radius: 4pt; margin-bottom: 10pt; }
.urgent { display: flex; gap: 8pt; align-items: flex-start; background: #FBDED5; border-radius: 10pt; padding: 10pt 12pt; margin-bottom: 12pt; font-weight: 600; break-inside: avoid; }
.urgent .icon { flex: none; width: 16pt; height: 16pt; color: #E8543E; }
h1 { font-size: 20pt; line-height: 1.15; letter-spacing: -0.01em; font-weight: 700; margin-bottom: 4pt; }
.lead { color: #5B6670; font-size: 9.5pt; margin-bottom: 10pt; }
.notice { background: #FBEAC4; border-radius: 8pt; padding: 6pt 10pt; margin: 6pt 0 10pt; font-size: 9.5pt; }
section { padding: 7pt 0; border-top: 1px solid #E4DED3; break-inside: avoid; }
.body > section:first-child { border-top: 0; }
h2 { font-size: 9pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #1F6F6B; margin-bottom: 3pt; }
ul, ol { padding-inline-start: 14pt; }
li + li { margin-top: 3pt; }
ul.items { list-style: none; padding: 0; }
ul.items > li { padding: 5pt 0; }
ul.items > li + li { border-top: 1px dashed #E4DED3; }
mark { background: #F8E3AA; color: inherit; border-radius: 2pt; box-shadow: 0 0 0 1.5pt #F8E3AA; }
blockquote { margin-top: 3pt; padding: 3pt 8pt; border-inline-start: 3px solid #D6EDE6; background: #F3EFE8; border-radius: 0 4pt 4pt 0; font-size: 9.5pt; color: #0B1216; }
.q-label { font-weight: 600; color: #5B6670; font-size: 8.5pt; }
.kv { font-size: 9.5pt; margin-top: 2pt; }
.kv span { color: #5B6670; font-weight: 600; }
.check { font-weight: 600; font-size: 9.5pt; margin-bottom: 3pt; }
.who { color: #5B6670; font-size: 9pt; }
.who::before { content: "· "; }
.routes .route-name { display: block; }
.routes .contacts { color: #5B6670; font-size: 9pt; }
.ungrounded { background: #FBEAC4; border: 0; border-radius: 10pt; padding: 9pt 12pt; margin: 8pt 0; }
.ungrounded h2 { color: #0B1216; }
.ungrounded .lead { color: #0B1216; margin-bottom: 4pt; }
.about { font-size: 9pt; color: #5B6670; }
.about h2 { color: #5B6670; }
.qr { display: flex; gap: 12pt; align-items: center; margin-top: 12pt; padding: 10pt 12pt; border: 1px solid #E4DED3; border-radius: 10pt; background: #FDFAF5; break-inside: avoid; }
.qr img { width: 28mm; height: 28mm; flex: none; }
.qr h2 { color: #0B1216; text-transform: none; letter-spacing: 0; font-size: 11pt; }
.qr p { font-size: 9.5pt; }
.qr .link { font-weight: 600; color: #1F6F6B; word-break: break-all; margin-top: 2pt; }
.qr .small { font-size: 8.5pt; color: #5B6670; margin-top: 2pt; }
`;
