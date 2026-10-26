import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth/sessions";
import { createUser } from "@/lib/auth/users";
import { parseEnv } from "@/lib/config/env";
import { open, seal } from "@/lib/crypto/aead";
import { openDb, type DB } from "@/lib/db";
import { deleteSummary, exportAccount, getSummary, KEY_VERSION, listSummaries, saveSummary, savedResultSchema, type SavedResult } from "@/lib/summaries/store";
import { buildUnderstandView, savedLetterSource } from "@/lib/understand/view";
import letter from "../fixtures/gp-letter-explain.json";
import marcia from "../fixtures/marcia-summary.json";

// T-24 / FR-14: encrypted saved summaries, list/open/delete, export, auto-save after generation.

const NOW = Date.UTC(2026, 9, 22, 12);
const KEY = randomBytes(32);
const PHRASE = "Zebra-violet knee wobble 7731";

function prepareResult(mainConcern = marcia.english.mainConcern): SavedResult {
  return savedResultSchema.parse({ flow: "prepare", english: { ...marcia.english, mainConcern }, user: marcia.user, userFallback: marcia.userFallback });
}
const explainResult = (): SavedResult => savedResultSchema.parse({ flow: "understand", ...letter.explainDefault });

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

describe("AES-256-GCM (AC-14.2)", () => {
  it("round-trips, uses a fresh IV each time, and refuses tampering, another row or the wrong key", () => {
    const a = seal(Buffer.from("hello"), KEY, "row-1");
    const b = seal(Buffer.from("hello"), KEY, "row-1");
    expect(a.iv).toHaveLength(12);
    expect(a.tag).toHaveLength(16);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(open(a, KEY, "row-1").toString()).toBe("hello");
    expect(() => open(a, KEY, "row-2")).toThrow();
    expect(() => open(a, randomBytes(32), "row-1")).toThrow();
    const flipped = Buffer.from(a.ciphertext);
    flipped[0] ^= 1;
    expect(() => open({ ...a, ciphertext: flipped }, KEY, "row-1")).toThrow();
  });

  it("DATA_KEY must be 32 bytes of base64 when set", () => {
    expect(parseEnv({ DATA_KEY: KEY.toString("base64") }).DATA_KEY).toBe(KEY.toString("base64"));
    expect(() => parseEnv({ DATA_KEY: randomBytes(16).toString("base64") })).toThrow();
    expect(() => parseEnv({ DATA_KEY: "not base64!" })).toThrow();
    expect(parseEnv({ DATA_KEY: "" }).DATA_KEY).toBeUndefined();
  });
});

describe("summary store (AC-14.1, AC-14.3)", () => {
  it("saves labels from fixed lists in the clear and everything else encrypted", () => {
    const user = createUser(db, "ana@example.com", null, NOW);
    const id = saveSummary(db, KEY, user.id, prepareResult(), { forWhom: "parent", ageBand: "1_to_4" }, NOW);
    const row = db.prepare("SELECT * FROM summaries").get() as Record<string, unknown>;
    expect(row).toMatchObject({ id, user_id: user.id, flow: "prepare", for_whom_label: "parent", is_child: 1, language_detected: "jam", key_version: KEY_VERSION, created_at: NOW });
    expect((row.iv as Buffer).length).toBe(12);
    expect(listSummaries(db, user.id)).toEqual([
      { id, flow: "prepare", forWhom: "parent", isChild: true, languageDetected: "jam", languageOutput: marcia.user.meta.outputLanguage, createdAt: NOW },
    ]);
    expect(getSummary(db, KEY, user.id, id)?.result).toEqual(prepareResult());
  });

  it("only the owner can open or delete a summary; the wrong key opens nothing", () => {
    const ana = createUser(db, "ana@example.com", null, NOW);
    const bo = createUser(db, "bo@example.com", null, NOW);
    const id = saveSummary(db, KEY, ana.id, explainResult(), { forWhom: "not_asked", ageBand: null }, NOW);
    expect(getSummary(db, KEY, bo.id, id)).toBeNull();
    expect(listSummaries(db, bo.id)).toEqual([]);
    expect(getSummary(db, randomBytes(32), ana.id, id)?.result).toBeNull();
    expect(deleteSummary(db, bo.id, id)).toBe(false);
    expect(deleteSummary(db, ana.id, id)).toBe(true);
    expect(listSummaries(db, ana.id)).toEqual([]);
  });

  it("export holds the account and every summary, decrypted and readable", () => {
    const user = createUser(db, "ana@example.com", null, NOW, "so");
    saveSummary(db, KEY, user.id, prepareResult(), { forWhom: "self", ageBand: null }, NOW);
    saveSummary(db, KEY, user.id, explainResult(), { forWhom: "not_asked", ageBand: null }, NOW + 1);
    const out = exportAccount(db, KEY, user, NOW + 2);
    expect(out.account).toEqual({ email: "ana@example.com", createdAt: new Date(NOW).toISOString(), language: "so" });
    expect(out.summaries.map((s) => [s.flow, s.result?.english.meta.detectedLanguage])).toEqual([
      ["prepare", "jam"],
      ["understand", letter.explainDefault.english.meta.detectedLanguage],
    ]);
  });

  it("the database file never holds the summary text (AC-14.2)", () => {
    const dir = mkdtempSync(join(tmpdir(), "carenav-summaries-"));
    const file = join(dir, "db.sqlite");
    try {
      const fileDb = openDb(file);
      const user = createUser(fileDb, "ana@example.com", null, NOW);
      const id = saveSummary(fileDb, KEY, user.id, prepareResult(`My ${PHRASE} is worse at night.`), { forWhom: "self", ageBand: null }, NOW);
      expect(JSON.stringify(getSummary(fileDb, KEY, user.id, id)?.result)).toContain(PHRASE);
      const blobs = fileDb.prepare("SELECT payload_enc FROM summaries").all() as { payload_enc: Buffer }[];
      expect(blobs.map((b) => b.payload_enc.toString("latin1")).join()).not.toContain(PHRASE);
      // Before and after a checkpoint, in the main file and the write-ahead log.
      const raw = () => [file, `${file}-wal`].filter(existsSync).map((f) => readFileSync(f));
      for (const buf of raw()) {
        expect(buf.includes(Buffer.from(PHRASE, "utf8"))).toBe(false);
        expect(buf.includes(Buffer.from("Zebra-violet", "utf16le"))).toBe(false);
      }
      fileDb.close();
      for (const buf of raw()) expect(buf.includes(Buffer.from(PHRASE, "utf8"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("reopened explanation (AC-14.3, CLAUDE.md rule 7)", () => {
  it("keeps every item the server grounded, and ungrounded items stay apart", () => {
    const { english } = letter.explainDefault;
    const fromLetter = buildUnderstandView(english as never, english as never, letter.letter);
    const reopened = buildUnderstandView(english as never, english as never, savedLetterSource(english as never));
    expect(reopened).toEqual(fromLetter);
    expect(reopened.notFound.map((n) => n.text)).toEqual(english.ungrounded.map((u) => u.text));
  });
});

// ---- Routes -----------------------------------------------------------------

describe("auto-save and /api/summaries, /api/account (FR-14)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_PATH", ":memory:");
    vi.stubEnv("DATA_KEY", KEY.toString("base64"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/ai/pipeline/journeys");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const urgent = { kind: "urgent", gate: { level: "emergency", messageKey: "emergency", categories: [], language: "en", register: "standard", failedLayers: [] } };

  /** The generate routes with the AI pipeline faked: the fixture result, or an urgent outcome. */
  async function setup(outcome: "result" | "urgent" = "result") {
    vi.doMock("@/lib/ai/pipeline/journeys", () => ({
      runSummary: async () => (outcome === "urgent" ? urgent : structuredClone({ kind: marcia.kind, english: marcia.english, user: marcia.user, userFallback: marcia.userFallback })),
      runExplain: async () => (outcome === "urgent" ? urgent : structuredClone(letter.explainDefault)),
    }));
    const { db: getDb } = await import("@/lib/db");
    const database = getDb();
    const user = createUser(database, "ana@example.com", null, NOW);
    const cookie = `cn_session=${createSession(database, user.id, Date.now())}`;
    return {
      database,
      cookie,
      summary: (await import("@/app/api/summary/route")).POST,
      explain: (await import("@/app/api/explain/route")).POST,
      list: (await import("@/app/api/summaries/route")).GET,
      one: await import("@/app/api/summaries/[id]/route"),
      exportData: (await import("@/app/api/account/export/route")).POST,
      deleteAccount: (await import("@/app/api/account/delete/route")).POST,
      log: (await import("@/lib/log/logger")).log,
    };
  }
  const req = (path: string, opts: { body?: unknown; cookie?: string; method?: string } = {}) =>
    new Request(`http://localhost:3000${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: { host: "localhost:3000", "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  const summaryBody = { answers: { forWhom: { relationship: "parent", label: null, ageBand: "5_to_11" }, mainConcern: "knees", timing: { started: null, pattern: null, note: null }, changes: null, medicines: null, worries: null, followUps: [] } };
  const explainBody = { confirmedText: letter.letter, source: "typed", followUps: [] };
  const count = (database: DB) => (database.prepare("SELECT count(*) AS n FROM summaries").get() as { n: number }).n;

  it("guests: the result is unchanged and nothing is written", async () => {
    const s = await setup();
    const res = await (await s.summary(req("/api/summary", { body: summaryBody }))).json();
    expect(res.kind).toBe("result");
    expect(res).not.toHaveProperty("saved");
    expect(count(s.database)).toBe(0);
  });

  it("signed in: both journeys save after generation, and the list, open, delete work", async () => {
    const s = await setup();
    const a = await (await s.summary(req("/api/summary", { body: summaryBody, cookie: s.cookie }))).json();
    const b = await (await s.explain(req("/api/explain", { body: explainBody, cookie: s.cookie }))).json();
    expect([a.saved, b.saved]).toEqual(["saved", "saved"]);
    expect(a.english).toEqual(marcia.english);

    const list = await (await s.list(req("/api/summaries", { cookie: s.cookie }))).json();
    expect(list.saving).toBe(true);
    expect(list.summaries.map((x: { flow: string; forWhom: string; isChild: boolean }) => [x.flow, x.forWhom, x.isChild]).sort()).toEqual([
      ["prepare", "parent", true],
      ["understand", "not_asked", false],
    ]);
    expect(JSON.stringify(list)).not.toContain("knee"); // metadata only

    const prep = list.summaries.find((x: { flow: string }) => x.flow === "prepare");
    const opened = await (await s.one.GET(req(`/api/summaries/${prep.id}`, { cookie: s.cookie }))).json();
    expect(opened.summary.result).toEqual({ flow: "prepare", english: marcia.english, user: marcia.user, userFallback: marcia.userFallback });

    expect((await s.one.GET(req(`/api/summaries/${prep.id}`))).status).toBe(401);
    expect((await s.one.DELETE(req(`/api/summaries/${prep.id}`, { cookie: s.cookie, method: "DELETE" }))).status).toBe(200);
    expect((await s.one.GET(req(`/api/summaries/${prep.id}`, { cookie: s.cookie }))).status).toBe(404);
    expect(count(s.database)).toBe(1);
  });

  it("never saves an urgent outcome", async () => {
    const s = await setup("urgent");
    const res = await (await s.summary(req("/api/summary", { body: summaryBody, cookie: s.cookie }))).json();
    expect(res).toEqual(urgent);
    expect(count(s.database)).toBe(0);
  });

  it("without DATA_KEY, saving is off and nothing is stored", async () => {
    vi.stubEnv("DATA_KEY", "");
    const s = await setup();
    const res = await (await s.summary(req("/api/summary", { body: summaryBody, cookie: s.cookie }))).json();
    expect(res.saved).toBe("off");
    expect(res.kind).toBe("result");
    expect(count(s.database)).toBe(0);
    expect((await (await s.list(req("/api/summaries", { cookie: s.cookie }))).json()).saving).toBe(false);
  });

  it("a failed save still returns the result, marked quietly, and logs no content", async () => {
    const s = await setup();
    const errors: unknown[] = [];
    vi.spyOn(s.log, "error").mockImplementation((e) => void errors.push(e));
    s.database.exec("DROP TABLE summaries");
    const res = await s.summary(req("/api/summary", { body: summaryBody, cookie: s.cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe("failed");
    expect(body.english).toEqual(marcia.english);
    expect(errors).toEqual([expect.objectContaining({ errorType: "save_failed" })]);
  });

  it("export downloads everything; delete removes the account in one action and clears the cookie", async () => {
    const s = await setup();
    await s.summary(req("/api/summary", { body: summaryBody, cookie: s.cookie }));
    const exp = await s.exportData(req("/api/account/export", { body: {}, cookie: s.cookie }));
    expect(exp.headers.get("content-disposition")).toContain("attachment");
    const file = JSON.parse(await exp.text());
    expect(file.account.email).toBe("ana@example.com");
    expect(file.summaries[0].result.english.mainConcern).toBe(marcia.english.mainConcern);

    expect((await s.deleteAccount(req("/api/account/delete", { body: {}, cookie: s.cookie }))).status).toBe(400);
    const del = await s.deleteAccount(req("/api/account/delete", { body: { confirm: true }, cookie: s.cookie }));
    expect(del.status).toBe(200);
    expect(del.headers.getSetCookie().join()).toContain("cn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    for (const t of ["users", "sessions", "summaries"]) expect((s.database.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n).toBe(0);
    expect((await s.list(req("/api/summaries", { cookie: s.cookie }))).status).toBe(401);
  });
});
