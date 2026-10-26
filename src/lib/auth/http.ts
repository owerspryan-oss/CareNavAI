import type { z } from "zod";
import { handle, handler, HttpError, type Ctx } from "@/lib/api/route";
import { db as defaultDb } from "@/lib/db";
import { readCookie } from "@/lib/limits/rate";
import { isHttps, isLocalHost } from "@/lib/security/local";
import { readSession, SESSION_COOKIE, sessionCookie } from "./sessions";
import type { UserRow } from "./users";

/** Request-level auth helpers shared by the account routes (FR-12/13/14). */

export function isLocalRequest(req: Request): boolean {
  return isLocalHost(req.headers.get("host"));
}

/** The session cookie is Secure on everything but localhost, where the dev server is plain HTTP. */
export function secureCookies(req: Request): boolean {
  return !isLocalRequest(req);
}

/** AC-12.3: accounts work only over HTTPS, or on this machine. */
export function assertSecureTransport(req: Request): void {
  if (!isLocalRequest(req) && !isHttps(req)) throw new HttpError(403, "https_required");
}

export function sessionToken(req: Request): string | null {
  return readCookie(req, SESSION_COOKIE);
}

/** The signed-in user, or null. Never extends the session (for the generate routes' auto-save). */
export function currentUser(req: Request): UserRow | null {
  return readSession(defaultDb(), sessionToken(req), Date.now())?.user ?? null;
}

/** A JSON-posting account route: transport check, then the shared wrapper (rate limit, Zod, errors). */
export function authRoute<S extends z.ZodType>(route: string, schema: S, fn: (body: z.infer<S>, ctx: Ctx, req: Request) => Promise<Response>) {
  return handler(route, schema, (body, ctx, req) => {
    assertSecureTransport(req);
    return fn(body, ctx, req);
  });
}

/**
 * A route that needs a signed-in user (session auth): 401 when signed out. Each use slides the session
 * forward and re-sends the cookie when it did.
 */
export function signedInRoute(route: string, fn: (user: UserRow, req: Request, ctx: Ctx) => Promise<Response>) {
  return handle(route, async (req, ctx) => {
    assertSecureTransport(req);
    const token = sessionToken(req);
    const session = readSession(defaultDb(), token, Date.now(), { extend: true });
    if (!session || !token) throw new HttpError(401, "signed_out");
    const res = await fn(session.user, req, ctx);
    // A route that cleared the cookie (sign out, account delete) keeps it cleared.
    const setsSession = (res.headers.get("set-cookie") ?? "").includes(`${SESSION_COOKIE}=`);
    if (session.extended && !setsSession) res.headers.append("Set-Cookie", sessionCookie(token, secureCookies(req)));
    return res;
  });
}
