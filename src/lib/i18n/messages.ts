// Client-safe interface-text helpers (FR-27). No file-system or config imports: the server loads
// the locale (./locale.ts) and passes the merged messages down through <UiProvider>.

/** The shape of every locale file's `messages`, taken from the English master. */
export type UiMessages = (typeof import("../../../content/ui/en.json"))["messages"];

export type UiDir = "ltr" | "rtl";

/** What the server hands the client for one interface language. */
export interface UiLocale {
  /** The language actually served (has a file in content/ui), e.g. "en", "pcm", "ur". */
  language: string;
  dir: UiDir;
  /** AC-27.4: false shows the "not checked by a native speaker yet" notice. */
  reviewed: boolean;
  /** Merged over English key by key, so a missing string is English, never blank (AC-27.2). */
  messages: UiMessages;
}

/** The {name} placeholders in a template, sorted, e.g. "Step {n} of {total}" -> ["n", "total"]. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
}

/** Fill {name} placeholders. Unknown names are left as they are. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** Numbers in the interface language's grouping, always with Western digits (like medicine doses). */
export function formatNumber(n: number, language: string): string {
  try {
    return new Intl.NumberFormat(language, { numberingSystem: "latn" }).format(n);
  } catch {
    return new Intl.NumberFormat("en-GB").format(n);
  }
}

/** A short list joined the interface language's way ("a, b, c"). */
export function formatList(items: string[], language: string): string {
  try {
    return new Intl.ListFormat(language, { style: "short", type: "unit" }).format(items);
  } catch {
    return items.join(", ");
  }
}

type Leaf = string;
type Tree = { [key: string]: Tree | Leaf | Leaf[] } | Leaf[];

/**
 * Every string in `master`, with the translated one from `other` where it is usable: a non-empty
 * string with exactly the master's placeholders. Anything else (missing, wrong type, a dropped or
 * renamed placeholder) falls back to English for that one string. Keys only in `other` are ignored.
 */
export function mergeOverMaster<T>(master: T, other: unknown): { merged: T; fallbacks: string[] } {
  const fallbacks: string[] = [];
  const walk = (m: unknown, o: unknown, path: string): unknown => {
    if (typeof m === "string") {
      if (typeof o === "string" && o.trim() !== "" && placeholders(o).join() === placeholders(m).join()) return o;
      fallbacks.push(path);
      return m;
    }
    if (Array.isArray(m)) return m.map((x, i) => walk(x, Array.isArray(o) ? o[i] : undefined, `${path}.${i}`));
    const obj = m as Tree as Record<string, unknown>;
    const oo = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, walk(v, oo[k], path ? `${path}.${k}` : k)]));
  };
  return { merged: walk(master, other, "") as T, fallbacks };
}
