import { handler, json } from "@/lib/api/route";
import { languageUpdateSchema } from "@/lib/auth/account";
import { assertSecureTransport, currentUser } from "@/lib/auth/http";
import { setUserLanguage } from "@/lib/auth/users";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/account/language: the language picker and the chooser call this on every change. Signed
// in, it becomes the account's language; a guest gets { saved: false } and nothing is stored.
export const POST = handler("/api/account/language", languageUpdateSchema, async (body, _ctx, req) => {
  const user = currentUser(req);
  if (!user) return json({ saved: false });
  assertSecureTransport(req);
  setUserLanguage(db(), user.id, body.language);
  return json({ saved: true });
});
