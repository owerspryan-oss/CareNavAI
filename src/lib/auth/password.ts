import { hash, verify } from "@node-rs/argon2";

/**
 * Passwords (AC-12.1): argon2id with the library's defaults (19 MiB, 2 passes), the OWASP baseline.
 * The plain text is never stored or logged; only the encoded hash reaches the database.
 */

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

// Verified against when there is no account (or no password), so a wrong email takes as long as a
// wrong password and the response time doesn't reveal which accounts exist.
let dummy: Promise<string> | undefined;

export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummy ??= hash("not-a-real-password-for-timing-only");
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}
