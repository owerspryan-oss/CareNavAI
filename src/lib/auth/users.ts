import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db";
import { normaliseEmail } from "./tokens";

/** `language`: the code the person reads the app in (config/languages.json), or null when not chosen yet. */
export type UserRow = { id: string; email: string; password_hash: string | null; created_at: number; language: string | null };

export function findUserByEmail(db: DB, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(normaliseEmail(email)) as UserRow | undefined;
}

export function findUserById(db: DB, id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(db: DB, email: string, passwordHash: string | null, now: number, language: string | null = null): UserRow {
  const row: UserRow = { id: randomUUID(), email: normaliseEmail(email), password_hash: passwordHash, created_at: now, language };
  db.prepare("INSERT INTO users (id, email, password_hash, created_at, language) VALUES (?, ?, ?, ?, ?)").run(row.id, row.email, row.password_hash, row.created_at, row.language);
  return row;
}

/** The account's language. Callers validate the code against config/languages.json first. */
export function setUserLanguage(db: DB, userId: string, language: string): void {
  db.prepare("UPDATE users SET language = ? WHERE id = ?").run(language, userId);
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
