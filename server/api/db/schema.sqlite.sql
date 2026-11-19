-- Local development / tests only (DB_SQLITE_PATH): the same tables as schema.mysql.sql.
-- Created automatically when the SQLite file is new.

-- Schema 3.0 names (#319): the 2.x tables and columns renamed in place – run before the CREATE TABLEs below, each skipped
-- when its old name is gone (a new database creates the new names; Db::migrate)
ALTER TABLE spreads RENAME TO scenes;
ALTER TABLE scenes RENAME COLUMN title TO label;
ALTER TABLE entries RENAME COLUMN spread_id TO scene_id;
ALTER TABLE books RENAME COLUMN initial_spread_id TO initial_scene;

-- Schema 4.0 names (#320): the book becomes the experience – renamed in place like #319's, before the CREATE TABLEs,
-- each skipped when its old name (or its table) is gone. The printed book's data moves into the experience's JSON
-- (Db::migrate's data step, Migration4) and the `author` column goes at the end of this file
ALTER TABLE books RENAME TO experiences;
ALTER TABLE book_versions RENAME TO experience_versions;
ALTER TABLE scenes RENAME COLUMN book_id TO experience_id;
ALTER TABLE entries RENAME COLUMN book_id TO experience_id;
ALTER TABLE targets RENAME COLUMN book_id TO experience_id;
ALTER TABLE entities RENAME COLUMN book_id TO experience_id;
ALTER TABLE experience_versions RENAME COLUMN book_id TO experience_id;
ALTER TABLE changes RENAME COLUMN book_id TO experience_id;
ALTER TABLE assets RENAME COLUMN book_id TO experience_id;
ALTER TABLE plugins RENAME COLUMN book_id TO experience_id;
ALTER TABLE asset_credits RENAME COLUMN book_id TO experience_id;
ALTER TABLE asset_names RENAME COLUMN book_id TO experience_id;
ALTER TABLE surface_references RENAME COLUMN book_id TO experience_id;
ALTER TABLE progress RENAME COLUMN book_id TO experience_id;
ALTER TABLE page_images RENAME COLUMN book_id TO experience_id;
ALTER TABLE experiences RENAME COLUMN book_json TO experience_json;
ALTER TABLE users RENAME COLUMN book_updates TO experience_updates;
ALTER TABLE login_requests RENAME COLUMN book_updates TO experience_updates;

CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  experience_updates INTEGER NOT NULL DEFAULT 0,
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
  experience_updates INTEGER NOT NULL DEFAULT 0,
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
  experience_id TEXT NOT NULL,
  record TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, experience_id)
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
CREATE TABLE IF NOT EXISTS experiences (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  experience_json TEXT NOT NULL,
  initial_scene TEXT NOT NULL,
  assets_base TEXT NOT NULL DEFAULT '',
  files_json TEXT NOT NULL,
  content_schema TEXT NOT NULL,
  imported_hash TEXT NULL DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (experience_id, id)
);

CREATE TABLE IF NOT EXISTS entries (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  scene_id TEXT NULL DEFAULT NULL,
  position INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (experience_id, id)
);
CREATE INDEX IF NOT EXISTS entries_scene ON entries (experience_id, scene_id);

CREATE TABLE IF NOT EXISTS targets (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  image_src TEXT NOT NULL,
  entity_ref TEXT NULL DEFAULT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (experience_id, id)
);
CREATE INDEX IF NOT EXISTS targets_entry ON targets (experience_id, entry_id);

CREATE TABLE IF NOT EXISTS entities (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  position INTEGER NOT NULL,
  type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (experience_id, ref)
);

CREATE TABLE IF NOT EXISTS experience_versions (
  id TEXT NOT NULL PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  env TEXT NOT NULL,
  build TEXT NOT NULL,
  hash TEXT NOT NULL,
  published_by TEXT NULL DEFAULT NULL,
  published_at INTEGER NOT NULL,
  note TEXT NULL
);
CREATE INDEX IF NOT EXISTS experience_versions_experience ON experience_versions (experience_id, published_at);

CREATE TABLE IF NOT EXISTS changes (
  id TEXT NOT NULL PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  user_id TEXT NULL DEFAULT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  before_json TEXT NULL,
  after_json TEXT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_experience ON changes (experience_id, created_at);

-- The editor's assets (Assets.php): uploaded files, one row per upload in asset_versions
CREATE TABLE IF NOT EXISTS assets (
  id TEXT NOT NULL PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER NULL DEFAULT NULL,
  height INTEGER NULL DEFAULT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NULL DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_experience ON assets (experience_id, status, updated_at);

CREATE TABLE IF NOT EXISTS asset_versions (
  id TEXT NOT NULL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL,
  note TEXT NULL DEFAULT NULL,
  created_by TEXT NULL DEFAULT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS asset_versions_asset ON asset_versions (asset_id, version);

-- Roles (schema.mysql.sql has the notes)
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO roles (id, name, description) VALUES
  (1, 'reader', 'Every account'),
  (2, 'editor', 'May use the editor (/editor) and the editor API'),
  (3, 'admin', 'May use the admin page (/editor/admin) and the admin API');

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL,
  granted_by TEXT NULL DEFAULT NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS user_roles_role ON user_roles (role_id);

INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_at, granted_by)
  SELECT id, 1, strftime('%Y-%m-%d %H:%M:%S', 'now'), 'migration' FROM users;
INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_at, granted_by)
  SELECT id, 2, strftime('%Y-%m-%d %H:%M:%S', 'now'), 'migration' FROM users WHERE role = 'editor';

-- The editor's plugin sources (Plugins.php): the Code tab's TypeScript per plugin id; the compiled plugins an experience
-- declares come with the import (experiences.plugins_json)
CREATE TABLE IF NOT EXISTS plugins (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  source TEXT NOT NULL,
  created_by TEXT NULL DEFAULT NULL,
  updated_by TEXT NULL DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (experience_id, id)
);
ALTER TABLE experiences ADD COLUMN plugins_json TEXT NOT NULL DEFAULT '[]';

-- A video's duration (schema.mysql.sql has the notes)
ALTER TABLE assets ADD COLUMN duration_ms INTEGER NULL DEFAULT NULL;

-- AI connections' personal access tokens (schema.mysql.sql has the notes)
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NULL DEFAULT NULL,
  expires_at TEXT NULL DEFAULT NULL,
  revoked_at TEXT NULL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS api_tokens_user ON api_tokens (user_id);
ALTER TABLE changes ADD COLUMN token_name TEXT NULL DEFAULT NULL;

-- What the draft is based on (schema.mysql.sql has the notes)
ALTER TABLE experiences ADD COLUMN imported_json TEXT NULL DEFAULT NULL;

-- The onboarding belongs to the reader (schema.mysql.sql has the notes)
ALTER TABLE experiences DROP COLUMN tutorial_json;

-- Picture credits per file (schema.mysql.sql has the notes)
CREATE TABLE IF NOT EXISTS asset_credits (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  credits TEXT NOT NULL,
  updated_by TEXT NULL DEFAULT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (experience_id, url)
);

-- Library file names by use for imported files (schema.mysql.sql has the notes)
CREATE TABLE IF NOT EXISTS asset_names (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_by TEXT NULL DEFAULT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (experience_id, url)
);

-- Scenes (#307 phase 2): the experience's groups (schema.mysql.sql has the notes)
ALTER TABLE experiences ADD COLUMN groups_json TEXT NOT NULL DEFAULT '[]';

-- Reverts (#312, schema.mysql.sql has the notes)
ALTER TABLE changes ADD COLUMN change_set TEXT NULL DEFAULT NULL;
ALTER TABLE changes ADD COLUMN reverts TEXT NULL DEFAULT NULL;

-- Surface reference images (#314, schema.mysql.sql has the notes)
CREATE TABLE IF NOT EXISTS surface_references (
  experience_id TEXT NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  surface_id TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  fit TEXT NOT NULL DEFAULT 'cover',
  updated_by TEXT NULL DEFAULT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (experience_id, scene_id, surface_id)
);

-- Schema 3.0 cleanup (#319, every experience is migrated to 3.0): the 2.x page model's columns (RULES #25: the table
-- `page_images` stays, unread; an old database keeps its index `entries_spread` on the renamed column), the change
-- log's old kind and the behaviour rules' scene scope and event
ALTER TABLE scenes DROP COLUMN first_page;
ALTER TABLE scenes DROP COLUMN last_page;
ALTER TABLE entries DROP COLUMN page;
UPDATE changes SET kind = 'scene' WHERE kind = 'spread';
UPDATE entities SET data_json = REPLACE(REPLACE(data_json, '"scope":"spread"', '"scope":"scene"'), '"spreadChanged"', '"sceneChanged"') WHERE data_json LIKE '%spread%';
UPDATE targets SET data_json = REPLACE(REPLACE(data_json, '"scope":"spread"', '"scope":"scene"'), '"spreadChanged"', '"sceneChanged"') WHERE data_json LIKE '%spread%';
UPDATE scenes SET data_json = REPLACE(REPLACE(data_json, '"scope":"spread"', '"scope":"scene"'), '"spreadChanged"', '"sceneChanged"') WHERE data_json LIKE '%spread%';

-- Schema 4.0 cleanup (#320): the change log's old kind, and the `author` column – the author lives in
-- experience_json.book now (Migration4 moves it there from the JSON, which always held it; RULES #25: a removed
-- column by name)
UPDATE changes SET kind = 'experience' WHERE kind = 'book';
-- The old index names on renamed tables and columns: SQLite rebuilds them under the new names (MariaDB keeps the old
-- names, which no code uses)
DROP INDEX IF EXISTS book_versions_book;
DROP INDEX IF EXISTS changes_book;
DROP INDEX IF EXISTS assets_book;
ALTER TABLE experiences DROP COLUMN author;
