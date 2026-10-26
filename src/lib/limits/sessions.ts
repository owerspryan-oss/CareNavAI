import { AiError, type AiDeps } from "@/lib/ai/client";
import { env } from "@/lib/config/env";
import { db as defaultDb, type DB } from "@/lib/db";

/**
 * Daily session cap (FR-15, AC-15.4). A session is one journey's result: one /api/summary or
 * /api/explain request that reached generation (its English-master DRAFT call is in the ledger).
 * Days are UTC. Checked after the gate, so urgent messages keep working when the cap is hit (AC-15.2).
 */
export const SESSION_ENDPOINTS = ["/api/summary", "/api/explain"] as const;

export function dayStartUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function sessionsSince(database: DB, since: number): number {
  const row = database
    .prepare(
      `SELECT COUNT(DISTINCT request_id) AS n FROM usage_ledger
       WHERE ts >= ? AND role = 'DRAFT' AND endpoint IN (${SESSION_ENDPOINTS.map(() => "?").join(", ")})`,
    )
    .get(since, ...SESSION_ENDPOINTS) as { n: number };
  return row.n;
}

/** Throws `cap_reached` (a friendly "busy" to the person) once today's sessions reach DAILY_SESSION_CAP. */
export function assertSessionAvailable(deps: AiDeps = {}): void {
  const database = deps.db ?? defaultDb();
  const now = (deps.now ?? Date.now)();
  if (sessionsSince(database, dayStartUtc(now)) >= env().DAILY_SESSION_CAP) throw new AiError("cap_reached");
}
