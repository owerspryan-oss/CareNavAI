import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { languageUpdateSchema, register, registerSchema } from "@/lib/auth/account";
import { createUser, deleteAccount, findUserById, setUserLanguage } from "@/lib/auth/users";
import { fetchSummary } from "@/lib/client/prepare";
import { fetchExplain } from "@/lib/client/understand";
import { migrate, openDb, type DB } from "@/lib/db";
import { needsLanguageChoice } from "@/lib/i18n/locale";
import { uiLanguageCookie } from "@/lib/i18n/messages";
import type { PrepareAnswers } from "@/lib/ai/schemas";
import summaryFixture from "../fixtures/marcia-summary.json";
import letterFixture from "../fixtures/gp-letter-explain.json";

// 2026-10-25 product-owner request: one language preference for the interface and the results, asked
// before a guest's first journey and on registration, stored on the account.

const NOW = Date.UTC(2026, 9, 25, 12);

describe("users.language (migration 002)", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("adds a nullable language column; existing accounts get null", () => {
    const dir = mkdtempSync(join(tmpdir(), "carenav-mig-"));
    try {
      copyFileSync(join(process.cwd(), "src/lib/db/migrations/001_init.sql"), join(dir, "001_init.sql"));
      // An older database (001 only), then the current migrations.
      db = new Database(":memory:");
      migrate(db, dir);
      db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'old@example.test', 0)").run();
      expect(migrate(db)).toEqual(["002_user_language.sql"]);
      const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string; notnull: number; dflt_value: unknown }[];
      expect(cols.find((c) => c.name === "language")).toMatchObject({ notnull: 0, dflt_value: null });
      expect(findUserById(db, "u1")?.language).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is written on create, changed, and removed with the account", () => {
    db = openDb(":memory:");
    const user = createUser(db, "ana@example.com", null, NOW, "so");
    expect(findUserById(db, user.id)?.language).toBe("so");
    setUserLanguage(db, user.id, "ur");
    expect(findUserById(db, user.id)?.language).toBe("ur");
    expect(createUser(db, "ben@example.com", null, NOW).language).toBeNull();
    deleteAccount(db, user.id);
    expect(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)).toBeUndefined();
  });

  it("registration stores the chosen language", async () => {
    db = openDb(":memory:");
    const user = await register({ email: "ana@example.com", password: "a long password", inviteCode: null, language: "fr" }, { db, now: NOW, invitesRequired: false });
    expect(findUserById(db, user.id)?.language).toBe("fr");
  });
});

describe("language validation", () => {
  it("accepts only codes in config/languages.json", () => {
    const base = { email: "ana@example.com", password: "a long password", inviteCode: null };
    expect(registerSchema.parse(base).language).toBeNull();
    expect(registerSchema.parse({ ...base, language: "so" }).language).toBe("so");
    expect(registerSchema.safeParse({ ...base, language: "xx" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, language: "<script>" }).success).toBe(false);
    expect(languageUpdateSchema.safeParse({ language: "zh-Hant" }).success).toBe(true);
    expect(languageUpdateSchema.safeParse({ language: null }).success).toBe(false);
  });
});

describe("the guest language chooser", () => {
  it("shows only while no language has been chosen (no usable cookie)", () => {
    expect(needsLanguageChoice(undefined)).toBe(true);
    expect(needsLanguageChoice("")).toBe(true);
    expect(needsLanguageChoice("not-a-language")).toBe(true);
    expect(needsLanguageChoice("so")).toBe(false);
    expect(needsLanguageChoice("en")).toBe(false);
  });

  it("the preference cookie lasts a year and is Secure away from localhost", () => {
    expect(uiLanguageCookie("ur")).toBe("carenav_lang=ur; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(uiLanguageCookie("zh-Hans", true)).toBe("carenav_lang=zh-Hans; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
});

describe("results follow the preference (outputLanguage)", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  afterEach(() => vi.unstubAllGlobals());

  it("Journey 1 sends it with the summary request", async () => {
    const f = vi.fn(async () => json(summaryFixture));
    vi.stubGlobal("fetch", f);
    const answers: PrepareAnswers = {
      forWhom: { relationship: "self", label: null, ageBand: null },
      mainConcern: "my knees hurt",
      timing: { started: null, pattern: null, note: null },
      changes: null,
      medicines: null,
      previousSupport: null,
      worries: null,
      followUps: [],
    };
    await fetchSummary(answers, false, "so");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).outputLanguage).toBe("so");
  });

  it("Journey 2 sends it with the explanation request", async () => {
    const f = vi.fn(async () => json(letterFixture.explainPcm));
    vi.stubGlobal("fetch", f);
    await fetchExplain({ confirmedText: letterFixture.letter, source: "typed", followUps: [], acknowledgedUrgent: false, outputLanguage: "so" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).outputLanguage).toBe("so");
  });
});

describe("routes: sign-in sets the language, the picker saves it, export includes it", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_PATH", ":memory:");
    vi.stubEnv("PILOT_INVITE_REQUIRED", "false");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const req = (url: string, body?: unknown, cookie?: string) =>
    new Request(`http://localhost:3000${url}`, {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const cookieFrom = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

  it("works end to end", async () => {
    const register = (await import("@/app/api/auth/register/route")).POST;
    const login = (await import("@/app/api/auth/login/route")).POST;
    const language = (await import("@/app/api/account/language/route")).POST;
    const exportData = (await import("@/app/api/account/export/route")).POST;

    // Registration with a language: the interface cookie comes back with the session.
    const reg = await register(req("/api/auth/register", { email: "ana@example.com", password: "a long password", inviteCode: null, language: "ur" }));
    expect(reg.status).toBe(200);
    expect(cookieFrom(reg, "carenav_lang")).toBe("carenav_lang=ur; Path=/; Max-Age=31536000; SameSite=Lax");
    expect((await reg.json()).user.language).toBe("ur");
    const session = cookieFrom(reg, "cn_session")!.split(";")[0];

    // An unknown code is refused; nothing changes.
    expect((await language(req("/api/account/language", { language: "xx" }, session))).status).toBe(400);

    // The picker while signed in updates the account; sign-in then brings it back.
    expect(await (await language(req("/api/account/language", { language: "fr" }, session))).json()).toEqual({ saved: true });
    const ok = await login(req("/api/auth/login", { email: "ana@example.com", password: "a long password" }));
    expect(cookieFrom(ok, "carenav_lang")).toBe("carenav_lang=fr; Path=/; Max-Age=31536000; SameSite=Lax");

    // A guest's change is not stored anywhere.
    expect(await (await language(req("/api/account/language", { language: "so" }))).json()).toEqual({ saved: false });

    // The export carries the account's language.
    const exported = await (await exportData(req("/api/account/export", {}, session))).json();
    expect(exported.account.language).toBe("fr");

    // An account without a language sets no interface cookie at sign-in.
    await register(req("/api/auth/register", { email: "ben@example.com", password: "a long password", inviteCode: null }));
    const ben = await login(req("/api/auth/login", { email: "ben@example.com", password: "a long password" }));
    expect(ben.status).toBe(200);
    expect(cookieFrom(ben, "carenav_lang")).toBeUndefined();
  });
});
