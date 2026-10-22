import type { z } from "zod";
import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import type { RestyleRequest } from "@/lib/ai/schemas";
import { HttpError, type Ctx } from "@/lib/api/route";
import { isPlayfulLanguage } from "@/lib/config";
import { env } from "@/lib/config/env";
import { log } from "@/lib/log/logger";
import { postPlayfulFields, postStyleSchema, prePlayfulFields, preStyleSchema, type PostStyleFields, type PreStyleFields } from "@/lib/restyle/fields";
import { doseAndDateTerms } from "@/lib/result/view";
import { screen } from "@/lib/safety/gate";
import { allStrings, forbiddenHits } from "@/lib/validate/forbidden";
import { parityMismatch } from "@/lib/validate/parity";
import { missingProtectedSpansByField } from "@/lib/validate/spans";

export const STYLE_PROMPT = { name: "style", version: "v1" } as const;

/** Why a playful version wasn't made. The client shows one quiet line and keeps the plain version. */
export type RestyleRefusal = "not_offered" | "urgent_result" | "gate" | "call_failed" | "parity" | "protected_spans" | "forbidden";

export type RestyleResponse =
  | { kind: "restyled"; restyled: true; flow: "prepare"; language: string; promptVersion: string; fields: PreStyleFields }
  | { kind: "restyled"; restyled: true; flow: "understand"; language: string; promptVersion: string; fields: PostStyleFields }
  | { kind: "unavailable"; reason: RestyleRefusal };

const ROUTE = "/api/restyle";

/**
 * Restyled text must keep, field by field, every medicine name, dose, number and date of the English
 * (CLAUDE.md rule 6, AC-23.2). On top of the shared protected-span check: no field gains a number the
 * English doesn't have, and doses and dates are compared exactly as written ("500mg" must not become
 * "500 mg"), since a restyle stays in English spelling.
 */
function spansKept(master: string[], restyled: string[], terms: string[]): boolean {
  if (missingProtectedSpansByField(master, restyled, terms).length > 0) return false;
  if (missingProtectedSpansByField(restyled, master, []).length > 0) return false;
  return master.every((m, i) => doseAndDateTerms(m).every((t) => restyled[i].includes(t)));
}

/**
 * FR-23 playful restyle (ADR-010). Fixed order: offered? -> no urgent notice -> size -> full urgency gate
 * on the text about to be restyled (rule 1: no generation without `clear`) -> one STYLE call -> parity,
 * protected spans, forbidden-content scan. Any failure is a refusal: never a partial or mismatched version.
 * Nothing is saved; the response is tagged `restyled` so the PDF and saved-record schemas reject it.
 */
export async function runRestyle(req: RestyleRequest, ctx: Ctx, deps?: AiDeps): Promise<RestyleResponse> {
  const refuse = (reason: RestyleRefusal): RestyleResponse => {
    log.info({ requestId: ctx.requestId, route: ROUTE, status: "refused", errorType: `restyle_${reason}`, languageCode: req.language });
    return { kind: "unavailable", reason };
  };

  if (!isPlayfulLanguage(req.language)) return refuse("not_offered");
  // AC-23.3: unavailable on any result that carries an urgent notice.
  if (req.english.meta.urgentAcknowledged !== null) return refuse("urgent_result");

  const fields = req.flow === "prepare" ? prePlayfulFields(req.english) : postPlayfulFields(req.english);
  const schema: z.ZodType = req.flow === "prepare" ? preStyleSchema : postStyleSchema;
  const master = allStrings(fields);
  if (master.reduce((n, s) => n + s.length, 0) > env().MAX_RESTYLE_CHARS) throw new HttpError(413, "text_too_long");

  const ageBand = req.flow === "prepare" ? req.english.forWhom.ageBand : null;
  const gate = await screen(master.join("\n\n"), { step: "restyle", ageBand, languageHint: null, endpoint: ROUTE, requestId: ctx.requestId }, deps);
  if (gate.level !== "clear") return refuse("gate");

  const medicines = req.flow === "prepare" ? req.english.medicationAndSupport.medicines : req.english.medicines;
  const terms = medicines.flatMap((m) => (m.dose ? [m.name, m.dose] : [m.name]));
  const prompt = loadPrompt(STYLE_PROMPT.name, STYLE_PROMPT.version);

  let out: unknown;
  try {
    out = await callStructured(
      {
        role: "STYLE",
        endpoint: ROUTE,
        requestId: ctx.requestId,
        schema,
        schemaName: "playful_version",
        instructions: prompt.text,
        input: `<target>\n${req.language}\n</target>\n${wrapUserData("english_fields", JSON.stringify(fields))}`,
      },
      deps,
    );
  } catch {
    return refuse("call_failed");
  }

  if (parityMismatch(fields, out) !== null) return refuse("parity");
  const restyled = allStrings(out);
  // An empty English field stays empty: anything written there would be new content.
  if (master.some((m, i) => (m.trim() === "") !== (restyled[i].trim() === ""))) return refuse("parity");
  if (!spansKept(master, restyled, terms)) return refuse("protected_spans");
  if (restyled.some((s) => forbiddenHits(s).length > 0)) return refuse("forbidden");

  const base = { kind: "restyled" as const, restyled: true as const, language: req.language, promptVersion: prompt.version };
  return req.flow === "prepare"
    ? { ...base, flow: "prepare", fields: out as PreStyleFields }
    : { ...base, flow: "understand", fields: out as PostStyleFields };
}
