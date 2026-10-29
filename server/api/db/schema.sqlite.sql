-- Local development / tests only (DB_SQLITE_PATH): the same tables as schema.mysql.sql.
-- Created automatically when the SQLite file is new.

CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  book_updates INTEGER NOT NULL DEFAULT 0,
  artist_updates INTEGER NOT NULL DEFAULT 0,
  publisher_updates INTEGER NOT NULL DEFAULT 0,
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
  book_updates INTEGER NOT NULL DEFAULT 0,
  artist_updates INTEGER NOT NULL DEFAULT 0,
  publisher_updates INTEGER NOT NULL DEFAULT 0,
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
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  book_id TEXT NOT NULL,
  record TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS password_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS password_attempts_email ON password_attempts (email, created_at);
CREATE INDEX IF NOT EXISTS password_attempts_ip ON password_attempts (ip_hash, created_at);

ALTER TABLE users ADD COLUMN password_hash TEXT NULL DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN method TEXT NOT NULL DEFAULT 'email';
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'reader';

-- The editor's data (schema.mysql.sql has the column notes)
CREATE TABLE IF NOT EXISTS books (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  book_json TEXT NOT NULL,
  tutorial_json TEXT NOT NULL,
  initial_spread_id TEXT NOT NULL,
  assets_base TEXT NOT NULL DEFAULT '',
  files_json TEXT NOT NULL,
  content_schema TEXT NOT NULL,
  imported_hash TEXT NULL DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spreads (
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  first_page INTEGER NOT NULL,
  last_page INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (book_id, id)
);

CREATE TABLE IF NOT EXISTS entries (
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  spread_id TEXT NULL DEFAULT NULL,
  position INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  page INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (book_id, id)
);
CREATE INDEX IF NOT EXISTS entries_spread ON entries (book_id, spread_id);

CREATE TABLE IF NOT EXISTS targets (
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  image_src TEXT NOT NULL,
  entity_ref TEXT NULL DEFAULT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (book_id, id)
);
CREATE INDEX IF NOT EXISTS targets_entry ON targets (book_id, entry_id);

CREATE TABLE IF NOT EXISTS entities (
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  position INTEGER NOT NULL,
  type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (book_id, ref)
);

CREATE TABLE IF NOT EXISTS book_versions (
  id TEXT NOT NULL PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  env TEXT NOT NULL,
  build TEXT NOT NULL,
  hash TEXT NOT NULL,
  published_by TEXT NULL DEFAULT NULL,
  published_at INTEGER NOT NULL,
  note TEXT NULL
);
CREATE INDEX IF NOT EXISTS book_versions_book ON book_versions (book_id, published_at);

CREATE TABLE IF NOT EXISTS changes (
  id TEXT NOT NULL PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  user_id TEXT NULL DEFAULT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  before_json TEXT NULL,
  after_json TEXT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_book ON changes (book_id, created_at);
