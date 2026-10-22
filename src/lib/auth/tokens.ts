import { createHash, randomBytes } from "node:crypto";

/** Hex sha256. Session ids, magic-link tokens and invite codes are stored only as this (PRD §12.3). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 32 random bytes, base64url: session ids and magic-link tokens. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Emails are compared and rate-limited lower-cased and trimmed. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
