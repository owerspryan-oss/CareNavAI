import { afterEach, describe, expect, it } from "vitest";
import { migrate, openDb, type DB } from "@/lib/db";

const TABLES = [
  "clinician_feedback",
  "feedback_user",
  "invites",
  "magic_links",
  "pdf_exports",
  "rate_limits",
  "safety_events",
  "sessions",
  "summaries",
  "usage_ledger",
  "users",
];

let db: DB;
afterEach(() => db?.close());

describe("migrations", () => {
  it("create every PRD §12.2 table", () => {
    db = openDb(":memory:");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'")
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();
    expect(names).toEqual(TABLES);
  });

  it("are idempotent", () => {
    db = openDb(":memory:");
    expect(migrate(db)).toEqual([]);
  });

  it("cascade a user delete to sessions and summaries (FR-14 one-action delete)", () => {
    db = openDb(":memory:");
    db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.test', 0)").run();
    db.prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ('h', 'u1', 0)").run();
    db.prepare(
      `INSERT INTO summaries (id, user_id, flow, for_whom_label, language_detected, language_output, payload_enc, iv, tag, key_version, created_at)
       VALUES ('s1', 'u1', 'prepare', 'Me', 'en', 'en', x'00', x'00', x'00', 1, 0)`,
    ).run();
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(db.prepare("SELECT count(*) n FROM sessions").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) n FROM summaries").get()).toEqual({ n: 0 });
  });

  it("refuse an unknown safety level", () => {
    db = openDb(":memory:");
    expect(() =>
      db
        .prepare("INSERT INTO safety_events (ts, step, level, layer_flags, language, mode) VALUES (0, 's', 'fine', '', 'en', 'locked')")
        .run(),
    ).toThrow(/CHECK/);
  });
});
