<?php
declare(strict_types=1);

/**
 * OSCT users API (docs/server.md) – every request under /api/ comes here (.htaccess).
 *
 *   GET    /health                   { status, version, db }
 *   POST   /auth/request             send the confirmation email (link + code)
 *   POST   /auth/verify              link token or request id + code → session token
 *   POST   /auth/logout              end this device's session
 *   GET    /user                     the signed-in user
 *   PATCH  /user                     change the options / language
 *   DELETE /user                     delete the user and everything stored with it
 *   GET    /progress/{bookId}        stored progress record
 *   PUT    /progress/{bookId}        store the progress record
 *   POST   /admin/migrate            create missing tables (header X-Admin-Secret: SECRET) – after a deploy
 *
 * Signed-in requests send `Authorization: Bearer <session token>`.
 */

foreach (['Version', 'Config', 'Db', 'Http', 'Mailer', 'Smtp', 'LoginMail', 'Auth', 'Users', 'Progress'] as $class) {
    require __DIR__ . "/src/$class.php";
}

// Errors go to our own log file (db/ is never served; read it over FTP) – LOG_PATH, empty = the host's log
$logPath = Config::get('LOG_PATH');
if ($logPath !== '') {
    ini_set('log_errors', '1');
    ini_set('error_log', $logPath);
}

// The path below the API folder: /api/auth/request → /auth/request (also with `php -S` and a router script)
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && str_starts_with($path, $base . '/')) $path = substr($path, strlen($base));
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** POST /admin/migrate – called by the deploy workflow with the SECRET in X-Admin-Secret */
function migrate(): never
{
    $secret = Config::get('SECRET');
    $given = (string) ($_SERVER['HTTP_X_ADMIN_SECRET'] ?? '');
    if (strlen($secret) < 32 || !hash_equals($secret, $given)) throw new ApiError(403, 'forbidden', 'Not allowed.');
    Http::json(200, ['statements' => Db::migrate()]);
}

try {
    Http::cors();
    $route = "$method $path";
    match (true) {
        $route === 'GET /health' => Http::json(200, ['status' => 'ok', 'version' => Version::APP, 'db' => Db::value('SELECT 1') == 1 ? 'ok' : 'error']),
        $route === 'POST /admin/migrate' => migrate(),
        $route === 'POST /auth/request' => Auth::request(Http::body()),
        $route === 'POST /auth/verify' => Auth::verify(Http::body()),
        $route === 'POST /auth/logout' => Auth::logout(),
        $route === 'GET /user' => Users::get(),
        $route === 'PATCH /user' => Users::update(Http::body()),
        $route === 'DELETE /user' => Users::delete(),
        (bool) preg_match('#^(GET|PUT) /progress/([A-Za-z0-9_-]{1,64})$#', $route, $match) =>
            $match[1] === 'GET' ? Progress::get($match[2]) : Progress::put($match[2], Http::body()),
        default => throw new ApiError(404, 'not-found', 'Unknown endpoint.'),
    };
} catch (ApiError $error) {
    Http::error($error);
} catch (Throwable $error) {
    error_log('[osct] ' . $error::class . ': ' . $error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    Http::error(new ApiError(500, 'server-error', 'Something went wrong on the server.'));
}
