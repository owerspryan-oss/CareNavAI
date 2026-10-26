import { randomUUID } from "node:crypto";
import { z } from "zod";
import { notRestyled, postAppointmentResultSchema, preAppointmentResultSchema, type AgeBand } from "@/lib/ai/schemas";
import { env } from "@/lib/config/env";
import { open, seal } from "@/lib/crypto/aead";
import type { DB } from "@/lib/db";

/**
 * Saved summaries for signed-in users (FR-14). The payload is the result exactly as the person received
 * it, encrypted with AES-256-GCM under DATA_KEY (AC-14.2); the clear columns hold only labels from fixed
 * lists and language codes. No inputs beyond what the result contains; never audio or images.
 */

export const KEY_VERSION = 1;

/** The data key, or null when DATA_KEY is unset: then nothing is saved (never stored unencrypted). */
export function dataKey(): Buffer | null {
  const k = env().DATA_KEY;
  return k ? Buffer.from(k, "base64") : null;
}

const fallback = z.enum(["parity", "protected_spans", "call_failed"]).nullable();
/** Playful (restyled) text is never part of a saved record (AC-23.4). */
export const savedResultSchema = notRestyled(
  z.discriminatedUnion("flow", [
    z.object({ flow: z.literal("prepare"), english: preAppointmentResultSchema, user: preAppointmentResultSchema.nullable(), userFallback: fallback }),
    z.object({ flow: z.literal("understand"), english: postAppointmentResultSchema, user: postAppointmentResultSchema.nullable(), userFallback: fallback }),
  ]),
);
export type SavedResult = z.infer<typeof savedResultSchema>;

/** Who it was for, from the fixed list (Journey 1). Journey 2 doesn't ask. */
export type ForWhom = "self" | "parent" | "carer" | "other" | "not_asked";

export type SummaryMeta = {
  id: string;
  flow: SavedResult["flow"];
  forWhom: ForWhom;
  isChild: boolean;
  languageDetected: string;
  languageOutput: string;
  createdAt: number;
};

type Row = {
  id: string;
  user_id: string;
  flow: SavedResult["flow"];
  for_whom_label: ForWhom;
  is_child: 0 | 1;
  language_detected: string;
  language_output: string;
  payload_enc: Buffer;
  iv: Buffer;
  tag: Buffer;
  key_version: number;
  created_at: number;
};

const CHILD_BANDS: ReadonlySet<AgeBand> = new Set(["under_1", "1_to_4", "5_to_11", "12_to_17"]);

/** Binds a ciphertext to its row and owner. */
const aad = (id: string, userId: string, version: number) => `carenav-summary:v${version}:${id}:${userId}`;

const toMeta = (r: Row): SummaryMeta => ({
  id: r.id,
  flow: r.flow,
  forWhom: r.for_whom_label,
  isChild: r.is_child === 1,
  languageDetected: r.language_detected,
  languageOutput: r.language_output,
  createdAt: r.created_at,
});

export function saveSummary(
  db: DB,
  key: Buffer,
  userId: string,
  result: SavedResult,
  who: { forWhom: ForWhom; ageBand: AgeBand | null },
  now: number,
): string {
  const id = randomUUID();
  const sealed = seal(Buffer.from(JSON.stringify(result), "utf8"), key, aad(id, userId, KEY_VERSION));
  db.prepare(
    `INSERT INTO summaries (id, user_id, flow, for_whom_label, is_child, language_detected, language_output, payload_enc, iv, tag, key_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    result.flow,
    who.forWhom,
    who.ageBand && CHILD_BANDS.has(who.ageBand) ? 1 : 0,
    result.english.meta.detectedLanguage,
    (result.user ?? result.english).meta.outputLanguage,
    sealed.ciphertext,
    sealed.iv,
    sealed.tag,
    KEY_VERSION,
    now,
  );
  return id;
}

/** Newest first. Metadata only: nothing is decrypted to list. */
export function listSummaries(db: DB, userId: string): SummaryMeta[] {
  return (db.prepare("SELECT * FROM summaries WHERE user_id = ? ORDER BY created_at DESC, id").all(userId) as Row[]).map(toMeta);
}

function decrypt(r: Row, key: Buffer): SavedResult | null {
  // Only version 1 exists; a rotated key adds a lookup by version here.
  if (r.key_version !== KEY_VERSION) return null;
  try {
    const plain = open({ ciphertext: r.payload_enc, iv: r.iv, tag: r.tag }, key, aad(r.id, r.user_id, r.key_version));
    const parsed = savedResultSchema.safeParse(JSON.parse(plain.toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** One saved summary, decrypted, if it belongs to this user. `result` is null when it can't be read (wrong key). */
export function getSummary(db: DB, key: Buffer, userId: string, id: string): { meta: SummaryMeta; result: SavedResult | null } | null {
  const r = db.prepare("SELECT * FROM summaries WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
  return r ? { meta: toMeta(r), result: decrypt(r, key) } : null;
}

export function deleteSummary(db: DB, userId: string, id: string): boolean {
  return db.prepare("DELETE FROM summaries WHERE id = ? AND user_id = ?").run(id, userId).changes === 1;
}

/** AC-14.4 export: the account and every saved summary, decrypted, as one readable JSON document. */
export function exportAccount(db: DB, key: Buffer | null, user: { id: string; email: string; created_at: number; language: string | null }, now: number) {
  const rows = db.prepare("SELECT * FROM summaries WHERE user_id = ? ORDER BY created_at, id").all(user.id) as Row[];
  return {
    exportedAt: new Date(now).toISOString(),
    account: { email: user.email, createdAt: new Date(user.created_at).toISOString(), language: user.language },
    summaries: rows.map((r) => {
      const { createdAt, ...meta } = toMeta(r);
      return { ...meta, createdAt: new Date(createdAt).toISOString(), result: key ? decrypt(r, key) : null };
    }),
  };
}
