import { createHash, randomUUID } from "node:crypto";
import { env } from "@/lib/config/env";
import { db as defaultDb, type DB } from "@/lib/db";

/**
 * Per-device rate limits (FR-15, T-25). A device is a random cookie; only its hash is stored,
 * never an IP address. Fixed windows per minute and per day in `rate_limits`.
 */
export const DEVICE_COOKIE = "cn_dev";
const MINUTE = 60_000;
const DAY = 86_400_000;

export type RateCheck = { ok: boolean; setCookie: string | null };

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

function bump(database: DB, key: string, windowStart: number): number {
  database
    .prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1")
    .run(key, windowStart);
  return (database.prepare("SELECT count FROM rate_limits WHERE key = ? AND window_start = ?").get(key, windowStart) as { count: number }).count;
}

export function checkRate(
  req: Request,
  opts: { now?: number; db?: DB; perMinute?: number; perDay?: number } = {},
): RateCheck {
  const now = opts.now ?? Date.now();
  const database = opts.db ?? defaultDb();
  let device = readCookie(req, DEVICE_COOKIE);
  let setCookie: string | null = null;
  if (!device || !/^[0-9a-f-]{36}$/.test(device)) {
    device = randomUUID();
    setCookie = `${DEVICE_COOKIE}=${device}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`;
  }
  const key = createHash("sha256").update(device).digest("hex");
  const perMinute = opts.perMinute ?? env().RATE_LIMIT_PER_MINUTE;
  const perDay = opts.perDay ?? env().RATE_LIMIT_PER_DAY;
  const minuteCount = bump(database, `m:${key}`, now - (now % MINUTE));
  const dayCount = bump(database, `d:${key}`, now - (now % DAY));
  // Old windows are pruned opportunistically so the table stays small.
  if (Math.random() < 0.01) database.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now - 2 * DAY);
  return { ok: minuteCount <= perMinute && dayCount <= perDay, setCookie };
}
