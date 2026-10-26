// Create a pilot invite code (FR-12, AC-12.4): `npm run invite:create [-- --uses 5 --days 14]`.
//
// Prints the code once. Only its sha256 is stored (in `invites`, with a use limit and an expiry), so a
// lost code can't be shown again: make a new one. Registration asks for a code only when
// PILOT_INVITE_REQUIRED=true. Reads DATABASE_PATH from .env.local if set (default data/carenav.sqlite).

import { createHash, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";

const { values } = parseArgs({ options: { uses: { type: "string", default: "1" }, days: { type: "string", default: "30" } } });
const uses = Number(values.uses);
const days = Number(values.days);
if (!Number.isInteger(uses) || uses < 1 || !Number.isFinite(days) || days < 0) {
  console.error("Usage: npm run invite:create -- [--uses N (default 1)] [--days D (default 30; 0 = never expires)]");
  process.exit(1);
}

// Same alphabet and normalisation as src/lib/auth/invites.ts (no 0/O, 1/I/L; dashes and case ignored).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const raw = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = raw.match(/.{4}/g).join("-");
const codeHash = createHash("sha256").update(raw).digest("hex");

const file = process.env.DATABASE_PATH || "data/carenav.sqlite";
mkdirSync(dirname(file), { recursive: true });
const db = new Database(file);
db.pragma("foreign_keys = ON");

// Apply any pending migration, the same way src/lib/db/index.ts does, so this works before first run.
const dir = fileURLToPath(new URL("../src/lib/db/migrations/", import.meta.url));
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
const done = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((r) => r.name));
for (const name of readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f) && !done.has(f)).sort()) {
  db.transaction(() => {
    db.exec(readFileSync(join(dir, name), "utf8"));
    db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(name, Date.now());
  })();
}

const expiresAt = days === 0 ? null : Date.now() + days * 86_400_000;
db.prepare("INSERT INTO invites (code_hash, max_uses, used, expires_at) VALUES (?, ?, 0, ?)").run(codeHash, uses, expiresAt);
db.close();

console.log(`Invite code: ${code}`);
console.log(`Uses: ${uses}. ${expiresAt ? `Expires: ${new Date(expiresAt).toISOString().slice(0, 10)}.` : "Never expires."}`);
console.log("This code is shown once; only its hash is stored.");
