import { magicVerifySchema, verifyMagicLink } from "@/lib/auth/account";
import { authRoute } from "@/lib/auth/http";
import { signedIn } from "@/lib/auth/respond";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/magic/verify (FR-13): single use, 15 minutes. Posted from /account/verify on a button
// press, so a link scanner opening the URL can't use the link up.
export const POST = authRoute("/api/auth/magic/verify", magicVerifySchema, async (body, _ctx, req) =>
  signedIn(req, verifyMagicLink(body, { db: db(), now: Date.now(), invitesRequired: env().PILOT_INVITE_REQUIRED })),
);
