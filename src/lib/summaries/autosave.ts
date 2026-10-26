import type { AgeBand } from "@/lib/ai/schemas";
import type { ExplainResponse, SummaryResponse } from "@/lib/ai/pipeline/journeys";
import { currentUser } from "@/lib/auth/http";
import { db } from "@/lib/db";
import { log } from "@/lib/log/logger";
import type { SaveStatus } from "./status";
import { dataKey, savedResultSchema, saveSummary, type ForWhom } from "./store";


type Who = { forWhom: ForWhom; ageBand: AgeBand | null };

/**
 * AC-14.1: after a generated result, a signed-in person's copy is saved automatically. Urgent outcomes
 * are never saved. Saving never blocks or fails the response: on any error the result goes back as
 * normal, marked `saved: "failed"` for a quiet note. Guests are untouched (nothing read, nothing written).
 */
export function autoSave<R extends SummaryResponse | ExplainResponse>(
  req: Request,
  flow: "prepare" | "understand",
  res: R,
  who: Who,
  ctx: { requestId: string; route: string },
): R | (R & { saved: SaveStatus }) {
  if (res.kind !== "result") return res;
  try {
    const user = currentUser(req);
    if (!user) return res;
    const key = dataKey();
    if (!key) return { ...res, saved: "off" };
    const { english, user: userVersion, userFallback } = res;
    // Exactly what the person receives (bar `kind`), checked against the result schemas before sealing.
    const saved = savedResultSchema.parse({ flow, english, user: userVersion, userFallback });
    saveSummary(db(), key, user.id, saved, who, Date.now());
    return { ...res, saved: "saved" };
  } catch {
    log.error({ requestId: ctx.requestId, route: ctx.route, errorType: "save_failed" });
    // A signed-in person is told quietly; if even the session couldn't be read, they're told the same.
    return { ...res, saved: "failed" };
  }
}
