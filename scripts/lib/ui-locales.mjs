// Shared helpers for the interface-locale scripts (T-32, FR-27). Plain Node, no app imports.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

export const UI_DIR = new URL("../../content/ui/", import.meta.url);
export const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
export const localeUrl = (code) => new URL(`${code}.json`, UI_DIR);
export const languages = () => readJson(new URL("../../config/languages.json", import.meta.url)).languages;
export const localeCodes = () => readdirSync(UI_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));

/** {a: {b: "x"}, list: ["y"]} -> {"a.b": "x", "list.0": "y"} */
export function flatten(tree, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, path, out);
    else out[path] = v;
  }
  return out;
}

/** The reverse of flatten, shaped like `master` (so arrays stay arrays). */
export function unflatten(flat, master) {
  const walk = (m, prefix) => {
    if (typeof m === "string") return flat[prefix];
    if (Array.isArray(m)) return m.map((x, i) => walk(x, `${prefix}.${i}`)).filter((x) => x !== undefined);
    const out = {};
    for (const [k, v] of Object.entries(m)) {
      const r = walk(v, prefix ? `${prefix}.${k}` : k);
      if (r !== undefined && !(typeof r === "object" && Object.keys(r).length === 0)) out[k] = r;
    }
    return out;
  };
  return walk(master, "");
}

/** Short hash of an English string; must match sourceHash() in src/lib/i18n/locale.ts. */
export const sourceHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);

const placeholders = (s) => [...s.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort().join();
const digits = (s) => (s.match(/\d+/g) ?? []).sort().join();
const KEEP = ["CareNav AI", "NHS", "OpenAI"];

/** Why a translation of `english` is unusable, or null. Same rules the app and tests apply, plus digits and names. */
export function problem(english, translated) {
  if (typeof translated !== "string" || translated.trim() === "") return "empty";
  if (placeholders(translated) !== placeholders(english)) return "placeholders differ";
  if (digits(translated) !== digits(english)) return "numbers differ";
  for (const name of KEEP) if (english.includes(name) && !translated.includes(name)) return `"${name}" missing`;
  return null;
}

export function writeLocale(code, flat, { reviewed, hashes }) {
  const master = readJson(localeUrl("en"));
  const file = {
    $comment: `Interface text, ${code}. DRAFT translation of content/ui/en.json (scripts/translate-ui.mjs). Not reviewed by a native speaker unless "reviewed" is true. sourceHashes record which English each string was translated from; a string whose English has changed falls back to English until it is translated and reviewed again.`,
    language: code,
    derivedFrom: "en",
    reviewed,
    sourceHashes: Object.fromEntries(Object.keys(flat).sort().map((k) => [k, hashes[k]])),
    messages: unflatten(flat, master.messages),
  };
  writeFileSync(localeUrl(code), JSON.stringify(file, null, 2) + "\n");
}

/** A locale's usable strings, the stale and missing keys, against the current English. */
export function status(code) {
  const en = flatten(readJson(localeUrl("en")).messages);
  let file = null;
  try {
    file = readJson(localeUrl(code));
  } catch {
    file = null;
  }
  const flat = file ? flatten(file.messages) : {};
  const hashes = file?.sourceHashes ?? {};
  const good = {};
  const stale = [];
  const missing = [];
  for (const [k, english] of Object.entries(en)) {
    if (flat[k] === undefined || problem(english, flat[k])) missing.push(k);
    else if (hashes[k] !== sourceHash(english)) stale.push(k);
    else good[k] = flat[k];
  }
  return { en, file, flat, good, stale, missing };
}

/** Minimal RFC 4180 CSV. */
export function toCsv(rows) {
  const cell = (v) => (/[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((r) => r.map((v) => cell(v ?? "")).join(",")).join("\r\n") + "\r\n";
}

export function fromCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}
