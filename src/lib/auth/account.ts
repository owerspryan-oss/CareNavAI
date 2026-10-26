import { z } from "zod";
import { HttpError } from "@/lib/api/route";
import { isKnownLanguage } from "@/lib/config";
import type { DB } from "@/lib/db";
import { checkKeyLimit } from "@/lib/limits/rate";
import { consumeInvite } from "./invites";
import { createMagicLink, peekMagicLink, consumeMagicLink } from "./magic";
import { hashPassword, verifyPassword } from "./password";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./rules";
import { normaliseEmail, sha256 } from "./tokens";
import { createUser, findUserByEmail, type UserRow } from "./users";

/**
 * Account actions behind /api/auth/* (FR-12, FR-13, PRD §3.5, §12.3). Pure over a database and a clock,
 * so they are tested without HTTP. Errors are generic codes; the interface maps each to static copy.
 */

const email = z.email().max(254);
const inviteCode = z.string().trim().max(40).nullable().default(null);
/** A code from config/languages.json: the language the person reads the app in. */
export const languageCode = z.string().max(16).refine(isKnownLanguage);
const language = languageCode.nullable().default(null);

export const registerSchema = z.object({ email, password: z.string().max(MAX_PASSWORD_LENGTH), inviteCode, language });
export const loginSchema = z.object({ email, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) });
export const magicRequestSchema = z.object({ email });
export const magicVerifySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), inviteCode, language });
export const languageUpdateSchema = z.object({ language: languageCode });

/** Login and magic-link requests: 5 per email per 15 minutes, on top of the per-device limit (AC-12.2). */
export const EMAIL_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export function assertEmailRate(db: DB, address: string, now: number): void {
  if (!checkKeyLimit(`email:${sha256(normaliseEmail(address))}`, EMAIL_LIMIT.max, EMAIL_LIMIT.windowMs, { db, now })) {
    throw new HttpError(429, "rate_limited");
  }
}

export type AuthOpts = { db: DB; now: number; invitesRequired: boolean };

/** A parsed body whose language may be left out (callers that predate the language question). */
type WithLanguage<T> = Omit<T, "language"> & { language?: string | null };

export async function register(body: WithLanguage<z.infer<typeof registerSchema>>, { db, now, invitesRequired }: AuthOpts): Promise<UserRow> {
  if (body.password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, "password_too_short");
  // Hash first, whatever happens next, so an existing email doesn't answer faster.
  const passwordHash = await hashPassword(body.password);
  return db.transaction(() => {
    // Generic: the same answer whether the email has an account or the details are otherwise unusable.
    if (findUserByEmail(db, body.email)) throw new HttpError(409, "register_failed");
    if (invitesRequired && !consumeInvite(db, body.inviteCode, now)) throw new HttpError(400, "invite_invalid");
    return createUser(db, body.email, passwordHash, now, body.language ?? null);
  })();
}

export async function login(body: z.infer<typeof loginSchema>, { db }: Pick<AuthOpts, "db">): Promise<UserRow> {
  const user = findUserByEmail(db, body.email);
  // Always verify (against a dummy hash when there's no password), so timing says nothing either way.
  const ok = await verifyPassword(user?.password_hash ?? null, body.password);
  if (!user || !ok) throw new HttpError(401, "login_failed");
  return user;
}

/** Always succeeds the same way, whether or not the email has an account (no enumeration). Returns the token. */
export function requestMagicLink(body: z.infer<typeof magicRequestSchema>, { db, now }: Pick<AuthOpts, "db" | "now">): string {
  return createMagicLink(db, body.email, now);
}

/**
 * Uses a magic link: signs in, or creates the account if there isn't one (PRD §3.5). When invites are
 * required, a new account needs a valid code; asking for one does not use the link up, and a wrong
 * code rolls back so the link still works. A new account is asked for its language the same way
 * (`language_required`), before the invite.
 */
export function verifyMagicLink(body: WithLanguage<z.infer<typeof magicVerifySchema>>, { db, now, invitesRequired }: AuthOpts): UserRow {
  const address = peekMagicLink(db, body.token, now);
  if (!address) throw new HttpError(400, "link_invalid");
  const existing = findUserByEmail(db, address);
  if (!existing && !body.language) throw new HttpError(400, "language_required");
  if (!existing && invitesRequired && !body.inviteCode) throw new HttpError(400, "invite_required");
  return db.transaction(() => {
    if (!consumeMagicLink(db, body.token, now)) throw new HttpError(400, "link_invalid");
    if (existing) return existing;
    if (invitesRequired && !consumeInvite(db, body.inviteCode, now)) throw new HttpError(400, "invite_invalid");
    return createUser(db, address, null, now, body.language ?? null);
  })();
}
