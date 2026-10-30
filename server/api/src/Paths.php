<?php
declare(strict_types=1);

/**
 * Where the API keeps what is not code (docs/server.md "Content store and var"):
 * - the **content store** – published versions and the Library's uploads (CONTENT_STORE_DIR, as an environment
 *   variable OSCT_CONTENT_STORE_DIR), the backend of every environment without a CDN;
 * - **var/** – the SQLite file (DB_SQLITE_PATH), the error log (LOG_PATH) and the development mail log (MAIL_LOG_PATH).
 *
 * In a development checkout (the API at `server/api`) they default to the top level: `content-store/` and
 * `var/log/error.log`, `var/mail/mail.log`, `var/db/`. In a deployed layout (the API at `<docroot>/api`) to the API's
 * own folder (`api/content-store/`, `api/var/…`), where every request goes through index.php. A relative setting counts
 * from the API's folder.
 *
 * `server/api/db/` holds the schema only. A setting that still points into it (an older `config.local.php`: `__DIR__ .
 * '/db/local.sqlite'`), or a default that used to, is read as the same file name at the new place, and the first
 * request moves the old file or folder there once – when the new place is empty – and logs it. When the move fails the
 * old place keeps being used (and logged), so nothing is lost. A setting that points anywhere else is used as it is
 * and nothing moves.
 */
final class Paths
{
    /** @var array<string, string> resolved once per request */
    private static array $cache = [];

    /** Resolves every path once – the start of a request, the container's migration: the moves happen here */
    public static function prepare(): void
    {
        self::log();
        self::contentStore();
        self::mailLog();
        self::sqlite();
    }

    /** The content store's folder (the directory store: `<env>/<build>/…`, `assets/<book>/…`) */
    public static function contentStore(): string
    {
        return self::$cache['CONTENT_STORE_DIR'] ??= self::resolve('CONTENT_STORE_DIR', self::root() . '/content-store', 'content', true);
    }

    /** The error log; '' = the host's log (LOG_PATH set to an empty value in config.local.php) */
    public static function log(): string
    {
        return self::$cache['LOG_PATH'] ??= self::resolve('LOG_PATH', self::root() . '/var/log/error.log', 'error.log', false);
    }

    /** The development mail log (MAIL_TRANSPORT=log) */
    public static function mailLog(): string
    {
        return self::$cache['MAIL_LOG_PATH'] ??= self::resolve('MAIL_LOG_PATH', self::root() . '/var/mail/mail.log', 'mail.log', false);
    }

    /** The SQLite file, '' = MySQL (DB_SQLITE_PATH unset: there is no default SQLite file) */
    public static function sqlite(): string
    {
        if (Config::explicit('DB_SQLITE_PATH') === null) return '';
        return self::$cache['DB_SQLITE_PATH'] ??= self::resolve('DB_SQLITE_PATH', '', null, false);
    }

    /** The folder above `server/` in a development checkout, else the API's own folder */
    public static function root(): string
    {
        $api = self::api();
        return basename(dirname($api)) === 'server' ? dirname($api, 2) : $api;
    }

    /** The API's folder (index.php, src/, db/) */
    public static function api(): string
    {
        return str_replace('\\', '/', dirname(__DIR__));
    }

    /**
     * The path for `$key`: the default when unset, the setting itself when it points outside `api/db/`, else the same
     * name at the new place (`$default`'s folder; a folder setting: `$default` itself) – moving the old one there once.
     * `$legacy` = the name the default had inside `api/db/` (null: none).
     */
    private static function resolve(string $key, string $default, ?string $legacy, bool $folder): string
    {
        $configured = Config::explicit($key);
        if ($configured === '') return '';
        if ($configured === null) {
            $path = $default;
            $old = $legacy !== null ? self::api() . "/db/$legacy" : null;
        } else {
            $given = self::absolute($configured);
            if (!self::inLegacy($given)) return $given;
            $old = $given;
            $path = $folder ? $default : ($default !== '' ? dirname($default) : self::root() . '/var/db') . '/' . basename($given);
        }
        if ($old !== null) $path = self::migrate($old, $path, $folder);
        if (!$folder && !self::special($path)) self::ensureFolder(dirname($path));
        return $path;
    }

    /** Moves `$old` to `$new` once when `$old` exists and `$new` is absent or an empty folder; the path to use */
    private static function migrate(string $old, string $new, bool $folder): string
    {
        if (!file_exists($old) || self::same($old, $new)) return $new;
        if (file_exists($new) && !($folder && self::emptyFolder($new))) return $new;
        self::ensureFolder(dirname($new));
        if (is_dir($new)) @rmdir($new);
        if (@rename($old, $new)) {
            error_log("[osct] moved $old to $new (server/api/db/ holds the schema only)");
            return $new;
        }
        error_log("[osct] could not move $old to $new – still using $old; move it by hand");
        return $old;
    }

    /** A folder with its parents; in a deployed layout var/ gets a "deny all" for a host whose rewrite is off */
    private static function ensureFolder(string $folder): void
    {
        if (!is_dir($folder)) @mkdir($folder, 0775, true);
        $var = self::root() . '/var';
        if (self::root() === self::api() && is_dir($var) && !is_file("$var/.htaccess")) {
            @file_put_contents("$var/.htaccess", "Require all denied\n");
        }
    }

    private static function absolute(string $path): string
    {
        $path = str_replace('\\', '/', $path);
        return self::special($path) || preg_match('#^([A-Za-z]:)?/#', $path) ? $path : self::api() . "/$path";
    }

    /** Inside `api/db/` (where the schema lives) */
    private static function inLegacy(string $path): bool
    {
        if (self::special($path)) return false;
        $db = self::normal(self::api() . '/db');
        return str_starts_with(self::normal($path) . '/', "$db/") && self::normal($path) !== $db;
    }

    /** A stream (`php://stderr`) or a device (`/dev/stderr`), never moved */
    private static function special(string $path): bool
    {
        return str_contains($path, '://') || str_starts_with($path, '/dev/');
    }

    private static function same(string $a, string $b): bool
    {
        return self::normal($a) === self::normal($b);
    }

    /** Resolves `.` and `..` (realpath where the path exists), forward slashes, no trailing slash */
    private static function normal(string $path): string
    {
        $real = realpath($path);
        $path = str_replace('\\', '/', $real !== false ? $real : $path);
        $parts = [];
        foreach (explode('/', $path) as $i => $part) {
            if ($part === '..' && $parts && end($parts) !== '') array_pop($parts);
            elseif ($part !== '.' && ($part !== '' || $i === 0)) $parts[] = $part;
        }
        $normal = implode('/', $parts);
        return PHP_OS_FAMILY === 'Windows' ? strtolower($normal) : $normal;
    }

    private static function emptyFolder(string $folder): bool
    {
        return is_dir($folder) && count(array_diff((array) scandir($folder), ['.', '..'])) === 0;
    }
}
