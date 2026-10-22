import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usageReport } from "@/lib/admin/usage";
import { writeLedger } from "@/lib/ai/cost";
import { openDb, type DB } from "@/lib/db";
import { dayStartUtc, sessionsSince } from "@/lib/limits/sessions";
import { log } from "@/lib/log/logger";

// T-25 / FR-15, FR-25: ledger, cap alerts, sessions, admin report.

const NOW = Date.UTC(2026, 9, 22, 12);
let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

const row = (over: Partial<Parameters<typeof writeLedger>[1]> = {}) => ({
  ts: NOW,
  endpoint: "/api/summary",
  role: "DRAFT",
  model: "m",
  tokensIn: 10,
  tokensOut: 10,
  estCostGbp: 1,
  requestId: "r1",
  ...over,
});

describe("cap alerts (AC-15.3)", () => {
  it("warns once at 50%, 80% and the cap, as spend crosses each", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (const cost of [4, 0.5, 1, 2, 0.5, 1, 1, 1]) writeLedger(db, row({ estCostGbp: cost }), 10);
    expect(warn.mock.calls.map((c) => (c[0] as { status: string }).status)).toEqual(["cap_alert_50", "cap_alert_80", "cap_reached"]);
    for (const [fields] of warn.mock.calls) expect(Object.keys(fields as object).sort()).toEqual(["requestId", "route", "status"]);
  });

  it("records audio seconds for speech to text (AC-15.1)", () => {
    writeLedger(db, row({ role: "STT", endpoint: "/api/transcribe", audioSeconds: 42 }), 10);
    expect(db.prepare("SELECT audio_seconds FROM usage_ledger").get()).toEqual({ audio_seconds: 42 });
  });
});

describe("sessions (AC-15.4)", () => {
  it("counts one per summary or explanation that reached generation, not other calls", () => {
    writeLedger(db, row({ requestId: "a" }), 100);
    writeLedger(db, row({ requestId: "a", role: "TRANSLATE" }), 100); // same session, derive call
    writeLedger(db, row({ requestId: "b", endpoint: "/api/explain" }), 100);
    writeLedger(db, row({ requestId: "c", endpoint: "/api/screen", role: "GATE" }), 100);
    writeLedger(db, row({ requestId: "d", endpoint: "/api/followups" }), 100);
    writeLedger(db, row({ requestId: "e", ts: NOW - 86_400_000 }), 100); // yesterday
    expect(sessionsSince(db, dayStartUtc(NOW))).toBe(2);
  });
});

describe("admin usage report (FR-25)", () => {
  it("shows spend against the cap, sessions, average cost and urgent events per day", () => {
    writeLedger(db, row({ requestId: "a", estCostGbp: 30 }), 50);
    writeLedger(db, row({ requestId: "b", estCostGbp: 12 }), 50);
    db.prepare("INSERT INTO safety_events (ts, step, level, layer_flags, language, mode) VALUES (?, 'step_text', 'emergency', 'rules', 'en', 'continue_after_ack')").run(NOW);
    db.prepare("INSERT INTO safety_events (ts, step, level, layer_flags, language, mode) VALUES (?, 'step_text', 'clear', '', 'en', 'continue_after_ack')").run(NOW);
    const r = usageReport(db, NOW, 50);
    expect(r.month).toMatchObject({ spentGbp: 42, capGbp: 50, alert: 80, sessions: 2, avgCostPerSessionGbp: 21 });
    expect(r.days[0]).toMatchObject({ date: "2026-10-22", sessions: 2, costGbp: 42, urgentEvents: { emergency: 1, crisis: 0, urgent: 0, uncertain: 0 } });
    expect(r.days).toHaveLength(14);
    expect(JSON.stringify(r)).not.toMatch(/knee|text|quote/i);
  });

  it("has no alert under half the cap, and none for an empty month", () => {
    expect(usageReport(db, NOW, 50).month).toMatchObject({ spentGbp: 0, alert: null, avgCostPerSessionGbp: null });
  });
});
