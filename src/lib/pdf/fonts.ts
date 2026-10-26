import fs from "node:fs";
import path from "node:path";

// Bundled Noto fonts for the PDF (FR-10, AC-10.5): every script the interface offers renders the same
// on any machine, with no system fonts and no network (the renderer only allows data: URLs). Only the
// files whose characters appear in the document are embedded, so a Latin-only PDF stays small and a
// Chinese one carries just the chunks it uses.

const DIR = path.join(process.cwd(), "assets", "fonts");

type Entry = { family: string; weight: number; file: string; ranges: [number, number][] };

let entries: Entry[] | undefined;
const data = new Map<string, string>();

function parseRanges(unicodeRange: string): [number, number][] {
  return unicodeRange.split(",").map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-");
    const lo = parseInt(a.replace(/\?/g, "0"), 16);
    const hi = b ? parseInt(b, 16) : parseInt(a.replace(/\?/g, "F"), 16);
    return [lo, hi];
  });
}

function manifest(): Entry[] {
  entries ??= (JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")).fonts as { family: string; weight: number; file: string; unicodeRange: string }[]).map(
    (f) => ({ family: f.family, weight: f.weight, file: f.file, ranges: parseRanges(f.unicodeRange) }),
  );
  return entries;
}

function base64(file: string): string {
  let b = data.get(file);
  if (!b) {
    b = fs.readFileSync(path.join(DIR, "files", file)).toString("base64");
    data.set(file, b);
  }
  return b;
}

/** The font files a text needs: every file whose range covers at least one of its characters. */
export function fontFilesFor(text: string): Entry[] {
  const points = new Set<number>();
  for (const ch of text) points.add(ch.codePointAt(0)!);
  const sorted = [...points].sort((a, b) => a - b);
  return manifest().filter((e) => e.ranges.some(([lo, hi]) => sorted.some((p) => p >= lo && p <= hi)));
}

/** @font-face rules, as data: URLs, for the characters in `text`. */
export function fontFaceCss(text: string): string {
  return fontFilesFor(text)
    .map(
      (e) =>
        `@font-face{font-family:"${e.family}";font-weight:${e.weight};font-style:normal;src:url(data:font/woff2;base64,${base64(e.file)}) format("woff2");unicode-range:${e.ranges.map(([lo, hi]) => (lo === hi ? `U+${lo.toString(16)}` : `U+${lo.toString(16)}-${hi.toString(16)}`)).join(",")}}`,
    )
    .join("\n");
}
