import { z } from "zod";
import { languageCodeSchema } from "@/lib/ai/schemas";
import { db as defaultDb, type DB } from "@/lib/db";
import { FEEDBACK_ANSWERS } from "./answers";

/**
 * Anonymous user feedback after a result (FR-16, AC-16.1/16.2): two fixed statements, three answers
 * each. Stored: flow, language, the two answers and a timestamp. No content, no user or device id.
 */
const answerSchema = z.enum(FEEDBACK_ANSWERS).nullable();

export const userFeedbackSchema = z
  .object({
    flow: z.enum(["prepare", "understand"]),
    /** The language of the result the person read (its output language). */
    language: languageCodeSchema,
    confident: answerSchema,
    understandNext: answerSchema,
  })
  .strict()
  .refine((f) => f.confident !== null || f.understandNext !== null, "at least one answer");
export type UserFeedback = z.infer<typeof userFeedbackSchema>;

export function saveUserFeedback(f: UserFeedback, database: DB = defaultDb(), now = Date.now()): void {
  database
    .prepare("INSERT INTO feedback_user (ts, flow, language, q1, q2) VALUES (?, ?, ?, ?, ?)")
    .run(now, f.flow, f.language, f.confident, f.understandNext);
}
