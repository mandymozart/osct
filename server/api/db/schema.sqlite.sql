-- Local development / tests only (DB_SQLITE_PATH): the same tables as schema.mysql.sql.
-- Created automatically when the SQLite file is new.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  book_updates INTEGER NOT NULL DEFAULT 1,
  publisher_updates INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_requests (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  book_updates INTEGER NOT NULL DEFAULT 1,
  publisher_updates INTEGER NOT NULL DEFAULT 1,
  ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS login_requests_email ON login_requests (email, created_at);
CREATE INDEX IF NOT EXISTS login_requests_ip ON login_requests (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account_id);

CREATE TABLE IF NOT EXISTS progress (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  record TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, book_id)
);
