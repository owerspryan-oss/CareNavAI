import fs from "node:fs";
import path from "node:path";

// Prompts are versioned Markdown files (CONTEXT.md §6). Every output records the version it used.
const DIR = path.join(process.cwd(), "src/lib/ai/prompts");
const cache = new Map<string, string>();

export type Prompt = { text: string; version: string };

export function loadPrompt(name: string, version: string): Prompt {
  const file = `${name}.${version}.md`;
  let text = cache.get(file);
  if (text === undefined) {
    // Strip the review-status HTML comment; it is for humans, not the model.
    text = fs.readFileSync(path.join(DIR, file), "utf8").replace(/^<!--[\s\S]*?-->\s*/, "");
    cache.set(file, text);
  }
  return { text, version: `${name}@${version}` };
}

/** Wraps untrusted text in a delimited block, neutralising any attempt to close the block early. */
export function wrapUserData(tag: string, text: string): string {
  const safe = text.replace(new RegExp(`</?\\s*${tag}\\s*>`, "gi"), "[removed-tag]");
  return `<${tag}>\n${safe}\n</${tag}>`;
}
