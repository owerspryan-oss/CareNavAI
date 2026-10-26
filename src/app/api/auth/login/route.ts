import { assertEmailRate, login, loginSchema } from "@/lib/auth/account";
import { authRoute } from "@/lib/auth/http";
import { signedIn } from "@/lib/auth/respond";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/login (FR-12): generic failure, rate limited per device and per email (AC-12.2).
export const POST = authRoute("/api/auth/login", loginSchema, async (body, _ctx, req) => {
  assertEmailRate(db(), body.email, Date.now());
  return signedIn(req, await login(body, { db: db() }));
});
