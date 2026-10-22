import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { isLocalHost } from "@/lib/security/local";
import { readSession, SESSION_COOKIE } from "./sessions";
import type { UserRow } from "./users";

/** The signed-in user for a server-rendered page, or null. Pages only read; API calls slide the session. */
export async function pageUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  return readSession(db(), token, Date.now())?.user ?? null;
}

/** True when the page was requested on this machine (local-only pages, the dev inbox hint). */
export async function pageIsLocal(): Promise<boolean> {
  return isLocalHost((await headers()).get("host"));
}
