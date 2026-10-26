import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM (PRD §12.4, AC-14.2): a fresh 12-byte IV per record, a 16-byte tag, and associated data
 * that binds a ciphertext to its row so it can't be moved to another one.
 */
export type Sealed = { ciphertext: Buffer; iv: Buffer; tag: Buffer };

export function seal(plaintext: Buffer, key: Buffer, aad: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

/** Throws if the key, IV, tag or associated data don't match (tampering or the wrong key). */
export function open(sealed: Sealed, key: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}
