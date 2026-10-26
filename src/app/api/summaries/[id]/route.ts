import { HttpError, json } from "@/lib/api/route";
import { signedInRoute } from "@/lib/auth/http";
import { db } from "@/lib/db";
import { dataKey, deleteSummary, getSummary } from "@/lib/summaries/store";

export const runtime = "nodejs";

const idFrom = (req: Request) => {
  const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "not_found");
  return id;
};

// GET /api/summaries/[id] (AC-14.3): one saved summary, decrypted, only for its owner.
export const GET = signedInRoute("/api/summaries/[id]", async (user, req) => {
  const key = dataKey();
  const found = key && getSummary(db(), key, user.id, idFrom(req));
  if (!found) throw new HttpError(404, "not_found");
  if (!found.result) throw new HttpError(409, "unreadable");
  return json({ summary: { ...found.meta, result: found.result } });
});

// DELETE /api/summaries/[id] (AC-14.3).
export const DELETE = signedInRoute("/api/summaries/[id]", async (user, req) => {
  if (!deleteSummary(db(), user.id, idFrom(req))) throw new HttpError(404, "not_found");
  return json({ ok: true });
});
