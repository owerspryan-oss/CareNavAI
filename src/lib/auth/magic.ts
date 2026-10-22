import { randomUUID } from "node:crypto";
import type { DB } from "@/lib/db";
import { newToken, normaliseEmail, sha256 } from "./tokens";

/**
 * Magic links (AC-13.1, PRD §12.3): 32 random bytes, only the sha256 stored, single use, 15 minutes.
 */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export function createMagicLink(db: DB, email: string, now: number): string {
  const token = newToken();
  db.prepare("INSERT INTO magic_links (id, email, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)").run(
    randomUUID(),
    normaliseEmail(email),
    sha256(token),
    now + MAGIC_LINK_TTL_MS,
  );
  // Links that can no longer be used carry nothing worth keeping.
  db.prepare("DELETE FROM magic_links WHERE expires_at <= ?").run(now - MAGIC_LINK_TTL_MS);
  return token;
}

/** The email a valid, unused, unexpired link was sent to, or null. Does not use it up. */
export function peekMagicLink(db: DB, token: string, now: number): string | null {
  const row = db.prepare("SELECT email FROM magic_links WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(sha256(token), now) as
    | { email: string }
    | undefined;
  return row?.email ?? null;
}

/** Marks the link used. False if it was already used or has expired (so it can only ever succeed once). */
export function consumeMagicLink(db: DB, token: string, now: number): boolean {
  return db.prepare("UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").run(now, sha256(token), now).changes === 1;
}

/**
 * The local stand-in for email (AC-13.1): the plain link lives only in this process's memory, never on
 * disk or in a log, and is shown on /dev/inbox to localhost requests. Kept on globalThis so the route
 * handler and the page share one list in development.
 */
export type InboxItem = { to: string; link: string; sentAt: number; expiresAt: number };
const INBOX_SIZE = 20;
const store = globalThis as typeof globalThis & { __carenavDevInbox?: InboxItem[] };

export function deliverToDevInbox(item: InboxItem): void {
  const inbox = (store.__carenavDevInbox ??= []);
  inbox.unshift(item);
  inbox.length = Math.min(inbox.length, INBOX_SIZE);
}

export function devInbox(now = Date.now()): InboxItem[] {
  return (store.__carenavDevInbox ?? []).filter((i) => i.expiresAt > now);
}

export function magicLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/account/verify?token=${encodeURIComponent(token)}`;
}
