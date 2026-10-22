import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOG_FIELDS } from "@/lib/log/logger";

// T-28 log audit (CLAUDE.md rule 8): every literal key passed to log.info/warn/error anywhere in src/
// is on the allow-list, and nothing writes to the console directly.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const sources = files(join(process.cwd(), "src")).map((f) => [f, readFileSync(f, "utf8")] as const);

describe("log audit", () => {
  it("uses only allow-listed field names in log calls", () => {
    const allowed = new Set<string>(LOG_FIELDS);
    const bad: string[] = [];
    let calls = 0;
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/\blog\.(?:info|warn|error)\(\{([^}]*)\}/g)) {
        calls++;
        for (const part of m[1].split(",")) {
          const key = part.trim().match(/^([A-Za-z_]\w*)\s*(?::|$)/)?.[1];
          if (key && !allowed.has(key)) bad.push(`${file.replace(process.cwd(), "")}: ${key}`);
        }
      }
    }
    expect(calls).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });

  it("never writes to the console directly", () => {
    const hits = sources.filter(([, src]) => /\bconsole\.(log|info|warn|error|debug)\(/.test(src)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});
