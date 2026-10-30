<?php
declare(strict_types=1);

/**
 * OSCT users API (docs/server.md) – every request under /api/ comes here (.htaccess).
 *
 *   GET    /health                   { status, version, env, db }
 *   POST   /auth/request             send the confirmation email (link + code)
 *   POST   /auth/verify              link token or request id + code → session token
 *   POST   /auth/password            email + password → session token (users who set a password)
 *   POST   /auth/logout              end this device's session
 *   GET    /user                     the signed-in user (`roles`: reader for every account, editor, admin)
 *   PATCH  /user                     change the options / language
 *   DELETE /user                     delete the user and everything stored with it
 *   PUT    /user/password            set or change the password
 *   GET    /user/tokens              the AI connections' tokens (docs/server.md "AI connections"; a session only, never a token)
 *   POST   /user/tokens              { name } → 201 { token, apiToken } – the token once (editors and admins, for themselves)
 *   POST   /user/tokens/{id}/renew   expires 182 days from now · DELETE /user/tokens/{id} revoke it
 *   GET    /progress/{bookId}        stored progress record
 *   PUT    /progress/{bookId}        store the progress record
 *   POST   /admin/migrate            create missing tables (header X-Admin-Secret: SECRET) – after a deploy
 *
 *   The admin API (docs/server.md "Admin API"; a signed-in user with role admin, or the header X-Admin-Secret: SECRET):
 *   GET    /admin/roles                         the roles
 *   GET    /admin/users?q=&role=&newsletter=1   the users (search by e-mail) with their roles, options, language
 *   GET    /admin/users.csv?newsletter=1        the same as CSV – the newsletter list
 *   PUT    /admin/users/{id}/roles/{role}       grant the role · DELETE … revoke it
 *   POST   /admin/editors                       { email } → make the user an editor, creating it if new
 *
 *   The editor (docs/server.md "Editor data"; a signed-in user with role editor, else 403):
 *   GET    /editor/books                        the books: id, title, author, spreads, updatedAt, lastPublish
 *   POST   /editor/books/{id}/import            { configuration, files?, assetsBase? } or { source: "cdn" } → replace the book's rows
 *   GET    /editor/books/{id}                   the tree: book, spreads with entries, each entry's target
 *   GET    /editor/books/{id}/entities          the shared entities { ref: EntityData }
 *   PUT    /editor/books/{id}/entities/{ref}    body EntityData → saves it, records a change
 *   PUT    /editor/books/{id}/targets/{id}      { entity } | { ref } | { imageSrc } | { print } → the target, records a change
 *   POST   /editor/books/{id}/entries           { title, page, category?, target: { imageSrc, print?, entity? } } → 201 a new entry with its target
 *   PUT    /editor/books/{id}/spreads/{id}      { title?, format?, passes? } → a spread's title, format (spread | cover | back) and own passes
 *   POST   /editor/books/{id}/spreads           { format: spread, after?, id?, title? } → 201 a double page after `after` (default: before
 *                                               the back cover), later pages numbered on by two · { format: cover | back, title? } → 201 a cover
 *   DELETE /editor/books/{id}/spreads/{id}      a spread without entries goes, later pages numbered back (409 spread-not-empty, initial-spread)
 *   PUT    /editor/books/{id}/environment       { environment: { world, onionSky } | null } → the book's world and onion sky
 *   PUT    /editor/books/{id}/passes            { passes: [{ type, … }] | null } → the book's post-processing (every spread without its own)
 *   DELETE /editor/books/{id}/entries/{id}      the entry and its target go
 *   GET    /editor/books/{id}/draft/latest.json · …/draft/{build}/game.config.json · …/draft/{build}/files.json
 *                                               the draft as a content version (the engine's loader reads it like the CDN)
 *   POST   /editor/books/{id}/publish           { env, note? } → writes the version to the content store
 *   GET    /editor/books/{id}/versions          the publish log
 *   GET    /editor/books/{id}/changes?limit=    the change log, newest first
 *   GET    /editor/books/{id}/assets[?kind=]    the uploaded files (docs/server.md "Assets"), with their number of uses
 *   POST   /editor/books/{id}/assets            the file as the body, X-File-Name → 201 { asset } (200 when these bytes exist)
 *   PUT    /editor/books/{id}/assets/{aid}/file the new file as the body → a new version, every use relinked
 *   GET    /editor/books/{id}/assets/{aid}/usages · DELETE /editor/books/{id}/assets/{aid}[?force=1]
 *   GET    /editor/books/{id}/plugins · GET | PUT { source } | DELETE /editor/books/{id}/plugins/{pid}
 *                                               the Code tab's plugin sources (docs/server.md "Plugin sources")
 *   GET    /content/{env}/{path}                the local content store (json files, and the assets' files; public)
 *
 * Signed-in requests send `Authorization: Bearer <session token>` – or an AI connection's token `osct_…` (ApiTokens).
 */

foreach (['Version', 'Config', 'Db', 'Http', 'Mailer', 'Smtp', 'LoginMail', 'Auth', 'ApiTokens', 'Passwords', 'Users', 'Progress', 'Roles', 'Admin', 'Editor', 'Books', 'ContentVersion', 'ContentStore', 'Assets', 'VideoInfo', 'Plugins'] as $class) {
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
$GLOBALS['osctApiBase'] = $base !== '' ? $base : '/api';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
// Ids in the editor's paths (books, entities, targets); assets have uuids
$uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Ids in the editor's paths (books, entities, targets)
$id = Editor::ID;

/** POST /admin/migrate needs the SECRET in X-Admin-Secret, else 403 (the other admin endpoints: Admin::actor()) */
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

try {
    Http::cors();
    $route = "$method $path";
    match (true) {
        $route === 'GET /health' => Http::json(200, ['status' => 'ok', 'version' => Version::APP, 'env' => Config::env(), 'db' => Db::value('SELECT 1') == 1 ? 'ok' : 'error']),
        $route === 'POST /admin/migrate' => migrate(),
        $route === 'POST /admin/editors' => Admin::makeEditor(Http::body()),
        $route === 'GET /admin/roles' => Admin::roles(),
        $route === 'GET /admin/users' => Admin::users(),
        $route === 'GET /admin/users.csv' => Admin::usersCsv(),
        (bool) preg_match("#^(PUT|DELETE) /admin/users/($uuid)/roles/([a-z]{1,32})$#", $route, $match) => Admin::setRole($match[2], $match[3], $match[1] === 'PUT'),
        $route === 'POST /auth/request' => Auth::request(Http::body()),
        $route === 'POST /auth/verify' => Auth::verify(Http::body()),
        $route === 'POST /auth/password' => Passwords::signIn(Http::body()),
        $route === 'POST /auth/logout' => Auth::logout(),
        $route === 'GET /user' => Users::get(),
        $route === 'PATCH /user' => Users::update(Http::body()),
        $route === 'DELETE /user' => Users::delete(),
        $route === 'PUT /user/password' => Passwords::set(Http::body()),
        $route === 'GET /user/tokens' => ApiTokens::list(),
        $route === 'POST /user/tokens' => ApiTokens::create(Http::body()),
        (bool) preg_match("#^POST /user/tokens/($uuid)/renew$#", $route, $match) => ApiTokens::renew($match[1]),
        (bool) preg_match("#^DELETE /user/tokens/($uuid)$#", $route, $match) => ApiTokens::revoke($match[1]),
        (bool) preg_match('#^(GET|PUT) /progress/([A-Za-z0-9_-]{1,64})$#', $route, $match) =>
            $match[1] === 'GET' ? Progress::get($match[2]) : Progress::put($match[2], Http::body()),
        $route === 'GET /editor/books' => Books::list(),
        (bool) preg_match("#^POST /editor/books/($id)/import$#", $route, $match) => Books::import($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)$#", $route, $match) => Books::tree($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/entities$#", $route, $match) => Books::entities($match[1]),
        (bool) preg_match("#^PUT /editor/books/($id)/entities/($id)$#", $route, $match) => Books::putEntity($match[1], $match[2]),
        (bool) preg_match("#^PUT /editor/books/($id)/targets/($id)$#", $route, $match) => Books::putTarget($match[1], $match[2]),
        (bool) preg_match("#^POST /editor/books/($id)/entries$#", $route, $match) => Books::addEntry($match[1]),
        (bool) preg_match("#^PUT /editor/books/($id)/spreads/($id)$#", $route, $match) => Books::putSpread($match[1], $match[2]),
        (bool) preg_match("#^POST /editor/books/($id)/spreads$#", $route, $match) => Books::addSpread($match[1]),
        (bool) preg_match("#^DELETE /editor/books/($id)/spreads/($id)$#", $route, $match) => Books::deleteSpread($match[1], $match[2]),
        (bool) preg_match("#^PUT /editor/books/($id)/environment$#", $route, $match) => Books::putEnvironment($match[1]),
        (bool) preg_match("#^PUT /editor/books/($id)/passes$#", $route, $match) => Books::putPasses($match[1]),
        (bool) preg_match("#^DELETE /editor/books/($id)/entries/($id)$#", $route, $match) => Books::deleteEntry($match[1], $match[2]),
        (bool) preg_match("#^GET /editor/books/($id)/draft/latest\\.json$#", $route, $match) => ContentVersion::draftManifest($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/draft/[0-9a-f]{12}/(game\\.config|files)\\.json$#", $route, $match) => ContentVersion::draftFile($match[1], $match[2]),
        (bool) preg_match("#^POST /editor/books/($id)/publish$#", $route, $match) => Books::publish($match[1], Http::body()),
        (bool) preg_match("#^GET /editor/books/($id)/versions$#", $route, $match) => Books::versions($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/changes$#", $route, $match) => Books::changes($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/assets$#", $route, $match) => Assets::list($match[1]),
        (bool) preg_match("#^POST /editor/books/($id)/assets$#", $route, $match) => Assets::upload($match[1]),
        (bool) preg_match("#^PUT /editor/books/($id)/assets/($uuid)/file$#", $route, $match) => Assets::replace($match[1], $match[2]),
        (bool) preg_match("#^GET /editor/books/($id)/assets/($uuid)/usages$#", $route, $match) => Assets::usages($match[1], $match[2]),
        (bool) preg_match("#^DELETE /editor/books/($id)/assets/($uuid)$#", $route, $match) => Assets::delete($match[1], $match[2]),
        (bool) preg_match("#^GET /editor/books/($id)/plugins$#", $route, $match) => Plugins::list($match[1]),
        (bool) preg_match("#^GET /editor/books/($id)/plugins/($id)$#", $route, $match) => Plugins::get($match[1], $match[2]),
        (bool) preg_match("#^PUT /editor/books/($id)/plugins/($id)$#", $route, $match) => Plugins::put($match[1], $match[2]),
        (bool) preg_match("#^DELETE /editor/books/($id)/plugins/($id)$#", $route, $match) => Plugins::delete($match[1], $match[2]),
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
