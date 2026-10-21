import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { languagesConfig } from "@/lib/config";
import { mergeOverMaster, type UiDir, type UiLocale, type UiMessages } from "./messages";

// Server-only: interface locale files in content/ui/<code>.json (FR-27, D13). Translated once by
// scripts/translate-ui.mjs and stored, never translated at run time. Adding a language needs only a
// file (AC-28.4). English is the master and the fallback for every missing string (AC-27.2).

export const UI_COOKIE = "carenav_lang";
const DIR = path.join(process.cwd(), "content", "ui");

type LocaleFile = {
  language: string;
  derivedFrom: string | null;
  reviewed: boolean;
  /** Per string: a hash of the English it was translated from (scripts/translate-ui.mjs). */
  sourceHashes?: Record<string, string>;
  messages: unknown;
};

/** Must match sourceHash() in scripts/lib/ui-locales.mjs. */
export const sourceHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 10);

/**
 * Drop every translated string whose English has changed since it was translated (or that has no
 * recorded source), so it shows in English until it is translated and reviewed again.
 */
function withoutStale(master: unknown, translated: unknown, hashes: Record<string, string>, prefix = ""): unknown {
  if (typeof master === "string") return typeof translated === "string" && hashes[prefix] === sourceHash(master) ? translated : undefined;
  if (!translated || typeof translated !== "object") return undefined;
  const m = master as Record<string, unknown>;
  const t = translated as Record<string, unknown>;
  const out: Record<string, unknown> | unknown[] = Array.isArray(m) ? [] : {};
  for (const k of Object.keys(m)) (out as Record<string, unknown>)[k] = withoutStale(m[k], t[k], hashes, prefix ? `${prefix}.${k}` : k);
  return out;
}

const read = (code: string) => JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), "utf8")) as LocaleFile;

let codesCache: readonly string[] | undefined;
/** Interface languages with a file, in config/languages.json order (the picker's order). */
export function uiLanguages(): readonly string[] {
  if (!codesCache) {
    const files = new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));
    codesCache = languagesConfig.languages.map((l) => l.code).filter((c) => files.has(c));
  }
  return codesCache;
}

const cache = new Map<string, UiLocale>();
/** The merged interface text for `code`, or English when there is no such file. Never throws for a bad file. */
export function getUiLocale(code: string): UiLocale {
  const language = uiLanguages().includes(code) ? code : "en";
  let locale = cache.get(language);
  if (!locale) {
    const master = read("en").messages as UiMessages;
    let file: LocaleFile | null = null;
    try {
      file = language === "en" ? null : read(language);
    } catch {
      file = null; // unreadable file: whole interface in English rather than a broken page
    }
    const current = file ? withoutStale(master, file.messages, file.sourceHashes ?? {}) : null;
    const { merged, fallbacks } = file ? mergeOverMaster(master, current) : { merged: master, fallbacks: [] };
    const dir: UiDir = languagesConfig.languages.find((l) => l.code === language)?.dir === "rtl" ? "rtl" : "ltr";
    // English fallbacks on a right-to-left page are isolated as left-to-right, so their full stops
    // and brackets stay at the right end ("You've got this.", not ".You've got this").
    if (file && dir === "rtl") isolateLtr(merged, new Set(fallbacks));
    locale = { language: file ? language : "en", dir: file ? dir : "ltr", reviewed: file ? file.reviewed === true : true, messages: merged };
    cache.set(language, locale);
  }
  return locale;
}

const LRI = "\u2066";
const PDI = "\u2069";
function isolateLtr(tree: unknown, paths: Set<string>, prefix = ""): void {
  const node = tree as Record<string, unknown>;
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      if (paths.has(path)) node[k] = `${LRI}${v}${PDI}`;
    } else if (v && typeof v === "object") {
      isolateLtr(v, paths, path);
    }
  }
}

/** Common browser tags that name a language our registry spells differently. */
const ALIASES: Record<string, string> = {
  zh: "zh-Hans",
  "zh-cn": "zh-Hans",
  "zh-sg": "zh-Hans",
  "zh-tw": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-mo": "zh-Hant",
  pa: "pa-Guru",
  "pa-in": "pa-Guru",
  "pa-pk": "pa-Arab",
};

/** Map one tag to a code that has a locale file, or null. Exact match, then alias, then primary subtag. */
export function matchUiLanguage(tag: string): string | null {
  const codes = uiLanguages();
  const lower = tag.trim().toLowerCase();
  if (!lower) return null;
  const exact = codes.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const alias = ALIASES[lower];
  if (alias && codes.includes(alias)) return alias;
  const primary = lower.split("-")[0];
  const viaAlias = ALIASES[primary];
  if (viaAlias && codes.includes(viaAlias)) return viaAlias;
  return codes.find((c) => c.toLowerCase() === primary) ?? null;
}

/** AC-27.1: the remembered choice (cookie) wins, else the browser's Accept-Language, else English. */
export function resolveUiLanguage(cookieValue: string | undefined, acceptLanguage: string | null): string {
  if (cookieValue) {
    const fromCookie = matchUiLanguage(cookieValue);
    if (fromCookie) return fromCookie;
  }
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const match = matchUiLanguage(tag);
    if (match) return match;
  }
  return "en";
}
