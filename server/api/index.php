<?php
declare(strict_types=1);

/**
 * OSCT accounts API (server/README.md) – every request under /api/ comes here (.htaccess).
 *
 *   GET    /health                   { status, db }
 *   POST   /auth/request             send the confirmation email (link + code)
 *   POST   /auth/verify              link token or request id + code → session token
 *   POST   /auth/logout              end this device's session
 *   GET    /account                  the signed-in account
 *   PATCH  /account                  change the options / language
 *   DELETE /account                  delete the account and everything stored with it
 *   GET    /progress/{bookId}        stored progress record
 *   PUT    /progress/{bookId}        store the progress record
 *   POST   /admin/migrate            create missing tables (header X-Admin-Secret: SECRET) – after a deploy
 *
 * Signed-in requests send `Authorization: Bearer <session token>`.
 */

foreach (['Config', 'Db', 'Http', 'Mailer', 'Smtp', 'LoginMail', 'Auth', 'Accounts', 'Progress'] as $class) {
    require __DIR__ . "/src/$class.php";
}

// The path below the API folder: /api/auth/request → /auth/request (also with `php -S` and a router script)
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && str_starts_with($path, $base . '/')) $path = substr($path, strlen($base));
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** POST /admin/migrate – the deploy script (server/deploy.php) sends the SECRET */
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
        $route === 'GET /health' => Http::json(200, ['status' => 'ok', 'db' => Db::value('SELECT 1') == 1 ? 'ok' : 'error']),
        $route === 'POST /admin/migrate' => migrate(),
        $route === 'POST /auth/request' => Auth::request(Http::body()),
        $route === 'POST /auth/verify' => Auth::verify(Http::body()),
        $route === 'POST /auth/logout' => Auth::logout(),
        $route === 'GET /account' => Accounts::get(),
        $route === 'PATCH /account' => Accounts::update(Http::body()),
        $route === 'DELETE /account' => Accounts::delete(),
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
