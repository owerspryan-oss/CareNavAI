import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "@/lib/db";
import { getUrgentMessage } from "@/lib/content";
import { createPdf, exportRow, languagePair, pdfRequestSchema, type PdfRequest } from "@/lib/pdf";
import { clinicianFeedbackSchema, COMMENT_MAX, MAX_FEEDBACK_PER_REF, refExists, saveClinicianFeedback } from "@/lib/pdf/feedback";
import { clinicianUrl, newRef, REF_PATTERN } from "@/lib/pdf/qr";
import { buildPdfHtml, esc, type TemplateOptions } from "@/lib/pdf/template";
import { pdfCopy } from "@/lib/pdf/copy";
import { isGrounded } from "@/lib/validate/grounding";

const fixture = (name: string) => JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const letter = fs.readFileSync(new URL("../../demo/letter/gp-letter.txt", import.meta.url), "utf8");

type Flow<F extends PdfRequest["flow"]> = Extract<PdfRequest, { flow: F }>;
const prepareReq = () => pdfRequestSchema.parse({ flow: "prepare", ...fixture("marcia-summary.json") }) as Flow<"prepare">;
const understandReq = () => pdfRequestSchema.parse({ flow: "understand", ...fixture("gp-letter-explain-pcm.json") }) as Flow<"understand">;

const opts = (o: Partial<TemplateOptions> = {}): TemplateOptions => ({
  feedbackUrl: "http://localhost:3000/c/AAAAAAAAAAAAAAAAAAAAAA",
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  now: new Date("2026-10-21T10:00:00Z"),
  showDraftLabel: true,
  ...o,
});

/** Text of each `<section ...>` in the HTML, with its class attribute. */
function sections(html: string) {
  return [...html.matchAll(/<section( class="([^"]*)")?>([\s\S]*?)<\/section>/g)].map((m) => ({ cls: m[2] ?? "", body: m[3] }));
}

describe("PDF request schema (FR-10)", () => {
  it("accepts both fixtures, as the client would spread a /api/summary or /api/explain response", () => {
    expect(prepareReq().flow).toBe("prepare");
    expect(understandReq().flow).toBe("understand");
  });

  it("rejects a result that does not match its flow", () => {
    const body = { flow: "understand", ...fixture("marcia-summary.json") };
    expect(pdfRequestSchema.safeParse(body).success).toBe(false);
  });

  it("the Journey 2 fixture is grounded in the demo letter, except the planted ungrounded item", () => {
    const r = understandReq();
    const quotes = [...r.english.whatYouWereTold, ...r.english.nextSteps, ...r.english.medicines].map((i) => i.sourceQuote);
    for (const q of quotes) expect(isGrounded(q, letter), q).toBe(true);
    expect(r.english.ungrounded.every((u) => !isGrounded(u.sourceQuote, letter))).toBe(true);
  });
});

describe("PDF template", () => {
  it("escapes all text, so model text can never become HTML", () => {
    const req = prepareReq();
    const evil = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
    req.english.mainConcern = evil;
    req.english.questionsToAsk = [evil];
    const html = buildPdfHtml(req, opts());
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(esc(evil));
    expect(esc(`a&b<'"`)).toBe("a&amp;b&lt;&#39;&quot;");
  });

  it("loads nothing from the network: no scripts, no stylesheets, only data: images", () => {
    const html = buildPdfHtml(understandReq(), opts());
    expect(html).not.toMatch(/<(script|link|iframe)/i);
    for (const m of html.matchAll(/\ssrc="([^"]*)"/g)) expect(m[1]).toMatch(/^data:/);
    expect(html).toContain("default-src 'none'");
  });

  it("has the English clinician page first and the user version second (AC-10.1)", () => {
    const html = buildPdfHtml(understandReq(), opts());
    const pages = [...html.matchAll(/<article class="version" lang="([^"]+)"/g)].map((m) => m[1]);
    expect(pages).toEqual(["en", "pcm"]);
    expect(html).toContain("Di doctor don start you on new medicine");
    expect(html).toContain(pdfCopy.confidenceNotice);
  });

  it("is English only when there is no user version", () => {
    const req = prepareReq();
    req.user = null;
    const html = buildPdfHtml(req, opts());
    expect(html.match(/<article class="version"/g)).toHaveLength(1);
  });

  it("puts the QR link, the date and the disclaimer on the clinician page (AC-10.2)", () => {
    const html = buildPdfHtml(prepareReq(), opts());
    const clinician = html.split('<article class="version"')[1];
    expect(clinician).toContain("http://localhost:3000/c/AAAAAAAAAAAAAAAAAAAAAA");
    expect(clinician).toContain("data:image/svg+xml;base64,");
    expect(clinician).toContain("21 October 2026");
    expect(clinician).toContain(esc(prepareReq().english.disclaimer[0]));
  });

  it("shows ungrounded items only in the labelled section, never as fact (rule 7)", () => {
    const html = buildPdfHtml(understandReq(), opts());
    const text = "Check your blood pressure at home every day.";
    const holding = sections(html).filter((s) => s.body.includes(text));
    expect(holding).toHaveLength(2); // one per page
    for (const s of holding) {
      expect(s.cls).toBe("ungrounded");
      expect(s.body).toContain(esc(pdfCopy.understand.ungroundedTitle));
    }
  });

  it("has no ungrounded section when everything is grounded", () => {
    const req = understandReq();
    req.english.ungrounded = [];
    req.user = null;
    expect(buildPdfHtml(req, opts())).not.toContain('class="ungrounded"');
  });

  it("carries the static urgent banner on every page when an urgent result was acknowledged (v0.3 A2)", () => {
    expect(buildPdfHtml(understandReq(), opts())).not.toContain('class="urgent"');
    const req = understandReq();
    req.english.meta.urgentAcknowledged = "urgent";
    const html = buildPdfHtml(req, opts());
    expect(html).toContain(esc(getUrgentMessage("urgent", "en").message.banner));
    expect(html).toContain(esc(getUrgentMessage("urgent", "pcm").message.banner));
    expect(html.match(/class="urgent"/g)).toHaveLength(2);
  });

  it("treats uncertain as urgent for the banner (fail closed)", () => {
    const req = prepareReq();
    req.english.meta.urgentAcknowledged = "uncertain";
    expect(buildPdfHtml(req, opts())).toContain(esc(getUrgentMessage("urgent", "en").message.banner));
  });

  it("shows the DRAFT label on every page unless switched off (FR-29)", () => {
    expect(buildPdfHtml(prepareReq(), opts()).match(/DRAFT, NOT CLINICALLY APPROVED/g)).toHaveLength(2);
    expect(buildPdfHtml(prepareReq(), opts({ showDraftLabel: false }))).not.toContain("DRAFT, NOT CLINICALLY APPROVED");
  });

  it("highlights medicine names and doses", () => {
    const html = buildPdfHtml(understandReq(), opts());
    expect(html).toContain("<mark>Amlodipine</mark>");
    expect(html).toContain(esc(pdfCopy.understand.checkMedicines));
  });
});

describe("pdf_exports row (FR-10, rule 9)", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("stores ref, ts, flow and language pair only, no content", async () => {
    db = openDb(":memory:");
    const req = understandReq();
    let rendered = "";
    const { ref, pdf } = await createPdf(req, {
      db,
      now: new Date("2026-10-21T10:00:00Z"),
      render: async (html) => {
        rendered = html;
        return Buffer.from("%PDF-stub");
      },
    });
    expect(pdf.toString()).toBe("%PDF-stub");
    expect(ref).toMatch(REF_PATTERN);
    expect(rendered).toContain(`/c/${ref}`);

    const rows = db.prepare("SELECT * FROM pdf_exports").all();
    expect(rows).toEqual([{ ref, ts: Date.parse("2026-10-21T10:00:00Z"), flow: "understand", language_pair: "en+pcm" }]);
    const stored = JSON.stringify(rows);
    for (const s of ["Amlodipine", "blood", "Okafor", "ankles"]) expect(stored).not.toContain(s);
  });

  it("language pair is en alone without a user version", () => {
    const req = prepareReq();
    expect(languagePair(req)).toBe("en+jam");
    req.user = null;
    expect(exportRow(req, "r", 1)).toEqual({ ref: "r", ts: 1, flow: "prepare", language_pair: "en" });
  });

  it("refs are random and unguessable, and the link holds nothing else (AC-10.3)", () => {
    const a = newRef();
    expect(a).toMatch(REF_PATTERN);
    expect(newRef()).not.toBe(a);
    expect(clinicianUrl("http://localhost:3000/", a)).toBe(`http://localhost:3000/c/${a}`);
  });
});

describe("clinician feedback (FR-16, AC-16.3)", () => {
  let db: DB;
  afterEach(() => db?.close());
  const ref = "BBBBBBBBBBBBBBBBBBBBBB";
  const ok = { ref, useful: "yes", missingOrMisleading: "none", comment: "" };

  it("saves only for a known ref, with no IP column", () => {
    db = openDb(":memory:");
    expect(saveClinicianFeedback(clinicianFeedbackSchema.parse(ok), db)).toBe("unknown_ref");
    db.prepare("INSERT INTO pdf_exports VALUES (?, 0, 'prepare', 'en')").run(ref);
    expect(refExists(ref, db)).toBe(true);
    expect(refExists("../../etc", db)).toBe(false);
    expect(saveClinicianFeedback(clinicianFeedbackSchema.parse({ ...ok, comment: "  Clear and short.  " }), db, 5)).toBe("saved");
    expect(db.prepare("SELECT ref, ts, useful, missing_or_misleading, comment FROM clinician_feedback").all()).toEqual([
      { ref, ts: 5, useful: "yes", missing_or_misleading: "none", comment: "Clear and short." },
    ]);
    const cols = (db.prepare("PRAGMA table_info(clinician_feedback)").all() as { name: string }[]).map((c) => c.name);
    expect(cols.some((c) => /ip|addr|agent/i.test(c))).toBe(false);
  });

  it("limits comments to 500 characters in the schema and in the database", () => {
    db = openDb(":memory:");
    expect(clinicianFeedbackSchema.safeParse({ ...ok, comment: "x".repeat(COMMENT_MAX) }).success).toBe(true);
    expect(clinicianFeedbackSchema.safeParse({ ...ok, comment: "x".repeat(COMMENT_MAX + 1) }).success).toBe(false);
    expect(clinicianFeedbackSchema.safeParse({ ...ok, useful: "maybe" }).success).toBe(false);
    db.prepare("INSERT INTO pdf_exports VALUES (?, 0, 'prepare', 'en')").run(ref);
    expect(() =>
      db.prepare("INSERT INTO clinician_feedback (ref, ts, comment) VALUES (?, 0, ?)").run(ref, "x".repeat(COMMENT_MAX + 1)),
    ).toThrow(/CHECK/);
  });

  it("caps entries per ref", () => {
    db = openDb(":memory:");
    db.prepare("INSERT INTO pdf_exports VALUES (?, 0, 'prepare', 'en')").run(ref);
    const f = clinicianFeedbackSchema.parse(ok);
    for (let i = 0; i < MAX_FEEDBACK_PER_REF; i++) expect(saveClinicianFeedback(f, db)).toBe("saved");
    expect(saveClinicianFeedback(f, db)).toBe("full");
  });
});
