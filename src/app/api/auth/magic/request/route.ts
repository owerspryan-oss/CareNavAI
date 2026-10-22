import { assertEmailRate, magicRequestSchema, requestMagicLink } from "@/lib/auth/account";
import { authRoute } from "@/lib/auth/http";
import { normaliseEmail } from "@/lib/auth/tokens";
import { deliverToDevInbox, MAGIC_LINK_TTL_MS, magicLinkUrl } from "@/lib/auth/magic";
import { json } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/auth/magic/request (FR-13): the same answer whether or not the email has an account.
// Locally the link goes to /dev/inbox (memory only); the pilot sends it by email.
export const POST = authRoute("/api/auth/magic/request", magicRequestSchema, async (body) => {
  const now = Date.now();
  assertEmailRate(db(), body.email, now);
  const token = requestMagicLink(body, { db: db(), now });
  deliverToDevInbox({ to: normaliseEmail(body.email), link: magicLinkUrl(env().PUBLIC_BASE_URL, token), sentAt: now, expiresAt: now + MAGIC_LINK_TTL_MS });
  return json({ ok: true });
});
