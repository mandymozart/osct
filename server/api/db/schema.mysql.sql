-- OSCT users (docs/server.md). MySQL 5.7+ / MariaDB 10.3+, utf8mb4.
-- Times are UTC, written by PHP (no NOW()) so the same queries run on SQLite for local development.
-- Changes after the first deploy are additive statements at the end of this file: `ALTER TABLE … ADD COLUMN`
-- runs only while the column is missing (Db::migrate), so the file can run on every deploy.

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  -- The update options (opt-in, off by default); the progress is always kept (can be reset)
  `book_updates` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'news about Onion Skin & Crocodile Tears',
  `artist_updates` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'news from Kévin Bray',
  `publisher_updates` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'news from Building Fictions',
  `created_at` DATETIME NOT NULL,
  -- Double opt-in: when the email address was confirmed (link or code)
  `confirmed_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One per "send me an email": the link token and the 6-digit code, stored as hashes only
CREATE TABLE IF NOT EXISTS `login_requests` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  `book_updates` TINYINT(1) NOT NULL DEFAULT 0,
  `artist_updates` TINYINT(1) NOT NULL DEFAULT 0,
  `publisher_updates` TINYINT(1) NOT NULL DEFAULT 0,
  `ip_hash` CHAR(64) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `login_requests_token` (`token_hash`),
  KEY `login_requests_email` (`email`, `created_at`),
  KEY `login_requests_ip` (`ip_hash`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A signed-in device: the app keeps the token, the server only its hash
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `last_used_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_token` (`token_hash`),
  KEY `sessions_user` (`user_id`),
  CONSTRAINT `sessions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The reader's progress record per book (client: types/history.ts ProgressRecord, as JSON)
CREATE TABLE IF NOT EXISTS `progress` (
  `user_id` CHAR(36) NOT NULL,
  `book_id` VARCHAR(64) NOT NULL,
  `record` MEDIUMTEXT NOT NULL,
  `updated_at` BIGINT NOT NULL COMMENT 'milliseconds since 1970 (UTC), compared by the app',
  PRIMARY KEY (`user_id`, `book_id`),
  CONSTRAINT `progress_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Failed password sign-ins, for the hourly limits (email and hashed IP)
CREATE TABLE IF NOT EXISTS `password_attempts` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `ip_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `password_attempts_email` (`email`, `created_at`),
  KEY `password_attempts_ip` (`ip_hash`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional password (PHP password_hash, bcrypt); NULL = sign-in by email only. The email always works too.
ALTER TABLE `users` ADD COLUMN `password_hash` VARCHAR(255) NULL DEFAULT NULL;

-- How the device signed in: `email` (link or code) or `password`
ALTER TABLE `sessions` ADD COLUMN `method` VARCHAR(16) NOT NULL DEFAULT 'email';

-- Who may use the editor API: `reader` (default) or `editor` (POST /admin/editors)
ALTER TABLE `users` ADD COLUMN `role` VARCHAR(16) NOT NULL DEFAULT 'reader';

-- The editor's data (docs/server.md "Editor data"): a game configuration imported into rows. Every row keeps the
-- imported object as JSON (data_json); the typed columns index it. Times in *_at BIGINT columns are milliseconds
-- since 1970 (UTC), as in progress.updated_at.
CREATE TABLE IF NOT EXISTS `books` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(255) NOT NULL,
  `book_json` TEXT NOT NULL COMMENT 'BookData',
  `tutorial_json` MEDIUMTEXT NOT NULL COMMENT 'StepData[]',
  `initial_spread_id` VARCHAR(64) NOT NULL,
  `assets_base` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT 'where /assets/content/… resolves; empty = as imported',
  `files_json` MEDIUMTEXT NOT NULL COMMENT 'files.json of the imported version',
  `content_schema` VARCHAR(16) NOT NULL COMMENT 'content schema MAJOR.MINOR of the import',
  `imported_hash` CHAR(64) NULL DEFAULT NULL COMMENT 'version.hash of the imported configuration',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `spreads` (
  `book_id` VARCHAR(64) NOT NULL,
  `id` VARCHAR(64) NOT NULL,
  `position` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `first_page` INT NOT NULL,
  `last_page` INT NOT NULL,
  `data_json` TEXT NOT NULL COMMENT 'SpreadData',
  PRIMARY KEY (`book_id`, `id`),
  CONSTRAINT `spreads_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- spread_id NULL: the entry's page is in no spread (kept and exported all the same)
CREATE TABLE IF NOT EXISTS `entries` (
  `book_id` VARCHAR(64) NOT NULL,
  `id` VARCHAR(64) NOT NULL,
  `spread_id` VARCHAR(64) NULL DEFAULT NULL,
  `position` INT NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `page` INT NOT NULL,
  `data_json` MEDIUMTEXT NOT NULL COMMENT 'EntryData without its target',
  PRIMARY KEY (`book_id`, `id`),
  KEY `entries_spread` (`book_id`, `spread_id`),
  CONSTRAINT `entries_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- entity_ref: the shared entity it points at; NULL = an inline entity (in data_json) or none
CREATE TABLE IF NOT EXISTS `targets` (
  `book_id` VARCHAR(64) NOT NULL,
  `id` VARCHAR(64) NOT NULL,
  `entry_id` VARCHAR(64) NOT NULL,
  `image_src` VARCHAR(1024) NOT NULL,
  `entity_ref` VARCHAR(64) NULL DEFAULT NULL,
  `data_json` MEDIUMTEXT NOT NULL COMMENT 'TargetData',
  PRIMARY KEY (`book_id`, `id`),
  KEY `targets_entry` (`book_id`, `entry_id`),
  CONSTRAINT `targets_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `entities` (
  `book_id` VARCHAR(64) NOT NULL,
  `ref` VARCHAR(64) NOT NULL,
  `position` INT NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `data_json` MEDIUMTEXT NOT NULL COMMENT 'EntityData',
  PRIMARY KEY (`book_id`, `ref`),
  CONSTRAINT `entities_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The publish log: one row per POST /editor/books/{id}/publish
CREATE TABLE IF NOT EXISTS `book_versions` (
  `id` CHAR(36) NOT NULL,
  `book_id` VARCHAR(64) NOT NULL,
  `env` VARCHAR(32) NOT NULL,
  `build` CHAR(12) NOT NULL,
  `hash` CHAR(64) NOT NULL,
  `published_by` CHAR(36) NULL DEFAULT NULL,
  `published_at` BIGINT NOT NULL,
  `note` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `book_versions_book` (`book_id`, `published_at`),
  CONSTRAINT `book_versions_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The change log: before and after of every edited entity (kind `entity`, ref) or target (kind `target`, ref = target id)
CREATE TABLE IF NOT EXISTS `changes` (
  `id` CHAR(36) NOT NULL,
  `book_id` VARCHAR(64) NOT NULL,
  `user_id` CHAR(36) NULL DEFAULT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `ref` VARCHAR(64) NOT NULL,
  `before_json` MEDIUMTEXT NULL,
  `after_json` MEDIUMTEXT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `changes_book` (`book_id`, `created_at`),
  CONSTRAINT `changes_book_fk` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The editor's assets (Assets.php): uploaded files, one row per upload in asset_versions
CREATE TABLE IF NOT EXISTS assets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  book_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,          -- the file name as uploaded
  kind VARCHAR(16) NOT NULL,           -- glb | gltf | video | image | audio (the contract's asset types)
  mime VARCHAR(64) NOT NULL,
  size BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  width INT NULL DEFAULT NULL,         -- images and videos (duration_ms: videos – added at the end of the file)
  height INT NULL DEFAULT NULL,
  version INT NOT NULL DEFAULT 1,      -- the current version
  path VARCHAR(255) NOT NULL,          -- in the store: <book>/<asset>/v<n>.<ext>
  url VARCHAR(512) NOT NULL,           -- the public URL the content names
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by CHAR(36) NULL DEFAULT NULL,
  created_at BIGINT NOT NULL,          -- ms since 1970 (UTC)
  updated_at BIGINT NOT NULL,
  INDEX assets_book (book_id, status, updated_at),
  CONSTRAINT assets_book_fk FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  asset_id CHAR(36) NOT NULL,
  version INT NOT NULL,
  path VARCHAR(255) NOT NULL,
  url VARCHAR(512) NOT NULL,
  size BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  note VARCHAR(255) NULL DEFAULT NULL,
  created_by CHAR(36) NULL DEFAULT NULL,
  created_at BIGINT NOT NULL,
  INDEX asset_versions_asset (asset_id, version),
  CONSTRAINT asset_versions_asset_fk FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles (docs/server.md "Roles", after SCUTOONS' roles tables): fixed ids; every account has reader, editor may use
-- the editor, admin the admin API. user_roles: who has which role, granted when (UTC) and by whom (granted_by:
-- signup | migration | config | secret | the granting admin's user id). users.role mirrors the editor role.
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT NOT NULL,
  `name` VARCHAR(32) NOT NULL,
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES
  (1, 'reader', 'Every account'),
  (2, 'editor', 'May use the editor (/editor) and the editor API'),
  (3, 'admin', 'May use the admin page (/editor/admin) and the admin API');

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` CHAR(36) NOT NULL,
  `role_id` INT NOT NULL,
  `granted_at` DATETIME NOT NULL,
  `granted_by` VARCHAR(64) NULL DEFAULT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `user_roles_role` (`role_id`),
  CONSTRAINT `user_roles_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_role_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill (runs on every deploy, adds only what is missing): every account is a reader, users.role = editor stays editor
INSERT IGNORE INTO `user_roles` (`user_id`, `role_id`, `granted_at`, `granted_by`)
  SELECT `id`, 1, UTC_TIMESTAMP(), 'migration' FROM `users`;
INSERT IGNORE INTO `user_roles` (`user_id`, `role_id`, `granted_at`, `granted_by`)
  SELECT `id`, 2, UTC_TIMESTAMP(), 'migration' FROM `users` WHERE `role` = 'editor';

-- The editor's plugin sources (Plugins.php): the Code tab's TypeScript per plugin id; the compiled plugins a book
-- declares come with the import (books.plugins_json)
CREATE TABLE IF NOT EXISTS plugins (
  book_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  source MEDIUMTEXT NOT NULL,
  created_by CHAR(36) NULL DEFAULT NULL,
  updated_by CHAR(36) NULL DEFAULT NULL,
  created_at BIGINT NOT NULL,          -- ms since 1970 (UTC)
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (book_id, id),
  CONSTRAINT plugins_book_fk FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `books` ADD COLUMN `plugins_json` TEXT NOT NULL DEFAULT '[]';

-- A video's duration as its file states it (Assets.php, VideoInfo.php); width / height hold its picture's size
ALTER TABLE `assets` ADD COLUMN `duration_ms` BIGINT NULL DEFAULT NULL;

-- AI connections' personal access tokens (ApiTokens.php, docs/server.md "AI connections"): the token `osct_…` is
-- shown once, only its SHA-256 hash is kept (like sessions); `token_prefix` = its first characters, to tell tokens apart
CREATE TABLE IF NOT EXISTS `api_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `token_prefix` VARCHAR(16) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `last_used_at` DATETIME NULL DEFAULT NULL,
  `expires_at` DATETIME NULL DEFAULT NULL,
  `revoked_at` DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_tokens_token` (`token_hash`),
  KEY `api_tokens_user` (`user_id`),
  CONSTRAINT `api_tokens_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- A save made through an AI connection names its token in the change log
ALTER TABLE `changes` ADD COLUMN `token_name` VARCHAR(80) NULL DEFAULT NULL;

-- What the draft is based on (Books::import): the imported build, its date, the app and schema version that built it,
-- where it came from, when and by whom – the import's version comparison reads it, and the change log after `at`
ALTER TABLE `books` ADD COLUMN `imported_json` TEXT NULL DEFAULT NULL;
