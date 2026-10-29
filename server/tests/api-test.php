<?php
/**
 * API test: runs the real API with PHP's built-in server on a fresh SQLite database and goes through the
 * whole flow (request → email → verify by code and by link → user → progress → delete), plus one mail
 * over SMTP to a fake SMTP server. Exits 1 on the first failure.
 *
 *   php server/tests/api-test.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/osct-api-test-' . bin2hex(random_bytes(4));
mkdir($tmp);
$processes = [];
$failures = 0;

function check(bool $ok, string $what): void
{
    global $failures;
    echo ($ok ? '  ok   ' : '  FAIL ') . $what . "\n";
    if (!$ok) $failures++;
}

function freePort(): int
{
    $socket = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr(strrchr(stream_socket_get_name($socket, false), ':'), 1);
    fclose($socket);
    return $port;
}

/** Starts the API on a free port with these settings; returns its base URL */
function startApi(array $settings): string
{
    global $root, $processes;
    $port = freePort();
    $env = getenv();
    foreach ($settings as $key => $value) $env["OSCT_$key"] = $value;
    $env['OSCT_CONFIG_FILE'] = '/nonexistent'; // never a developer's config.local.php
    $command = [PHP_BINARY, '-S', "127.0.0.1:$port", '-t', $root, "$root/api/index.php"];
    $processes[] = proc_open($command, [1 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a'], 2 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a']], $pipes, $root, $env);
    for ($i = 0; $i < 50; $i++) {
        if (@fsockopen('127.0.0.1', $port)) return "http://127.0.0.1:$port/api";
        usleep(100000);
    }
    throw new RuntimeException('API did not start');
}

/** @return array{0: int, 1: mixed} status and decoded JSON */
function call(string $base, string $method, string $path, ?array $body = null, ?string $token = null, string $origin = 'http://localhost:5173', ?string $rawBody = null): array
{
    $headers = ["Origin: $origin", 'Content-Type: application/json'];
    if ($token) $headers[] = "Authorization: Bearer $token";
    $context = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true,
        'content' => $rawBody ?? ($body === null ? '' : json_encode($body)),
    ]]);
    $response = file_get_contents($base . $path, false, $context);
    $status = (int) explode(' ', $http_response_header[0])[1];
    return [$status, $response === '' ? null : json_decode($response, true), $http_response_header];
}

function lastMail(string $log): array
{
    $mails = explode('=== ', (string) @file_get_contents($log));
    $mail = end($mails);
    preg_match('/login=([A-Za-z0-9_-]+)/', $mail, $link);
    preg_match('/^    (\d{6})$/m', $mail, $code);
    return ['text' => $mail, 'token' => $link[1] ?? null, 'code' => $code[1] ?? null, 'count' => count($mails) - 1];
}

try {
    $mailLog = "$tmp/mail.log";
    $settings = [
        'DB_SQLITE_PATH' => "$tmp/test.sqlite", 'SECRET' => str_repeat('s', 40), 'MAIL_TRANSPORT' => 'log',
        'MAIL_LOG_PATH' => $mailLog, 'APP_URL' => 'https://app.example', 'ALLOWED_ORIGINS' => 'http://localhost:5173, https://*--staging.example',
        'LOGIN_MAX_PER_EMAIL_HOUR' => '4', 'CONTENT_STORE_DIR' => "$tmp/content",
    ];
    $api = startApi($settings);

    echo "health, CORS\n";
    [$status, $data, $headers] = call($api, 'GET', '/health');
    check($status === 200 && $data['db'] === 'ok', 'health answers with the database');
    $appVersion = json_decode((string) file_get_contents(dirname($root) . '/client/package.json'), true)['version'];
    check(($data['version'] ?? null) === $appVersion, "health reports the server version = the app version ($appVersion, RULES #10)");
    check(in_array('Access-Control-Allow-Origin: http://localhost:5173', $headers, true), 'allowed origin gets CORS headers');
    [, , $headers] = call($api, 'GET', '/health', null, null, 'https://deploy-1--staging.example');
    check(in_array('Access-Control-Allow-Origin: https://deploy-1--staging.example', $headers, true), 'wildcard origin is allowed');
    [, , $headers] = call($api, 'GET', '/health', null, null, 'https://evil.example');
    check(!preg_grep('/^Access-Control-Allow-Origin/', $headers), 'other origins get no CORS headers');
    [$status] = call($api, 'OPTIONS', '/auth/request');
    check($status === 204, 'preflight answers 204');
    [$status, $data] = call($api, 'GET', '/nope');
    check($status === 404 && $data['error']['code'] === 'not-found', 'unknown endpoint → 404');

    echo "migrate\n";
    [$status] = call($api, 'POST', '/admin/migrate');
    check($status === 403, 'without the secret → 403');
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => 'X-Admin-Secret: ' . str_repeat('s', 40), 'ignore_errors' => true]]);
    $result = json_decode((string) file_get_contents("$api/admin/migrate", false, $context), true);
    check(($result['statements'] ?? 0) > 4, 'with the secret: the schema runs (again, safely)');

    echo "request\n";
    [$status, $data] = call($api, 'POST', '/auth/request', ['email' => 'nope']);
    check($status === 400 && $data['error']['code'] === 'invalid-email', 'invalid email → 400');
    [$status, $data] = call($api, 'POST', '/auth/request', ['email' => 'a@b.example', 'options' => ['bookUpdates' => 'yes']]);
    check($status === 400 && $data['error']['code'] === 'invalid-options', 'non-boolean option → 400');
    [$status, $data] = call($api, 'POST', '/auth/request', ['email' => ' Reader@Example.com ', 'language' => 'de', 'options' => ['bookUpdates' => true]]);
    check($status === 202 && is_string($data['requestId']), 'request → 202 with a request id');
    $requestId = $data['requestId'];
    $mail = lastMail($mailLog);
    check($mail['code'] !== null && $mail['token'] !== null, 'mail contains the code and the link');
    check(str_contains($mail['text'], 'https://app.example') === false && str_contains($mail['text'], 'http://localhost:5173/about?login='), 'link points to the calling allowed origin');
    check(str_contains($mail['text'], 'Neuigkeiten zu') && !str_contains($mail['text'], 'Neuigkeiten von Building'), 'German mail lists the chosen options only');

    echo "verify by code\n";
    [$status, $data] = call($api, 'POST', '/auth/verify', ['requestId' => $requestId, 'code' => '000000' === $mail['code'] ? '111111' : '000000']);
    check($status === 400 && $data['error']['code'] === 'invalid-code', 'wrong code → 400');
    [$status, $data] = call($api, 'POST', '/auth/verify', ['requestId' => $requestId, 'code' => substr($mail['code'], 0, 3) . ' ' . substr($mail['code'], 3)]);
    check($status === 200 && $data['created'] === true, 'right code (with a space) → session, new user');
    check($data['user']['email'] === 'reader@example.com', 'email stored lowercase and trimmed');
    check($data['user']['options'] === ['bookUpdates' => true, 'artistUpdates' => false, 'publisherUpdates' => false], 'options from the form, missing ones off (opt-in)');
    $session = $data['session'];
    [$status, $data] = call($api, 'POST', '/auth/verify', ['token' => $mail['token']]);
    check($status === 410 && $data['error']['code'] === 'already-used', 'link of a used request → 410');

    echo "verify by link (existing user keeps its options)\n";
    call($api, 'POST', '/auth/request', ['email' => 'reader@example.com', 'options' => ['publisherUpdates' => true]]);
    $mail = lastMail($mailLog);
    check(!str_contains($mail['text'], 'signed up for'), 'mail for an existing user lists no options');
    [$status, $data] = call($api, 'POST', '/auth/verify', ['token' => $mail['token']]);
    check($status === 200 && $data['created'] === false && $data['user']['options']['publisherUpdates'] === false, 'link → session, options unchanged');
    $secondSession = $data['session'];

    echo "code attempts\n";
    [, $data] = call($api, 'POST', '/auth/request', ['email' => 'guess@example.com']);
    $guessId = $data['requestId'];
    $right = lastMail($mailLog)['code'];
    $wrong = $right === '123456' ? '654321' : '123456';
    for ($i = 0; $i < 5; $i++) call($api, 'POST', '/auth/verify', ['requestId' => $guessId, 'code' => $wrong]);
    [$status, $data] = call($api, 'POST', '/auth/verify', ['requestId' => $guessId, 'code' => $right]);
    check($status === 429 && $data['error']['code'] === 'too-many-attempts', 'after 5 wrong codes even the right one is refused');

    echo "rate limit\n";
    for ($i = 0; $i < 4; $i++) [$status, $data] = call($api, 'POST', '/auth/request', ['email' => 'many@example.com']);
    check($status === 202, 'four requests per hour are fine');
    [$status, $data] = call($api, 'POST', '/auth/request', ['email' => 'many@example.com']);
    check($status === 429 && $data['error']['code'] === 'too-many-requests', 'the fifth → 429');

    echo "user\n";
    [$status] = call($api, 'GET', '/user');
    check($status === 401, 'no token → 401');
    [$status] = call($api, 'GET', '/user', null, str_repeat('x', 43));
    check($status === 401, 'unknown token → 401');
    [$status, $data] = call($api, 'GET', '/user', null, $session);
    check($status === 200 && $data['user']['language'] === 'de', 'user with language');
    [$status, $data] = call($api, 'PATCH', '/user', ['options' => ['bookUpdates' => false], 'language' => 'fr'], $session);
    check($status === 200 && $data['user']['options']['bookUpdates'] === false && $data['user']['language'] === 'fr', 'options and language changed');

    echo "password\n";
    [, $data] = call($api, 'GET', '/user', null, $session);
    check($data['user']['hasPassword'] === false, 'a new user has no password');
    [$status, $data] = call($api, 'POST', '/auth/password', ['email' => 'reader@example.com', 'password' => 'anything-at-all']);
    check($status === 401 && $data['error']['code'] === 'invalid-credentials', 'no password set → 401 invalid-credentials');
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => 'short']);
    check($status === 401, 'setting a password needs a session');
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => 'short'], $session);
    check($status === 400 && $data['error']['code'] === 'password-too-short', 'shorter than 8 → 400');
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => str_repeat('ä', 37)], $session);
    check($status === 400 && $data['error']['code'] === 'password-too-long', 'more than 72 bytes → 400 (bcrypt would cut it)');
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => 'first password'], $session);
    check($status === 200 && $data['user']['hasPassword'] === true, 'set from an email session → hasPassword');
    $pdo = new PDO("sqlite:$tmp/test.sqlite");
    $hash = (string) $pdo->query("SELECT password_hash FROM users WHERE email = 'reader@example.com'")->fetchColumn();
    check(str_starts_with($hash, '$2y$12$') && !str_contains($hash, 'first password') && password_verify('first password', $hash), 'stored as a bcrypt hash (cost 12), not the password');
    [$status, $data] = call($api, 'POST', '/auth/password', ['email' => 'reader@example.com', 'password' => 'wrong password']);
    check($status === 401 && $data['error']['code'] === 'invalid-credentials', 'wrong password → 401');
    [$status, $data] = call($api, 'POST', '/auth/password', ['email' => 'nobody@example.com', 'password' => 'first password']);
    check($status === 401 && $data['error']['code'] === 'invalid-credentials', 'unknown email → the same 401');
    [$status, $data] = call($api, 'POST', '/auth/password', ['email' => ' Reader@Example.com ', 'password' => 'first password']);
    check($status === 200 && is_string($data['session']) && $data['created'] === false && $data['user']['email'] === 'reader@example.com', 'right password → session');
    $passwordSession = $data['session'];
    check((int) $pdo->query("SELECT COUNT(*) FROM password_attempts WHERE email = 'reader@example.com'")->fetchColumn() === 0, 'a successful sign-in clears the failed attempts');
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => 'second password'], $passwordSession);
    check($status === 403 && $data['error']['code'] === 'current-password-required', 'change from a password session needs the current password');
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => 'second password', 'currentPassword' => 'nope nope'], $passwordSession);
    check($status === 403 && $data['error']['code'] === 'wrong-current-password', 'wrong current password → 403');
    [$status] = call($api, 'PUT', '/user/password', ['password' => 'second password', 'currentPassword' => 'first password'], $passwordSession);
    check($status === 200, 'with the current password → changed');
    [$status] = call($api, 'POST', '/auth/password', ['email' => 'reader@example.com', 'password' => 'first password']);
    check($status === 401, 'the old password no longer works');
    $pdo->exec("UPDATE sessions SET created_at = '2000-01-01 00:00:00'");
    [$status, $data] = call($api, 'PUT', '/user/password', ['password' => 'third password'], $session);
    check($status === 403 && $data['error']['code'] === 'current-password-required', 'an old email session needs the current password too');
    [$status] = call($api, 'DELETE', '/user/password', null, $session);
    check($status === 404, 'a password cannot be removed (no endpoint)');
    [$status] = call($api, 'PUT', '/user/password', ['password' => 'final password', 'currentPassword' => 'second password'], $session);
    check($status === 200, 'changed with the current password from the old session');
    for ($i = 0; $i < 10; $i++) call($api, 'POST', '/auth/password', ['email' => 'nobody@example.com', 'password' => "guess $i"]);
    [$status, $data] = call($api, 'POST', '/auth/password', ['email' => 'nobody@example.com', 'password' => 'guess again']);
    check($status === 429 && $data['error']['code'] === 'too-many-password-attempts', 'after 10 failures per hour → 429');
    $pdo = null;

    echo "progress\n";
    $record = ['format' => 1, 'bookId' => 'osct', 'appVersions' => ['1.1.0'], 'unlocked' => new stdClass(), 'consulted' => ['e1' => 5], 'lastSpreadId' => null, 'lastCategory' => null, 'onboarded' => true];
    [$status, $data] = call($api, 'GET', '/progress/osct', null, $session);
    check($status === 200 && $data['record'] === null && $data['updatedAt'] === null, 'nothing stored yet');
    [$status, $data] = call($api, 'PUT', '/progress/osct', ['record' => $record + [], 'baseUpdatedAt' => null], $session, 'http://localhost:5173', json_encode(['record' => $record, 'baseUpdatedAt' => null]));
    check($status === 200 && is_int($data['updatedAt']), 'stored');
    $version = $data['updatedAt'];
    $raw = file_get_contents($api . '/progress/osct', false, stream_context_create(['http' => ['header' => "Authorization: Bearer $secondSession"]]));
    check(str_contains($raw, '"unlocked":{}'), 'an empty object stays an object');
    [$status, $data] = call($api, 'PUT', '/progress/osct', null, $secondSession, 'http://localhost:5173', json_encode(['record' => $record, 'baseUpdatedAt' => $version - 1]));
    check($status === 409 && $data['error']['code'] === 'conflict' && $data['updatedAt'] === $version && $data['record']['consulted']['e1'] === 5, 'outdated base → 409 with the stored record');
    [$status, $data] = call($api, 'PUT', '/progress/osct', null, $secondSession, 'http://localhost:5173', json_encode(['record' => $record, 'baseUpdatedAt' => $version]));
    check($status === 200 && $data['updatedAt'] > $version, 'current base → stored, newer version');
    [$status, $data] = call($api, 'PUT', '/progress/other', null, $session, 'http://localhost:5173', json_encode(['record' => $record, 'baseUpdatedAt' => null]));
    check($status === 400 && $data['error']['code'] === 'invalid-record', 'record of another book → 400');

    echo "editor: access\n";
    $storeDir = "$tmp/content";
    call($api, 'POST', '/auth/request', ['email' => 'author@example.com']);
    [, $data] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    $editor = $data['session'];
    check($data['user']['role'] === 'reader', 'a new user is a reader');
    [$status] = call($api, 'GET', '/editor/books');
    check($status === 401, 'editor endpoints without a token → 401');
    [$status, $data] = call($api, 'GET', '/editor/books', null, $editor);
    check($status === 403 && $data['error']['code'] === 'forbidden', 'a reader → 403 forbidden');
    [$status] = call($api, 'POST', '/admin/editors', ['email' => 'author@example.com']);
    check($status === 403, 'admin/editors without the secret → 403');
    $admin = fn(string $path, array $body): array => (array) json_decode((string) file_get_contents("$api$path", false, stream_context_create(['http' => [
        'method' => 'POST', 'header' => 'X-Admin-Secret: ' . str_repeat('s', 40) . "\r\nContent-Type: application/json", 'content' => json_encode($body), 'ignore_errors' => true]])), true);
    $data = $admin('/admin/editors', ['email' => 'Author@Example.com']);
    check(($data['user']['role'] ?? null) === 'editor' && $data['created'] === false, 'with the secret: the existing user becomes an editor');
    $data = $admin('/admin/editors', ['email' => 'new-editor@example.com']);
    check(($data['user']['role'] ?? null) === 'editor' && $data['created'] === true, 'an unknown address: the user is created as an editor');
    [, $data] = call($api, 'GET', '/user', null, $editor);
    check($data['user']['role'] === 'editor', 'GET /user shows the role');
    [$status, $data] = call($api, 'GET', '/editor/books', null, $editor);
    check($status === 200 && $data['books'] === [], 'the editor sees the (empty) book list');
    [$status] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($status === 404, 'no book before an import → 404');

    echo "editor: import\n";
    $configuration = [
        'version' => ['version' => '1.9.0', 'timestamp' => '2026-01-01T00:00:00.000Z', 'hash' => str_repeat('ab', 32), 'schema' => '1.2'],
        'book' => ['id' => 'osct', 'title' => 'Test Book', 'author' => 'Someone', 'publisher' => 'Building Fictions'],
        'initialSpreadId' => 's1',
        'spreads' => [['id' => 's1', 'title' => 'One', 'firstPage' => 1, 'lastPage' => 2], ['id' => 's2', 'title' => 'Two', 'firstPage' => 3, 'lastPage' => 4, 'note' => 'an extra field']],
        'entries' => [
            ['id' => 'racoon', 'category' => 'glossary', 'title' => 'Racoon', 'page' => 1, 'body' => 'A beast.', 'tags' => [], 'target' => [
                'id' => 'racoon', 'imageSrc' => '/assets/content/entries/racoon/img.jpg',
                'entity' => ['type' => 'model', 'assets' => [['id' => 'racoon-0', 'assetType' => 'glb', 'src' => '/assets/content/entries/racoon/racoon.glb']], 'params' => ['scale' => 0.5]]]],
            ['id' => 'castle', 'category' => 'video', 'title' => 'Castle', 'page' => 3, 'body' => '', 'image' => '/assets/content/entries/castle/cover.jpg', 'tags' => ['x'], 'target' => [
                'id' => 'castle-target', 'imageSrc' => '/assets/content/entries/castle/img.jpg', 'entity' => ['ref' => 'castle']]],
            ['id' => 'link', 'category' => 'link', 'title' => 'A link', 'page' => 4, 'body' => '', 'media' => 'https://example.com', 'tags' => []],
            ['id' => 'lost', 'category' => 'text', 'title' => 'Lost', 'page' => 99, 'body' => 'No spread has page 99.', 'tags' => []],
        ],
        'entities' => ['castle' => ['type' => 'video', 'assets' => [['id' => 'castle-0', 'assetType' => 'video', 'src' => '/assets/content/entities/castle/c.mp4']], 'params' => new stdClass(), 'filters' => [['type' => 'chromaKey', 'color' => '#00ff00']]]],
        'tutorial' => [['id' => 'step-1', 'index' => 0, 'title' => '{{title}}', 'illustration' => '/assets/content/tutorial/mark.svg', 'advance' => 3800]],
    ];
    $files = ['/assets/content/entries/racoon/racoon.glb' => ['size' => 1234, 'v' => 'abcdef012345'], '/assets/content/entries/racoon/img.jpg' => ['size' => 10, 'v' => '0123456789ab']];
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
    [$status, $data] = call($api, 'POST', '/editor/books/osct/import', null, $editor, 'http://localhost:5173', json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200 && $data['counts'] === ['spreads' => 2, 'entries' => 4, 'targets' => 2, 'entities' => 1], 'import → counts');
    check(preg_match('/^[0-9a-f]{12}$/', $data['draft']['build'] ?? '') === 1 && $data['book']['importedHash'] === str_repeat('ab', 32), 'import answers with the draft build and the imported hash');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/import', null, $editor, 'http://localhost:5173', json_encode(['configuration' => ['book' => []]]));
    check($status === 400 && $data['error']['code'] === 'invalid-configuration', 'a configuration without a schema → 400');
    $bad = $configuration;
    $bad['entities']['castle']['type'] = 'hologram';
    [$status, $data] = call($api, 'POST', '/editor/books/osct/import', null, $editor, 'http://localhost:5173', json_encode(['configuration' => $bad], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'an unknown entity type → 400 invalid-entity');
    $bad = $configuration;
    $bad['entries'][1]['target']['entity'] = ['ref' => 'ghost'];
    [$status, $data] = call($api, 'POST', '/editor/books/osct/import', null, $editor, 'http://localhost:5173', json_encode(['configuration' => $bad], $flags));
    check($status === 400 && $data['error']['code'] === 'unknown-entity', 'a ref to no entity → 400 unknown-entity');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/import', ['source' => 'cdn'], $editor);
    check($status === 400 && $data['error']['code'] === 'no-content-base', 'source cdn without CONTENT_BASE_URL → 400');

    echo "editor: tree, entities\n";
    [$status, $data] = call($api, 'GET', '/editor/books', null, $editor);
    check($status === 200 && count($data['books']) === 1 && $data['books'][0]['spreads'] === 2 && $data['books'][0]['lastPublish'] === null && $data['books'][0]['book']['publisher'] === 'Building Fictions', 'book list: one book, two spreads, not published');
    [$status, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($status === 200 && count($tree['spreads']) === 2 && $tree['spreads'][0]['id'] === 's1' && $tree['spreads'][0]['firstPage'] === 1 && $tree['spreads'][1]['note'] === 'an extra field', 'tree: spreads in order with every field');
    check(($tree['spreads'][0]['entries'][0]['target']['entity']['type'] ?? null) === 'model', 'tree: an inline entity under its entry');
    check(($tree['spreads'][1]['entries'][0]['target']['entity']['ref'] ?? null) === 'castle' && $tree['spreads'][1]['entries'][1]['target'] === null, 'tree: a ref, and an entry without a target');
    check(count($tree['unassigned']) === 1 && $tree['unassigned'][0]['id'] === 'lost', 'an entry whose page is in no spread is kept apart');
    [$status, $data] = call($api, 'GET', '/editor/books/osct/entities', null, $editor);
    check($status === 200 && array_keys($data['entities']) === ['castle'] && $data['entities']['castle']['type'] === 'video', 'the shared entities');

    echo "editor: draft\n";
    [$status, $manifest, $headers] = call($api, 'GET', '/editor/books/osct/draft/latest.json?t=1', null, $editor);
    check($status === 200 && preg_match('/^[0-9a-f]{12}$/', $manifest['build']) === 1 && strlen($manifest['hash']) === 64 && str_starts_with($manifest['hash'], $manifest['build'])
        && $manifest['schema'] === '1.2' && $manifest['version'] === $appVersion && isset($manifest['activatedAt']), 'draft latest.json is a content manifest');
    check(in_array('Cache-Control: no-store', $headers, true), 'the draft is never cached');
    $withToken = stream_context_create(['http' => ['header' => "Authorization: Bearer $editor"]]);
    $rawDraft = (string) file_get_contents("$api/editor/books/osct/draft/{$manifest['build']}/game.config.json", false, $withToken);
    $draft = json_decode($rawDraft, true);
    check($draft['version']['hash'] === $manifest['hash'] && $draft['version']['version'] === $appVersion && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/', $draft['version']['timestamp']) === 1
        && array_keys($draft['version']) === ['version', 'timestamp', 'hash', 'schema'], 'game.config.json carries the version block');
    $expected = json_decode(json_encode($configuration, $flags), true);
    unset($expected['version'], $draft['version']);
    check($draft === $expected, 'import → draft round-trips the configuration unchanged (keys, order, extra fields, the entry without a spread)');
    check(str_contains($rawDraft, '"params":{}') && str_contains($rawDraft, '"tags":[]'), 'empty objects and lists keep their kind');
    [$status, $data] = call($api, 'GET', "/editor/books/osct/draft/{$manifest['build']}/files.json", null, $editor);
    check($status === 200 && $data === $files, 'files.json as imported');
    [$status] = call($api, 'GET', "/editor/books/osct/draft/{$manifest['build']}/game.config.json");
    check($status === 401, 'the draft needs the token');

    echo "editor: edit\n";
    $castle = $configuration['entities']['castle'];
    $castle['params'] = ['scale' => 2];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    check($status === 200 && $data['entity']['params']['scale'] === 2, 'PUT entity → saved');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', ['type' => 'hologram', 'assets' => []], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'an unknown type → 400 invalid-entity');
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', ['type' => 'video'], $editor);
    check($status === 400, 'without assets → 400');
    $racoon = $configuration['entries'][0]['target']['entity'];
    $racoon['params'] = ['position' => [0, 0.1, 0], 'scale' => 0.5];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/targets/racoon', ['entity' => $racoon], $editor);
    check($status === 200 && $data['target']['id'] === 'racoon' && $data['target']['entity']['params']['position'] === [0, 0.1, 0], 'PUT target → the inline entity changed');
    [$status] = call($api, 'PUT', '/editor/books/osct/targets/nope', ['entity' => $racoon], $editor);
    check($status === 404, 'unknown target → 404');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/targets/racoon', ['ref' => 'nope'], $editor);
    check($status === 400 && $data['error']['code'] === 'unknown-entity', 'a ref to an unknown entity → 400');
    [, $data] = call($api, 'GET', '/editor/books/osct/draft/latest.json', null, $editor);
    check($data['build'] !== $manifest['build'], 'an edit changes the draft build');
    $edited = json_decode((string) file_get_contents("$api/editor/books/osct/draft/{$data['build']}/game.config.json", false, $withToken), true);
    check($edited['entities']['castle']['params']['scale'] === 2 && $edited['entries'][0]['target']['entity']['params']['position'] === [0, 0.1, 0], 'the draft has both edits');
    unset($edited['version'], $edited['entities']['castle']['params'], $edited['entries'][0]['target']['entity']['params']);
    $rest = $expected;
    unset($rest['entities']['castle']['params'], $rest['entries'][0]['target']['entity']['params']);
    check($edited === $rest, 'everything else is as imported');
    [$status, $data] = call($api, 'GET', '/editor/books/osct/changes', null, $editor);
    check($status === 200 && count($data['changes']) === 2 && $data['changes'][0]['kind'] === 'target' && $data['changes'][0]['ref'] === 'racoon' && $data['changes'][0]['user'] === 'author@example.com'
        && $data['changes'][1]['kind'] === 'entity' && $data['changes'][1]['ref'] === 'castle' && $data['changes'][1]['after']['params']['scale'] === 2 && $data['changes'][1]['before']['params'] === [], 'change log: two entries, newest first, before/after and the user');
    [, $data] = call($api, 'GET', '/editor/books/osct/changes?limit=1', null, $editor);
    check(count($data['changes']) === 1, 'limit');

    echo "editor: publish (local store)\n";
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'nowhere'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-env', 'unknown env → 400');
    [$status, $first] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local', 'note' => 'first'], $editor);
    check($status === 200 && $first['env'] === 'local' && preg_match('/^[0-9a-f]{12}$/', $first['build']) === 1 && str_starts_with($first['hash'], $first['build']) && isset($first['publishedAt']), 'publish → env, build, hash');
    check(is_file("$storeDir/local/{$first['build']}/game.config.json") && is_file("$storeDir/local/{$first['build']}/files.json") && is_file("$storeDir/local/latest.json") && is_file("$storeDir/local/versions.json"), 'the version folder, versions.json and latest.json are in the store dir');
    [$status, $data, $headers] = call($api, 'GET', '/content/local/latest.json');
    check($status === 200 && $data['build'] === $first['build'] && $data['hash'] === $first['hash'] && $data['schema'] === '1.2' && $data['version'] === $appVersion && isset($data['activatedAt']), 'GET /content/local/latest.json serves the manifest (no token needed)');
    check(in_array('Cache-Control: no-cache', $headers, true), 'latest.json is revalidated');
    [$status, $data, $headers] = call($api, 'GET', "/content/local/{$first['build']}/game.config.json");
    check($status === 200 && $data['version']['hash'] === $first['hash'] && $data['entities']['castle']['params']['scale'] === 2, 'the published game.config.json is the draft');
    check((bool) preg_grep('/^Cache-Control: public, max-age=31536000, immutable$/', $headers), 'version files are immutable');
    [, $data] = call($api, 'GET', '/content/local/versions.json');
    check(count($data) === 1 && $data[0]['build'] === $first['build'] && $data[0]['retiredAt'] === null && $data[0]['uploadedAt'] === $data[0]['activatedAt'], 'versions.json has the one version, current');
    [$status] = call($api, 'GET', '/content/local/../test.sqlite');
    [$status2] = call($api, 'GET', "/content/local/{$first['build']}/game.config.txt");
    [$status3] = call($api, 'GET', '/content/Local/latest.json');
    check($status === 404 && $status2 === 404 && $status3 === 404, 'only the json files of a version: no traversal, other names and envs → 404');
    $castle['params'] = ['scale' => 3];
    call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    [$status, $second] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 200 && $second['build'] !== $first['build'], 'a second publish makes a new version');
    [, $data] = call($api, 'GET', '/content/local/versions.json');
    check(count($data) === 2 && $data[0]['build'] === $first['build'] && is_string($data[0]['retiredAt']) && $data[1]['build'] === $second['build'] && $data[1]['retiredAt'] === null, 'versions.json: the first retired, the second current');
    [, $data] = call($api, 'GET', '/content/local/latest.json');
    check($data['build'] === $second['build'] && is_file("$storeDir/local/{$first['build']}/game.config.json"), 'latest.json moved, the first version folder stays');
    $written = file_get_contents("$storeDir/local/{$second['build']}/game.config.json");
    [$status, $again] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    [, $data] = call($api, 'GET', '/content/local/versions.json');
    check($status === 200 && $again['build'] === $second['build'] && count($data) === 2 && file_get_contents("$storeDir/local/{$second['build']}/game.config.json") === $written, 'publishing the same draft again rewrites no version folder and adds no version');
    [$status, $data] = call($api, 'GET', '/editor/books/osct/versions', null, $editor);
    check($status === 200 && count($data['versions']) === 3 && $data['versions'][2]['note'] === 'first' && $data['versions'][0]['publishedBy'] === 'author@example.com', 'the publish log: three publishes, newest first');
    [, $data] = call($api, 'GET', '/editor/books', null, $editor);
    check($data['books'][0]['lastPublish']['env'] === 'local' && $data['books'][0]['lastPublish']['build'] === $second['build'], 'the book list shows the last publish');

    echo "editor: assets base\n";
    $base = 'https://cdn.example/staging/0123456789ab';
    [$status] = call($api, 'POST', '/editor/books/osct/import', null, $editor, 'http://localhost:5173', json_encode(['configuration' => $configuration, 'files' => $files, 'assetsBase' => "$base/"], $flags));
    check($status === 200, 're-import with an assets base');
    [, $m] = call($api, 'GET', '/editor/books/osct/draft/latest.json', null, $editor);
    [, $data] = call($api, 'GET', "/editor/books/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check($data['entries'][0]['target']['imageSrc'] === "$base/assets/content/entries/racoon/img.jpg"
        && $data['entries'][0]['target']['entity']['assets'][0]['src'] === "$base/assets/content/entries/racoon/racoon.glb"
        && $data['entries'][1]['image'] === "$base/assets/content/entries/castle/cover.jpg"
        && $data['entities']['castle']['assets'][0]['src'] === "$base/assets/content/entities/castle/c.mp4"
        && $data['tutorial'][0]['illustration'] === "$base/assets/content/tutorial/mark.svg"
        && $data['entries'][2]['media'] === 'https://example.com', 'content paths become URLs below the base (src, imageSrc, image, illustration); other strings stay');
    [, $data] = call($api, 'GET', "/editor/books/osct/draft/{$m['build']}/files.json", null, $editor);
    check(array_keys($data) === ["$base/assets/content/entries/racoon/racoon.glb", "$base/assets/content/entries/racoon/img.jpg"], 'files.json keys rewritten, in order');
    [, $data] = call($api, 'GET', '/editor/books/osct/changes', null, $editor);
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check(count($data['changes']) === 3 && $tree['spreads'][0]['entries'][0]['target']['entity']['params'] === ['scale' => 0.5], 're-import replaced the edited rows; the change log stays');

    echo "editor: node trees (content schema 2.0)
";
    $castle = $configuration['entities']['castle'];
    // Content schema 2.0: the entity as a tree of nodes
    $tree = ['type' => 'group', 'assets' => [], 'children' => [
        $castle,
        ['type' => 'text', 'assets' => [], 'text' => '{{entry.title}}', 'color' => '#f3cc94', 'params' => ['position' => [0, -0.5, 0.01]]],
    ]];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $tree, $editor);
    check($status === 200 && count($data['entity']['children']) === 2 && $data['entity']['children'][1]['type'] === 'text', 'PUT entity with children → saved as a tree');
    $bad = $tree;
    $bad['children'][1]['color'] = 'gold';
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $bad, $editor);
    check($status === 400 && str_contains($data['error']['message'] ?? '', 'children[1].color'), 'a bad child → 400 with its path');
    $deep = ['type' => 'group', 'assets' => []];
    for ($i = 0; $i < 9; $i++) $deep = ['type' => 'group', 'assets' => [], 'children' => [$deep]];
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', $deep, $editor);
    check($status === 400, 'nodes deeper than 8 levels → 400');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    check($status === 200 && !isset($data['entity']['children']), 'back to one node');

    echo "editor: publish to bunny (test double)\n";
    $storagePort = freePort();
    $bunnyDir = "$tmp/bunny";
    $testLog = [1 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a'], 2 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a']];
    $processes[] = proc_open([PHP_BINARY, '-S', "127.0.0.1:$storagePort", __DIR__ . '/fake-storage.php'], $testLog, $pipes, __DIR__, ['STORAGE_DIR' => $bunnyDir, 'STORAGE_KEY' => 'zone-key'] + getenv());
    for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $storagePort); $i++) usleep(100000);
    $bunny = ['CONTENT_STORE' => 'bunny', 'BUNNY_STORAGE_ZONE' => 'osct', 'BUNNY_STORAGE_ENDPOINT' => "http://127.0.0.1:$storagePort", 'BUNNY_STORAGE_PASSWORD' => 'zone-key'];
    $bunnyApi = startApi($bunny + $settings);
    [$status, $data] = call($bunnyApi, 'POST', '/editor/books/osct/publish', ['env' => 'staging'], $editor);
    check($status === 200 && is_file("$bunnyDir/osct/staging/{$data['build']}/game.config.json") && is_file("$bunnyDir/osct/staging/{$data['build']}/files.json"), 'staging goes to the storage zone: osct/staging/<build>/');
    $latest = json_decode((string) @file_get_contents("$bunnyDir/osct/staging/latest.json"), true);
    $versions = json_decode((string) @file_get_contents("$bunnyDir/osct/staging/versions.json"), true);
    check(($latest['build'] ?? null) === $data['build'] && count($versions ?? []) === 1 && $versions[0]['build'] === $data['build'] && $versions[0]['retiredAt'] === null, 'latest.json and versions.json on the zone');
    [$status] = call($bunnyApi, 'GET', '/content/staging/latest.json');
    check($status === 404, 'nothing local for staging on a bunny host');
    [$status, $data] = call($bunnyApi, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 200 && is_file("$storeDir/local/{$data['build']}/game.config.json"), 'the environment local stays in the local store');
    $wrongKey = startApi(['BUNNY_STORAGE_PASSWORD' => 'wrong'] + $bunny + $settings);
    [$status, $data] = call($wrongKey, 'POST', '/editor/books/osct/publish', ['env' => 'production'], $editor);
    check($status === 502 && $data['error']['code'] === 'content-store-failed', 'a refused upload → 502 content-store-failed');

    echo "deploy keeps the data\n";
    foreach (glob(dirname(__DIR__) . '/api/db/schema.*.sql') as $schema) {
        check(!preg_match('/\b(DROP|TRUNCATE)\b|^\s*DELETE\b/im', (string) file_get_contents($schema)), basename($schema) . ' only adds (no DROP / TRUNCATE / DELETE)');
    }
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => 'X-Admin-Secret: ' . str_repeat('s', 40), 'ignore_errors' => true]]);
    file_get_contents("$api/admin/migrate", false, $context);
    [$status, $data] = call($api, 'GET', '/user', null, $session);
    check($status === 200 && $data['user']['email'] === 'reader@example.com', 'migrate again (as every deploy does): users and sessions still there');
    [, $data] = call($api, 'GET', '/progress/osct', null, $session);
    check(($data['record']['consulted']['e1'] ?? null) === 5, 'migrate again: progress still there');
    [$status, $data] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($status === 200 && count($data['spreads']) === 2, "migrate again: the editor's book still there");

    [$status] = call($api, 'POST', '/auth/password', ['email' => 'reader@example.com', 'password' => 'final password']);
    check($status === 200, 'migrate again: the password still signs in');

    echo "migrate an older database (before passwords)\n";
    $oldSchema = preg_replace('/\nCREATE TABLE IF NOT EXISTS password_attempts.*$/s', '', (string) file_get_contents("$root/api/db/schema.sqlite.sql"));
    $oldToken = str_repeat('o', 43);
    $oldDb = new PDO("sqlite:$tmp/old.sqlite");
    $oldDb->exec($oldSchema);
    $oldDb->exec("INSERT INTO users (id, email, created_at, confirmed_at, updated_at) VALUES ('u1', 'old@example.com', '2026-01-01 00:00:00', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $oldDb->exec("INSERT INTO sessions (id, user_id, token_hash, created_at, last_used_at) VALUES ('s1', 'u1', '" . hash('sha256', $oldToken) . "', '2026-01-01 00:00:00', '2099-01-01 00:00:00')");
    $oldDb = null;
    $oldApi = startApi(['DB_SQLITE_PATH' => "$tmp/old.sqlite"] + $settings);
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => 'X-Admin-Secret: ' . str_repeat('s', 40), 'ignore_errors' => true]]);
    file_get_contents("$oldApi/admin/migrate", false, $context);
    file_get_contents("$oldApi/admin/migrate", false, $context);
    [$status, $data] = call($oldApi, 'GET', '/user', null, $oldToken);
    check($status === 200 && $data['user']['email'] === 'old@example.com' && $data['user']['hasPassword'] === false, 'migrated twice: columns added once, the old user and session kept');
    [$status] = call($oldApi, 'PUT', '/user/password', ['password' => 'a new password'], $oldToken);
    check($status === 200, 'the old user can set a password');
    [$status] = call($oldApi, 'POST', '/auth/password', ['email' => 'old@example.com', 'password' => 'a new password']);
    check($status === 200, 'and sign in with it');

    echo "logout, delete\n";
    [$status] = call($api, 'POST', '/auth/logout', null, $secondSession);
    check($status === 204, 'logout → 204');
    [$status] = call($api, 'GET', '/user', null, $secondSession);
    check($status === 401, 'logged-out session no longer works');
    [$status] = call($api, 'GET', '/user', null, $session);
    check($status === 200, 'the other device stays signed in');
    [$status] = call($api, 'DELETE', '/user', null, $session);
    check($status === 204, 'delete → 204');
    [$status] = call($api, 'GET', '/user', null, $session);
    check($status === 401, 'deleted user: session gone');
    $pdo = new PDO("sqlite:$tmp/test.sqlite");
    check((int) $pdo->query("SELECT COUNT(*) FROM users WHERE email = 'reader@example.com'")->fetchColumn() === 0
        && (int) $pdo->query("SELECT COUNT(*) FROM login_requests WHERE email = 'reader@example.com'")->fetchColumn() === 0, 'user and its requests are gone');
    $pdo = null;

    echo "smtp\n";
    $smtpPort = freePort();
    $smtpOut = "$tmp/smtp.txt";
    $processes[] = proc_open([PHP_BINARY, __DIR__ . '/fake-smtp.php', (string) $smtpPort, $smtpOut], [], $pipes);
    for ($i = 0; $i < 50 && !is_file("$smtpOut.ready"); $i++) usleep(100000);
    $smtpApi = startApi(['MAIL_TRANSPORT' => 'smtp', 'SMTP_HOST' => '127.0.0.1', 'SMTP_PORT' => (string) $smtpPort, 'SMTP_SECURE' => 'none',
        'SMTP_USER' => 'user', 'SMTP_PASS' => 'pass', 'MAIL_FROM' => 'app@example.com', 'DB_SQLITE_PATH' => "$tmp/smtp.sqlite"] + $settings);
    [$status, $data] = call($smtpApi, 'POST', '/auth/request', ['email' => 'smtp@example.com', 'language' => 'de']);
    check($status === 202, 'request over SMTP → 202');
    for ($i = 0; $i < 30 && !is_file($smtpOut); $i++) usleep(100000);
    $session = (string) @file_get_contents($smtpOut);
    check(str_contains($session, 'MAIL FROM:<app@example.com>') && str_contains($session, 'RCPT TO:<smtp@example.com>'), 'envelope sent');
    check(str_contains($session, base64_encode('user')), 'authenticated');
    check(str_contains($session, 'Subject: =?UTF-8?B?') && str_contains($session, 'multipart/alternative'), 'encoded subject, text + HTML');
    [$status, $data] = call($smtpApi, 'POST', '/auth/request', ['email' => 'smtp2@example.com']);
    check($status === 502 && $data['error']['code'] === 'mail-failed', 'SMTP server gone → 502, nothing stored');
} catch (Throwable $error) {
    check(false, 'unexpected: ' . $error->getMessage());
} finally {
    foreach ($processes as $process) { proc_terminate($process); proc_close($process); }
}

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit($failures ? 1 : 0);
