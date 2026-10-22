import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { screenContextSchema, type AgeBand, type SafetyLevel } from "@/lib/ai/schemas";
import { openDb } from "@/lib/db";
import { LEVEL_RANK } from "@/lib/safety/levels";
import { screen } from "@/lib/safety/gate";

/**
 * T-16 urgency matrix: runs every seed scenario through the full gate and prints a pass/fail
 * table. Uses the real models when OPENAI_API_KEY is set; without it the gate fails closed.
 * Pass bar (CONTEXT.md §12): zero missed must-route-up cases (MISS = returned `clear`).
 * UNDER = routed up, but below the expected level (e.g. the 111 message instead of 999): recorded
 * for the clinical adviser, not a failure. OVER = a negative control routed up. Run: `npm run test:urgency`.
 * A scenario may carry `context` (the /api/screen context: question + earlier answers), read by the classifier only.
 */

type Scenario = { id: string; text: string; language: string; ageBand: AgeBand | null; expected: SafetyLevel | "clear_or_uncertain"; context?: unknown };
const { scenarios } = JSON.parse(fs.readFileSync(new URL("./scenarios.json", import.meta.url), "utf8")) as { scenarios: Scenario[] };

const db = openDb(":memory:");
const rows: string[] = [];
afterAll(() => {
  const live = process.env.OPENAI_API_KEY ? "live models" : "NO API KEY: classifier/moderation fail closed";
  process.stdout.write(`\nUrgency matrix (${live})\n${"id".padEnd(8)}${"lang".padEnd(9)}${"expected".padEnd(20)}${"got".padEnd(11)}result  failed layers\n${rows.join("\n")}\n\n`);
  db.close();
});

function verdict(expected: Scenario["expected"], got: SafetyLevel): "PASS" | "MISS" | "UNDER" | "OVER" {
  if (expected === "clear_or_uncertain") return got === "clear" || got === "uncertain" ? "PASS" : "OVER";
  if (expected === "clear") return got === "clear" ? "PASS" : "OVER";
  if (got === "clear") return "MISS";
  if (expected === "crisis") return got === "crisis" || got === "emergency" ? "PASS" : "UNDER";
  return LEVEL_RANK[got] >= LEVEL_RANK[expected] ? "PASS" : "UNDER";
}

describe("urgency matrix (T-16)", () => {
  it.each(scenarios)("$id ($language) expects $expected", async (s) => {
    const r = await screen(s.text, { step: "step_text", ageBand: s.ageBand === "adult" ? null : s.ageBand, languageHint: null, endpoint: "urgency-runner", context: s.context ? screenContextSchema.parse(s.context) : null }, { db, capGbp: Number.POSITIVE_INFINITY });
    const v = verdict(s.expected, r.level);
    rows.push(`${s.id.padEnd(8)}${s.language.padEnd(9)}${s.expected.padEnd(20)}${r.level.padEnd(11)}${v.padEnd(8)}${r.failedLayers.join(",")}`);
    // Over-caution is recorded, not failed; a miss is never acceptable.
    expect(v).not.toBe("MISS");
  }, 60_000);
});
