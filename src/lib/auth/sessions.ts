import type { DB } from "@/lib/db";
import { findUserById, type UserRow } from "./users";
import { newToken, sha256 } from "./tokens";

/**
 * Sessions (AC-12.3, PRD §12.3): a random id in an HttpOnly cookie; only its sha256 is stored.
 * 24 hours, sliding: each use pushes the expiry back, at most once an hour so reads stay cheap.
 */
export const SESSION_COOKIE = "cn_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const EXTEND_AFTER_MS = 60 * 60 * 1000;

export function createSession(db: DB, userId: string, now: number): string {
  const token = newToken();
  db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, now + SESSION_TTL_MS);
  // Expired sessions are cleared as new ones start, so the table stays small.
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  return token;
}

export type ActiveSession = { user: UserRow; extended: boolean };

/**
 * The signed-in user for a session id, or null when it is unknown or expired. With `extend`, the expiry
 * slides forward (throttled); `extended` says the cookie should be re-sent with a fresh lifetime.
 */
export function readSession(db: DB, token: string | null, now: number, opts: { extend?: boolean } = {}): ActiveSession | null {
  if (!token) return null;
  const idHash = sha256(token);
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE id_hash = ?").get(idHash) as { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at <= now) return null;
  const user = findUserById(db, row.user_id);
  if (!user) return null;
  let extended = false;
  if (opts.extend && row.expires_at - now < SESSION_TTL_MS - EXTEND_AFTER_MS) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?").run(now + SESSION_TTL_MS, idHash);
    extended = true;
  }
  return { user, extended };
}

export function destroySession(db: DB, token: string | null): void {
  if (token) db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(sha256(token));
}

/** HttpOnly, SameSite=Lax, Path=/; Secure everywhere except localhost (AC-12.3). */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
