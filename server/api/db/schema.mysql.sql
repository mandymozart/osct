-- OSCT users (docs/server.md). MySQL 5.7+ / MariaDB 10.3+, utf8mb4.
-- Times are UTC, written by PHP (no NOW()) so the same queries run on SQLite for local development.
-- Changes after the first deploy are additive statements at the end of this file: `ALTER TABLE … ADD COLUMN`
-- runs only while the column is missing (Db::migrate), so the file can run on every deploy.

-- Schema 3.0 names (#319): the 2.x tables and columns renamed in place – run before the CREATE TABLEs below, each skipped
-- when its old name is gone (a new database creates the new names; Db::migrate)
ALTER TABLE `spreads` RENAME TO `scenes`;
ALTER TABLE `scenes` RENAME COLUMN `title` TO `label`;
ALTER TABLE `entries` RENAME COLUMN `spread_id` TO `scene_id`;
ALTER TABLE `books` RENAME COLUMN `initial_spread_id` TO `initial_scene`;

-- Schema 4.0 names (#320): the book becomes the experience – renamed in place like #319's, before the CREATE TABLEs,
-- each skipped when its old name (or its table) is gone. The printed book's data moves into the experience's JSON
-- (Db::migrate's data step, Migration4) and the `author` column goes at the end of this file
ALTER TABLE `books` RENAME TO `experiences`;
ALTER TABLE `book_versions` RENAME TO `experience_versions`;
ALTER TABLE `scenes` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `entries` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `targets` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `entities` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `experience_versions` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `changes` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `assets` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `plugins` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `asset_credits` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `asset_names` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `surface_references` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `progress` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `page_images` RENAME COLUMN `book_id` TO `experience_id`;
ALTER TABLE `experiences` RENAME COLUMN `book_json` TO `experience_json`;
ALTER TABLE `users` RENAME COLUMN `book_updates` TO `experience_updates`;
ALTER TABLE `login_requests` RENAME COLUMN `book_updates` TO `experience_updates`;

-- One update option (#325): news from Building Fictions. Db::migrate first turns it on wherever any of the three old
-- options was on (Db::mergeUpdateOptions), then the publisher's column takes the new name and the other two go
ALTER TABLE `users` RENAME COLUMN `publisher_updates` TO `buildingfictions_updates`;
ALTER TABLE `login_requests` RENAME COLUMN `publisher_updates` TO `buildingfictions_updates`;
ALTER TABLE `users` DROP COLUMN `experience_updates`;
ALTER TABLE `users` DROP COLUMN `artist_updates`;
ALTER TABLE `login_requests` DROP COLUMN `experience_updates`;
ALTER TABLE `login_requests` DROP COLUMN `artist_updates`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `language` VARCHAR(8) NOT NULL DEFAULT 'en',
  -- The one update option (opt-in, off by default, #325); the progress is always kept (can be reset)
  `buildingfictions_updates` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'news from Building Fictions',
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
  `buildingfictions_updates` TINYINT(1) NOT NULL DEFAULT 0,
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

-- The reader's progress record per experience (client: types/history.ts ProgressRecord, as JSON)
CREATE TABLE IF NOT EXISTS `progress` (
  `user_id` CHAR(36) NOT NULL,
  `experience_id` VARCHAR(64) NOT NULL,
  `record` MEDIUMTEXT NOT NULL,
  `updated_at` BIGINT NOT NULL COMMENT 'milliseconds since 1970 (UTC), compared by the app',
  PRIMARY KEY (`user_id`, `experience_id`),
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
CREATE TABLE IF NOT EXISTS `experiences` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `experience_json` TEXT NOT NULL COMMENT 'ExperienceData',
  `initial_scene` VARCHAR(64) NOT NULL,
  `assets_base` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT 'where /assets/content/… resolves; empty = as imported',
  `files_json` MEDIUMTEXT NOT NULL COMMENT 'files.json of the imported version',
  `content_schema` VARCHAR(16) NOT NULL COMMENT 'content schema MAJOR.MINOR of the import',
  `imported_hash` CHAR(64) NULL DEFAULT NULL COMMENT 'version.hash of the imported configuration',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scenes` (
  `experience_id` VARCHAR(64) NOT NULL,
  `id` VARCHAR(64) NOT NULL,
  `position` INT NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `data_json` TEXT NOT NULL COMMENT 'SceneData',
  PRIMARY KEY (`experience_id`, `id`),
  CONSTRAINT `scenes_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- scene_id NULL: the entry's page is in no scene (kept and exported all the same)
CREATE TABLE IF NOT EXISTS `entries` (
  `experience_id` VARCHAR(64) NOT NULL,
  `id` VARCHAR(64) NOT NULL,
  `scene_id` VARCHAR(64) NULL DEFAULT NULL,
  `position` INT NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `data_json` MEDIUMTEXT NOT NULL COMMENT 'EntryData without its target',
  PRIMARY KEY (`experience_id`, `id`),
  KEY `entries_scene` (`experience_id`, `scene_id`),
  CONSTRAINT `entries_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- entity_ref: the shared entity it points at; NULL = an inline entity (in data_json) or none
CREATE TABLE IF NOT EXISTS `targets` (
  `experience_id` VARCHAR(64) NOT NULL,
  `id` VARCHAR(64) NOT NULL,
  `entry_id` VARCHAR(64) NOT NULL,
  `image_src` VARCHAR(1024) NOT NULL,
  `entity_ref` VARCHAR(64) NULL DEFAULT NULL,
  `data_json` MEDIUMTEXT NOT NULL COMMENT 'TargetData',
  PRIMARY KEY (`experience_id`, `id`),
  KEY `targets_entry` (`experience_id`, `entry_id`),
  CONSTRAINT `targets_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `entities` (
  `experience_id` VARCHAR(64) NOT NULL,
  `ref` VARCHAR(64) NOT NULL,
  `position` INT NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `data_json` MEDIUMTEXT NOT NULL COMMENT 'EntityData',
  PRIMARY KEY (`experience_id`, `ref`),
  CONSTRAINT `entities_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The publish log: one row per POST /editor/experiences/{id}/publish
CREATE TABLE IF NOT EXISTS `experience_versions` (
  `id` CHAR(36) NOT NULL,
  `experience_id` VARCHAR(64) NOT NULL,
  `env` VARCHAR(32) NOT NULL,
  `build` CHAR(12) NOT NULL,
  `hash` CHAR(64) NOT NULL,
  `published_by` CHAR(36) NULL DEFAULT NULL,
  `published_at` BIGINT NOT NULL,
  `note` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `experience_versions_experience` (`experience_id`, `published_at`),
  CONSTRAINT `experience_versions_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The change log: before and after of every edited entity (kind `entity`, ref) or target (kind `target`, ref = target id)
CREATE TABLE IF NOT EXISTS `changes` (
  `id` CHAR(36) NOT NULL,
  `experience_id` VARCHAR(64) NOT NULL,
  `user_id` CHAR(36) NULL DEFAULT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `ref` VARCHAR(64) NOT NULL,
  `before_json` MEDIUMTEXT NULL,
  `after_json` MEDIUMTEXT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `changes_experience` (`experience_id`, `created_at`),
  CONSTRAINT `changes_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The editor's assets (Assets.php): uploaded files, one row per upload in asset_versions
CREATE TABLE IF NOT EXISTS assets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  experience_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,          -- the file name as uploaded
  kind VARCHAR(16) NOT NULL,           -- glb | gltf | video | image | audio (the contract's asset types), shader (#186)
  mime VARCHAR(64) NOT NULL,
  size BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  width INT NULL DEFAULT NULL,         -- images and videos (duration_ms: videos – added at the end of the file)
  height INT NULL DEFAULT NULL,
  version INT NOT NULL DEFAULT 1,      -- the current version
  path VARCHAR(255) NOT NULL,          -- in the store: <experience>/<asset>/v<n>.<ext>
  url VARCHAR(512) NOT NULL,           -- the public URL the content names
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by CHAR(36) NULL DEFAULT NULL,
  created_at BIGINT NOT NULL,          -- ms since 1970 (UTC)
  updated_at BIGINT NOT NULL,
  INDEX assets_experience (experience_id, status, updated_at),
  CONSTRAINT assets_experience_fk FOREIGN KEY (experience_id) REFERENCES experiences (id) ON DELETE CASCADE
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

-- The editor's plugin sources (Plugins.php): the Code tab's TypeScript per plugin id; the compiled plugins an experience
-- declares come with the import (experiences.plugins_json)
CREATE TABLE IF NOT EXISTS plugins (
  experience_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  source MEDIUMTEXT NOT NULL,
  created_by CHAR(36) NULL DEFAULT NULL,
  updated_by CHAR(36) NULL DEFAULT NULL,
  created_at BIGINT NOT NULL,          -- ms since 1970 (UTC)
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (experience_id, id),
  CONSTRAINT plugins_experience_fk FOREIGN KEY (experience_id) REFERENCES experiences (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `experiences` ADD COLUMN `plugins_json` TEXT NOT NULL DEFAULT '[]';

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

-- What the draft is based on (Experiences::import): the imported build, its date, the app and schema version that built it,
-- where it came from, when and by whom – the import's version comparison reads it, and the change log after `at`
ALTER TABLE `experiences` ADD COLUMN `imported_json` TEXT NULL DEFAULT NULL;

-- The onboarding belongs to the reader (#236): the steps an import kept in `experiences` go. A column of a removed feature is
-- removed by name and only that (RULES #25); the migration skips it once the column is gone
ALTER TABLE `experiences` DROP COLUMN `tutorial_json`;

-- Picture credits (#277, Assets::setCredits): one free text line per file of an experience's Library, by its URL – the imported
-- files have no `assets` row, so the line is kept by URL for both
CREATE TABLE IF NOT EXISTS `asset_credits` (
  `experience_id` VARCHAR(64) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `credits` TEXT NOT NULL,
  `updated_by` CHAR(36) NULL DEFAULT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`experience_id`, `url`),
  CONSTRAINT `asset_credits_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Library file names by use (#298 phase 3, AssetNames): an imported file (no `assets` row, read-only – #244) is listed
-- under the name its use gives, kept by URL like its credits; the URL and the file never change
CREATE TABLE IF NOT EXISTS `asset_names` (
  `experience_id` VARCHAR(64) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `updated_by` CHAR(36) NULL DEFAULT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`experience_id`, `url`),
  CONSTRAINT `asset_names_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scenes (#307 phase 2): the experience's groups – a label over several scenes (`GroupData[]`, the content's root `groups`);
-- a scene (a `scenes` row) names its group in its data_json (`group`), with its surfaces, layout and label
ALTER TABLE `experiences` ADD COLUMN `groups_json` TEXT NOT NULL DEFAULT '[]';

-- Reverts (#312): a revert is a new change; the changes one revert writes share a set, each names the change it takes back
ALTER TABLE `changes` ADD COLUMN `change_set` CHAR(36) NULL DEFAULT NULL;
ALTER TABLE `changes` ADD COLUMN `reverts` CHAR(36) NULL DEFAULT NULL;

-- Surface reference images (#314, SurfaceReferences): one image of the experience's Library per surface of a scene, what the
-- editor's stage shows on it – editor-only, no content (the draft, its publish and the reader never carry it). `fit`:
-- cover | contain | stretch. Keyed by the scene's and the surface's ids; a removed surface or scene takes its row
CREATE TABLE IF NOT EXISTS `surface_references` (
  `experience_id` VARCHAR(64) NOT NULL,
  `scene_id` VARCHAR(64) NOT NULL,
  `surface_id` VARCHAR(64) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `fit` VARCHAR(16) NOT NULL DEFAULT 'cover',
  `updated_by` CHAR(36) NULL DEFAULT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`experience_id`, `scene_id`, `surface_id`),
  CONSTRAINT `surface_references_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Schema 3.0 cleanup (#319, every experience is migrated to 3.0): the 2.x page model's columns (RULES #25: the table
-- `page_images` stays, unread; an old database keeps its index `entries_spread` on the renamed column), the change
-- log's old kind and the behaviour rules' scene scope and event
ALTER TABLE `scenes` DROP COLUMN `first_page`;
ALTER TABLE `scenes` DROP COLUMN `last_page`;
ALTER TABLE `entries` DROP COLUMN `page`;
UPDATE `changes` SET `kind` = 'scene' WHERE `kind` = 'spread';
UPDATE `entities` SET `data_json` = REPLACE(REPLACE(`data_json`, '"scope":"spread"', '"scope":"scene"'), '"spreadChanged"', '"sceneChanged"') WHERE `data_json` LIKE '%spread%';
UPDATE `targets` SET `data_json` = REPLACE(REPLACE(`data_json`, '"scope":"spread"', '"scope":"scene"'), '"spreadChanged"', '"sceneChanged"') WHERE `data_json` LIKE '%spread%';
UPDATE `scenes` SET `data_json` = REPLACE(REPLACE(`data_json`, '"scope":"spread"', '"scope":"scene"'), '"spreadChanged"', '"sceneChanged"') WHERE `data_json` LIKE '%spread%';

-- Schema 4.0 cleanup (#320): the change log's old kind, and the `author` column – the author lives in
-- experience_json.book now (Migration4 moves it there from the JSON, which always held it; RULES #25: a removed
-- column by name)
UPDATE `changes` SET `kind` = 'experience' WHERE `kind` = 'book';
ALTER TABLE `experiences` DROP COLUMN `author`;

-- Arrivals by source (#324, Arrivals.php): counts only – per source (`?s=` of a printed QR code or a link), UTC day and
-- device class; no IP, no user
CREATE TABLE IF NOT EXISTS `arrivals` (
  `source` VARCHAR(32) NOT NULL,
  `day` DATE NOT NULL,
  `device` VARCHAR(8) NOT NULL,
  `arrivals` INT UNSIGNED NOT NULL DEFAULT 0,
  `first_arrivals` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`source`, `day`, `device`),
  KEY `arrivals_day` (`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deliveries (#322, Deliveries.php): a publisher's delivery applied through the API – its name, where it came from, the
-- plan as sent (scenes, entries, targets, file URLs) and what it wrote. Every change it wrote names it
-- (`changes.delivery_id`), so the history shows it and the revert takes it back
CREATE TABLE IF NOT EXISTS `deliveries` (
  `id` CHAR(36) NOT NULL,
  `experience_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `source` VARCHAR(512) NULL DEFAULT NULL,
  `plan_json` MEDIUMTEXT NOT NULL,
  `counts_json` TEXT NOT NULL,
  `created_by` CHAR(36) NULL DEFAULT NULL,
  `token_name` VARCHAR(255) NULL DEFAULT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `deliveries_experience` (`experience_id`, `created_at`),
  CONSTRAINT `deliveries_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `changes` ADD COLUMN `delivery_id` CHAR(36) NULL DEFAULT NULL;

-- Publish jobs (#345, PublishJob.php): a publish runs as a job – the POST starts it, polls of GET …/publish/{job} report
-- its progress and drive what is left where nothing runs on after the answer (Apache mod_php). `plan_json` = every file
-- the publish writes (emptied when the job ends), `state_json` = where it is (files still to write, the archive's outcome)
CREATE TABLE IF NOT EXISTS `publish_jobs` (
  `id` CHAR(36) NOT NULL,
  `experience_id` VARCHAR(64) NOT NULL,
  `env` VARCHAR(32) NOT NULL,
  `user_id` CHAR(36) NULL DEFAULT NULL,
  `note` TEXT NULL,
  `status` VARCHAR(16) NOT NULL,
  `phase` VARCHAR(16) NOT NULL,
  `build` CHAR(12) NOT NULL,
  `hash` CHAR(64) NOT NULL,
  `done` INT NOT NULL DEFAULT 0,
  `total` INT NOT NULL DEFAULT 0,
  `skipped` INT NOT NULL DEFAULT 0,
  `plan_json` LONGTEXT NOT NULL,
  `state_json` MEDIUMTEXT NOT NULL,
  `error_code` VARCHAR(64) NULL DEFAULT NULL,
  `error_message` TEXT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  `lease_until` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `publish_jobs_experience` (`experience_id`, `env`, `created_at`),
  CONSTRAINT `publish_jobs_experience_fk` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
