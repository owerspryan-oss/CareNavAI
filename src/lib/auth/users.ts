import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db";
import { normaliseEmail } from "./tokens";

export type UserRow = { id: string; email: string; password_hash: string | null; created_at: number };

export function findUserByEmail(db: DB, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(normaliseEmail(email)) as UserRow | undefined;
}

export function findUserById(db: DB, id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(db: DB, email: string, passwordHash: string | null, now: number): UserRow {
  const row: UserRow = { id: randomUUID(), email: normaliseEmail(email), password_hash: passwordHash, created_at: now };
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(row.id, row.email, row.password_hash, row.created_at);
  return row;
}

/**
 * One-action delete (AC-14.4, PRD §12.5): the user, their sessions and saved summaries (cascade) and
 * every magic link for their email, in one transaction.
 */
export function deleteAccount(db: DB, userId: string): void {
  db.transaction(() => {
    const user = findUserById(db, userId);
    if (!user) return;
    db.prepare("DELETE FROM magic_links WHERE email = ?").run(user.email);
    db.prepare("DELETE FROM summaries WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  })();
}
