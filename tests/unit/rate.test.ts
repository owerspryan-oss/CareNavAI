import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "@/lib/db";
import { checkRate, DEVICE_COOKIE } from "@/lib/limits/rate";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

const NOW = Date.UTC(2026, 9, 21, 12, 0, 30);
const req = (cookie?: string) => new Request("http://x/api/screen", { headers: cookie ? { cookie } : {} });

describe("per-device rate limits (T-25)", () => {
  it("issues a device cookie on first use", () => {
    const r = checkRate(req(), { db, now: NOW, perMinute: 2, perDay: 10 });
    expect(r.ok).toBe(true);
    expect(r.setCookie).toMatch(new RegExp(`^${DEVICE_COOKIE}=[0-9a-f-]{36}; Path=/; HttpOnly; SameSite=Strict`));
  });

  it("limits per minute, then resets in the next window", () => {
    const c = `${DEVICE_COOKIE}=11111111-1111-1111-1111-111111111111`;
    const run = (now: number) => checkRate(req(c), { db, now, perMinute: 2, perDay: 10 }).ok;
    expect([run(NOW), run(NOW), run(NOW)]).toEqual([true, true, false]);
    expect(run(NOW + 60_000)).toBe(true);
  });

  it("limits per day", () => {
    const c = `${DEVICE_COOKIE}=22222222-2222-2222-2222-222222222222`;
    const results = Array.from({ length: 4 }, (_, i) => checkRate(req(c), { db, now: NOW + i * 60_000, perMinute: 5, perDay: 3 }).ok);
    expect(results).toEqual([true, true, true, false]);
  });

  it("stores only a hash of the device id", () => {
    const id = "33333333-3333-3333-3333-333333333333";
    checkRate(req(`${DEVICE_COOKIE}=${id}`), { db, now: NOW });
    expect(JSON.stringify(db.prepare("SELECT * FROM rate_limits").all())).not.toContain(id);
  });
});
