import { signedInRoute } from "@/lib/auth/http";
import { db } from "@/lib/db";
import { dataKey, exportAccount } from "@/lib/summaries/store";

export const runtime = "nodejs";

// POST /api/account/export (AC-14.4, PRD §12.5): one readable JSON file of the account and its summaries.
export const POST = signedInRoute("/api/account/export", async (user) => {
  const body = JSON.stringify(exportAccount(db(), dataKey(), user, Date.now()), null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="carenav-ai-export.json"',
      "Cache-Control": "no-store",
    },
  });
});
