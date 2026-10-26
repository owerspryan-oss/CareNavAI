import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostAppointmentResult, PreAppointmentResult } from "@/lib/ai/schemas";
import { restyleRequestSchema } from "@/lib/ai/schemas";
import { isPlayfulLanguage, languageNames, languagesConfig } from "@/lib/config";
import { pdfRequestSchema } from "@/lib/pdf";
import {
  applyPostPlayful,
  applyPrePlayful,
  playfulLanguage,
  postPlayfulFields,
  prePlayfulFields,
  type PreStyleFields,
} from "@/lib/restyle/fields";
import { savedResultSchema } from "@/lib/summaries/store";

// T-27 / FR-23 playful dialect mode: config, field selection, the /api/restyle route with the AI faked,
// and proof that playful text can't reach the PDF or a saved record (AC-23.4, AC-10.4).

const fixture = (name: string) => JSON.parse(fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const marcia = () => fixture("marcia-summary.json") as { english: PreAppointmentResult; user: PreAppointmentResult; userFallback: null };
const letterPcm = () => fixture("gp-letter-explain-pcm.json") as { english: PostAppointmentResult; user: PostAppointmentResult; userFallback: null };
const languages = languageNames();

/** A well-behaved fake restyle: same shape, every protected span kept, empty stays empty. */
const patois = <T,>(fields: T): T => JSON.parse(JSON.stringify(fields), (_k, v) => (typeof v === "string" && v ? `Mi tell yuh: ${v}` : v));

describe("language registry: playful flag (FR-23, AC-28.4)", () => {
  it("offers playful mode for Jamaican Patois and Nigerian Pidgin only", () => {
    expect(languagesConfig.languages.filter((l) => l.playful).map((l) => l.code).sort()).toEqual(["jam", "pcm"]);
    expect(isPlayfulLanguage("jam")).toBe(true);
    expect(isPlayfulLanguage("pcm")).toBe(true);
    expect(isPlayfulLanguage("en")).toBe(false);
    expect(isPlayfulLanguage("kri")).toBe(false);
    expect(isPlayfulLanguage("xx")).toBe(false);
    expect(languages.jam.playful).toBe(true);
    expect(languages.hi.playful).toBe(false);
  });
});

describe("playfulLanguage: when the toggle is offered (AC-23.1, AC-23.3)", () => {
  it("offers the detected dialect on a patois result", () => {
    expect(playfulLanguage(marcia(), languages)).toBe("jam");
  });
  it("offers the chosen output dialect on an English letter explained in Pidgin", () => {
    expect(playfulLanguage(letterPcm(), languages)).toBe("pcm");
  });
  it("is not offered for English, without a user version, or with an urgent notice", () => {
    expect(playfulLanguage(fixture("gp-letter-explain.json").explainDefault, languages)).toBeNull();
    expect(playfulLanguage({ ...marcia(), user: null }, languages)).toBeNull();
    const m = marcia();
    const urgent = { english: { ...m.english, meta: { ...m.english.meta, urgentAcknowledged: "urgent" as const } }, user: m.user };
    expect(playfulLanguage(urgent, languages)).toBeNull();
  });
});

describe("playful fields (PRD 2.1 guardrail 1)", () => {
  it("never includes medicines, quotes, clinician words, byWhen, routes, disclaimer or ungrounded items", () => {
    const pre = JSON.stringify(prePlayfulFields(marcia().english));
    expect(pre).not.toContain("two tablets, sometimes"); // a dose
    expect(pre).not.toContain("Call NHS 111"); // a service route
    expect(pre).not.toContain("not medical advice");
    const l = letterPcm().english;
    const post = JSON.stringify(postPlayfulFields(l));
    for (const q of [...l.whatYouWereTold, ...l.nextSteps, ...l.medicines].map((i) => i.sourceQuote)) expect(post).not.toContain(JSON.stringify(q));
    for (const w of l.whatItMeans) expect(post).not.toContain(JSON.stringify(w.clinicianWords));
    for (const u of l.ungrounded) expect(post).not.toContain(u.text);
  });

  it("lays the playful text over the user version only, tagged restyled, and refuses a mismatched shape", () => {
    const m = marcia();
    const f = patois(prePlayfulFields(m.english));
    const shown = applyPrePlayful(m.user, f)!;
    expect(shown.meta.restyled).toBe(true);
    expect(shown.mainConcern).toBe(f.mainConcern);
    expect(shown.medicationAndSupport.medicines).toEqual(m.user.medicationAndSupport.medicines);
    expect(shown.serviceRoutes).toEqual(m.user.serviceRoutes);
    expect(shown.disclaimer).toEqual(m.user.disclaimer);
    expect(applyPrePlayful(m.user, { ...f, questionsToAsk: f.questionsToAsk.slice(1) })).toBeNull();

    const l = letterPcm();
    const lf = patois(postPlayfulFields(l.english));
    const ls = applyPostPlayful(l.user, lf)!;
    expect(ls.whatYouWereTold.map((x) => x.sourceQuote)).toEqual(l.user.whatYouWereTold.map((x) => x.sourceQuote));
    expect(ls.medicines).toEqual(l.user.medicines);
    expect(ls.nextSteps.map((x) => x.byWhen)).toEqual(l.user.nextSteps.map((x) => x.byWhen));
  });
});

describe("playful text never reaches the PDF or a saved record (AC-23.4, AC-10.4)", () => {
  it("the PDF schema rejects a body carrying a restyled version", () => {
    const m = marcia();
    const shown = applyPrePlayful(m.user, patois(prePlayfulFields(m.english)))!;
    expect(pdfRequestSchema.safeParse({ flow: "prepare", english: m.english, user: m.user }).success).toBe(true);
    expect(pdfRequestSchema.safeParse({ flow: "prepare", english: m.english, user: shown }).success).toBe(false);
    expect(pdfRequestSchema.safeParse({ flow: "prepare", english: { ...m.english, meta: { ...m.english.meta, restyled: true } }, user: null }).success).toBe(false);
    const l = letterPcm();
    const ls = applyPostPlayful(l.user, patois(postPlayfulFields(l.english)))!;
    expect(pdfRequestSchema.safeParse({ flow: "understand", english: l.english, user: ls }).success).toBe(false);
  });

  it("the saved-record schema rejects it too", () => {
    const m = marcia();
    const shown = applyPrePlayful(m.user, patois(prePlayfulFields(m.english)))!;
    expect(savedResultSchema.safeParse({ flow: "prepare", ...m }).success).toBe(true);
    expect(savedResultSchema.safeParse({ flow: "prepare", ...m, user: shown }).success).toBe(false);
  });

  it("the restyle route and pipeline never save or render a PDF", () => {
    for (const f of ["src/app/api/restyle/route.ts", "src/lib/ai/pipeline/restyle.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/autoSave|saveSummary|@\/lib\/summaries|@\/lib\/pdf|createPdf/);
    }
  });

  it("the restyle request itself can't take a restyled version as its source", () => {
    const m = marcia();
    expect(restyleRequestSchema.safeParse({ flow: "prepare", language: "jam", english: m.english }).success).toBe(true);
    const tagged = { ...m.english, meta: { ...m.english.meta, restyled: true } };
    expect(restyleRequestSchema.safeParse({ flow: "prepare", language: "jam", english: tagged }).success).toBe(false);
  });
});

describe("POST /api/restyle (AI faked)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/limits/rate");
    vi.doUnmock("@/lib/ai/client");
    vi.doUnmock("@/lib/safety/gate");
  });

  async function route(opts: { level?: string; styled?: (fields: unknown) => unknown } = {}) {
    vi.doMock("@/lib/limits/rate", () => ({ checkRate: () => ({ ok: true, setCookie: null }) }));
    const gateActual = await vi.importActual<typeof import("@/lib/safety/gate")>("@/lib/safety/gate");
    const screen = vi.fn(async (text: string) => {
      void text;
      return { level: opts.level ?? "clear", messageKey: null, categories: [], language: "en", register: "standard", failedLayers: [], redactedText: "" };
    });
    vi.doMock("@/lib/safety/gate", () => ({ ...gateActual, screen }));
    const actual = await vi.importActual<typeof import("@/lib/ai/client")>("@/lib/ai/client");
    const callStructured = vi.fn(async (call: { role: string; input: string; instructions: string }) => {
      const fields = JSON.parse(call.input.split("<english_fields>\n")[1].split("\n</english_fields>")[0]);
      const out = (opts.styled ?? patois)(fields);
      if (out instanceof Error) throw out;
      return out;
    });
    vi.doMock("@/lib/ai/client", () => ({ ...actual, callStructured }));
    const { POST } = await import("@/app/api/restyle/route");
    const send = async (body: unknown) => {
      const res = await POST(new Request("http://localhost/api/restyle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
      return { status: res.status, body: await res.json() };
    };
    return { send, screen, callStructured };
  }

  const prepareBody = (english = marcia().english, language = "jam") => ({ flow: "prepare", language, english });

  it("restyles a clear result: screened first, STYLE role, tagged restyled, protected spans intact", async () => {
    const { send, screen, callStructured } = await route();
    const { status, body } = await send(prepareBody());
    expect(status).toBe(200);
    expect(body).toMatchObject({ kind: "restyled", restyled: true, flow: "prepare", language: "jam", promptVersion: "style@v1" });
    expect((body.fields as PreStyleFields).questionsToAsk[1]).toContain("paracetamol");
    expect(screen).toHaveBeenCalledTimes(1);
    expect(screen.mock.calls[0][0]).toContain(marcia().english.mainConcern);
    expect(screen.mock.invocationCallOrder[0]).toBeLessThan(callStructured.mock.invocationCallOrder[0]);
    const call = callStructured.mock.calls[0][0];
    expect(call.role).toBe("STYLE");
    // Static rules first, user data last and delimited (CONTEXT.md §6).
    expect(call.instructions).toMatch(/never mocking/i);
    expect(call.input.trim().endsWith("</english_fields>")).toBe(true);
    expect(call.input).not.toContain("tel:111");
  });

  it("restyles a Journey 2 explanation into Pidgin", async () => {
    const { send } = await route();
    const { body } = await send({ flow: "understand", language: "pcm", english: letterPcm().english });
    expect(body).toMatchObject({ kind: "restyled", flow: "understand" });
  });

  it("refuses when the gate is not clear, without calling STYLE (CLAUDE.md rule 1)", async () => {
    for (const level of ["uncertain", "urgent", "emergency", "crisis"]) {
      vi.resetModules();
      const { send, callStructured } = await route({ level });
      expect((await send(prepareBody())).body).toEqual({ kind: "unavailable", reason: "gate" });
      expect(callStructured).not.toHaveBeenCalled();
    }
  });

  it("refuses a result that carries an urgent notice, before screening or calling STYLE (AC-23.3)", async () => {
    const { send, screen, callStructured } = await route();
    const m = marcia().english;
    const { body } = await send(prepareBody({ ...m, meta: { ...m.meta, urgentAcknowledged: "urgent" } }));
    expect(body).toEqual({ kind: "unavailable", reason: "urgent_result" });
    expect(screen).not.toHaveBeenCalled();
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("refuses a language without the playful flag", async () => {
    const { send, callStructured } = await route();
    expect((await send(prepareBody(undefined, "en"))).body).toEqual({ kind: "unavailable", reason: "not_offered" });
    expect((await send(prepareBody(undefined, "hi"))).body).toEqual({ kind: "unavailable", reason: "not_offered" });
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("rejects a version that changes a medicine name, a number or a dose's spelling (AC-23.2)", async () => {
    const cases: ((f: PreStyleFields) => PreStyleFields)[] = [
      (f) => ({ ...f, questionsToAsk: f.questionsToAsk.map((q) => q.replace("paracetamol", "Paracetamol")) }),
      (f) => ({ ...f, mainConcern: f.mainConcern.replace("two months", "2 months") }),
    ];
    for (const change of cases) {
      vi.resetModules();
      const { send } = await route({ styled: (f) => change(patois(f as PreStyleFields)) });
      expect((await send(prepareBody())).body).toEqual({ kind: "unavailable", reason: "protected_spans" });
    }
    vi.resetModules();
    const m = marcia().english;
    const withDose = { ...m, whatToBring: ["Your 500mg tablets.", ...m.whatToBring.slice(1)] };
    const { send } = await route({ styled: (f) => {
      const p = patois(f as PreStyleFields);
      return { ...p, whatToBring: ["Yuh 500 mg tablet dem.", ...p.whatToBring.slice(1)] };
    } });
    expect((await send(prepareBody(withDose))).body).toEqual({ kind: "unavailable", reason: "protected_spans" });
  });

  it("rejects a version whose shape doesn't match the English (schema parity)", async () => {
    const { send } = await route({ styled: (f) => ({ ...patois(f as PreStyleFields), changesAndTriggers: [] }) });
    expect((await send(prepareBody())).body).toEqual({ kind: "unavailable", reason: "parity" });
  });

  it("rejects new content written into an empty field", async () => {
    const m = marcia().english;
    const { send } = await route({ styled: (f) => ({ ...patois(f as PreStyleFields), frequencyAndPattern: "It come an go." }) });
    expect((await send(prepareBody({ ...m, frequencyAndPattern: "" }))).body).toEqual({ kind: "unavailable", reason: "parity" });
  });

  it("rejects a version with forbidden content", async () => {
    const { send } = await route({ styled: (f) => ({ ...patois(f as PreStyleFields), mainConcern: "This means you have arthritis." }) });
    expect((await send(prepareBody())).body).toEqual({ kind: "unavailable", reason: "forbidden" });
  });

  it("says it couldn't be made when the STYLE call fails", async () => {
    const { send } = await route({ styled: () => new Error("down") });
    expect((await send(prepareBody())).body).toEqual({ kind: "unavailable", reason: "call_failed" });
  });

  it("rejects malformed bodies and over-long text before screening", async () => {
    const { send, screen } = await route();
    expect((await send({ flow: "prepare", language: "jam" })).status).toBe(400);
    expect((await send({ flow: "understand", language: "jam", english: marcia().english })).status).toBe(400);
    const m = marcia().english;
    expect((await send(prepareBody({ ...m, notMentioned: ["x".repeat(7000)] }))).status).toBe(413);
    expect(screen).not.toHaveBeenCalled();
  });
});

describe("requestRestyle (client)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("returns the fields of a well-formed restyled response, and null for anything else", async () => {
    const { requestRestyle } = await import("@/lib/client/restyle");
    const m = marcia();
    const fields = patois(prePlayfulFields(m.english));
    const req = { flow: "prepare" as const, language: "jam", english: m.english };
    stub(200, { kind: "restyled", restyled: true, flow: "prepare", language: "jam", promptVersion: "style@v1", fields });
    expect(await requestRestyle(req)).toEqual(fields);
    stub(200, { kind: "unavailable", reason: "gate" });
    expect(await requestRestyle(req)).toBeNull();
    stub(200, { kind: "restyled", restyled: true, flow: "understand", fields: postPlayfulFields(letterPcm().english) });
    expect(await requestRestyle(req)).toBeNull();
    stub(502, { error: "generation_failed" });
    expect(await requestRestyle(req)).toBeNull();
  });
});
