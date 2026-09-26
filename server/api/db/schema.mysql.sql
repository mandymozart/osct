-- OSCT users (server/README.md). MySQL 5.7+ / MariaDB 10.3+, utf8mb4.
-- Times are UTC, written by PHP (no NOW()) so the same queries run on SQLite for local development.
-- Changes after the first deploy: add a dated file to server/db/migrations/ and update this file.

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
