<?php
declare(strict_types=1);

/**
 * Settings: an environment variable wins, else `config.local.php` (next to index.php, not committed – copy
 * `config.local.php.example`), else the default below. Secrets never go into the repository.
 */
final class Config
{
    private const DEFAULTS = [
        // MySQL (production). DB_SQLITE_PATH instead = SQLite file for local development / tests
        'DB_HOST' => 'localhost',
        'DB_PORT' => '3306',
        'DB_NAME' => '',
        'DB_USER' => '',
        'DB_PASS' => '',
        // A relative path counts from the api folder; one inside api/db/ is read as var/db/<name> (Paths)
        'DB_SQLITE_PATH' => '',
        // Long random string: hashes the login codes and IP addresses (openssl rand -hex 32)
        'SECRET' => '',
        // The app: links in the emails go here, unless the request comes from another allowed origin
        'APP_URL' => 'http://localhost:5173',
        // Which environment this instance is (local, staging, production): GET /health names it, the editor publishes to
        // it and no other, and the editor's AI agent guide names the MCP server after it (osct-staging …)
        'ENV' => 'local',
        // Other origins that may call the API (comma separated, * wildcard), e.g. the staging site
        'ALLOWED_ORIGINS' => '',
        // Roles (docs/server.md "Roles"): e-mail addresses that get the role editor when they sign in – the first editors of
        // an instance without the admin secret; the admin page and POST /admin/editors add more at any time
        'EDITORS' => '',
        // Addresses that get the role admin when they sign in (docs/server.md "Roles") – the instance's first admins,
        // who then grant roles on the admin page (/editor/admin) without the secret
        'ADMINS' => '',
        // log = write the mails to MAIL_LOG_PATH (development), mail = PHP mail() (testing), smtp (production)
        'MAIL_TRANSPORT' => 'log',
        'MAIL_FROM' => 'no-reply@example.com',
        'MAIL_FROM_NAME' => 'Onion Skin & Crocodile Tears',
        // Empty = var/mail/mail.log (Paths)
        'MAIL_LOG_PATH' => '',
        'SMTP_HOST' => '',
        'SMTP_PORT' => '587',
        // tls = STARTTLS (587), ssl = implicit TLS (465), none = plain (local test servers only)
        'SMTP_SECURE' => 'tls',
        'SMTP_USER' => '',
        'SMTP_PASS' => '',
        'SMTP_TIMEOUT' => '15',
        // Limits
        'LOGIN_TTL_MINUTES' => '30',
        'LOGIN_MAX_ATTEMPTS' => '5',
        'LOGIN_MAX_PER_EMAIL_HOUR' => '5',
        'LOGIN_MAX_PER_IP_HOUR' => '30',
        'SESSION_TTL_DAYS' => '365',
        // Optional passwords: minimum length, failed sign-ins per hour, and how long after an email sign-in a
        // password can be changed without the current one ("forgot password")
        'PASSWORD_MIN_LENGTH' => '8',
        'PASSWORD_MAX_FAILS_PER_EMAIL_HOUR' => '10',
        'PASSWORD_MAX_FAILS_PER_IP_HOUR' => '30',
        'PASSWORD_RESET_MINUTES' => '15',
        'PROGRESS_MAX_BYTES' => '262144',
        // Editor (docs/server.md "Editor data"): largest request body (the import of a game configuration)
        'EDITOR_MAX_BYTES' => '8388608',
        // Assets uploaded in the editor (docs/server.md "Assets"): the largest file; where their URLs point
        // (empty = the CDN's CONTENT_BASE_URL + /assets for the bunny store, this API's /content/assets for the local one)
        'ASSET_MAX_BYTES' => '67108864',
        'ASSET_BASE_URL' => '',
        // Where published content versions go: local = the content store's folder (served by GET /content/{env}/…), bunny =
        // the CDN's storage zone the osct CLI syncs to (every environment but local, which stays in the folder)
        'CONTENT_STORE' => 'local',
        // The content store's folder (OSCT_CONTENT_STORE_DIR); empty = content-store/ at the top level of a development
        // checkout, api/content-store in a deployed layout (Paths)
        'CONTENT_STORE_DIR' => '',
        // The reader's content CDN of this instance – `{ "source": "cdn" }` imports its current version
        'CONTENT_BASE_URL' => '',
        'BUNNY_STORAGE_ZONE' => '',
        // Host name; a full http(s) origin only for a local test double
        'BUNNY_STORAGE_ENDPOINT' => 'storage.bunnycdn.com',
        'BUNNY_STORAGE_PASSWORD' => '',
        // Error log of the API; unset = var/log/error.log (Paths), set to an empty value in config.local.php = the host's log
        'LOG_PATH' => '',
    ];

    /** @var array<string, string> */
    private static array $local = [];
    private static bool $loaded = false;

    public static function get(string $key): string
    {
        self::load();
        $env = getenv('OSCT_' . $key);
        if ($env !== false && $env !== '') return $env;
        if (isset(self::$local[$key])) return (string) self::$local[$key];
        return self::DEFAULTS[$key] ?? '';
    }

    /** The value set for a key – an environment variable or config.local.php –, null when the default applies */
    public static function explicit(string $key): ?string
    {
        self::load();
        $env = getenv('OSCT_' . $key);
        if ($env !== false && $env !== '') return $env;
        return isset(self::$local[$key]) ? (string) self::$local[$key] : null;
    }

    public static function int(string $key): int
    {
        return (int) self::get($key);
    }

    /** A rate limit (emails, attempts, failures per hour): **-1 switches it off** (local testing, the codes in the mail log); 0 allows nothing */
    public static function limit(string $key): int
    {
        $limit = self::int($key);
        return $limit < 0 ? PHP_INT_MAX : $limit;
    }

    /** This instance's environment (`ENV`): lower-case letters, digits and hyphens, else `local` */
    public static function env(): string
    {
        $env = strtolower(trim(self::get('ENV')));
        return preg_match('/^[a-z0-9][a-z0-9-]{0,31}$/', $env) ? $env : 'local';
    }

    /** @return string[] */
    public static function list(string $key): array
    {
        return array_values(array_filter(array_map('trim', explode(',', self::get($key)))));
    }

    private static function load(): void
    {
        if (self::$loaded) return;
        self::$loaded = true;
        $file = getenv('OSCT_CONFIG_FILE') ?: __DIR__ . '/../config.local.php';
        if (is_file($file)) {
            $values = require $file;
            if (is_array($values)) self::$local = $values;
        }
    }
}
