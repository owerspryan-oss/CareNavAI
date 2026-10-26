// T-32 / AC-27.6: export a language's interface text as a review sheet for a native speaker.
//
//   npm run ui:review:export -- pcm [file.csv]     (default: ui-review-pcm.csv)
//
// Columns: key, english, translation, status (ok | out of date | missing), approved (reviewer writes
// "yes"), correction (reviewer's better wording, if any), note. Open it in any spreadsheet app.
import { writeFileSync } from "node:fs";
import { status, toCsv } from "./lib/ui-locales.mjs";

const [code, out = `ui-review-${code}.csv`] = process.argv.slice(2);
if (!code || code === "en") {
  console.error("Usage: ui-review-export.mjs <code> [file.csv]");
  process.exit(2);
}

const { en, flat, stale, missing } = status(code);
const staleSet = new Set(stale);
const missingSet = new Set(missing);
const rows = [["key", "english", "translation", "status", "approved", "correction", "note"]];
for (const [k, english] of Object.entries(en)) {
  const s = missingSet.has(k) ? "missing" : staleSet.has(k) ? "out of date" : "ok";
  rows.push([k, english, flat[k] ?? "", s, "", "", ""]);
}
writeFileSync(out, "﻿" + toCsv(rows)); // BOM so spreadsheet apps open it as UTF-8
console.log(`${code}: ${rows.length - 1} strings written to ${out} (${missing.length} missing, ${stale.length} out of date)`);
