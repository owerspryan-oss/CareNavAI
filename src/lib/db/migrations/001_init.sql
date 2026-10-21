-- CareNav AI initial schema (PRD §12.2, CONTEXT.md §7).
-- No table stores user content except summaries.payload_enc (AES-256-GCM, registered users only).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,                      -- null for magic-link-only accounts
  created_at    INTEGER NOT NULL
);

CREATE TABLE magic_links (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE sessions (
  id_hash    TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  code_hash  TEXT PRIMARY KEY,
  max_uses   INTEGER NOT NULL DEFAULT 1,
  used       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER
);

CREATE TABLE summaries (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flow              TEXT NOT NULL CHECK (flow IN ('prepare', 'understand')),
  for_whom_label    TEXT NOT NULL,
  is_child          INTEGER NOT NULL DEFAULT 0 CHECK (is_child IN (0, 1)),
  language_detected TEXT NOT NULL,
  language_output   TEXT NOT NULL,
  payload_enc       BLOB NOT NULL,
  iv                BLOB NOT NULL,
  tag               BLOB NOT NULL,
  key_version       INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX summaries_user ON summaries(user_id);

CREATE TABLE usage_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  endpoint      TEXT NOT NULL,
  role          TEXT NOT NULL,
  model         TEXT NOT NULL,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  audio_seconds REAL NOT NULL DEFAULT 0,
  images        INTEGER NOT NULL DEFAULT 0,
  est_cost_gbp  REAL NOT NULL DEFAULT 0,
  request_id    TEXT
);
CREATE INDEX usage_ledger_ts ON usage_ledger(ts);

CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE safety_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  step        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('emergency', 'urgent', 'crisis', 'uncertain', 'clear')),
  layer_flags TEXT NOT NULL,               -- comma-separated layer names that fired or failed
  language    TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('continue_after_ack', 'locked'))
);
CREATE INDEX safety_events_ts ON safety_events(ts);

CREATE TABLE feedback_user (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  flow     TEXT NOT NULL,
  language TEXT NOT NULL,
  q1       TEXT,
  q2       TEXT
);

CREATE TABLE pdf_exports (
  ref           TEXT PRIMARY KEY,
  ts            INTEGER NOT NULL,
  flow          TEXT NOT NULL,
  language_pair TEXT NOT NULL
);

CREATE TABLE clinician_feedback (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  ref                   TEXT NOT NULL REFERENCES pdf_exports(ref),
  ts                    INTEGER NOT NULL,
  useful                TEXT,
  missing_or_misleading TEXT,
  comment               TEXT CHECK (comment IS NULL OR length(comment) <= 500)
);
