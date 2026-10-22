import { register, registerSchema } from "@/lib/auth/account";
import { authRoute } from "@/lib/auth/http";
import { signedIn } from "@/lib/auth/respond";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/register (FR-12): email + password (+ invite code when PILOT_INVITE_REQUIRED).
export const POST = authRoute("/api/auth/register", registerSchema, async (body, _ctx, req) =>
  signedIn(req, await register(body, { db: db(), now: Date.now(), invitesRequired: env().PILOT_INVITE_REQUIRED })),
);
