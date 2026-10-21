import { z } from "zod";
import { db as defaultDb, type DB } from "@/lib/db";
import { REF_PATTERN } from "./qr";

/** Clinician feedback form (FR-16, AC-16.3): two questions and a short comment. No patient info, no IP. */
export const COMMENT_MAX = 500;
/** One PDF is normally seen by one clinician; a small cap stops a leaked link being used to flood the table. */
export const MAX_FEEDBACK_PER_REF = 5;

export const clinicianFeedbackSchema = z.object({
  ref: z.string().regex(REF_PATTERN),
  useful: z.enum(["yes", "partly", "no"]),
  missingOrMisleading: z.enum(["none", "missing", "misleading", "both"]),
  comment: z
    .string()
    .trim()
    .max(COMMENT_MAX)
    .transform((s) => s || null),
});
export type ClinicianFeedback = z.infer<typeof clinicianFeedbackSchema>;

export function refExists(ref: string, database: DB = defaultDb()): boolean {
  return REF_PATTERN.test(ref) && !!database.prepare("SELECT 1 FROM pdf_exports WHERE ref = ?").get(ref);
}

export type SaveResult = "saved" | "unknown_ref" | "full";

export function saveClinicianFeedback(f: ClinicianFeedback, database: DB = defaultDb(), now = Date.now()): SaveResult {
  if (!refExists(f.ref, database)) return "unknown_ref";
  const { n } = database.prepare("SELECT count(*) AS n FROM clinician_feedback WHERE ref = ?").get(f.ref) as { n: number };
  if (n >= MAX_FEEDBACK_PER_REF) return "full";
  database
    .prepare("INSERT INTO clinician_feedback (ref, ts, useful, missing_or_misleading, comment) VALUES (?, ?, ?, ?, ?)")
    .run(f.ref, now, f.useful, f.missingOrMisleading, f.comment);
  return "saved";
}
