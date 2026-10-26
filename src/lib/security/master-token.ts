import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Proof that an English master came from this server after a clear (or acknowledged) gate, so a
 * language change can re-derive it without re-screening or re-drafting (CLAUDE.md rules 1 and 5):
 * the server never translates English the client made up. The key lives only in this process
 * (on globalThis, shared by every route bundle); after a restart old tokens fail and the client
 * falls back to a full explanation.
 */
const store = globalThis as typeof globalThis & { __carenavMasterKey?: Buffer };
const key = () => (store.__carenavMasterKey ??= randomBytes(32));

/** `english` must be schema-parsed on both sides, so key order matches. */
const mac = (flow: string, english: unknown) => createHmac("sha256", key()).update(`${flow}\n${JSON.stringify(english)}`).digest();

export function signMaster(flow: "understand", english: unknown): string {
  return mac(flow, english).toString("base64url");
}

export function verifyMaster(flow: "understand", english: unknown, token: string): boolean {
  const expected = mac(flow, english);
  const given = Buffer.from(token, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
