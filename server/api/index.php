<?php
declare(strict_types=1);

/**
 * OSCT users API (docs/server.md) – every request under /api/ comes here (.htaccess).
 *
 *   GET    /health                   { status, version, db }
 *   POST   /auth/request             send the confirmation email (link + code)
 *   POST   /auth/verify              link token or request id + code → session token
 *   POST   /auth/password            email + password → session token (users who set a password)
 *   POST   /auth/logout              end this device's session
 *   GET    /user                     the signed-in user (`role`: reader by default, or editor)
 *   PATCH  /user                     change the options / language
 *   DELETE /user                     delete the user and everything stored with it
 *   PUT    /user/password            set or change the password
 *   GET    /progress/{bookId}        stored progress record
 *   PUT    /progress/{bookId}        store the progress record
 *   POST   /admin/migrate            create missing tables (header X-Admin-Secret: SECRET) – after a deploy
 *   POST   /admin/editors            { email } → make the user an editor, creating it if new (header X-Admin-Secret: SECRET)
 *
 *   The editor (docs/server.md "Editor data"; a signed-in user with role editor, else 403):
 *   GET    /editor/books                        the books: id, title, author, spreads, updatedAt, lastPublish
 *   POST   /editor/books/{id}/import            { configuration, files?, assetsBase? } or { source: "cdn" } → replace the book's rows
 *   GET    /editor/books/{id}                   the tree: book, spreads with entries, each entry's target
 *   GET    /editor/books/{id}/entities          the shared entities { ref: EntityData }
 *   PUT    /editor/books/{id}/entities/{ref}    body EntityData → saves it, records a change
 *   PUT    /editor/books/{id}/targets/{id}      { entity } or { ref } → the target's entity, records a change
 *   GET    /editor/books/{id}/draft/latest.json · …/draft/{build}/game.config.json · …/draft/{build}/files.json
 *                                               the draft as a content version (the engine's loader reads it like the CDN)
 *   POST   /editor/books/{id}/publish           { env, note? } → writes the version to the content store
 *   GET    /editor/books/{id}/versions          the publish log
 *   GET    /editor/books/{id}/changes?limit=    the change log, newest first
 *   GET    /content/{env}/{path}                the local content store (json files only; public)
 *
 * Signed-in requests send `Authorization: Bearer <session token>`.
 */

foreach (['Version', 'Config', 'Db', 'Http', 'Mailer', 'Smtp', 'LoginMail', 'Auth', 'Passwords', 'Users', 'Progress', 'Editor', 'Books', 'ContentVersion', 'ContentStore'] as $class) {
    require __DIR__ . "/src/$class.php";
}

// Errors go to our own log file (db/ is never served; read it on the server) – LOG_PATH, empty = the host's log
$logPath = Config::get('LOG_PATH');
if ($logPath !== '') {
    ini_set('log_errors', '1');
    ini_set('error_log', $logPath);
}

// The path below the API folder: /api/auth/request → /auth/request. The folder's place under the document root is
// the base (/api); SCRIPT_NAME is the fallback – `php -S` with a router script reports the request path there for
// file-like URIs (…/latest.json), which would strip the wrong prefix.
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$root = rtrim(str_replace('\\', '/', (string) realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''))), '/');
$here = str_replace('\\', '/', __DIR__);
$base = $root !== '' && str_starts_with($here, $root . '/')
    ? substr($here, strlen($root))
    : rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && str_starts_with($path, $base . '/')) $path = substr($path, strlen($base));
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// Ids in the editor's paths (books, entities, targets)
$id = Editor::ID;

/** The admin endpoints (/admin/*) need the SECRET in X-Admin-Secret, else 403 */
function adminOnly(): void
{
    $secret = Config::get('SECRET');
    $given = (string) ($_SERVER['HTTP_X_ADMIN_SECRET'] ?? '');
    if (strlen($secret) < 32 || !hash_equals($secret, $given)) throw new ApiError(403, 'forbidden', 'Not allowed.');
}

/** POST /admin/migrate – called by the deploy workflow with the SECRET in X-Admin-Secret */
function migrate(): never
{
    adminOnly();
    Http::json(200, ['statements' => Db::migrate()]);
}

/** POST /admin/editors { email } – makes (or creates) an editor */
function makeEditor(): never
{
    adminOnly();
    Editor::makeEditor(Http::body());
}

try {
    Http::cors();
    $route = "$method $path";
    match (true) {
        $route === 'GET /health' => Http::json(200, ['status' => 'ok', 'version' => Version::APP, 'db' => Db::value('SELECT 1') == 1 ? 'ok' : 'error']),
        $route === 'POST /admin/migrate' => migrate(),
        $route === 'POST /admin/editors' => makeEditor(),
        $route === 'POST /auth/request' => Auth::request(Http::body()),
        $route === 'POST /auth/verify' => Auth::verify(Http::body()),
        $route === 'POST /auth/password' => Passwords::signIn(Http::body()),
        $route === 'POST /auth/logout' => Auth::logout(),
        $route === 'GET /user' => Users::get(),
        $route === 'PATCH /user' => Users::update(Http::body()),
        $route === 'DELETE /user' => Users::delete(),
        $route === 'PUT /user/password' => Passwords::set(Http::body()),
        (bool) preg_match('#^(GET|PUT) /progress/([A-Za-z0-9_-]{1,64})$#', $route, $match) =>
            $match[1] === 'GET' ? Progress::get($match[2]) : Progress::put($match[2], Http::body()),
        $route === 'GET /editor/books' => Books::list(),
        (bool) preg_match("#^POST /editor/books/($id)/import$#", $route, $match) => Books::import($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)$#", $route, $match) => Books::tree($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/entities$#", $route, $match) => Books::entities($match[1]),
        (bool) preg_match("#^PUT /editor/books/($id)/entities/($id)$#", $route, $match) => Books::putEntity($match[1], $match[2]),
        (bool) preg_match("#^PUT /editor/books/($id)/targets/($id)$#", $route, $match) => Books::putTarget($match[1], $match[2]),
        (bool) preg_match("#^GET /editor/books/($id)/draft/latest\\.json$#", $route, $match) => ContentVersion::draftManifest($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/draft/[0-9a-f]{12}/(game\\.config|files)\\.json$#", $route, $match) => ContentVersion::draftFile($match[1], $match[2]),
        (bool) preg_match("#^POST /editor/books/($id)/publish$#", $route, $match) => Books::publish($match[1], Http::body()),
        (bool) preg_match("#^GET /editor/books/($id)/versions$#", $route, $match) => Books::versions($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/changes$#", $route, $match) => Books::changes($match[1]),
        // The local content store, public like the CDN (the environment name as the osct CLI accepts it)
        (bool) preg_match('#^GET /content/([a-z][a-z0-9-]{0,31})/(.+)$#', $route, $match) => ContentStore::serve($match[1], $match[2]),
        default => throw new ApiError(404, 'not-found', 'Unknown endpoint.'),
    };
} catch (ApiError $error) {
    Http::error($error);
} catch (Throwable $error) {
    error_log('[osct] ' . $error::class . ': ' . $error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    Http::error(new ApiError(500, 'server-error', 'Something went wrong on the server.'));
}
