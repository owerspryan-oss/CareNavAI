import { randomInt } from "node:crypto";
import type { DB } from "@/lib/db";
import { sha256 } from "./tokens";

/**
 * Pilot invite codes (AC-12.4). Stored as a hash only, with a use limit and an optional expiry.
 * Codes are 12 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX-XXXX;
 * spaces, dashes and case are ignored when one is typed back.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normaliseInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function newInviteCode(): string {
  const raw = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return raw.match(/.{4}/g)!.join("-");
}

export function createInvite(db: DB, code: string, opts: { maxUses?: number; expiresAt?: number | null } = {}): void {
  db.prepare("INSERT INTO invites (code_hash, max_uses, used, expires_at) VALUES (?, ?, 0, ?)").run(
    sha256(normaliseInviteCode(code)),
    opts.maxUses ?? 1,
    opts.expiresAt ?? null,
  );
}

/** Uses one place on a valid, unexpired code. False when the code is unknown, used up or expired. */
export function consumeInvite(db: DB, code: string | null | undefined, now: number): boolean {
  const normalised = normaliseInviteCode(code ?? "");
  if (!normalised) return false;
  const res = db
    .prepare("UPDATE invites SET used = used + 1 WHERE code_hash = ? AND used < max_uses AND (expires_at IS NULL OR expires_at > ?)")
    .run(sha256(normalised), now);
  return res.changes === 1;
}
