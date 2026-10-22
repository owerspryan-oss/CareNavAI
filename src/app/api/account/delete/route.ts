import { z } from "zod";
import { HttpError, json } from "@/lib/api/route";
import { secureCookies, signedInRoute } from "@/lib/auth/http";
import { clearSessionCookie } from "@/lib/auth/sessions";
import { deleteAccount } from "@/lib/auth/users";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const confirmSchema = z.object({ confirm: z.literal(true) }).strict();

// POST /api/account/delete (AC-14.4, PRD §12.5): one action removes the user, sessions, magic links and
// summaries, then clears the cookie. The body must say { confirm: true }.
export const POST = signedInRoute("/api/account/delete", async (user, req) => {
  const body: unknown = await req.json().catch(() => null);
  if (!confirmSchema.safeParse(body).success) throw new HttpError(400, "invalid_request");
  deleteAccount(db(), user.id);
  const res = json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(secureCookies(req)));
  return res;
});
