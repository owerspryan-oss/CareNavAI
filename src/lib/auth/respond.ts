import { json } from "@/lib/api/route";
import { db } from "@/lib/db";
import { uiLanguageCookie } from "@/lib/i18n/messages";
import { secureCookies } from "./http";
import { createSession, sessionCookie } from "./sessions";
import type { UserRow } from "./users";

/** What the browser learns about the signed-in account: its own email, when it was made, and its language. */
export function publicUser(user: UserRow): { email: string; createdAt: number; language: string | null } {
  return { email: user.email, createdAt: user.created_at, language: user.language };
}

/** Starts a session for `user` and answers with its cookie, plus the account's language as the interface language. */
export function signedIn(req: Request, user: UserRow): Response {
  const token = createSession(db(), user.id, Date.now());
  const res = json({ user: publicUser(user) });
  res.headers.append("Set-Cookie", sessionCookie(token, secureCookies(req)));
  if (user.language) res.headers.append("Set-Cookie", uiLanguageCookie(user.language, secureCookies(req)));
  return res;
}
