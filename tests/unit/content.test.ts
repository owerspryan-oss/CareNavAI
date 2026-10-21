import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAFETY_LEVELS, urgentMessageKeySchema } from "@/lib/ai/schemas";
import { languagesConfig } from "@/lib/config";
import {
  contentLanguage,
  contentLanguages,
  disclaimersFileSchema,
  draftLabelEnabled,
  getDisclaimers,
  getServiceRoutes,
  getUrgentMessage,
  serviceRoutesFileSchema,
  urgentMessageKeyFor,
  urgentMessagesFileSchema,
  type UrgentMessagesFile,
} from "@/lib/content";

const CONTENT_DIR = join(process.cwd(), "content");
const readJson = (dir: string, file: string) => JSON.parse(readFileSync(join(CONTENT_DIR, dir, file), "utf8"));
const jsonFiles = (dir: string) => readdirSync(join(CONTENT_DIR, dir)).filter((f) => f.endsWith(".json"));

const urgentFiles: [string, UrgentMessagesFile][] = jsonFiles("urgent-messages").map((f) => [
  f.replace(/\.json$/, ""),
  urgentMessagesFileSchema.parse(readJson("urgent-messages", f)),
]);
const en = urgentFiles.find(([lang]) => lang === "en")![1];

/** Every digit run (allowing single spaces inside, e.g. "116 123") in all user-visible text of a message. */
function phoneNumbersIn(file: UrgentMessagesFile, key: (typeof urgentMessageKeySchema.options)[number]) {
  const m = file.messages[key];
  const check = m.continueCheck ? [m.continueCheck.link, m.continueCheck.title, ...m.continueCheck.body, m.continueCheck.confirm, m.continueCheck.button] : [];
  const text = [m.title, ...m.body, m.banner, ...m.actions.map((a) => a.label), ...check].join("\n");
  return (text.match(/\d+(?: \d+)*/g) ?? []).sort();
}

describe("static content files (T-05)", () => {
  it("ships the English master plus an urgent-message file for every Tier A target (v0.3 A4)", () => {
    expect(urgentFiles.map(([l]) => l).sort()).toEqual(["en", "gyn", "hi", "ht", "jam", "kri", "pcm", "trf", "tw"]);
    const tierATargets = languagesConfig.languages.filter((l) => l.tierATarget).map((l) => l.code);
    for (const code of tierATargets) expect(urgentFiles.map(([l]) => l), code).toContain(code);
  });

  it("discovers every urgent-message file on disk without a code change (AC-28.4)", () => {
    expect(contentLanguages("urgentMessages")).toEqual(urgentFiles.map(([l]) => l).sort());
    for (const [lang] of urgentFiles) {
      expect(getUrgentMessage("emergency", lang)).toMatchObject({ servedLanguage: lang, fellBack: false });
    }
  });

  it.each(urgentFiles)("%s: parses, names its own language, and has all three messages", (lang, file) => {
    expect(file.language).toBe(lang);
    for (const key of urgentMessageKeySchema.options) expect(file.messages[key].body.length).toBeGreaterThan(0);
  });

  it.each(urgentFiles)("%s: is marked DRAFT, unreviewed, and derived from English", (lang, file) => {
    expect(file.status).toBe("DRAFT_NOT_CLINICALLY_APPROVED");
    expect(file.reviewed).toBe(false);
    expect(file.derivedFrom).toBe(lang === "en" ? null : "en");
  });

  it.each(urgentFiles.filter(([l]) => l !== "en"))("%s: phone numbers and links are byte-identical to English", (_lang, file) => {
    for (const key of urgentMessageKeySchema.options) {
      expect(phoneNumbersIn(file, key), key).toEqual(phoneNumbersIn(en, key));
      const actions = (f: UrgentMessagesFile) => f.messages[key].actions.map((a) => [a.id, a.href]);
      expect(actions(file), key).toEqual(actions(en));
    }
  });

  it.each(urgentFiles)("%s: crisis carries the 'continue' check with Samaritans; other levels don't", (_lang, file) => {
    expect(file.messages.crisis.continueCheck?.body.join(" ")).toContain("116 123");
    expect(file.messages.emergency.continueCheck).toBeUndefined();
    expect(file.messages.urgent.continueCheck).toBeUndefined();
  });

  it("rejects a file whose crisis message has no 'continue' check", () => {
    const raw = readJson("urgent-messages", "en.json") as { messages: { crisis: Record<string, unknown> } };
    const crisis = { ...raw.messages.crisis };
    delete crisis.continueCheck;
    expect(urgentMessagesFileSchema.safeParse({ ...raw, messages: { ...raw.messages, crisis } }).success).toBe(false);
  });

  it("English messages carry the PRD 9.2 numbers", () => {
    expect(phoneNumbersIn(en, "emergency")).toContain("999");
    expect(phoneNumbersIn(en, "urgent")).toEqual(expect.arrayContaining(["111", "999"]));
    expect(phoneNumbersIn(en, "crisis")).toEqual(expect.arrayContaining(["116 123", "999"]));
    expect(en.labels).toEqual({ acknowledge: "I understand, continue", startAgain: "Start again" });
  });

  it("service routes and disclaimers parse and are marked DRAFT", () => {
    for (const f of jsonFiles("service-routes")) {
      const parsed = serviceRoutesFileSchema.parse(readJson("service-routes", f));
      expect(parsed.status).toBe("DRAFT_NOT_CLINICALLY_APPROVED");
    }
    for (const f of jsonFiles("disclaimers")) {
      const parsed = disclaimersFileSchema.parse(readJson("disclaimers", f));
      expect(parsed.status).toBe("DRAFT_NOT_CLINICALLY_APPROVED");
      expect(parsed.draftLabel).toBe("DRAFT, NOT CLINICALLY APPROVED");
    }
  });
});

describe("content loader", () => {
  it("maps uncertain to the urgent message and clear to none", () => {
    expect(urgentMessageKeyFor("uncertain")).toBe("urgent");
    expect(urgentMessageKeyFor("clear")).toBeNull();
    expect(getUrgentMessage("uncertain", "en").key).toBe("urgent");
    expect(getUrgentMessage("uncertain", "en").message).toEqual(getUrgentMessage("urgent", "en").message);
  });

  it("every non-clear level has a message", () => {
    for (const level of SAFETY_LEVELS.filter((l) => l !== "clear")) {
      expect(getUrgentMessage(level, "pcm").message.title.length).toBeGreaterThan(0);
    }
  });

  it("serves the requested language when a file exists", () => {
    const served = getUrgentMessage("crisis", "jam");
    expect(served).toMatchObject({ key: "crisis", servedLanguage: "jam", fellBack: false, reviewed: false });
  });

  it("falls back to English for a language without a file, and says so", () => {
    for (const lang of ["so", "pl", "xx", "", null, undefined]) {
      const served = getUrgentMessage("emergency", lang);
      expect(served.servedLanguage).toBe("en");
      expect(served.message).toEqual(en.messages.emergency);
    }
    expect(getUrgentMessage("emergency", "so").fellBack).toBe(true);
    expect(getServiceRoutes("pcm")).toMatchObject({ servedLanguage: "en", fellBack: true });
    expect(getDisclaimers("hi")).toMatchObject({ servedLanguage: "en", fellBack: true });
  });

  it("normalises BCP-47 tags to the primary subtag", () => {
    expect(contentLanguage("en-GB")).toBe("en");
    expect(contentLanguage("PCM_NG")).toBe("pcm");
    expect(getUrgentMessage("urgent", "hi-IN").servedLanguage).toBe("hi");
  });
});

describe("draftLabelEnabled (FR-29)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is on by default", () => {
    expect(draftLabelEnabled()).toBe(true);
  });

  it("can be switched off by config only", async () => {
    vi.stubEnv("SHOW_DRAFT_LABEL", "false");
    vi.resetModules();
    const fresh = await import("@/lib/content");
    expect(fresh.draftLabelEnabled()).toBe(false);
  });
});
