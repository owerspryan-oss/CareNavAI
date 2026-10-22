import { json } from "@/lib/api/route";
import { db } from "@/lib/db";
import { secureCookies } from "./http";
import { createSession, sessionCookie } from "./sessions";
import type { UserRow } from "./users";

/** What the browser learns about the signed-in account: its own email and when it was made. */
export function publicUser(user: UserRow): { email: string; createdAt: number } {
  return { email: user.email, createdAt: user.created_at };
}

/** Starts a session for `user` and answers with its cookie. */
export function signedIn(req: Request, user: UserRow): Response {
  const token = createSession(db(), user.id, Date.now());
  const res = json({ user: publicUser(user) });
  res.headers.append("Set-Cookie", sessionCookie(token, secureCookies(req)));
  return res;
}
