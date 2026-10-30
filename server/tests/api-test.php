<?php
/**
 * API test: runs the real API with PHP's built-in server on a fresh database and goes through the
 * whole flow (request → email → verify by code and by link → user → progress → delete), plus one mail
 * over SMTP to a fake SMTP server. Exits 1 if anything failed.
 *
 *   php server/tests/api-test.php                              SQLite files in a temporary folder
 *   OSCT_TEST_DB=mysql php server/tests/api-test.php           MySQL / MariaDB (docker compose up -d db): every API of
 *                                                              the test gets a new database from schema.mysql.sql,
 *                                                              dropped at the end. OSCT_TEST_DB_HOST (127.0.0.1),
 *                                                              _PORT (3306), _USER (root), _PASS (osct-root, the
 *                                                              compose file's) – an account that may create databases
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/osct-api-test-' . bin2hex(random_bytes(4));
mkdir($tmp);
$processes = [];
$failures = 0;
$mysql = getenv('OSCT_TEST_DB') === 'mysql' ? [
    'host' => getenv('OSCT_TEST_DB_HOST') ?: '127.0.0.1', 'port' => getenv('OSCT_TEST_DB_PORT') ?: '3306',
    'user' => getenv('OSCT_TEST_DB_USER') ?: 'root', 'pass' => getenv('OSCT_TEST_DB_PASS') ?: 'osct-root',
    'prefix' => 'osct_test_' . bin2hex(random_bytes(3)) . '_', 'created' => [],
] : null;

function check(bool $ok, string $what): void
{
    global $failures;
    echo ($ok ? '  ok   ' : '  FAIL ') . $what . "\n";
    if (!$ok) $failures++;
}

// MySQL (staging, production) runs PDO without emulated prepares: a named parameter used twice in one query fails there
// (HY093, a 500) while the SQLite of this test passes it – so every query in the API is checked for it here
(function (): void {
    global $root;
    $found = [];
    foreach (array_merge(glob("$root/api/src/*.php"), ["$root/api/index.php"]) as $file) {
        $source = file_get_contents($file);
        preg_match_all('/([\'"])((?:SELECT|INSERT|UPDATE|DELETE|WITH)\b(?:(?!\1).)*)\1/si', $source, $queries, PREG_OFFSET_CAPTURE);
        foreach ($queries[2] as [$query, $offset]) {
            preg_match_all('/(?<!:):([a-z_][a-z0-9_]*)/i', $query, $names);
            $twice = array_keys(array_filter(array_count_values($names[1]), fn ($n) => $n > 1));
            if ($twice) $found[] = basename($file) . ':' . (substr_count(substr($source, 0, $offset), "\n") + 1) . ' :' . implode(', :', $twice);
        }
    }
    check($found === [], 'no query uses a named parameter twice (MySQL native prepares)' . ($found ? ' – ' . implode('; ', $found) : ''));
    // A backslash escapes inside a MySQL string literal: ESCAPE '\' does not end there (a syntax error, a 500) – Db::contains
    $escapes = [];
    foreach (array_merge(glob("$root/api/src/*.php"), ["$root/api/index.php"]) as $file) {
        if (preg_match('/ESCAPE\s+\'\\\\/i', (string) file_get_contents($file))) $escapes[] = basename($file);
    }
    check($escapes === [], "no LIKE … ESCAPE '\\' (MySQL string literals)" . ($escapes ? ' – ' . implode(', ', $escapes) : ''));
})();

/** Runs a schema file's statements one by one (the split of Db::migrate) */
function loadSchema(PDO $pdo, string $sql): void
{
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (array_filter(array_map('trim', preg_split('/;\s*(\n|$)/', (string) $sql))) as $statement) $pdo->exec($statement);
}

/** A PDO on the test database $name (null: the MySQL server without a database) */
function connect(?string $name): PDO
{
    global $mysql, $tmp;
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
    if (!$mysql) return new PDO("sqlite:$tmp/$name.sqlite", null, null, $options);
    $dsn = "mysql:host={$mysql['host']};port={$mysql['port']};charset=utf8mb4" . ($name === null ? '' : ";dbname={$mysql['prefix']}$name");
    return new PDO($dsn, $mysql['user'], $mysql['pass'], $options);
}

/**
 * The API settings for a new test database $name. SQLite: a file the API creates with its schema on first use, or
 * now from $schema. MySQL: a new database made from $schema, by default schema.mysql.sql (what a deploy's migration
 * finds on a new server).
 */
function database(string $name, ?string $schema = null): array
{
    global $mysql, $tmp, $root;
    if (!$mysql) {
        if ($schema !== null) loadSchema(connect($name), $schema);
        return ['DB_SQLITE_PATH' => "$tmp/$name.sqlite"];
    }
    connect(null)->exec("CREATE DATABASE `{$mysql['prefix']}$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $mysql['created'][] = $mysql['prefix'] . $name;
    loadSchema(connect($name), $schema ?? (string) file_get_contents("$root/api/db/schema.mysql.sql"));
    return ['DB_HOST' => $mysql['host'], 'DB_PORT' => $mysql['port'], 'DB_NAME' => $mysql['prefix'] . $name,
        'DB_USER' => $mysql['user'], 'DB_PASS' => $mysql['pass']];
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
function call(string $base, string $method, string $path, ?array $body = null, ?string $token = null, string $origin = 'http://localhost:5173', ?string $rawBody = null, array $extraHeaders = []): array
{
    $headers = [...["Origin: $origin", 'Content-Type: application/json'], ...$extraHeaders];
    if ($token) $headers[] = "Authorization: Bearer $token";
    $context = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true,
        'content' => $rawBody ?? ($body === null ? '' : json_encode($body)),
    ]]);
    $response = file_get_contents($base . $path, false, $context);
    $status = (int) explode(' ', $http_response_header[0])[1];
    return [$status, $response === '' ? null : json_decode($response, true), $http_response_header];
}

/**
 * An import that overwrites: the first answer of a book that exists is 409 confirm-import with a confirmation id
 * (Books::import) – sent again with it, as the editor does after the comparison. Errors pass through unchanged.
 */
function importing(string $base, string $book, ?string $token, string $raw): array
{
    $answer = call($base, 'POST', "/editor/books/$book/import", null, $token, 'http://localhost:5173', $raw);
    if ($answer[0] !== 409 || ($answer[1]['error']['code'] ?? null) !== 'confirm-import') return $answer;
    $body = json_decode($raw);
    $body->confirm = $answer[1]['error']['confirmation']['id'];
    return call($base, 'POST', "/editor/books/$book/import", null, $token, 'http://localhost:5173', json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

/**
 * A removal in its two steps (Books::deleteSpread / deleteEntry): the first answer is 409 confirm-delete with the impact
 * and a confirmation id – sent again with it (and `$options`, e.g. deleteFiles), as the editor does after the person
 * confirmed. Any other first answer passes through unchanged.
 */
function deleting(string $base, string $path, ?string $token, array $options = []): array
{
    $answer = call($base, 'DELETE', $path, null, $token);
    if ($answer[0] !== 409 || ($answer[1]['error']['code'] ?? null) !== 'confirm-delete') return $answer;
    return call($base, 'DELETE', $path, ['confirm' => $answer[1]['error']['confirmation']['id']] + $options, $token);
}

/** A file upload: the bytes as the body, the name in X-File-Name */
function upload(string $base, string $method, string $path, string $bytes, string $name, string $token): array
{
    $headers = ['Origin: http://localhost:5173', 'Content-Type: application/octet-stream', "X-File-Name: $name", "Authorization: Bearer $token"];
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true, 'content' => $bytes]]);
    $response = file_get_contents($base . $path, false, $context);
    $status = (int) explode(' ', $http_response_header[0])[1];
    return [$status, $response === '' ? null : json_decode($response, true), $http_response_header];
}

// ── Video containers built as bytes (no binaries in the repository): the headers VideoInfo reads, filler as media ──

/** An mp4 box: size, type, body (`$large`: the 64-bit size form, as a big mdat has it) */
function mp4Box(string $type, string $body, bool $large = false): string
{
    return $large ? pack('N', 1) . $type . pack('J', 16 + strlen($body)) . $body : pack('N', 8 + strlen($body)) . $type . $body;
}

/** A minimal mp4 / mov: ftyp, the media data, then moov with mvhd and one trak per [width, height, handler] */
function mp4File(int $timescale, int $duration, array $tracks, bool $version1 = false, bool $rotated = false, bool $largeMdat = false): string
{
    $mvhd = $version1
        ? "\x01\0\0\0" . pack('J', 0) . pack('J', 0) . pack('N', $timescale) . pack('J', $duration)
        : "\0\0\0\0" . pack('N4', 0, 0, $timescale, $duration);
    $mvhd .= str_repeat("\0", 80); // rate, volume, matrix, next track id: not read
    $matrix = $rotated ? pack('N9', 0, 0x00010000, 0, 0xFFFF0000, 0, 0, 0, 0, 0x40000000) : pack('N9', 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);
    $traks = '';
    foreach ($tracks as $i => [$width, $height, $handler]) {
        $tkhd = "\0\0\0\x03" . pack('N5', 0, 0, $i + 1, 0, $duration) . str_repeat("\0", 16) . $matrix . pack('N2', $width << 16, $height << 16);
        $hdlr = "\0\0\0\0" . pack('N', 0) . $handler . str_repeat("\0", 12) . "Handler\0";
        $traks .= mp4Box('trak', mp4Box('tkhd', $tkhd) . mp4Box('mdia', mp4Box('mdhd', str_repeat("\0", 24)) . mp4Box('hdlr', $hdlr)));
    }
    return mp4Box('ftyp', 'isom' . pack('N', 512) . 'isomiso2mp41') . mp4Box('mdat', random_bytes(4096), $largeMdat)
        . mp4Box('moov', mp4Box('mvhd', $mvhd) . $traks);
}

/** An EBML element: id, size, body (`$unknown`: the size of all ones, as a recorder writes a live Segment) */
function ebmlElement(string $id, string $body, bool $unknown = false): string
{
    $length = strlen($body);
    $size = $unknown ? "\x01\xFF\xFF\xFF\xFF\xFF\xFF\xFF" : ($length < 0x7F ? chr(0x80 | $length) : pack('n', 0x4000 | $length));
    return $id . $size . $body;
}

/** A minimal webm: the EBML header, a Segment with a Void, Info (scale, duration), Tracks (a sound and a video track), a Cluster */
function webmFile(int $width, int $height, float $duration, int $timecodeScale = 1000000, bool $unknownSegment = true): string
{
    $info = ebmlElement("\x2A\xD7\xB1", substr(pack('J', $timecodeScale), -3)) . ebmlElement("\x44\x89", pack('E', $duration));
    $audio = ebmlElement("\xAE", ebmlElement("\xD7", "\x01") . ebmlElement("\x83", "\x02"));
    $video = ebmlElement("\xAE", ebmlElement("\xD7", "\x02") . ebmlElement("\x83", "\x01")
        . ebmlElement("\xE0", ebmlElement("\xB0", pack('n', $width)) . ebmlElement("\xBA", pack('n', $height))));
    $segment = ebmlElement("\xEC", str_repeat("\0", 20)) . ebmlElement("\x15\x49\xA9\x66", $info)
        . ebmlElement("\x16\x54\xAE\x6B", $audio . $video) . ebmlElement("\x1F\x43\xB6\x75", random_bytes(1000));
    return ebmlElement("\x1A\x45\xDF\xA3", ebmlElement("\x42\x86", "\x01") . ebmlElement("\x42\x82", 'webm'))
        . ebmlElement("\x18\x53\x80\x67", $segment, $unknownSegment);
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
    echo $mysql ? "database: MySQL on {$mysql['host']}:{$mysql['port']} (" . connect(null)->query('SELECT VERSION()')->fetchColumn() . ")\n" : "database: SQLite\n";
    $settings = database('test') + [
        'SECRET' => str_repeat('s', 40), 'MAIL_TRANSPORT' => 'log', 'EDITORS' => 'Listed@example.com, other@example.com', 'ADMINS' => 'Chief@example.com',
        'MAIL_LOG_PATH' => $mailLog, 'APP_URL' => 'https://app.example', 'ALLOWED_ORIGINS' => 'http://localhost:5173, https://*--staging.example',
        'LOGIN_MAX_PER_EMAIL_HOUR' => '4', 'CONTENT_STORE_DIR' => "$tmp/content", 'LOG_PATH' => "$tmp/error.log",
    ];
    $api = startApi($settings);

    echo "health, CORS\n";
    [$status, $data, $headers] = call($api, 'GET', '/health');
    check($status === 200 && $data['db'] === 'ok', 'health answers with the database');
    $appVersion = json_decode((string) file_get_contents(dirname($root) . '/client/package.json'), true)['version'];
    check(($data['version'] ?? null) === $appVersion, "health reports the server version = the app version ($appVersion, RULES #10)");
    check(($data['env'] ?? null) === 'local', 'health names the environment (ENV, default local) – the AI agent guide names the MCP server after it');
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
    check(($data['error']['retryAfter'] ?? 0) > 0 && $data['error']['retryAfter'] <= 3600 && str_contains($data['error']['message'], 'minute'), 'the 429 says when the next email is allowed (retryAfter, seconds)');

    echo "rate limits off (-1)\n";
    $openApi = startApi(database('open') + ['LOGIN_MAX_PER_EMAIL_HOUR' => '-1', 'LOGIN_MAX_PER_IP_HOUR' => '-1'] + $settings);
    $statuses = [];
    for ($i = 0; $i < 7; $i++) [$statuses[]] = call($openApi, 'POST', '/auth/request', ['email' => 'open@example.com']);
    check($statuses === array_fill(0, 7, 202), 'a limit of -1 is off: seven requests in a row pass (local testing)');
    $zeroApi = startApi(database('zero') + ['LOGIN_MAX_PER_EMAIL_HOUR' => '0'] + $settings);
    [$status, $data] = call($zeroApi, 'POST', '/auth/request', ['email' => 'zero@example.com']);
    check($status === 429 && $data['error']['code'] === 'too-many-requests', 'a limit of 0 allows nothing (#83)');

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
    $pdo = connect('test');
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
    // An address in EDITORS (config) is an editor from its first sign-in – the first editors without the admin secret
    call($api, 'POST', '/auth/request', ['email' => 'listed@example.com']);
    [, $data] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    check($data['user']['role'] === 'editor', 'an address listed in EDITORS signs in as an editor');
    [$status] = call($api, 'GET', '/editor/books', null, $data['session']);
    check($status === 200, 'and may use the editor');
    [$status] = call($api, 'GET', '/editor/books');
    check($status === 401, 'editor endpoints without a token → 401');
    [$status, $data] = call($api, 'GET', '/editor/books', null, $editor);
    check($status === 403 && $data['error']['code'] === 'forbidden', 'a reader → 403 forbidden');
    [$status] = call($api, 'POST', '/admin/editors', ['email' => 'author@example.com']);
    check($status === 401, 'admin/editors without the secret or a session → 401');
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

    echo "roles, admin (docs/server.md \"Roles\")\n";
    [, $data] = call($api, 'GET', '/user', null, $session);
    check($data['user']['roles'] === ['reader'], 'GET /user lists the roles: every account has reader');
    [, $data] = call($api, 'GET', '/user', null, $editor);
    check($data['user']['roles'] === ['reader', 'editor'] && $data['user']['role'] === 'editor', 'an editor has reader and editor (role stays editor)');
    [$status, $data] = call($api, 'GET', '/admin/users');
    check($status === 401, 'admin endpoints without a session or the secret → 401');
    [$status, $data] = call($api, 'GET', '/admin/users', null, $editor);
    check($status === 403 && $data['error']['role'] === 'admin', 'an editor is no admin → 403 forbidden { role: admin }');
    $withSecret = fn(string $method, string $path, ?array $body = null): array => call($api, $method, $path, $body, null, 'http://localhost:5173', null, ['X-Admin-Secret: ' . str_repeat('s', 40)]);
    [$status, $data] = call($api, 'GET', '/admin/users', null, null, 'http://localhost:5173', null, ['X-Admin-Secret: wrong']);
    check($status === 403, 'a wrong secret → 403');
    [$status, $data] = $withSecret('GET', '/admin/users?q=AUTHOR');
    check($status === 200 && count($data['users']) === 1 && $data['users'][0]['email'] === 'author@example.com' && $data['total'] === 1, 'with the secret: search by e-mail (case-insensitive, a part)');
    $authorId = $data['users'][0]['id'];
    check($data['users'][0]['options']['bookUpdates'] === false && $data['users'][0]['language'] === 'en' && is_string($data['users'][0]['lastSeenAt']), 'a user comes with options, language and last seen');
    [, $data] = $withSecret('GET', '/admin/roles');
    check(array_column($data['roles'], 'name') === ['reader', 'editor', 'admin'], 'GET /admin/roles: reader, editor, admin with fixed ids');
    // An address in ADMINS (config) is an admin from its first sign-in – the instance's first admin without the secret
    call($api, 'POST', '/auth/request', ['email' => 'chief@example.com', 'options' => ['publisherUpdates' => true]]);
    [, $data] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    $chief = $data['session'];
    check($data['user']['roles'] === ['reader', 'admin'] && $data['user']['role'] === 'reader', 'an address listed in ADMINS signs in as an admin (not an editor)');
    [$status, $data] = call($api, 'GET', '/admin/users?role=admin', null, $chief);
    check($status === 200 && count($data['users']) === 1 && $data['users'][0]['grants'][1]['grantedBy'] === 'config', 'the admin may use the admin API; the grant says config');
    [$status, $data] = call($api, 'GET', '/editor/books', null, $chief);
    check($status === 403, 'but not the editor API');
    [$status, $data] = call($api, 'GET', '/admin/users?role=editor', null, $chief);
    check($status === 200 && count($data['users']) === 3, 'the editors: listed, author (made by the secret) and new-editor');
    [$status, $data] = call($api, 'PUT', "/admin/users/$authorId/roles/admin", null, $chief);
    check($status === 200 && $data['changed'] === true && $data['user']['roles'] === ['reader', 'editor', 'admin'], 'grant admin → changed, the user with its roles');
    $grant = array_values(array_filter($data['user']['grants'], fn(array $g) => $g['role'] === 'admin'))[0];
    check($grant['grantedByEmail'] === 'chief@example.com' && is_string($grant['grantedAt']), 'the grant records the granting admin');
    [$status, $data] = call($api, 'PUT', "/admin/users/$authorId/roles/admin", null, $chief);
    check($status === 200 && $data['changed'] === false, 'granting again changes nothing');
    [$status, $data] = call($api, 'DELETE', "/admin/users/$authorId/roles/editor", null, $chief);
    check($status === 200 && $data['changed'] === true && $data['user']['roles'] === ['reader', 'admin'] && $data['user']['role'] === 'reader', 'revoke editor → the user is a reader again');
    [$status] = call($api, 'GET', '/editor/books', null, $editor);
    check($status === 403, 'and may not use the editor API any more');
    $pdo = connect('test');
    check($pdo->query("SELECT role FROM users WHERE id = '$authorId'")->fetchColumn() === 'reader', 'users.role mirrors the editor role');
    $pdo = null;
    [$status, $data] = call($api, 'DELETE', "/admin/users/$authorId/roles/reader", null, $chief);
    check($status === 400 && $data['error']['code'] === 'invalid-role', 'reader cannot be revoked');
    [$status, $data] = call($api, 'PUT', "/admin/users/$authorId/roles/wizard", null, $chief);
    check($status === 404 && $data['error']['code'] === 'unknown-role', 'an unknown role → 404 unknown-role');
    [$status, $data] = call($api, 'PUT', '/admin/users/00000000-0000-4000-8000-000000000000/roles/editor', null, $chief);
    check($status === 404 && $data['error']['code'] === 'not-found', 'an unknown user → 404');
    [$status, $data] = call($api, 'DELETE', "/admin/users/$authorId/roles/admin", null, $editor);
    check($status === 200 && $data['changed'] === true, 'an admin may revoke their own admin role while another admin remains');
    [, $data] = call($api, 'GET', '/admin/users?q=chief', null, $chief);
    $chiefId = $data['users'][0]['id'];
    [$status, $data] = call($api, 'DELETE', "/admin/users/$chiefId/roles/admin", null, $chief);
    check($status === 409 && $data['error']['code'] === 'last-admin', 'the last admin keeps the role → 409 last-admin');
    [$status, $data] = call($api, 'PUT', "/admin/users/$authorId/roles/editor", null, $chief);
    check($status === 200 && $data['user']['role'] === 'editor', 'the author is an editor again');
    [$status] = call($api, 'GET', '/editor/books', null, $editor);
    check($status === 200, 'and the editor API opens again');
    [$status, $data] = $withSecret('PUT', "/admin/users/$chiefId/roles/editor");
    check($status === 200 && array_values(array_filter($data['user']['grants'], fn(array $g) => $g['role'] === 'editor'))[0]['grantedBy'] === 'secret', 'a grant with the secret says secret');
    $withSecret('DELETE', "/admin/users/$chiefId/roles/editor");
    [$status, $data] = call($api, 'POST', '/admin/editors', ['email' => 'invited@example.com'], $chief);
    check($status === 200 && $data['created'] === true && $data['user']['roles'] === ['reader', 'editor'], 'an admin invites an editor by e-mail (POST /admin/editors by session)');
    // The newsletter list: the users with an update option on, as CSV
    $csvContext = stream_context_create(['http' => ['header' => "Authorization: Bearer $chief", 'ignore_errors' => true]]);
    $csv = (string) file_get_contents("$api/admin/users.csv?newsletter=1", false, $csvContext);
    $lines = array_values(array_filter(explode("\n", trim($csv))));
    check(in_array('Content-Type: text/csv; charset=utf-8', $http_response_header, true) && (bool) preg_grep('/^Content-Disposition: attachment; filename="newsletter-/', $http_response_header), 'GET /admin/users.csv answers a CSV download');
    check($lines[0] === 'email,language,bookUpdates,artistUpdates,publisherUpdates,createdAt', 'the CSV header names the options');
    check(count($lines) === 2 && str_starts_with($lines[1], 'chief@example.com,en,no,no,yes,'), 'newsletter=1: only the users with an option on (the reader turned theirs off; chief: publisher updates)');
    $csv = (string) file_get_contents("$api/admin/users.csv?option=publisherUpdates", false, $csvContext);
    check(count(array_filter(explode("\n", trim($csv)))) === 2 && str_contains($csv, 'chief@example.com'), 'option=publisherUpdates narrows to that option');
    $csv = (string) file_get_contents("$api/admin/users.csv", false, $csvContext);
    check(count(array_filter(explode("\n", trim($csv)))) === 7, 'without a filter: every user');
    [$status] = call($api, 'GET', '/admin/users.csv', null, $editor);
    check($status === 403, 'the CSV needs an admin');
    // #99: the admin page grants editor to a reader-only account and shows the row the API answers with
    call($api, 'POST', '/auth/request', ['email' => 'reader99@example.com']);
    call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    [, $data] = call($api, 'GET', '/admin/users?q=reader99', null, $chief);
    $readerId = $data['users'][0]['id'];
    check($data['users'][0]['roles'] === ['reader'] && $data['users'][0]['role'] === 'reader', '#99: a new account is a reader only');
    [$status, $data] = call($api, 'PUT', "/admin/users/$readerId/roles/editor", null, $chief);
    check($status === 200 && $data['changed'] === true && $data['user']['id'] === $readerId && $data['user']['roles'] === ['reader', 'editor'] && $data['user']['role'] === 'editor', '#99: grant editor answers the row with editor on');
    check(array_column($data['user']['grants'], 'role') === ['reader', 'editor'] && $data['user']['grants'][1]['grantedByEmail'] === 'chief@example.com', '#99: and its grant, by the admin');
    [$status, $data] = call($api, 'GET', '/admin/users?role=editor&q=reader99', null, $chief);
    check($status === 200 && $data['total'] === 1 && $data['users'][0]['roles'] === ['reader', 'editor'], '#99: the Editors filter lists the new editor');
    [$status, $data] = call($api, 'GET', '/admin/users?role=editor', null, $chief);
    check($status === 200 && $data['total'] === count($data['users']) && in_array($readerId, array_column($data['users'], 'id'), true), '#99: the Editors filter without a search (count and list agree)');
    [$status, $data] = call($api, 'PUT', "/admin/users/$readerId/roles/editor", null, $chief);
    check($status === 200 && $data['changed'] === false && $data['user']['roles'] === ['reader', 'editor'], '#99: granting again is no change (the page says so instead of "Granted")');
    [$status, $data] = call($api, 'DELETE', "/admin/users/$readerId/roles/editor", null, $chief);
    check($status === 200 && $data['changed'] === true && $data['user']['roles'] === ['reader'], '#99: revoke answers the row with editor off');
    [$status, $data] = call($api, 'DELETE', "/admin/users/$readerId/roles/editor", null, $chief);
    check($status === 200 && $data['changed'] === false, '#99: revoking again is no change');

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
        // What the plugin registered, recorded by the content build (schema 2.14, #90): the API tells a typo from its node type
        'plugins' => [['id' => 'tint', 'src' => '/assets/content/plugins/tint/plugin.js', 'api' => '1.0', 'registered' => [
            'components' => ['tint' => ['description' => 'Tints.', 'params' => ['opacity' => ['kind' => 'number', 'default' => 0.3, 'min' => 0, 'max' => 1, 'description' => 'How much.']]]],
            'nodeTypes' => ['sparkle' => ['description' => 'Points.', 'params' => ['count' => ['kind' => 'number', 'default' => 50, 'min' => 1, 'max' => 500, 'description' => 'How many.']]]],
            'passes' => new stdClass(),
        ]]],
    ];
    $files = ['/assets/content/entries/racoon/racoon.glb' => ['size' => 1234, 'v' => 'abcdef012345'], '/assets/content/entries/racoon/img.jpg' => ['size' => 10, 'v' => '0123456789ab']];
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200 && $data['counts'] === ['spreads' => 2, 'entries' => 4, 'targets' => 2, 'entities' => 1], 'import → counts');
    check(preg_match('/^[0-9a-f]{12}$/', $data['draft']['build'] ?? '') === 1 && $data['book']['importedHash'] === str_repeat('ab', 32), 'import answers with the draft build and the imported hash');
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => ['book' => []]]));
    check($status === 400 && $data['error']['code'] === 'invalid-configuration', 'a configuration without a schema → 400');
    $bad = $configuration;
    $bad['entities']['castle']['type'] = 'hologram';
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $bad], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'an unknown entity type → 400 invalid-entity');
    $bad = $configuration;
    $bad['entries'][1]['target']['entity'] = ['ref' => 'ghost'];
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $bad], $flags));
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
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'No where!'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-env', 'an env that is no environment name → 400');
    foreach (['staging', 'production', 'nowhere'] as $env) {
        [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => $env], $editor);
        check($status === 403 && $data['error']['code'] === 'other-environment' && $data['error']['env'] === 'local' && !is_dir("$storeDir/$env"), "a local instance publishes to local only: $env → 403 other-environment, nothing written (#183)");
    }
    [$status, $data] = call($api, 'GET', '/editor/environments', null, $editor);
    $byEnv = array_column($data['environments'] ?? [], null, 'env');
    check($status === 200 && $data['env'] === 'local' && array_keys($byEnv) === ['local', 'staging', 'production'], 'environments: the own one first, local only because this instance is local');
    check($byEnv['local']['publish'] === true && $byEnv['local']['store'] === 'server' && str_ends_with((string) $byEnv['local']['url'], '/api/content/local')
        && str_contains((string) $byEnv['local']['warning'], 'No CDN connected – the published content is stored and served by this server only') && str_contains((string) $byEnv['local']['warning'], 'Back up the content store'),
        'the target local: this server, its URL, and the warning (content, not data)');
    check($byEnv['staging']['publish'] === false && $byEnv['production']['publish'] === false && $byEnv['staging']['warning'] === null && $byEnv['staging']['store'] === 'server', 'staging and production: no publish from here, no warning (not the target)');
    [$status] = call($api, 'GET', '/editor/environments', null, $chief);
    check($status === 403, 'environments: editors only (an admin without the editor role → 403)');
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

    echo "editor: one book per environment (#143)\n";
    [, $data] = call($api, 'GET', '/content/local/latest.json');
    [, $versions] = call($api, 'GET', '/content/local/versions.json');
    check(($data['book'] ?? null) === 'osct' && array_column($versions, 'book') === ['osct', 'osct'], 'latest.json and versions.json name the book');
    [, $data] = call($api, 'GET', '/editor/books', null, $editor);
    check($data['books'][0]['live'] === [['env' => 'local', 'build' => $second['build'], 'since' => $data['books'][0]['live'][0]['since'] ?? null]] && is_string($data['books'][0]['live'][0]['since']), 'the book list: the book is live on local, with its build and since when');
    check(count($data['environments']) === 1 && $data['environments'][0]['env'] === 'local' && $data['environments'][0]['book'] === 'osct', 'the book list names what each environment serves');
    $manifest = json_decode((string) file_get_contents("$storeDir/local/latest.json"), true);
    $withBook = file_get_contents("$storeDir/local/latest.json");
    unset($manifest['book']);
    file_put_contents("$storeDir/local/latest.json", json_encode($manifest));
    [, $data] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check(($data['book']['live'][0]['env'] ?? null) === 'local', "a manifest without book: its version's game.config.json tells (the tree shows it live)");
    file_put_contents("$storeDir/local/latest.json", $withBook);
    $demo = $configuration;
    $demo['book'] = ['id' => 'demo', 'title' => 'Demo', 'author' => 'Someone'];
    [$status] = importing($api, 'demo', $editor, json_encode(['configuration' => $demo], $flags));
    check($status === 200, 'a second book: demo');
    [, $data] = call($api, 'GET', '/editor/books', null, $editor);
    $byId = array_column($data['books'], null, 'id');
    check($byId['demo']['live'] === [] && count($byId['osct']['live']) === 1, 'the demo is draft only');
    [$status, $data] = call($api, 'POST', '/editor/books/demo/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'other-book' && $data['error']['current']['book'] === 'osct' && $data['error']['current']['title'] === 'Test Book' && $data['error']['current']['build'] === $second['build'], 'publishing another book over it → 409 other-book naming the current one');
    check(json_decode((string) file_get_contents("$storeDir/local/latest.json"), true)['book'] === 'osct', '… and nothing moved');
    [$status, $data] = call($api, 'POST', '/editor/books/demo/publish', ['env' => 'local', 'replace' => 'yes'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-replace', 'replace must be a boolean');
    [$status, $demoPublish] = call($api, 'POST', '/editor/books/demo/publish', ['env' => 'local', 'replace' => true], $editor);
    check($status === 200 && $demoPublish['replaced'] === ['book' => 'osct', 'build' => $second['build']], 'replace: true publishes it and names the book it replaced');
    [, $data] = call($api, 'GET', '/editor/books', null, $editor);
    $byId = array_column($data['books'], null, 'id');
    check(($byId['demo']['live'][0]['build'] ?? null) === $demoPublish['build'] && $byId['osct']['live'] === [], 'now the demo is live on local, the book is draft only');
    [$status, $data] = call($api, 'POST', '/editor/books/demo/publish', ['env' => 'local'], $editor);
    check($status === 200 && $data['replaced'] === null, 'the same book again: no replace needed');
    [$status] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 409, 'the book back needs replace too');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local', 'replace' => true], $editor);
    [, $versions] = call($api, 'GET', '/content/local/versions.json');
    $current = array_values(array_filter($versions, fn($v) => $v['retiredAt'] === null));
    check($status === 200 && $data['build'] === $second['build'] && $data['replaced']['book'] === 'demo' && count($current) === 1 && $current[0]['build'] === $second['build'] && $current[0]['book'] === 'osct', "switching back re-activates the book's version (no new folder)");

    echo "editor: import with a version comparison before it overwrites (#183)\n";
    $raw = fn(array $body) => call($api, 'POST', '/editor/books/osct/import', null, $editor, 'http://localhost:5173', json_encode($body, $flags));
    $incoming = $configuration;
    $incoming['version'] = ['version' => '1.42.0', 'timestamp' => '2026-10-30T08:00:00.000Z', 'hash' => str_repeat('cd', 32), 'schema' => '1.2'];
    [, $before] = call($api, 'GET', '/editor/books/osct/entities', null, $editor);
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files]);
    $comparison = $data['error']['comparison'] ?? [];
    $confirmation = $data['error']['confirmation'] ?? [];
    check($status === 409 && $data['error']['code'] === 'confirm-import' && preg_match('/^\d{10}\.[0-9a-f]{32}$/', $confirmation['id'] ?? '') === 1 && strtotime($confirmation['expiresAt'] ?? '') > time(),
        'an import over an existing book → 409 confirm-import with a confirmation id that expires');
    check(($comparison['book'] ?? null) === ['id' => 'osct', 'title' => 'Test Book'] && $comparison['incoming']['build'] === 'cdcdcdcdcdcd' && $comparison['incoming']['date'] === '2026-10-30T08:00:00.000Z'
        && $comparison['incoming']['appVersion'] === '1.42.0' && $comparison['incoming']['schema'] === '1.2' && $comparison['incoming']['source'] === 'configuration' && !isset($comparison['incoming']['digest']),
        'the comparison: the incoming build, its date, app and schema version');
    $basedOn = $comparison['draft']['basedOn'] ?? [];
    check(($basedOn['build'] ?? null) === 'abababababab' && $basedOn['date'] === '2026-01-01T00:00:00.000Z' && $basedOn['appVersion'] === '1.9.0' && $basedOn['importedBy'] === 'author@example.com' && is_string($basedOn['importedAt']),
        '… against what the draft is based on: build, date, app version, who imported it and when');
    check($comparison['draft']['edits'] === 3 && $comparison['draft']['recentEdits'][0]['kind'] === 'entity' && $comparison['draft']['recentEdits'][0]['ref'] === 'castle' && $comparison['draft']['recentEdits'][0]['user'] === 'author@example.com'
        && preg_match('/^[0-9a-f]{12}$/', $comparison['draft']['build']) === 1 && $comparison['same'] === false && ($comparison['draft']['live'][0]['env'] ?? null) === 'local',
        "… and the draft's unpublished edits since the import (the change log), its build and where it is live");
    [, $after] = call($api, 'GET', '/editor/books/osct/entities', null, $editor);
    check($after === $before, 'the first step changes nothing');
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => substr($confirmation['id'], 0, -1) . (str_ends_with($confirmation['id'], '0') ? '1' : '0')]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void' && isset($data['error']['comparison'], $data['error']['confirmation']), 'a forged confirmation → 409 confirmation-void, with a new comparison');
    [$status, $data] = $raw(['configuration' => $configuration, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void', 'the id is bound to the incoming content: another configuration → void');
    $castleNow = $before['entities']['castle'];
    $castleNow['params'] = ['scale' => 4];
    call($api, 'PUT', '/editor/books/osct/entities/castle', $castleNow, $editor);
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void' && $data['error']['comparison']['draft']['edits'] === 4, 'an edit after the comparison voids the id; the new comparison counts it');
    $confirmation = $data['error']['confirmation'];
    call($api, 'POST', '/auth/request', ['email' => 'listed@example.com']);
    [, $other] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    [$status, $data] = call($api, 'POST', '/editor/books/osct/import', null, $other['session'], 'http://localhost:5173', json_encode(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']], $flags));
    check($status === 409 && $data['error']['code'] === 'confirmation-void', "another editor cannot use someone's confirmation");
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 200 && $data['book']['importedHash'] === str_repeat('cd', 32) && $data['imported']['build'] === 'cdcdcdcdcdcd' && $data['imported']['appVersion'] === '1.42.0' && $data['imported']['importedBy'] === 'author@example.com',
        'the second step with the id imports and answers what the draft is now based on');
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void', 'the id is used up: the same import again needs a new comparison');
    check($data['error']['comparison']['draft']['edits'] === 0 && $data['error']['comparison']['same'] === true && $data['error']['comparison']['draft']['basedOn']['build'] === 'cdcdcdcdcdcd',
        'after the import: no edits since, the same build comes in');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'back to the first configuration (both steps)');
    echo "editor: assets base\n";
    $base = 'https://cdn.example/staging/0123456789ab';
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files, 'assetsBase' => "$base/"], $flags));
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
    check(count($data['changes']) === 4 && $tree['spreads'][0]['entries'][0]['target']['entity']['params'] === ['scale' => 0.5], 're-import replaced the edited rows; the change log stays');

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
    // Content schema 2.12: every node may carry a name (the editor's tree shows it)
    $named = $tree;
    $named['name'] = 'Castle and title';
    $named['children'][1]['name'] = 'Title';
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $named, $editor);
    check($status === 200 && $data['entity']['name'] === 'Castle and title' && $data['entity']['children'][1]['name'] === 'Title', 'PUT entity with node names → kept');
    $named['children'][0]['name'] = 7;
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $named, $editor);
    check($status === 400 && str_contains($data['error']['message'] ?? '', 'children[0].name'), 'a name that is no string → 400 with its path');
    $deep = ['type' => 'group', 'assets' => []];
    for ($i = 0; $i < 9; $i++) $deep = ['type' => 'group', 'assets' => [], 'children' => [$deep]];
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', $deep, $editor);
    check($status === 400, 'nodes deeper than 8 levels → 400');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    check($status === 200 && !isset($data['entity']['children']), 'back to one node');

    echo "editor: plugins (the Code tab's sources)\n";
    [$status, $data] = call($api, 'GET', '/editor/books/osct/plugins', null, $editor);
    check($status === 200 && $data['plugins'] === [], 'no plugin sources yet');
    $source = "export const register = (api) => { api.log('hi'); };\n";
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/plugins/glow', ['source' => $source], $editor);
    check($status === 200 && $data['plugin']['id'] === 'glow' && $data['plugin']['source'] === $source && $data['plugin']['size'] === strlen($source) && $data['plugin']['updatedBy'] === 'author@example.com', 'PUT a plugin source → saved with size and author');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/plugins/Glow', ['source' => $source], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-plugin', 'an upper-case id → 400 invalid-plugin');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/plugins/glow', ['source' => 3], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-plugin', 'a source that is no string → 400');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/plugins/glow', ['source' => str_repeat('x', 262145)], $editor);
    check($status === 413, 'a source above 256 KB → 413');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/plugins/glow', ['source' => "$source// v2\n"], $editor);
    [$status, $data] = call($api, 'GET', '/editor/books/osct/plugins/glow', null, $editor);
    check($status === 200 && str_ends_with($data['plugin']['source'], "// v2\n"), 'GET the plugin → the new source');
    [$status, $data] = call($api, 'GET', '/editor/books/osct/plugins', null, $editor);
    check($status === 200 && count($data['plugins']) === 1 && $data['plugins'][0]['id'] === 'glow' && !isset($data['plugins'][0]['source']), 'the list names the plugin without its source');
    [, $data] = call($api, 'GET', '/editor/books/osct/changes?limit=2', null, $editor);
    check($data['changes'][0]['kind'] === 'plugin' && $data['changes'][0]['ref'] === 'glow' && str_ends_with($data['changes'][0]['after'], "// v2\n") && $data['changes'][1]['before'] === null, 'every save is a change with the source before and after');
    [, $m] = call($api, 'GET', '/editor/books/osct/draft/latest.json', null, $editor);
    $rawDraft = (string) file_get_contents("$api/editor/books/osct/draft/{$m['build']}/game.config.json", false, $withToken);
    check(!str_contains($rawDraft, 'glow') && str_contains($rawDraft, '"plugins":[{"id":"tint","src":"' . $base . '/assets/content/plugins/tint/plugin.js","api":"1.0","registered":{"components":{"tint":'), 'the draft declares the imported compiled plugins (below the assets base) with what they recorded, never an editor source');
    [$status] = call($api, 'DELETE', '/editor/books/osct/plugins/glow', null, $editor);
    [$status2] = call($api, 'GET', '/editor/books/osct/plugins/glow', null, $editor);
    check($status === 204 && $status2 === 404, 'DELETE → 204, then 404');
    // Publishing content whose nodes use a component no plugin of the content can provide is refused
    $castle = $configuration['entities']['castle'];
    $castle['components'] = [['type' => 'tint', 'opacity' => 0.4]];
    call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    [$status] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'with a plugin declared, a node may use its component');
    $noPlugins = $configuration;
    unset($noPlugins['plugins']);
    importing($api, 'osct', $editor, json_encode(['configuration' => $noPlugins, 'files' => $files], $flags));
    call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-components' && $data['error']['components'] === ['tint'], 'without one, publish → 409 unknown-components naming the types');

    echo "editor: a plugin's node type (#77)\n";
    // A node type outside ENTITY_TYPES passes only in a book with plugins (declared, or sources of the Code tab)
    $sparkly = $configuration['entities']['castle'];
    $sparkly['children'] = [['type' => 'sparkle', 'assets' => [], 'params' => ['position' => [0, 0.1, 0], 'count' => 120]]];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $sparkly, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'children[0].type') && str_contains($data['error']['message'], 'needs a plugin'), 'a book without plugins: a plugin node type → 400 invalid-entity');
    call($api, 'PUT', '/editor/books/osct/plugins/sparkle', ['source' => "export const register = (api) => api.registerNodeType('sparkle', { description: 'x', params: {} }, ({ three }) => ({ object: new three.Points() }));\n"], $editor);
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $sparkly, $editor);
    check($status === 200 && $data['entity']['children'][0]['type'] === 'sparkle' && $data['entity']['children'][0]['params']['count'] === 120, 'with a source in the Code tab, the node type passes, its params kept');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/targets/racoon', ['entity' => ['type' => 'sparkle', 'assets' => []]], $editor);
    check($status === 200 && $data['target']['entity']['type'] === 'sparkle', 'a target\'s own entity may be one too');
    foreach (['Sparkle', 'spark-le', str_repeat('a', 33), 42] as $badType) {
        [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', ['type' => $badType, 'assets' => []], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-entity', 'a type not named like a plugin\'s (' . json_encode($badType) . ') → 400 even with plugins');
    }
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-node-types' && $data['error']['nodeTypes'] === ['sparkle'], 'without a declared plugin, publish → 409 unknown-node-types naming the types');
    call($api, 'DELETE', '/editor/books/osct/plugins/sparkle', null, $editor);
    // The import: allowed with plugins declared, refused without (and without sources)
    $withNodes = $configuration;
    $withNodes['entities']['castle'] = $sparkly;
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $withNodes, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin node type with plugins declared → 200');
    [$status] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'with a plugin declared, a node may have its type');
    unset($withNodes['plugins']);
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $withNodes, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'import: a plugin node type without plugins → 400 invalid-entity');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the plugins');

    echo "editor: the plugins' recorded specs (#90)\n";
    // The declared plugins recorded what they register: their node type passes, any other name is a typo
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', ['type' => 'sparkel', 'assets' => []], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'a plugin of the book registers (sparkle)'), 'a node type no declared plugin recorded → 400 naming the plugins\' node types');
    [$status] = call($api, 'PUT', '/editor/books/osct/targets/racoon', ['entity' => ['type' => 'sparkle', 'assets' => []]], $editor);
    check($status === 200, 'the recorded node type passes');
    $typo = $configuration;
    $typo['entities']['castle'] = ['type' => 'sparkel', 'assets' => []];
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $typo, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'import: a node type the configuration\'s plugins did not record → 400');
    // A component no declared plugin recorded is refused at publish, although the book declares plugins
    $glowing = $configuration['entities']['castle'];
    $glowing['components'] = [['type' => 'glow']];
    call($api, 'PUT', '/editor/books/osct/entities/castle', $glowing, $editor);
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-components' && $data['error']['components'] === ['glow'], 'publish: a component the declared plugins did not record → 409 unknown-components');
    // A plugin of an older build (nothing recorded) may register anything: a camelCase name passes, as before
    $older = $typo;
    unset($older['plugins'][0]['registered']);
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $older, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin without recorded specs lets a camelCase node type pass');
    $broken = $configuration;
    $broken['plugins'][0]['registered'] = ['nodeTypes' => ['sparkle']];
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $broken, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-configuration', 'import: registered.nodeTypes that is no object → 400');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the recorded plugins');

    echo "editor: a plugin's material (#188)\n";
    // A node's material (schema 2.17) is a plugin's: the recorded materials pass, any other is a typo; the publish checks
    $watery = $configuration;
    $watery['plugins'][0]['registered']['materials'] = ['water' => ['description' => 'Water.', 'params' => [
        'caustics' => ['kind' => 'texture', 'default' => '', 'description' => 'The caustics.'],
    ]]];
    $watery['plugins'][0]['registered']['textures'] = ['caustics' => ['description' => 'Light on the floor.', 'params' => new stdClass()]];
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $watery, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin with recorded materials and textures → 200');
    $tank = $configuration['entities']['castle'];
    $tank['material'] = ['type' => 'water', 'params' => ['caustics' => 'caustics']];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', $tank, $editor);
    check($status === 200 && $data['entity']['material']['type'] === 'water' && $data['entity']['material']['params']['caustics'] === 'caustics', 'a recorded material passes, its params kept');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', ['type' => 'group', 'assets' => [], 'material' => ['type' => 'lava']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'material.type') && str_contains($data['error']['message'], '(water)'), 'a material no declared plugin recorded → 400 naming the plugins\' materials');
    foreach ([['type' => 'Water'], ['params' => new stdClass()], 'water', ['type' => 'water', 'params' => [1, 2]]] as $badMaterial) {
        [$status, $data] = call($api, 'PUT', '/editor/books/osct/entities/castle', ['type' => 'group', 'assets' => [], 'material' => $badMaterial], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-entity', 'a material that is no { type, params? } (' . json_encode($badMaterial) . ') → 400');
    }
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', $tank, $editor);
    [$status] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'publish: a node with a recorded material → 200');
    // A Code tab source may register anything: the save passes, the publish refuses a material no compiled plugin provides
    call($api, 'PUT', '/editor/books/osct/plugins/lava', ['source' => "export const register = (api) => api.registerMaterial('lava', { description: 'x', params: {} }, ({ three }) => new three.MeshBasicMaterial());\n"], $editor);
    $lava = $tank;
    $lava['material'] = ['type' => 'lava'];
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', $lava, $editor);
    check($status === 200, 'with a source in the Code tab, a material it may register passes');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-materials' && $data['error']['materials'] === ['lava'], 'publish: a material no compiled plugin provides → 409 unknown-materials naming it');
    call($api, 'DELETE', '/editor/books/osct/plugins/lava', null, $editor);
    $dry = $noPlugins;
    $dry['entities']['castle'] = $tank;
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $dry, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'no plugins'), 'import: a material in a book without plugins → 400');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the recorded plugins');

    echo "editor: assets\n";
    // A 1×1 PNG and a tiny glb-like file (the API checks the type by the name, not the bytes)
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    [$status, $data] = upload($api, 'POST', '/editor/books/osct/assets', $png, 'Dot.png', $editor);
    $asset = $data['asset'] ?? null;
    check($status === 201 && $asset && $asset['kind'] === 'image' && $asset['width'] === 1 && $asset['height'] === 1 && $asset['version'] === 1 && str_ends_with($asset['url'], '/v1.png'), 'upload → 201 image asset with its size');
    check(str_starts_with($asset['url'], "$api/content/assets/osct/"), 'the local store\'s URL is this API\'s content route');
    [$status, $same] = upload($api, 'POST', '/editor/books/osct/assets', $png, 'again.png', $editor);
    check($status === 200 && $same['asset']['id'] === $asset['id'], 'the same bytes again → the same asset');
    [$status, $data] = upload($api, 'POST', '/editor/books/osct/assets', 'not a model', 'thing.exe', $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-file', 'an unsupported type → 400 invalid-file');
    [$status] = upload($api, 'POST', '/editor/books/osct/assets', '', 'empty.png', $editor);
    check($status === 400, 'an empty file → 400');
    $file = file_get_contents($asset['url']);
    check($file === $png, 'the file is served by the content route');
    check(in_array('Content-Type: image/png', $http_response_header, true) && in_array('Access-Control-Allow-Origin: *', $http_response_header, true), 'with its type and open CORS');
    [$status, $data] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    check($status === 200 && count($data['assets']) === 3 && $data['assets'][0]['id'] === $asset['id'] && $data['assets'][0]['usages'] === 0 && $data['assets'][0]['imported'] === false, 'the list: the upload, unused, first');
    $imported = array_values(array_filter($data['assets'], fn($a) => $a['imported']));
    check(count($imported) === 2 && $imported[0]['name'] === 'racoon.glb' && $imported[0]['kind'] === 'glb' && $imported[0]['size'] === 1234 && $imported[0]['url'] === '/assets/content/entries/racoon/racoon.glb' && $imported[1]['kind'] === 'image', 'and the files of the import (files.json) after it');
    check($imported[0]['usages'] === 1 && $imported[1]['usages'] === 1, 'an imported file counts its uses (the entity in the target, the target image)');
    // Below an assets base the list shows CDN URLs, the rows still name the content paths: the uses count all the same (#121)
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files, 'assetsBase' => 'https://cdn.example/staging/0123456789ab/'], $flags));
    [, $data] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    $based = array_values(array_filter($data['assets'], fn($a) => $a['imported']));
    check($status === 200 && $based[0]['url'] === 'https://cdn.example/staging/0123456789ab/assets/content/entries/racoon/racoon.glb' && $based[0]['usages'] === 1 && $based[1]['usages'] === 1, 'an imported file used by a target counts 1 below an assets base too');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again without the base');
    [, $filtered] = call($api, 'GET', '/editor/books/osct/assets?kind=image', null, $editor);
    check(count($filtered['assets']) === 2 && array_column($filtered['assets'], 'kind') === ['image', 'image'], 'the kind filter applies to both');
    [$status, $data] = call($api, 'DELETE', "/editor/books/osct/assets/{$imported[0]['id']}", null, $editor);
    check($status === 404, 'an imported file is read-only (no delete, replace or usages: 404)');
    // Used by a node: the usages know, delete refuses, replace relinks
    $image = ['type' => 'image', 'assets' => [['id' => 'castle-img', 'assetType' => 'image', 'src' => $asset['url']]]];
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', $image, $editor);
    check($status === 200, 'a node takes the asset\'s URL');
    [$status, $data] = call($api, 'GET', "/editor/books/osct/assets/{$asset['id']}/usages", null, $editor);
    check($status === 200 && $data['usages'] === [['kind' => 'entity', 'ref' => 'castle']], 'usages: the entity');
    [$status, $data] = call($api, 'DELETE', "/editor/books/osct/assets/{$asset['id']}", null, $editor);
    check($status === 409 && $data['error']['code'] === 'asset-in-use' && $data['error']['usages'][0]['ref'] === 'castle', 'delete while used → 409 with the usages');
    $png2 = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9Qz4AEGHEJAAB3AgT/0hQgCwAAAABJRU5ErkJggg==');
    [$status, $data] = upload($api, 'PUT', "/editor/books/osct/assets/{$asset['id']}/file", $png2, 'dot2.png', $editor);
    check($status === 200 && $data['asset']['version'] === 2 && str_ends_with($data['asset']['url'], '/v2.png') && $data['relinked'] === 1, 'replace → version 2 at a new path, one row relinked');
    $v2 = $data['asset']['url'];
    [, $data] = call($api, 'GET', '/editor/books/osct/entities', null, $editor);
    check($data['entities']['castle']['assets'][0]['src'] === $v2, 'the node names the new version');
    [$status, $data] = upload($api, 'PUT', "/editor/books/osct/assets/{$asset['id']}/file", 'glb bytes', 'tree.glb', $editor);
    check($status === 400, 'a replace of another kind → 400');
    [$status] = call($api, 'DELETE', "/editor/books/osct/assets/{$asset['id']}?force=1", null, $editor);
    check($status === 204, 'forced delete → 204');
    [$status] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    [, $data] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    check(array_column($data['assets'], 'imported') === [true, true], 'gone from the list (the imported files stay)');
    $gone = @file_get_contents($v2);
    check($gone === false, 'and from the store');

    echo "editor: a video's width, height and duration (#91)\n";
    require_once "$root/api/src/VideoInfo.php";
    $mp4 = mp4File(1000, 2500, [[0, 0, 'soun'], [640, 360, 'vide']]);
    check(VideoInfo::read($mp4, 'mp4') === ['width' => 640, 'height' => 360, 'durationMs' => 2500], 'mp4: the video track\'s size (not the sound track\'s), mvhd\'s duration');
    $mov = mp4File(600, 2700, [[1920, 1080, 'vide']], true, true, true);
    check(VideoInfo::read($mov, 'mov') === ['width' => 1080, 'height' => 1920, 'durationMs' => 4500], 'mov: version 1 mvhd, a 64-bit mdat, a quarter-turned track reads portrait');
    $webm = webmFile(1080, 1920, 4200.0);
    check(VideoInfo::read($webm, 'webm') === ['width' => 1080, 'height' => 1920, 'durationMs' => 4200], 'webm: Info\'s duration, the video TrackEntry\'s pixels (unknown-size Segment)');
    check(VideoInfo::read(webmFile(320, 240, 150.0, 10000000, false), 'mkv') === ['width' => 320, 'height' => 240, 'durationMs' => 1500], 'mkv: the duration in TimecodeScale units');
    check(VideoInfo::read(substr($mp4, 0, 200), 'mp4') === ['width' => null, 'height' => null, 'durationMs' => null]
        && VideoInfo::read('not a video at all', 'webm') === ['width' => null, 'height' => null, 'durationMs' => null], 'a truncated or foreign file: nulls, no error');
    [$status, $data] = upload($api, 'POST', '/editor/books/osct/assets', $mp4, 'Clip.mp4', $editor);
    $video = $data['asset'] ?? null;
    check($status === 201 && $video['kind'] === 'video' && $video['width'] === 640 && $video['height'] === 360 && $video['durationMs'] === 2500, 'upload of an mp4 → its width, height and duration');
    [, $data] = upload($api, 'POST', '/editor/books/osct/assets', $png . 'still', 'still.png', $editor);
    $still = $data['asset'];
    check($still['width'] === 1 && $still['durationMs'] === null, 'an image has no duration');
    [, $data] = upload($api, 'POST', '/editor/books/osct/assets', 'no header here', 'broken.mp4', $editor);
    $broken = $data['asset'];
    check($broken['width'] === null && $broken['height'] === null && $broken['durationMs'] === null, 'a video whose header cannot be read uploads with nulls');
    [, $data] = call($api, 'GET', '/editor/books/osct/assets?kind=video', null, $editor);
    $listed = array_values(array_filter($data['assets'], fn($a) => $a['id'] === $video['id']))[0] ?? null;
    check($listed && $listed['width'] === 640 && $listed['height'] === 360 && $listed['durationMs'] === 2500, 'the list answers them');
    [$status, $data] = call($api, 'GET', "/editor/books/osct/assets/{$video['id']}/usages", null, $editor);
    check($status === 200 && $data['usages'] === [] && $data['asset']['durationMs'] === 2500 && $data['asset']['width'] === 640, 'the usages answer the asset with them');
    [$status, $data] = upload($api, 'PUT', "/editor/books/osct/assets/{$video['id']}/file", $webm, 'clip.webm', $editor);
    check($status === 200 && $data['asset']['width'] === 1080 && $data['asset']['height'] === 1920 && $data['asset']['durationMs'] === 4200, 'a replace (a webm) records the new file\'s numbers');
    foreach ([$video, $still, $broken] as $uploaded) call($api, 'DELETE', "/editor/books/osct/assets/{$uploaded['id']}?force=1", null, $editor);

    echo "editor: targets and entries\n";
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/targets/racoon', ['imageSrc' => 'https://cdn.example/racoon-v2.jpg', 'print' => ['surface' => 'right', 'x' => 20, 'y' => 30, 'width' => 80]], $editor);
    check($status === 200 && $data['target']['imageSrc'] === 'https://cdn.example/racoon-v2.jpg' && $data['target']['print']['width'] == 80, 'PUT target: image and print placement');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/targets/racoon', ['print' => ['surface' => 'top', 'x' => 1, 'y' => 1, 'width' => 1]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'a bad surface → 400 invalid-target');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    $racoonEntry = $tree['spreads'][0]['entries'][0];
    check($racoonEntry['target']['print']['surface'] === 'right', 'the tree carries the print placement');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Shadows & Light', 'page' => 1, 'target' => ['imageSrc' => 'https://cdn.example/shadows.jpg', 'print' => ['surface' => 'left', 'x' => 10, 'y' => 10, 'width' => 60]]], $editor);
    check($status === 201 && $data['entry']['id'] === 'p1-shadows-light' && $data['entry']['target']['id'] === 'p1-shadows-light' && $data['spreadId'] === $tree['spreads'][0]['id'], 'POST entry → 201 with a slug id, on the page\'s spread');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Shadows & Light', 'page' => 1, 'target' => ['imageSrc' => 'x.jpg']], $editor);
    check($status === 409 && $data['error']['code'] === 'duplicate-id', 'the same id again → 409');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/entries', ['title' => 'No target', 'page' => 1], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'without a target → 400');
    [, $manifest2] = call($api, 'GET', '/editor/books/osct/draft/latest.json', null, $editor);
    $draft2 = json_decode((string) file_get_contents("$api/editor/books/osct/draft/{$manifest2['build']}/game.config.json", false, $withToken), true);
    $added = array_values(array_filter($draft2['entries'], fn($e) => $e['id'] === 'p1-shadows-light'));
    check(count($added) === 1 && $added[0]['target']['print']['surface'] === 'left' && $added[0]['tags'] === [], 'the draft has the new entry with its target');
    [$status] = deleting($api, '/editor/books/osct/entries/p1-shadows-light', $editor);
    check($status === 200, 'DELETE entry, confirmed → 200');
    [$status] = call($api, 'DELETE', '/editor/books/osct/entries/p1-shadows-light', null, $editor);
    check($status === 404, 'again → 404');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check(!in_array('p1-shadows-light', array_column($tree['spreads'][0]['entries'], 'id'), true), 'gone from the tree');

    echo "editor: spread formats (content schema 2.3)\n";
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'cover'], $editor);
    check($status === 201 && $data['spread'] === ['id' => 'cover', 'title' => 'Cover', 'firstPage' => 0, 'lastPage' => 0, 'format' => 'cover'], 'POST spreads cover → page 0, first');
    [$status] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'cover'], $editor);
    check($status === 409, 'a second cover → 409');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'back', 'title' => 'Rückseite'], $editor);
    $lastPage = max(array_map(fn($s) => $s['lastPage'], $tree['spreads']));
    check($status === 201 && $data['spread']['firstPage'] === $lastPage + 1 && $data['spread']['title'] === 'Rückseite', 'POST spreads back → the page after the last');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($tree['spreads'][0]['id'] === 'cover' && end($tree['spreads'])['id'] === 'back', 'the tree: cover first, back last');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/spreads/' . $tree['spreads'][1]['id'], ['title' => 'First pages'], $editor);
    check($status === 200 && $data['spread']['title'] === 'First pages' && !isset($data['spread']['format']), 'PUT spread title');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/spreads/' . $tree['spreads'][1]['id'], ['format' => 'cover'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-spread', 'a double page cannot become the cover');
    echo "editor: spread passes (content schema 2.5)\n";
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/spreads/' . $tree['spreads'][1]['id'], ['passes' => [['type' => 'bloom', 'strength' => 0.8], ['type' => 'vignette']]], $editor);
    check($status === 200 && $data['spread']['passes'] === [['type' => 'bloom', 'strength' => 0.8], ['type' => 'vignette']], 'PUT spread passes');
    [, $m] = call($api, 'GET', '/editor/books/osct/draft/latest.json?t=2', null, $editor);
    [, $draftNow] = call($api, 'GET', "/editor/books/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftNow['spreads'][1]['passes'] ?? null) === [['type' => 'bloom', 'strength' => 0.8], ['type' => 'vignette']], 'the draft carries the passes');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/spreads/' . $tree['spreads'][1]['id'], ['passes' => [['type' => 'glow']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-spread', 'an unknown pass type is refused');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/spreads/' . $tree['spreads'][1]['id'], ['passes' => null], $editor);
    check($status === 200 && !isset($data['spread']['passes']), 'passes: null removes the list');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Seal', 'page' => 0, 'target' => ['imageSrc' => 'https://cdn.example/seal.jpg', 'print' => ['surface' => 'front', 'x' => 60, 'y' => 100, 'width' => 100]]], $editor);
    check($status === 201 && $data['spreadId'] === 'cover' && $data['entry']['target']['print']['surface'] === 'front', 'an entry on page 0 lands on the cover, printed on its front');

    echo "editor: add and remove spreads (#166)\n";
    // The book now: cover (0), s1 (1–2), s2 (3–4), back (5); entries racoon p1, castle p3, link p4, lost p99, seal p0
    $draftOf = function () use ($api, $editor): array {
        [, $m] = call($api, 'GET', '/editor/books/osct/draft/latest.json?t=' . mt_rand(), null, $editor);
        [, $d] = call($api, 'GET', "/editor/books/osct/draft/{$m['build']}/game.config.json", null, $editor);
        return [$m['build'], $d];
    };
    $pagesOf = fn(array $tree) => array_map(fn($s) => [$s['id'], $s['firstPage'], $s['lastPage']], $tree['spreads']);
    [$status] = call($api, 'PUT', '/editor/books/osct/targets/castle-target', ['print' => ['page' => 3, 'surface' => 'left', 'x' => 10, 'y' => 10, 'width' => 50]], $editor);
    check($status === 200, 'the castle is printed on page 3');
    [$buildBefore] = $draftOf();
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread'], $editor);
    check($status === 201 && $data['spread'] === ['id' => 'spread-1', 'title' => 'New spread', 'firstPage' => 5, 'lastPage' => 6], 'POST spreads { format: spread } → a double page after the last one, before the back cover');
    check($data['moved'] === ['spreads' => 1, 'entries' => 1, 'targets' => 0], 'the back cover and the entry on page 99 are numbered on');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($pagesOf($tree) === [['cover', 0, 0], ['s1', 1, 2], ['s2', 3, 4], ['spread-1', 5, 6], ['back', 7, 7]], 'the tree: the new spread before the back cover, the back on page 7');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'after' => 's1', 'title' => 'Between'], $editor);
    check($status === 201 && $data['spread'] === ['id' => 'spread-2', 'title' => 'Between', 'firstPage' => 3, 'lastPage' => 4], 'POST spreads { after: s1 } → pages 3–4');
    check($data['moved'] === ['spreads' => 3, 'entries' => 3, 'targets' => 1], 'between two: the later spreads, their entries and the printed page move');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($pagesOf($tree) === [['cover', 0, 0], ['s1', 1, 2], ['spread-2', 3, 4], ['s2', 5, 6], ['spread-1', 7, 8], ['back', 9, 9]], 'pages numbered on: s2 5–6, spread-1 7–8, back 9');
    $castle = array_values(array_filter($tree['spreads'][3]['entries'], fn($e) => $e['id'] === 'castle'))[0] ?? null;
    check(array_column($tree['spreads'][3]['entries'], 'page') === [5, 6] && ($castle['target']['print']['page'] ?? null) === 5, 'the entries moved with their spread: castle on 5 (and printed there), the link on 6');
    check($tree['spreads'][2]['entries'] === [] && $tree['unassigned'][0]['page'] === 103, 'the new spread is empty; the entry in no spread moved on too');
    [, $draftNow] = $draftOf();
    $entryPages = array_column($draftNow['entries'], 'page', 'id');
    check($draftNow['spreads'][3] === ['id' => 's2', 'title' => 'Two', 'firstPage' => 5, 'lastPage' => 6, 'note' => 'an extra field'] && $entryPages['castle'] === 5 && $entryPages['racoon'] === 1 && $entryPages['p0-seal'] === 0,
        'the draft: the moved spread keeps its fields, the earlier entries stay');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'after' => 'cover', 'id' => 'opening'], $editor);
    check($status === 201 && $data['spread']['id'] === 'opening' && $data['spread']['firstPage'] === 1 && $data['moved']['spreads'] === 5, 'after the cover → pages 1–2 with the given id, everything after moves');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'after' => 'back'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-spread', 'nothing after the back cover → 400');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'after' => 'nowhere'], $editor);
    check($status === 400 && $data['error']['code'] === 'unknown-spread', 'after an unknown spread → 400 unknown-spread');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'id' => 's1'], $editor);
    check($status === 409 && $data['error']['code'] === 'duplicate-id', 'a spread id that exists → 409');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'cover', 'after' => 's1'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-spread', 'a cover takes no after');
    [$status, $data] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'poster'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-spread', 'an unknown format → 400');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/s2', null, $editor);
    check($status === 409 && $data['error']['code'] === 'confirm-delete' && array_column($data['error']['impact']['entries'], 'id') === ['castle', 'link'], 'removing a spread with entries → 409 confirm-delete: the impact names them, nothing goes yet');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/s1', null, $editor);
    check($status === 409 && $data['error']['code'] === 'initial-spread', 'removing the spread the book opens on → 409 initial-spread');
    [$status] = call($api, 'DELETE', '/editor/books/osct/spreads/nowhere', null, $editor);
    check($status === 404, 'removing an unknown spread → 404');
    [$status] = deleting($api, '/editor/books/osct/spreads/opening', $editor);
    [$status2] = deleting($api, '/editor/books/osct/spreads/spread-2', $editor);
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($status === 200 && $status2 === 200 && $pagesOf($tree) === [['cover', 0, 0], ['s1', 1, 2], ['s2', 3, 4], ['spread-1', 5, 6], ['back', 7, 7]], 'DELETE an empty spread, confirmed → 200, the later pages numbered back');
    [$status] = deleting($api, '/editor/books/osct/spreads/spread-1', $editor);
    [$buildAfter, $draftNow] = $draftOf();
    check($status === 200 && $buildAfter === $buildBefore, 'added and removed again: the same draft as before (pages, entries, prints)');
    [$status, $data] = call($api, 'GET', '/editor/books/osct/changes?limit=500', null, $editor);
    check(count(array_filter($data['changes'], fn($c) => $c['kind'] === 'spread' && $c['ref'] === 'spread-1' && $c['after'] === null)) === 1, 'the change log has the removal');
    [$status] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'after' => 'cover', 'id' => 'first'], $editor);
    [$status2] = deleting($api, '/editor/books/osct/spreads/first', $editor);
    check($status === 201 && $status2 === 200 && $draftOf()[0] === $buildBefore, 'a double page before everything, and gone again');
    [$status] = deleting($api, '/editor/books/osct/spreads/back', $editor);
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check($status === 200 && $pagesOf($tree) === [['cover', 0, 0], ['s1', 1, 2], ['s2', 3, 4]] && $tree['unassigned'][0]['page'] === 99, 'removing the back cover moves no page');
    [$status] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'back', 'title' => 'Rückseite'], $editor);
    check($status === 201 && $draftOf()[0] === $buildBefore, 'the back cover added again: the same draft');
    [$status] = call($api, 'PUT', '/editor/books/osct/targets/castle-target', ['print' => null], $editor);
    check($status === 200, 'the castle print removed again');

    echo "editor: removing a spread or an entry with everything on it, in two steps (#198)\n";
    // A double page 5–6 with three entries: e1 (its own file, the shared entity castle – also on castle-target), e2 (a
    // file used elsewhere too, its own entity naming a second file of its own), e3 (the shared entity lamp, only here)
    [$buildStart] = $draftOf();
    [$status] = call($api, 'POST', '/editor/books/osct/spreads', ['format' => 'spread', 'after' => 's2', 'id' => 'doomed', 'title' => 'Doomed'], $editor);
    [, $up] = upload($api, 'POST', '/editor/books/osct/assets', $png . 'only-a', 'a-only.png', $editor);
    $onlyA = $up['asset'];
    [, $up] = upload($api, 'POST', '/editor/books/osct/assets', $png . 'only-b', 'b-only.png', $editor);
    $onlyB = $up['asset'];
    [, $up] = upload($api, 'POST', '/editor/books/osct/assets', $png . 'shared', 'shared.png', $editor);
    $sharedFile = $up['asset'];
    call($api, 'PUT', '/editor/books/osct/entities/lamp', ['type' => 'model', 'assets' => [['id' => 'lamp-0', 'assetType' => 'glb', 'src' => 'https://cdn.example/lamp.glb']]], $editor);
    $made = [
        call($api, 'POST', '/editor/books/osct/entries', ['title' => 'One', 'page' => 5, 'id' => 'e1', 'target' => ['imageSrc' => $onlyA['url'], 'entity' => ['ref' => 'castle']]], $editor)[0],
        call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Two', 'page' => 6, 'id' => 'e2', 'target' => ['imageSrc' => $sharedFile['url'],
            'entity' => ['type' => 'image', 'assets' => [['id' => 'b', 'assetType' => 'image', 'src' => $onlyB['url']]]]]], $editor)[0],
        call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Three', 'page' => 6, 'id' => 'e3', 'target' => ['imageSrc' => 'https://cdn.example/three.jpg', 'entity' => ['ref' => 'lamp']]], $editor)[0],
        call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Elsewhere', 'page' => 1, 'id' => 'e4', 'target' => ['imageSrc' => $sharedFile['url']]], $editor)[0],
    ];
    check($status === 201 && $made === [201, 201, 201, 201], 'the double page, three files, the entity lamp and four entries (one of them on page 1)');
    [, $before] = call($api, 'GET', '/editor/books/osct/changes?limit=500', null, $editor);
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', null, $editor);
    $impact = $data['error']['impact'] ?? [];
    $first = $data['error']['confirmation']['id'] ?? '';
    check($status === 409 && $data['error']['code'] === 'confirm-delete' && preg_match('/^\d{10}\.[0-9a-f]{32}$/', $first) === 1
        && strtotime($data['error']['confirmation']['expiresAt']) > time(), 'without confirm → 409 confirm-delete with a confirmation id that expires');
    check(($impact['spread'] ?? null) === ['id' => 'doomed', 'title' => 'Doomed', 'firstPage' => 5, 'lastPage' => 6, 'format' => 'spread'] && $impact['pagesBack'] === 2 && $impact['kind'] === 'spread',
        'the impact: the spread, the pages that move back');
    check($impact['counts'] === ['entries' => 3, 'targets' => 3, 'entities' => 2, 'keptEntities' => 1, 'filesOnlyHere' => 2, 'filesElsewhere' => 1]
        && array_column($impact['entries'], 'id') === ['e1', 'e2', 'e3'] && array_column($impact['targets'], 'id') === ['e1', 'e2', 'e3'], 'the impact counts: 3 entries, 3 targets, 2 entities, 1 kept, 2 files only here, 1 elsewhere');
    check($impact['entities'] === [['ref' => 'lamp', 'type' => 'model', 'shared' => true, 'targets' => ['e3']], ['ref' => null, 'type' => 'image', 'shared' => false, 'targets' => ['e2']]]
        && count($impact['keptEntities']) === 1 && $impact['keptEntities'][0]['ref'] === 'castle' && $impact['keptEntities'][0]['targets'] === ['e1'] && $impact['keptEntities'][0]['usedBy'] === ['castle-target'], 'the entities: lamp and e2\'s own go, castle is kept (castle-target uses it)');
    check(array_column($impact['files']['onlyHere'], 'name') === ['a-only.png', 'b-only.png'] && array_column($impact['files']['elsewhere'], 'name') === ['shared.png']
        && $impact['files']['elsewhere'][0]['usedBy'] === [['kind' => 'target', 'ref' => 'e4']] && !isset($impact['files']['onlyHere'][0]['usedBy']),
        'the Library files: used only here (a-only, b-only) and elsewhere (shared.png, with its other use)');
    check(str_contains($data['error']['message'], '3 entries, 3 targets, 2 entities'), 'the message says it in words');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    [, $after] = call($api, 'GET', '/editor/books/osct/changes?limit=500', null, $editor);
    check(count($tree['spreads']) === 5 && count($tree['spreads'][3]['entries']) === 3 && count($after['changes']) === count($before['changes']), 'the first step writes nothing');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', ['deleteFiles' => 'yes'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-delete', 'deleteFiles must be true or false → 400');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', ['confirm' => '9999999999.' . str_repeat('0', 32)], $editor);
    check($status === 409 && $data['error']['code'] === 'confirmation-void' && $data['error']['impact']['counts']['entries'] === 3 && isset($data['error']['confirmation']['id']),
        'a forged id → 409 confirmation-void with a fresh impact and id');
    [$status] = call($api, 'DELETE', '/editor/books/osct/entries/e1', ['confirm' => $first], $editor);
    check($status === 409, 'the id is bound to what it was asked for: not an entry\'s removal');
    // Anything that changes meanwhile voids it – here a title elsewhere in the book
    call($api, 'PUT', '/editor/books/osct/spreads/s2', ['title' => 'Two again'], $editor);
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', ['confirm' => $first], $editor);
    $fresh = $data['error']['confirmation']['id'] ?? '';
    check($status === 409 && $data['error']['code'] === 'confirmation-void' && $fresh !== $first && $data['error']['impact']['counts']['targets'] === 3, 'a stale id (the book changed) → 409 confirmation-void, a fresh impact and a new id');
    // One transaction: when the last step fails, nothing of the removal stays done
    $pdo = connect('test');
    $pdo->exec($mysql ? "CREATE TRIGGER block_spread_delete BEFORE DELETE ON spreads FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'blocked'"
        : "CREATE TRIGGER block_spread_delete BEFORE DELETE ON spreads BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    [$status] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', ['confirm' => $fresh], $editor);
    $pdo->exec('DROP TRIGGER block_spread_delete');
    $pdo = null;
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    [, $entities] = call($api, 'GET', '/editor/books/osct/entities', null, $editor);
    check($status === 500 && count($tree['spreads'][3]['entries']) === 3 && isset($entities['entities']['lamp']), 'the spread\'s row refused: entries, targets and the entity are all still there (rolled back)');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', ['confirm' => $fresh], $editor);
    check($status === 200 && $data['deleted'] === ['spread' => 'doomed', 'entries' => ['e1', 'e2', 'e3'], 'targets' => ['e1', 'e2', 'e3'], 'entities' => ['lamp'], 'files' => []]
        && $data['moved'] === ['spreads' => 1, 'entries' => 1, 'targets' => 0], 'confirmed → 200: exactly what the impact listed; the back cover and the entry on page 101 move back');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    [, $entities] = call($api, 'GET', '/editor/books/osct/entities', null, $editor);
    check($pagesOf($tree) === [['cover', 0, 0], ['s1', 1, 2], ['s2', 3, 4], ['back', 5, 5]] && $tree['unassigned'][0]['page'] === 99
        && !isset($entities['entities']['lamp']) && isset($entities['entities']['castle']), 'the tree: the spread gone, the pages back; lamp gone, castle kept');
    [, $assets] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    $assetIds = array_column($assets['assets'], 'id');
    check(in_array($onlyA['id'], $assetIds, true) && in_array($onlyB['id'], $assetIds, true) && in_array($sharedFile['id'], $assetIds, true), 'without deleteFiles every Library file stays (the option is off by default)');
    [, $after] = call($api, 'GET', '/editor/books/osct/changes?limit=500', null, $editor);
    $removedRows = array_values(array_filter(array_slice($after['changes'], 0, count($after['changes']) - count($before['changes'])), fn($c) => $c['after'] === null));
    $kinds = array_map(fn($c) => $c['kind'] . ':' . $c['ref'], $removedRows);
    sort($kinds);
    check($kinds === ['entity:lamp', 'entry:e1', 'entry:e2', 'entry:e3', 'spread:doomed', 'target:e1', 'target:e2', 'target:e3']
        && count(array_filter($removedRows, fn($c) => is_array($c['before']))) === 8, 'the change log: every removed row with its before');
    [$status] = call($api, 'DELETE', '/editor/books/osct/spreads/doomed', ['confirm' => $fresh], $editor);
    check($status === 404, 'the id works once: the spread is gone');

    // An entry: its target, its entity and – only with deleteFiles – the files used only there; a file used elsewhere stays
    call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Five', 'page' => 2, 'id' => 'e5', 'target' => ['imageSrc' => $onlyA['url'],
        'entity' => ['type' => 'image', 'assets' => [['id' => 's', 'assetType' => 'image', 'src' => $sharedFile['url']]]]]], $editor);
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/entries/e5', null, $editor);
    $impact = $data['error']['impact'] ?? [];
    check($status === 409 && $data['error']['code'] === 'confirm-delete' && $impact['kind'] === 'entry' && $impact['entry']['id'] === 'e5' && $impact['entry']['spread'] === 's1'
        && $impact['counts'] === ['entries' => 1, 'targets' => 1, 'entities' => 1, 'keptEntities' => 0, 'filesOnlyHere' => 1, 'filesElsewhere' => 1],
        'an entry: 409 confirm-delete – its target, its entity, a file only here, one used elsewhere');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/entries/e5', ['confirm' => $data['error']['confirmation']['id'], 'deleteFiles' => true], $editor);
    check($status === 200 && $data['deleted'] === ['spread' => null, 'entries' => ['e5'], 'targets' => ['e5'], 'entities' => [], 'files' => [$onlyA['id']]], 'confirmed with deleteFiles → the file used only there goes too');
    [, $assets] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    $assetIds = array_column($assets['assets'], 'id');
    check(!in_array($onlyA['id'], $assetIds, true) && in_array($sharedFile['id'], $assetIds, true) && @file_get_contents($onlyA['url']) === false && @file_get_contents($sharedFile['url']) !== false,
        'gone from the Library and the store; the file used elsewhere is never deleted');
    [, $after] = call($api, 'GET', '/editor/books/osct/changes?limit=3', null, $editor);
    $assetChange = array_values(array_filter($after['changes'], fn($c) => $c['kind'] === 'asset'))[0] ?? null;
    check($assetChange && $assetChange['ref'] === $onlyA['id'] && $assetChange['before']['name'] === 'a-only.png' && $assetChange['after'] === null, 'the removed Library file is in the change log with its before');
    [$status] = deleting($api, '/editor/books/osct/entries/e4', $editor, ['deleteFiles' => true]);
    [, $assets] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    check($status === 200 && !in_array($sharedFile['id'], array_column($assets['assets'], 'id'), true), 'its last use removed with deleteFiles: now the shared file goes too');
    call($api, 'DELETE', "/editor/books/osct/assets/{$onlyB['id']}", null, $editor);
    call($api, 'PUT', '/editor/books/osct/spreads/s2', ['title' => 'Two'], $editor);
    check($draftOf()[0] === $buildStart, 'cleaned up: the same draft as before');

    echo "editor: the book's environment (content schema 2.8)\n";
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => false]], $editor);
    check($status === 200 && $data['environment'] === ['world' => 'cafe', 'onionSky' => false], 'PUT environment');
    [, $m] = call($api, 'GET', '/editor/books/osct/draft/latest.json?t=3', null, $editor);
    [, $draftNow] = call($api, 'GET', "/editor/books/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftNow['book']['environment'] ?? null) === ['world' => 'cafe', 'onionSky' => false], 'the draft carries the environment');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => ['world' => 'moon', 'onionSky' => true]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-environment', 'an unknown world is refused');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => ['world' => 'cafe']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-environment', 'onionSky is required');
    [$status] = call($api, 'PUT', '/editor/books/osct/environment', ['world' => 'cafe'], $editor);
    check($status === 400, 'the body needs environment');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => null], $editor);
    check($status === 200 && !isset($data['environment']), 'environment: null removes it – the default applies');

    echo "editor: the book's passes – the master, spreads override (#149)\n";
    $bookPasses = [['type' => 'grade', 'reach' => 'all', 'exposure' => 0.5], ['type' => 'vignette', 'strength' => 0.4]];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/passes', ['passes' => $bookPasses], $editor);
    check($status === 200 && $data['passes'] === $bookPasses, 'PUT book passes');
    [$status] = call($api, 'PUT', '/editor/books/osct/spreads/s2', ['passes' => []], $editor);
    check($status === 200, 'a spread turns them off with a list of its own');
    [, $draftNow] = $draftOf();
    $draftSpreads = array_column($draftNow['spreads'], null, 'id');
    check(($draftNow['book']['passes'] ?? null) === $bookPasses, 'the draft carries the book passes');
    check(!array_key_exists('passes', $draftSpreads['s1']) && ($draftSpreads['s2']['passes'] ?? null) === [], 'the draft: s1 has no list (the book’s apply), s2 its own empty one');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/passes', ['passes' => [['type' => 'glow']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'an unknown pass type is refused');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/passes', ['passes' => ['type' => 'bloom']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'passes must be a list');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/passes', ['passes' => [['type' => 'bloom', 'strength' => [1]]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'a parameter must be a scalar');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/passes', ['type' => 'bloom'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'the body needs passes');
    [$status] = call($api, 'PUT', '/editor/books/nowhere/passes', ['passes' => null], $editor);
    check($status === 404, 'an unknown book → 404');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/passes', ['passes' => null], $editor);
    [, $draftNow] = $draftOf();
    check($status === 200 && $data['passes'] === null && !array_key_exists('passes', $draftNow['book']), 'passes: null removes them from the book');
    [$status] = call($api, 'PUT', '/editor/books/osct/spreads/s2', ['passes' => null], $editor);
    check($status === 200, 'the spread back to the book’s');
    [, $data] = call($api, 'GET', '/editor/books/osct/changes?limit=500', null, $editor);
    check(count(array_filter($data['changes'], fn($c) => $c['kind'] === 'passes' && $c['ref'] === 'osct')) === 2, 'the change log has both book passes edits');

    echo "editor: the environment's world and sky as assets (content schema 2.10)
";
    [, $sky] = upload($api, 'POST', '/editor/books/osct/assets', $png . 'sky', 'sky.png', $editor);
    [, $world] = upload($api, 'POST', '/editor/books/osct/assets', 'glTF world', 'world.glb', $editor);
    $environment = ['world' => 'cafe', 'onionSky' => true, 'worldSrc' => $world['asset']['url'], 'skySrc' => $sky['asset']['url']];
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => $environment], $editor);
    check($status === 200 && $data['environment'] === $environment, 'PUT environment with a world model and a sky');
    [, $m] = call($api, 'GET', '/editor/books/osct/draft/latest.json?t=4', null, $editor);
    [, $draftNow] = call($api, 'GET', "/editor/books/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftNow['book']['environment'] ?? null) === $environment, 'the draft carries the asset references');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'worldSrc' => $sky['asset']['url']]], $editor);
    check($status === 400 && $data['error']['message'] === 'environment.worldSrc must be a glTF model (.glb, .gltf).', 'an image as the world is refused');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'skySrc' => 'sky.jpg']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-environment', 'a relative path is refused');
    [$status, $data] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'skySrc' => '/assets/content/environment/sky.webp']], $editor);
    check($status === 200, 'a content path is taken');
    [$status] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => $environment], $editor);
    [, $data] = call($api, 'GET', "/editor/books/osct/assets/{$sky['asset']['id']}/usages", null, $editor);
    check($data['usages'] === [['kind' => 'environment', 'ref' => 'osct']], 'the sky usages: the book environment');
    [, $data] = call($api, 'GET', '/editor/books/osct/assets', null, $editor);
    $listed = array_values(array_filter($data['assets'], fn($a) => $a['id'] === $world['asset']['id']));
    check(($listed[0]['usages'] ?? null) === 1, 'the list counts the world model use');
    [$status, $data] = call($api, 'DELETE', "/editor/books/osct/assets/{$world['asset']['id']}", null, $editor);
    check($status === 409 && $data['error']['usages'][0]['kind'] === 'environment', 'delete while the environment uses it → 409');
    [$status, $data] = upload($api, 'PUT', "/editor/books/osct/assets/{$sky['asset']['id']}/file", $png . 'sky 2', 'sky.png', $editor);
    check($status === 200 && $data['relinked'] === 1, 'replace the sky → the environment relinked');
    [, $tree] = call($api, 'GET', '/editor/books/osct', null, $editor);
    check(($tree['book']['book']['environment']['skySrc'] ?? null) === $data['asset']['url'] && $tree['book']['book']['environment']['worldSrc'] === $world['asset']['url'], 'the book names the new version, the world stays');
    [$status] = call($api, 'PUT', '/editor/books/osct/environment', ['environment' => null], $editor);
    check($status === 200, 'environment removed again');

    echo "editor: publish to bunny (test double)\n";
    $storagePort = freePort();
    $bunnyDir = "$tmp/bunny";
    $testLog = [1 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a'], 2 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a']];
    $processes[] = proc_open([PHP_BINARY, '-S', "127.0.0.1:$storagePort", __DIR__ . '/fake-storage.php'], $testLog, $pipes, __DIR__, ['STORAGE_DIR' => $bunnyDir, 'STORAGE_KEY' => 'zone-key'] + getenv());
    for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $storagePort); $i++) usleep(100000);
    $bunny = ['CONTENT_STORE' => 'bunny', 'BUNNY_STORAGE_ZONE' => 'osct', 'BUNNY_STORAGE_ENDPOINT' => "http://127.0.0.1:$storagePort", 'BUNNY_STORAGE_PASSWORD' => 'zone-key'];
    // A staging instance with the CDN connected: it publishes to staging only, and staging goes to the zone (#183)
    $bunnyApi = startApi(['ENV' => 'staging'] + $bunny + $settings);
    [$status, $data] = call($bunnyApi, 'POST', '/editor/books/osct/publish', ['env' => 'staging'], $editor);
    check($status === 200 && is_file("$bunnyDir/osct/staging/{$data['build']}/game.config.json") && is_file("$bunnyDir/osct/staging/{$data['build']}/files.json"), 'staging goes to the storage zone: osct/staging/<build>/');
    $latest = json_decode((string) @file_get_contents("$bunnyDir/osct/staging/latest.json"), true);
    $versions = json_decode((string) @file_get_contents("$bunnyDir/osct/staging/versions.json"), true);
    check(($latest['build'] ?? null) === $data['build'] && count($versions ?? []) === 1 && $versions[0]['build'] === $data['build'] && $versions[0]['retiredAt'] === null, 'latest.json and versions.json on the zone');
    check(($latest['book'] ?? null) === 'osct' && ($versions[0]['book'] ?? null) === 'osct', 'the zone\'s latest.json and versions.json name the book');
    [, $data] = call($bunnyApi, 'GET', '/editor/books', null, $editor);
    check(in_array('staging', array_column(array_column($data['books'], null, 'id')['osct']['live'], 'env'), true), 'the book list reads the zone: live on staging');
    [$status] = call($bunnyApi, 'GET', '/content/staging/latest.json');
    check($status === 404, 'nothing local for staging on a bunny host');
    foreach (['local', 'production'] as $env) {
        [$status, $data] = call($bunnyApi, 'POST', '/editor/books/osct/publish', ['env' => $env], $editor);
        check($status === 403 && $data['error']['code'] === 'other-environment' && $data['error']['env'] === 'staging', "a staging instance refuses $env → 403 other-environment (no cross-environment publish)");
    }
    [, $data] = call($bunnyApi, 'GET', '/editor/environments', null, $editor);
    $byEnv = array_column($data['environments'], null, 'env');
    check($data['env'] === 'staging' && array_keys($byEnv) === ['staging', 'production'], 'a deployed instance lists no local');
    check($byEnv['staging']['store'] === 'cdn' && $byEnv['staging']['publish'] === true && $byEnv['staging']['warning'] === null && $byEnv['production']['store'] === 'cdn' && $byEnv['production']['publish'] === false,
        'the CDN has priority: staging · CDN, no warning');
    [, $data] = call($bunnyApi, 'GET', '/editor/books', null, $editor);
    check(!in_array('local', array_column($data['environments'], 'env'), true), 'the book list reads no local store on a deployed instance');
    // A developer's machine with the CDN's key: local still stays in the directory store – with the warning
    $localBunny = startApi($bunny + $settings);
    [$status, $data] = call($localBunny, 'POST', '/editor/books/osct/publish', ['env' => 'local'], $editor);
    check($status === 200 && $data['store'] === 'server' && is_file("$storeDir/local/{$data['build']}/game.config.json"), 'the environment local stays in the directory store');
    [, $data] = call($localBunny, 'GET', '/editor/environments', null, $editor);
    $byEnv = array_column($data['environments'], null, 'env');
    check($byEnv['local']['store'] === 'server' && is_string($byEnv['local']['warning']) && $byEnv['staging']['store'] === 'cdn' && $byEnv['staging']['publish'] === false, 'local · this server (warned), staging · CDN (not a target here)');
    // An instance without a CDN: its own environment goes to the directory store, and the editor warns
    $plainStaging = startApi(['ENV' => 'staging'] + $settings);
    [, $data] = call($plainStaging, 'GET', '/editor/environments', null, $editor);
    check($data['environments'][0]['env'] === 'staging' && $data['environments'][0]['store'] === 'server' && str_starts_with((string) $data['environments'][0]['warning'], 'No CDN connected'), 'staging without a CDN: staging · this server, with the warning');
    [$status, $data] = call($plainStaging, 'POST', '/editor/books/osct/publish', ['env' => 'staging', 'replace' => true], $editor);
    check($status === 200 && $data['store'] === 'server' && is_file("$storeDir/staging/{$data['build']}/game.config.json"), '… and publishes there');
    $wrongKey = startApi(['ENV' => 'production', 'BUNNY_STORAGE_PASSWORD' => 'wrong'] + $bunny + $settings);
    [$status, $data] = call($wrongKey, 'POST', '/editor/books/osct/publish', ['env' => 'production'], $editor);
    check($status === 502 && $data['error']['code'] === 'content-store-failed', 'a refused upload → 502 content-store-failed');

    echo "content store and var/: the move out of api/db/ (#197)\n";
    // Copies of the API's code (never a developer's config or data) in temporary trees, started like the dev server
    $apiCopy = function (string $to) use ($root): void {
        foreach (['src', 'db'] as $folder) mkdir("$to/$folder", 0777, true);
        foreach (['index.php', '.htaccess'] as $file) copy("$root/api/$file", "$to/$file");
        foreach (glob("$root/api/src/*.php") as $file) copy($file, "$to/src/" . basename($file));
        foreach (['schema.mysql.sql', 'schema.sqlite.sql', '.htaccess'] as $file) copy("$root/api/db/$file", "$to/db/$file");
    };
    $startCopy = function (string $api, array $settings, ?string $configFile = null) use (&$processes): string {
        $port = freePort();
        $env = array_filter(getenv(), fn(string $key) => !str_starts_with($key, 'OSCT_'), ARRAY_FILTER_USE_KEY);
        foreach ($settings as $key => $value) $env["OSCT_$key"] = $value;
        $env['OSCT_CONFIG_FILE'] = $configFile ?? '/nonexistent';
        $log = sys_get_temp_dir() . '/osct-api-test.log';
        $processes[] = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', dirname($api), "$api/index.php"], [1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']], $pipes, dirname($api), $env);
        for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100000);
        return "http://127.0.0.1:$port/api";
    };
    $legacyStore = function (string $api): void {
        mkdir("$api/db/content/local/0123456789ab", 0777, true);
        file_put_contents("$api/db/content/local/latest.json", json_encode(['build' => '0123456789ab', 'book' => 'osct']));
        file_put_contents("$api/db/content/local/0123456789ab/game.config.json", '{"book":{"id":"osct"}}');
    };
    $copySecret = ['SECRET' => str_repeat('s', 40), 'MAIL_TRANSPORT' => 'log', 'ALLOWED_ORIGINS' => 'http://localhost:5173'];

    // A developer's checkout: the old folder and files, and a config.local.php that names them (__DIR__ . '/db/…')
    $dev = "$tmp/dev-checkout";
    $devApi = "$dev/server/api";
    $apiCopy($devApi);
    $legacyStore($devApi);
    $sqlite = new PDO("sqlite:$devApi/db/local.sqlite");
    loadSchema($sqlite, (string) file_get_contents("$root/api/db/schema.sqlite.sql"));
    $sqlite->exec('CREATE TABLE kept (note TEXT)');
    $sqlite->exec("INSERT INTO kept VALUES ('the developer''s data')");
    $sqlite = null;
    file_put_contents("$devApi/db/mail.log", "=== an old mail ===\n");
    file_put_contents("$devApi/db/error.log", "an old error\n");
    file_put_contents("$tmp/dev-config.php", '<?php return ' . var_export(['DB_SQLITE_PATH' => "$devApi/db/local.sqlite", 'MAIL_LOG_PATH' => "$devApi/db/mail.log"], true) . ';');
    $devBase = $startCopy($devApi, $copySecret, "$tmp/dev-config.php");
    [$status, $data] = call($devBase, 'GET', '/health');
    check($status === 200 && $data['db'] === 'ok', 'the first start after the move answers');
    check(is_file("$dev/content-store/local/latest.json") && is_file("$dev/content-store/local/0123456789ab/game.config.json") && !file_exists("$devApi/db/content"),
        'the content store moved from server/api/db/content to content-store/ at the top level');
    [$status, $data] = call($devBase, 'GET', '/content/local/latest.json');
    check($status === 200 && $data['build'] === '0123456789ab', 'GET /content/local/… serves it from there');
    $kept = is_file("$dev/var/db/local.sqlite") ? (new PDO("sqlite:$dev/var/db/local.sqlite"))->query('SELECT note FROM kept')->fetchColumn() : null;
    check($kept === "the developer's data" && !file_exists("$devApi/db/local.sqlite"), "the SQLite file named in config.local.php moved to var/db/ with the developer's data");
    call($devBase, 'POST', '/auth/request', ['email' => 'dev@example.com']);
    $mails = (string) @file_get_contents("$dev/var/mail/mail.log");
    check(str_starts_with($mails, '=== an old mail ===') && str_contains($mails, 'dev@example.com') && !file_exists("$devApi/db/mail.log"), 'the mail log moved to var/mail/ and new mails land there');
    $errors = (string) @file_get_contents("$dev/var/log/error.log");
    check(str_starts_with($errors, 'an old error') && str_contains($errors, 'moved') && !file_exists("$devApi/db/error.log"), 'the error log moved to var/log/, the moves are logged there');
    $left = array_values(array_diff(scandir("$devApi/db"), ['.', '..']));
    check($left === ['.htaccess', 'schema.mysql.sql', 'schema.sqlite.sql'], 'server/api/db/ keeps only the schema files');

    // The new place holds something already: nothing moves, nothing is overwritten
    $both = "$tmp/both-checkout";
    $apiCopy("$both/server/api");
    $legacyStore("$both/server/api");
    mkdir("$both/content-store/staging", 0777, true);
    file_put_contents("$both/content-store/staging/latest.json", '{"build":"aaaaaaaaaaaa"}');
    $bothBase = $startCopy("$both/server/api", $copySecret + ['DB_SQLITE_PATH' => "$tmp/both.sqlite", 'LOG_PATH' => "$tmp/both-error.log"]);
    call($bothBase, 'GET', '/health');
    check(is_file("$both/server/api/db/content/local/latest.json") && is_file("$both/content-store/staging/latest.json") && !file_exists("$both/content-store/local"),
        'when the content store is not empty, the old folder stays where it is (both kept, the new one used)');

    // A setting that points elsewhere (a test, a mounted volume): used as it is, the old folder is never touched
    $elsewhere = "$tmp/elsewhere-checkout";
    $apiCopy("$elsewhere/server/api");
    $legacyStore("$elsewhere/server/api");
    $elsewhereBase = $startCopy("$elsewhere/server/api", $copySecret + ['CONTENT_STORE_DIR' => "$tmp/mounted-store", 'DB_SQLITE_PATH' => "$tmp/elsewhere.sqlite", 'LOG_PATH' => "$tmp/elsewhere-error.log"]);
    [$status] = call($elsewhereBase, 'GET', '/content/local/latest.json');
    check($status === 404 && is_file("$elsewhere/server/api/db/content/local/latest.json") && !file_exists("$tmp/mounted-store/local"), 'OSCT_CONTENT_STORE_DIR elsewhere: nothing moves into it');

    // A deployed layout (the API at <docroot>/api, the FTPS staging): the store and var/ inside the API's folder, where
    // every request goes through index.php – outside the uploaded code, which the upload never deletes
    $site = "$tmp/site";
    $apiCopy("$site/api");
    $legacyStore("$site/api");
    file_put_contents("$site/api/db/error.log", "an old staging error\n");
    $siteBase = $startCopy("$site/api", $copySecret + ['DB_SQLITE_PATH' => "$tmp/site.sqlite", 'ENV' => 'staging']);
    [$status, $data] = call($siteBase, 'GET', '/content/local/latest.json');
    check(is_file("$site/api/content-store/local/latest.json") && !file_exists("$site/api/db/content") && $status === 200,
        'deployed: the old store moved to api/content-store (served as before)');
    check(str_starts_with((string) @file_get_contents("$site/api/var/log/error.log"), 'an old staging error') && trim((string) @file_get_contents("$site/api/var/.htaccess")) === 'Require all denied',
        'deployed: the error log moved to api/var/log/, and var/ denies direct requests');
    echo "AI connections: personal access tokens (#142)\n";
    [$status, $data] = call($api, 'GET', '/user/tokens', null, $editor);
    check($status === 200 && $data['tokens'] === [], 'an editor without tokens: an empty list');
    [$status, $data] = call($api, 'POST', '/user/tokens', ['name' => '   '], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-name', 'a token needs a name → 400 invalid-name');
    [$status, $data] = call($api, 'POST', '/user/tokens', ['name' => 'Claude'], $session);
    check($status === 403 && $data['error']['code'] === 'forbidden', 'a reader cannot make a token → 403 forbidden');
    call($api, 'POST', '/auth/request', ['email' => 'other@example.com']);
    [, $data] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    $otherEditor = $data['session'];
    [$status, $made] = call($api, 'POST', '/user/tokens', ['name' => 'Claude on my laptop', 'email' => 'other@example.com', 'userId' => 'someone-else'], $editor);
    $aiToken = $made['token'] ?? '';
    check($status === 201 && str_starts_with($aiToken, 'osct_') && strlen($aiToken) > 40 && $made['apiToken']['name'] === 'Claude on my laptop'
        && $made['apiToken']['prefix'] === substr($aiToken, 0, 9) . '…' && $made['apiToken']['lastUsedAt'] === null, 'create → 201: the token once (osct_…), its name and prefix');
    $days = (strtotime($made['apiToken']['expiresAt']) - time()) / 86400;
    check($days > 181.9 && $days <= 182, 'a token expires 182 days after it was made');
    [$status, $data] = call($api, 'GET', '/user/tokens', null, $editor);
    check($status === 200 && count($data['tokens']) === 1 && $data['tokens'][0]['id'] === $made['apiToken']['id'] && !str_contains(json_encode($data), $aiToken)
        && !array_key_exists('token', $data['tokens'][0]), 'the list names it, never shows the token again');
    [, $data] = call($api, 'GET', '/user/tokens', null, $otherEditor);
    check($data['tokens'] === [], 'nothing was made for another user (the body cannot name one)');
    $pdo = connect('test');
    $stored = $pdo->query("SELECT user_id, token_hash FROM api_tokens WHERE id = " . $pdo->quote($made['apiToken']['id']))->fetch(PDO::FETCH_ASSOC);
    $authorRow = $pdo->query("SELECT id FROM users WHERE email = 'author@example.com'")->fetchColumn();
    $pdo = null;
    check($stored['token_hash'] === hash('sha256', $aiToken) && $stored['user_id'] === $authorRow, 'stored as a SHA-256 hash, for the signed-in editor');

    [$status, $data] = call($api, 'GET', '/user', null, $aiToken);
    check($status === 200 && $data['user']['email'] === 'author@example.com' && in_array('editor', $data['user']['roles'], true) && $data['token']['name'] === 'Claude on my laptop',
        'a token authenticates as its user, with their roles; GET /user names the token');
    check(is_string($data['token']['lastUsedAt']), 'its use is recorded (last used)');
    [, $data] = call($api, 'GET', '/user', null, $editor);
    check(!array_key_exists('token', $data), 'a session gets no token field');
    [$status, $data] = call($api, 'GET', '/editor/books', null, $aiToken);
    check($status === 200 && in_array('osct', array_column($data['books'], 'id'), true), 'a token reads the editor API');
    $castle = $configuration['entities']['castle'];
    $castle['params'] = ['scale' => 4];
    [$status] = call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $aiToken);
    [, $data] = call($api, 'GET', '/editor/books/osct/changes?limit=1', null, $editor);
    check($status === 200 && $data['changes'][0]['ref'] === 'castle' && $data['changes'][0]['user'] === 'author@example.com' && $data['changes'][0]['token'] === 'Claude on my laptop',
        'a save through a token records the token\'s name in the change log');
    call($api, 'PUT', '/editor/books/osct/entities/castle', $castle, $editor);
    [, $data] = call($api, 'GET', '/editor/books/osct/changes?limit=1', null, $editor);
    check($data['changes'][0]['token'] === null, 'a save in the editor records none');

    // A token removes like its person – only through the same two steps (#198); its confirmation is its own
    [$status] = call($api, 'POST', '/editor/books/osct/entries', ['title' => 'Robot', 'page' => 1, 'id' => 'robot', 'target' => ['imageSrc' => 'https://cdn.example/robot.jpg']], $aiToken);
    [$status2, $data] = call($api, 'DELETE', '/editor/books/osct/entries/robot', null, $aiToken);
    check($status === 201 && $status2 === 409 && $data['error']['code'] === 'confirm-delete' && $data['error']['impact']['counts']['targets'] === 1,
        'a token\'s removal: first 409 confirm-delete with the impact');
    $tokenId = $data['error']['confirmation']['id'];
    [, $data] = call($api, 'DELETE', '/editor/books/osct/entries/robot', null, $editor);
    [$status] = call($api, 'DELETE', '/editor/books/osct/entries/robot', ['confirm' => $data['error']['confirmation']['id']], $aiToken);
    [$status2] = call($api, 'DELETE', '/editor/books/osct/entries/robot', ['confirm' => $tokenId], $editor);
    check($status === 409 && $status2 === 409, 'the person\'s id does not work for the token, nor the token\'s for the person');
    [$status, $data] = call($api, 'DELETE', '/editor/books/osct/entries/robot', ['confirm' => $tokenId], $aiToken);
    [, $log] = call($api, 'GET', '/editor/books/osct/changes?limit=2', null, $editor);
    check($status === 200 && $data['deleted']['entries'] === ['robot'] && array_column($log['changes'], 'token') === ['Claude on my laptop', 'Claude on my laptop']
        && $log['changes'][0]['after'] === null, 'confirmed with its own id → removed; the change log names the token');

    // What a token never does: publish (any environment), its own tokens, the password, the account
    foreach (['local', 'staging', 'production'] as $env) {
        [$status, $data] = call($api, 'POST', '/editor/books/osct/publish', ['env' => $env], $aiToken);
        check($status === 403 && $data['error']['code'] === 'not-for-ai', "a token cannot publish to $env → 403 not-for-ai");
    }
    $refused = [
        ['GET', '/user/tokens', null], ['POST', '/user/tokens', ['name' => 'Another']], ['POST', "/user/tokens/{$made['apiToken']['id']}/renew", null],
        ['DELETE', "/user/tokens/{$made['apiToken']['id']}", null], ['PUT', '/user/password', ['password' => 'from the robot']], ['DELETE', '/user', null],
        ['GET', '/admin/users', null], ['GET', '/admin/roles', null], ['POST', '/admin/editors', ['email' => 'robot@example.com']],
    ];
    foreach ($refused as [$method, $path, $body]) {
        [$status, $data] = call($api, $method, $path, $body, $aiToken);
        check($status === 403 && $data['error']['code'] === 'not-for-ai', "a token: $method $path → 403 not-for-ai");
    }
    [$status, $data] = call($api, 'GET', '/user', null, $editor);
    check($status === 200 && $data['user']['hasPassword'] === false, 'the account is still there, its password unchanged');

    // Renew, revoke, expire – the person's own sign-in; another editor's token is as unknown as none
    [$status] = call($api, 'POST', "/user/tokens/{$made['apiToken']['id']}/renew", null, $otherEditor);
    [$status2] = call($api, 'DELETE', "/user/tokens/{$made['apiToken']['id']}", null, $otherEditor);
    check($status === 404 && $status2 === 404, 'another editor cannot renew or revoke it → 404');
    $pdo = connect('test');
    $pdo->exec("UPDATE api_tokens SET expires_at = '2000-01-01 00:00:00' WHERE id = " . $pdo->quote($made['apiToken']['id']));
    $pdo = null;
    [$status, $data] = call($api, 'GET', '/editor/books', null, $aiToken);
    check($status === 401 && $data['error']['code'] === 'token-expired', 'an expired token → 401 token-expired');
    [, $data] = call($api, 'GET', '/user/tokens', null, $editor);
    check($data['tokens'][0]['expired'] === true, 'the list says it expired');
    [$status, $data] = call($api, 'POST', "/user/tokens/{$made['apiToken']['id']}/renew", null, $editor);
    $days = (strtotime($data['apiToken']['expiresAt'] ?? 'now') - time()) / 86400;
    check($status === 200 && $data['apiToken']['expired'] === false && $days > 181.9, 'renew → expires 182 days from now');
    [$status] = call($api, 'GET', '/editor/books', null, $aiToken);
    check($status === 200, 'the renewed token works again');
    [$status] = call($api, 'DELETE', "/user/tokens/{$made['apiToken']['id']}", null, $editor);
    check($status === 204, 'revoke → 204');
    [$status, $data] = call($api, 'GET', '/user', null, $aiToken);
    check($status === 401 && $data['error']['code'] === 'token-revoked', 'a revoked token → 401 token-revoked');
    [, $data] = call($api, 'GET', '/user/tokens', null, $editor);
    [$status] = call($api, 'POST', "/user/tokens/{$made['apiToken']['id']}/renew", null, $editor);
    check($data['tokens'] === [] && $status === 404, 'a revoked token leaves the list and cannot be renewed');
    [$status] = call($api, 'GET', '/user', null, 'osct_' . str_repeat('x', 43));
    check($status === 401, 'an unknown token → 401');

    // A token stops working when its account loses the editor and admin roles
    // (the author: an address in EDITORS would get the role back at once)
    [, $made] = call($api, 'POST', '/user/tokens', ['name' => 'Second'], $editor);
    $pdo = connect('test');
    $grants = $pdo->query("SELECT * FROM user_roles WHERE role_id IN (2, 3) AND user_id = " . $pdo->quote($authorRow))->fetchAll(PDO::FETCH_ASSOC);
    $pdo->exec("DELETE FROM user_roles WHERE role_id IN (2, 3) AND user_id = " . $pdo->quote($authorRow));
    [$status, $data] = call($api, 'GET', '/user', null, $made['token']);
    check($status === 401 && $data['error']['code'] === 'no-editor-role', 'without the editor or admin role a token → 401 no-editor-role');
    $insert = $pdo->prepare('INSERT INTO user_roles (user_id, role_id, granted_at, granted_by) VALUES (:user, :role, :at, :by)');
    foreach ($grants as $grant) $insert->execute(['user' => $grant['user_id'], 'role' => $grant['role_id'], 'at' => $grant['granted_at'], 'by' => $grant['granted_by']]);
    $pdo = null;
    [$status] = call($api, 'GET', '/user', null, $made['token']);
    check($status === 200 && $grants !== [], 'with the role back it works again');

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
    check($status === 200 && count($data['spreads']) === 4, "migrate again: the editor's book still there (its two spreads and the covers)");

    [$status] = call($api, 'POST', '/auth/password', ['email' => 'reader@example.com', 'password' => 'final password']);
    check($status === 200, 'migrate again: the password still signs in');

    echo "migrate an older database (before passwords)\n";
    $schemaFile = "$root/api/db/schema." . ($mysql ? 'mysql' : 'sqlite') . '.sql';
    $oldSchema = preg_replace('/\nCREATE TABLE IF NOT EXISTS `?password_attempts.*$/s', '', (string) file_get_contents($schemaFile));
    $oldToken = str_repeat('o', 43);
    $oldSettings = database('old', $oldSchema);
    $oldDb = connect('old');
    $oldDb->exec("INSERT INTO users (id, email, created_at, confirmed_at, updated_at) VALUES ('u1', 'old@example.com', '2026-01-01 00:00:00', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $oldDb->exec("INSERT INTO sessions (id, user_id, token_hash, created_at, last_used_at) VALUES ('s1', 'u1', '" . hash('sha256', $oldToken) . "', '2026-01-01 00:00:00', '2099-01-01 00:00:00')");
    $oldDb = null;
    $oldApi = startApi($oldSettings + $settings);
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => 'X-Admin-Secret: ' . str_repeat('s', 40), 'ignore_errors' => true]]);
    file_get_contents("$oldApi/admin/migrate", false, $context);
    file_get_contents("$oldApi/admin/migrate", false, $context);
    [$status, $data] = call($oldApi, 'GET', '/user', null, $oldToken);
    check($status === 200 && $data['user']['email'] === 'old@example.com' && $data['user']['hasPassword'] === false, 'migrated twice: columns added once, the old user and session kept');
    $oldDb = connect('old');
    $assetColumns = array_map(fn($c) => $c['name'] ?? $c['Field'], $oldDb->query($mysql ? 'SHOW COLUMNS FROM assets' : 'PRAGMA table_info(assets)')->fetchAll(PDO::FETCH_ASSOC));
    $oldDb = null;
    check(in_array('duration_ms', $assetColumns, true), 'an assets table from before gets duration_ms (#91)');
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
    $pdo = connect('test');
    check((int) $pdo->query("SELECT COUNT(*) FROM users WHERE email = 'reader@example.com'")->fetchColumn() === 0
        && (int) $pdo->query("SELECT COUNT(*) FROM login_requests WHERE email = 'reader@example.com'")->fetchColumn() === 0, 'user and its requests are gone');
    $pdo = null;

    echo "smtp\n";
    $smtpPort = freePort();
    $smtpOut = "$tmp/smtp.txt";
    $processes[] = proc_open([PHP_BINARY, __DIR__ . '/fake-smtp.php', (string) $smtpPort, $smtpOut], [], $pipes);
    for ($i = 0; $i < 50 && !is_file("$smtpOut.ready"); $i++) usleep(100000);
    $smtpApi = startApi(['MAIL_TRANSPORT' => 'smtp', 'SMTP_HOST' => '127.0.0.1', 'SMTP_PORT' => (string) $smtpPort, 'SMTP_SECURE' => 'none',
        'SMTP_USER' => 'user', 'SMTP_PASS' => 'pass', 'MAIL_FROM' => 'app@example.com'] + database('smtp') + $settings);
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
    if ($mysql) {
        try {
            foreach ($mysql['created'] as $name) connect(null)->exec("DROP DATABASE IF EXISTS `$name`");
        } catch (Throwable $error) {
            check(false, 'dropping the test databases: ' . $error->getMessage());
        }
    }
}

echo $failures ? "\n$failures failed\n" : "\nall passed\n";
exit($failures ? 1 : 0);
