<?php
declare(strict_types=1);

/** An error answered as `{ "error": { "code", "message" } }` with its HTTP status */
final class ApiError extends Exception
{
    /** @param array<string, mixed> $details more for the client, beside code and message (e.g. an asset's usages) */
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message = '', public readonly array $details = [])
    {
        parent::__construct($message !== '' ? $message : $errorCode);
    }
}

/** Request and response helpers (JSON in, JSON out) */
final class Http
{
    /** @return array<string, mixed> */
    public static function body(): array
    {
        $raw = (string) file_get_contents('php://input');
        if ($raw === '') return [];
        $data = json_decode($raw, true);
        if (!is_array($data)) throw new ApiError(400, 'invalid-json', 'The request body is not a JSON object.');
        return $data;
    }

    /** The body with JSON objects as stdClass (keeps `{}` apart from `[]`) */
    public static function bodyObject(): stdClass
    {
        $data = json_decode((string) file_get_contents('php://input'));
        if (!$data instanceof stdClass) throw new ApiError(400, 'invalid-json', 'The request body is not a JSON object.');
        return $data;
    }

    public static function json(int $status, mixed $data): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        if ($status !== 204) echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(ApiError $error): never
    {
        self::json($error->status, ['error' => ['code' => $error->errorCode, 'message' => $error->getMessage()] + $error->details]);
    }

    /** The `Authorization: Bearer <token>` header (Apache may hide it – see .htaccess) */
    public static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($header === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                if (strcasecmp($name, 'Authorization') === 0) $header = $value;
            }
        }
        return preg_match('/^Bearer\s+([A-Za-z0-9_-]{20,})$/', $header, $match) ? $match[1] : null;
    }

    public static function origin(): ?string
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        return $origin !== '' ? rtrim($origin, '/') : null;
    }

    /** The app's own origin (APP_URL) or one of ALLOWED_ORIGINS (`*` matches any part of a host name) */
    public static function isAllowedOrigin(string $origin): bool
    {
        $appOrigin = self::originOf(Config::get('APP_URL'));
        if ($appOrigin !== null && strcasecmp($origin, $appOrigin) === 0) return true;
        foreach (Config::list('ALLOWED_ORIGINS') as $pattern) {
            $regex = '/^' . str_replace('\*', '[a-z0-9-]+', preg_quote(rtrim($pattern, '/'), '/')) . '$/i';
            if (preg_match($regex, $origin)) return true;
        }
        return false;
    }

    /** CORS for allowed origins; a preflight request ends here */
    public static function cors(): void
    {
        $origin = self::origin();
        if ($origin !== null && self::isAllowedOrigin($origin)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization');
            header('Access-Control-Max-Age: 86400');
        }
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    /**
     * This API's own absolute URL (`https://host/api`): for the URLs of files the local store serves, which are stored in
     * the content. A deployed instance (ENV not local) takes the host from APP_URL – the API is served as /api next to
     * the app – and never from the request, whose `Host` / `X-Forwarded-Host` the client chooses; without APP_URL it
     * refuses (500 not-configured) rather than store a guessed URL. A local instance takes the request's host: there
     * APP_URL names an app's dev server, and the API answers on its own port.
     */
    public static function apiUrl(): string
    {
        $base = rtrim((string) ($GLOBALS['osctApiBase'] ?? '/api'), '/');
        if (Config::env() !== 'local') {
            $origin = self::originOf((string) Config::explicit('APP_URL'));
            if ($origin === null) throw new ApiError(500, 'not-configured', 'APP_URL is not set – the URLs of stored files are built from it.');
            return $origin . $base;
        }
        $https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        $host = (string) ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost');
        return ($https ? 'https' : 'http') . "://$host" . $base;
    }

    /** Where links in emails point: the calling app if its origin is allowed, else APP_URL */
    public static function appUrl(): string
    {
        $origin = self::origin();
        if ($origin !== null && self::isAllowedOrigin($origin)) return $origin;
        return rtrim(Config::get('APP_URL'), '/');
    }

    public static function clientIp(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    }

    private static function originOf(string $url): ?string
    {
        $parts = parse_url($url);
        if (!isset($parts['scheme'], $parts['host'])) return null;
        return $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    }
}
