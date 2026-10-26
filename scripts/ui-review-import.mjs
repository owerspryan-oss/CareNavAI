// T-32 / AC-27.6: import a reviewed sheet (from ui-review-export.mjs) back into content/ui/<code>.json.
//
//   npm run ui:review:import -- pcm ui-review-pcm.csv
//
// A non-empty "correction" replaces the translation. The file becomes reviewed: true only when every
// English string has a usable translation and every row says approved = yes. A correction that drops a
// {placeholder}, a number or a product name is rejected and reported by key.
import { readFileSync } from "node:fs";
import { fromCsv, problem, sourceHash, status, writeLocale } from "./lib/ui-locales.mjs";

const [code, file] = process.argv.slice(2);
if (!code || !file || code === "en") {
  console.error("Usage: ui-review-import.mjs <code> <file.csv>");
  process.exit(2);
}

const { en, good } = status(code);
const [header, ...rows] = fromCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const col = (name) => header.indexOf(name);
for (const name of ["key", "translation", "approved", "correction"]) {
  if (col(name) < 0) {
    console.error(`Missing column: ${name}`);
    process.exit(2);
  }
}

const out = { ...good };
const hashes = Object.fromEntries(Object.keys(good).map((k) => [k, sourceHash(en[k])]));
const approved = new Set();
const rejected = [];
for (const r of rows) {
  const key = r[col("key")];
  if (!(key in en)) continue;
  const text = (r[col("correction")] ?? "").trim() || (r[col("translation")] ?? "").trim();
  if (!text) continue;
  const why = problem(en[key], text);
  if (why) {
    rejected.push(`${key} (${why})`);
    continue;
  }
  out[key] = text;
  hashes[key] = sourceHash(en[key]);
  if (/^(y|yes|ok|approved)$/i.test((r[col("approved")] ?? "").trim())) approved.add(key);
}
const total = Object.keys(en).length;
const reviewed = Object.keys(en).every((k) => k in out && approved.has(k));
writeLocale(code, out, { reviewed, hashes });
console.log(`${code}: ${Object.keys(out).length}/${total} strings, ${approved.size} approved, reviewed: ${reviewed}`);
if (rejected.length) console.log(`Rejected (kept the previous text):\n  ${rejected.join("\n  ")}`);
