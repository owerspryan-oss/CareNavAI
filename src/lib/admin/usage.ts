import { CAP_ALERTS, monthStartUtc, monthToDateGbp } from "@/lib/ai/cost";
import type { DB } from "@/lib/db";
import { dayStartUtc, SESSION_ENDPOINTS, sessionsSince } from "@/lib/limits/sessions";

/**
 * Admin usage report (FR-25, AC-15.3): counts and money only, read from the ledger and the safety
 * events. No table it reads holds user content (AC-25.2).
 */

const DAY = 86_400_000;
export const NON_CLEAR_LEVELS = ["emergency", "crisis", "urgent", "uncertain"] as const;
type Level = (typeof NON_CLEAR_LEVELS)[number];

export type DayRow = { date: string; sessions: number; costGbp: number; urgentEvents: Record<Level, number> };

export type UsageReport = {
  month: { spentGbp: number; capGbp: number; share: number; alert: 50 | 80 | 100 | null; sessions: number; avgCostPerSessionGbp: number | null };
  byRole: { role: string; costGbp: number; calls: number }[];
  days: DayRow[];
};

export function usageReport(database: DB, now: number, capGbp: number, days = 14): UsageReport {
  const spentGbp = monthToDateGbp(database, now);
  const share = capGbp > 0 ? spentGbp / capGbp : 1;
  const alert = share >= 1 ? 100 : share >= CAP_ALERTS[1] ? 80 : share >= CAP_ALERTS[0] ? 50 : null;
  const monthStart = monthStartUtc(now);
  const monthSessions = sessionsSince(database, monthStart);

  const byRole = database
    .prepare("SELECT role, COALESCE(SUM(est_cost_gbp), 0) AS costGbp, COUNT(*) AS calls FROM usage_ledger WHERE ts >= ? GROUP BY role ORDER BY costGbp DESC")
    .all(monthStart) as UsageReport["byRole"];

  const today = dayStartUtc(now);
  const rows: DayRow[] = [];
  for (let i = 0; i < days; i++) {
    const start = today - i * DAY;
    const end = start + DAY;
    const sessions = database
      .prepare(
        `SELECT COUNT(DISTINCT request_id) AS n FROM usage_ledger WHERE ts >= ? AND ts < ? AND role = 'DRAFT' AND endpoint IN (${SESSION_ENDPOINTS.map(() => "?").join(", ")})`,
      )
      .get(start, end, ...SESSION_ENDPOINTS) as { n: number };
    const cost = database.prepare("SELECT COALESCE(SUM(est_cost_gbp), 0) AS c FROM usage_ledger WHERE ts >= ? AND ts < ?").get(start, end) as { c: number };
    const events = database
      .prepare("SELECT level, COUNT(*) AS n FROM safety_events WHERE ts >= ? AND ts < ? AND level != 'clear' GROUP BY level")
      .all(start, end) as { level: Level; n: number }[];
    const urgentEvents = Object.fromEntries(NON_CLEAR_LEVELS.map((l) => [l, events.find((e) => e.level === l)?.n ?? 0])) as Record<Level, number>;
    rows.push({ date: new Date(start).toISOString().slice(0, 10), sessions: sessions.n, costGbp: cost.c, urgentEvents });
  }

  return {
    month: { spentGbp, capGbp, share, alert, sessions: monthSessions, avgCostPerSessionGbp: monthSessions ? spentGbp / monthSessions : null },
    byRole,
    days: rows,
  };
}
