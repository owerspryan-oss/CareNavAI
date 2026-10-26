import { handle, json } from "@/lib/api/route";
import { assertSecureTransport, currentUser } from "@/lib/auth/http";
import { publicUser } from "@/lib/auth/respond";

export const runtime = "nodejs";

// GET /api/auth/me: the signed-in account, or null.
export const GET = handle("/api/auth/me", async (req) => {
  assertSecureTransport(req);
  const user = currentUser(req);
  return json({ user: user ? publicUser(user) : null });
});
