import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "@/lib/config/env";

export type DB = Database.Database;

const MIGRATIONS_DIR = path.join(process.cwd(), "src/lib/db/migrations");

/** Applies any `NNN_*.sql` migration not yet recorded, each in its own transaction. Returns the names applied. */
export function migrate(db: DB, dir = MIGRATIONS_DIR): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const done = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((r) => (r as { name: string }).name),
  );
  const pending = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !done.has(f))
    .sort();
  const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file, Date.now());
    })();
  }
  return pending;
}

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

let instance: DB | undefined;

export function db(): DB {
  instance ??= openDb(env().DATABASE_PATH);
  return instance;
}
