import fs from "node:fs";
import path from "node:path";
import { prepareAnswersSchema, type PrepareAnswers } from "@/lib/ai/schemas";

/*
 * Demo mode (FR-26, AC-26.1): the fictional inputs in demo/ (T-29), read on the server only when
 * DEMO_MODE is on and passed to the journeys as props. They fill the UI like typed answers; nothing
 * here skips the urgency gate. Every file is fictional, so none of this is user content.
 */

const DIR = path.join(process.cwd(), "demo");

export type DemoPreparePreset = { id: string; answers: PrepareAnswers };
export type DemoLetterPreset = { id: string; kind: "text"; text: string } | { id: string; kind: "photo"; dataUrl: string };

const ids = (dir: string, ext: string) =>
  fs
    .readdirSync(path.join(DIR, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => f.slice(0, -ext.length));

/** Journey 1 inputs: every demo/inputs/*.json, validated as request answers ("$comment" keys dropped). */
export function demoPreparePresets(): DemoPreparePreset[] {
  return ids("inputs", ".json").map((id) => {
    const raw = JSON.parse(fs.readFileSync(path.join(DIR, "inputs", `${id}.json`), "utf8")) as Record<string, unknown>;
    const clean = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("$")));
    return { id, answers: prepareAnswersSchema.parse(clean) };
  });
}

/** Journey 2 letters: each demo/letter file as typed text (.txt) or as a photo (.png) for the real extraction. */
export function demoLetterPresets(): DemoLetterPreset[] {
  const read = (f: string) => fs.readFileSync(path.join(DIR, "letter", f));
  return [
    ...ids("letter", ".png").map((id): DemoLetterPreset => ({ id, kind: "photo", dataUrl: `data:image/png;base64,${read(`${id}.png`).toString("base64")}` })),
    ...ids("letter", ".txt").map((id): DemoLetterPreset => ({ id, kind: "text", text: read(`${id}.txt`).toString("utf8").trim() })),
  ];
}
