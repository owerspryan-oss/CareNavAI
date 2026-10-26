import { z } from "zod";
import { json } from "@/lib/api/route";
import { authRoute, secureCookies, sessionToken } from "@/lib/auth/http";
import { clearSessionCookie, destroySession } from "@/lib/auth/sessions";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/logout: ends this session on the server and clears the cookie.
export const POST = authRoute("/api/auth/logout", z.object({}).strict(), async (_body, _ctx, req) => {
  destroySession(db(), sessionToken(req));
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(secureCookies(req)));
  return res;
});
