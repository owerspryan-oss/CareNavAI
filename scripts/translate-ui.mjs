// T-32: translate the interface text (content/ui/en.json) into stored locale files (FR-27, D13).
//
//   npm run ui:translate -- pcm ur        translate missing or out-of-date strings for these languages
//   npm run ui:translate -- --all         every language in config/languages.json
//   npm run ui:translate -- --stamp pcm   no model call: record the current English as the source of
//                                         every valid string already in the file (after a hand edit)
//
// Needs OPENAI_API_KEY. Uses the TRANSLATE role in config/models.json and the reviewed prompt
// src/lib/ai/prompts/translate-ui.v1.md. Every returned string is checked (placeholders, numbers,
// product names) and retried once; anything still wrong is left out, so the app shows English for it.
// Changed files are written with reviewed: false. Prints counts only, never text.

import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { languages, localeCodes, problem, readJson, sourceHash, status, writeLocale } from "./lib/ui-locales.mjs";

const args = process.argv.slice(2);
const stamp = args.includes("--stamp");
const codes = args.includes("--all") ? languages().map((l) => l.code).filter((c) => c !== "en") : args.filter((a) => !a.startsWith("--"));
if (codes.length === 0) {
  console.error("Usage: translate-ui.mjs [--stamp] <code...> | --all   (codes from config/languages.json)");
  process.exit(2);
}
const known = new Set(languages().map((l) => l.code));
for (const c of codes) {
  if (!known.has(c) || c === "en") {
    console.error(`Unknown or master language: ${c}`);
    process.exit(2);
  }
}

const CHUNK = 40;

async function translateChunk(client, role, prompt, lang, strings) {
  const res = await client.responses.create({
    model: role.model,
    instructions: prompt,
    input: JSON.stringify({ targetLanguage: { code: lang.code, name: lang.englishName, nativeName: lang.nativeName, script: lang.script }, strings }),
    text: { format: { type: "json_object" } },
    max_output_tokens: Math.max(role.maxOutputTokens, 8000),
    store: false,
  });
  return JSON.parse(res.output_text);
}

async function run() {
  if (stamp) {
    for (const code of codes) {
      const { en, flat, file } = status(code);
      const usable = Object.fromEntries(Object.entries(flat).filter(([k, v]) => k in en && !problem(en[k], v)));
      const hashes = Object.fromEntries(Object.keys(usable).map((k) => [k, sourceHash(en[k])]));
      writeLocale(code, usable, { reviewed: false, hashes });
      console.log(`${code}: stamped ${Object.keys(usable).length}/${Object.keys(en).length} strings${file?.reviewed ? " (reviewed reset to false)" : ""}`);
    }
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set (put it in .env.local and run with: node --env-file=.env.local scripts/translate-ui.mjs ...)");
    process.exit(2);
  }
  const client = new OpenAI({ maxRetries: 1 });
  const role = readJson(new URL("../config/models.json", import.meta.url)).roles.TRANSLATE;
  const prompt = readFileSync(new URL("../src/lib/ai/prompts/translate-ui.v1.md", import.meta.url), "utf8").replace(/^<!--[\s\S]*?-->\s*/, "");

  for (const code of codes) {
    const lang = languages().find((l) => l.code === code);
    const { en, good, stale, missing, file } = status(code);
    const todo = [...missing, ...stale];
    if (todo.length === 0) {
      console.log(`${code}: up to date (${Object.keys(good).length} strings)`);
      continue;
    }
    const out = { ...good };
    const hashes = Object.fromEntries(Object.keys(good).map((k) => [k, file.sourceHashes[k]]));
    let failed = 0;
    for (let i = 0; i < todo.length; i += CHUNK) {
      let keys = todo.slice(i, i + CHUNK);
      for (let attempt = 0; attempt < 2 && keys.length; attempt++) {
        let got = {};
        try {
          got = await translateChunk(client, role, prompt, lang, Object.fromEntries(keys.map((k) => [k, en[k]])));
        } catch (e) {
          console.error(`${code}: chunk failed (${e?.constructor?.name ?? "error"})`);
        }
        const retry = [];
        for (const k of keys) {
          if (problem(en[k], got[k])) {
            retry.push(k);
          } else {
            out[k] = got[k];
            hashes[k] = sourceHash(en[k]);
          }
        }
        keys = retry;
      }
      failed += keys.length;
    }
    writeLocale(code, out, { reviewed: false, hashes });
    console.log(`${code}: ${todo.length - failed} translated, ${failed} left in English, ${Object.keys(out).length}/${Object.keys(en).length} total`);
  }
  if (localeCodes().length) console.log("Next: export a review sheet for each language (npm run ui:review:export -- <code>).");
}

await run();
