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
        'DB_SQLITE_PATH' => '',
        // Long random string: hashes the login codes and IP addresses (openssl rand -hex 32)
        'SECRET' => '',
        // The app: links in the emails go here, unless the request comes from another allowed origin
        'APP_URL' => 'http://localhost:5173',
        // Other origins that may call the API (comma separated, * wildcard), e.g. the staging site
        'ALLOWED_ORIGINS' => '',
        // log = write the mails to MAIL_LOG_PATH (development), mail = PHP mail() (testing), smtp (production)
        'MAIL_TRANSPORT' => 'log',
        'MAIL_FROM' => 'no-reply@example.com',
        'MAIL_FROM_NAME' => 'Onion Skin & Crocodile Tears',
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
        'PROGRESS_MAX_BYTES' => '262144',
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

    public static function int(string $key): int
    {
        return (int) self::get($key);
    }

    /** @return string[] */
    public static function list(string $key): array
    {
        // Surrounding quotes (a value copied from a .env file) are not part of the list
        $value = trim(self::get($key), " \t\"'");
        return array_values(array_filter(array_map(fn($item) => trim($item, " \t\"'"), explode(',', $value))));
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
