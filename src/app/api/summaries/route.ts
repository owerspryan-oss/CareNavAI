import { json } from "@/lib/api/route";
import { signedInRoute } from "@/lib/auth/http";
import { db } from "@/lib/db";
import { dataKey, listSummaries } from "@/lib/summaries/store";

export const runtime = "nodejs";

// GET /api/summaries (FR-14, AC-14.3): the signed-in user's saved summaries, metadata only, newest first.
export const GET = signedInRoute("/api/summaries", async (user) => json({ saving: dataKey() !== null, summaries: listSummaries(db(), user.id) }));
