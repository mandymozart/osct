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
    foreach (array_filter(array_map('trim', preg_split('/;\s*(\n|$)/', (string) $sql))) as $statement) {
        // As Db::migrate: a removed feature's column goes only where it is
        if (preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+DROP\s+COLUMN\s+`?(\w+)`?/i', $statement, $match) && (!hasTable($pdo, $match[1]) || !hasColumn($pdo, $match[1], $match[2]))) continue;
        // and a rename (#319) only where the old name is
        if (preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+RENAME\s+TO\s+`?(\w+)`?/i', $statement, $match) && (!hasTable($pdo, $match[1]) || hasTable($pdo, $match[2]))) continue;
        if (preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+RENAME\s+COLUMN\s+`?(\w+)`?/i', $statement, $match) && (!hasTable($pdo, $match[1]) || !hasColumn($pdo, $match[1], $match[2]))) continue;
        $pdo->exec($statement);
    }
}

/** The table exists (SQLite or MySQL) */
function hasTable(PDO $pdo, string $table): bool
{
    $statement = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
        ? $pdo->prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
        : $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
    $statement->execute([$table]);
    return (int) $statement->fetchColumn() > 0;
}

/** The table has the column (SQLite or MySQL) */
function hasColumn(PDO $pdo, string $table, string $column): bool
{
    $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    $rows = $pdo->query($sqlite ? "PRAGMA table_info($table)" : "SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
    return in_array($column, array_map(fn($c) => $c['name'] ?? $c['Field'], $rows), true);
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
    // OSCT_TEST_PHP_ARGS: extra arguments for the API's php, e.g. "-d extension=gd" where php.ini does not load GD (#298)
    $extra = array_values(array_filter(explode(' ', (string) getenv('OSCT_TEST_PHP_ARGS'))));
    $command = [PHP_BINARY, ...$extra, '-S', "127.0.0.1:$port", '-t', $root, "$root/api/index.php"];
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

/** A browser's cookie jar (#207): keeps what the API's `Set-Cookie` headers set, sends it back as `Cookie` */
final class CookieJar
{
    /** @var array<string, string> */
    public array $cookies = [];
    /** @var array<string, string> the last `Set-Cookie` line per cookie, for its attributes */
    public array $lines = [];

    public function take(array $headers): void
    {
        foreach ($headers as $header) {
            if (!preg_match('/^Set-Cookie:\s*([^=;]+)=([^;]*)/i', $header, $match)) continue;
            $this->lines[$match[1]] = $header;
            $cleared = $match[2] === '' || $match[2] === 'deleted' || preg_match('/;\s*Max-Age=0\b/i', $header);
            if ($cleared) unset($this->cookies[$match[1]]);
            else $this->cookies[$match[1]] = urldecode($match[2]);
        }
    }

    /** @return list<string> */
    public function headers(): array
    {
        if (!$this->cookies) return [];
        return ['Cookie: ' . implode('; ', array_map(fn($name, $value) => "$name=$value", array_keys($this->cookies), $this->cookies))];
    }
}

/** A call as the browser makes it: the jar's cookies, the CSRF token when given; the answer's cookies go into the jar */
function browser(CookieJar $jar, string $base, string $method, string $path, ?array $body = null, ?string $csrf = null, array $extraHeaders = []): array
{
    $headers = [...$jar->headers(), ...$extraHeaders];
    if ($csrf !== null) $headers[] = "X-CSRF-Token: $csrf";
    $answer = call($base, $method, $path, $body, null, 'http://localhost:5173', null, $headers);
    $jar->take($answer[2]);
    return $answer;
}

/** The `Set-Cookie` lines of an answer */
function setCookies(array $headers): array
{
    return array_values(preg_grep('/^Set-Cookie:/i', $headers));
}

/**
 * An import that overwrites: the first answer of an experience that exists is 409 confirm-import with a confirmation id
 * (Experiences::import) – sent again with it, as the editor does after the comparison. Errors pass through unchanged.
 */
function importing(string $base, string $experience, ?string $token, string $raw): array
{
    $answer = call($base, 'POST', "/editor/experiences/$experience/import", null, $token, 'http://localhost:5173', $raw);
    if ($answer[0] !== 409 || ($answer[1]['error']['code'] ?? null) !== 'confirm-import') return $answer;
    $body = json_decode($raw);
    $body->confirm = $answer[1]['error']['confirmation']['id'];
    return call($base, 'POST', "/editor/experiences/$experience/import", null, $token, 'http://localhost:5173', json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

/**
 * A removal in its two steps (Experiences::deleteScene / deleteEntry): the first answer is 409 confirm-delete with the impact
 * and a confirmation id – sent again with it (and `$options`, e.g. deleteFiles), as the editor does after the person
 * confirmed. Any other first answer passes through unchanged.
 */
function deleting(string $base, string $path, ?string $token, array $options = []): array
{
    $answer = call($base, 'DELETE', $path, null, $token);
    if ($answer[0] !== 409 || ($answer[1]['error']['code'] ?? null) !== 'confirm-delete') return $answer;
    return call($base, 'DELETE', $path, ['confirm' => $answer[1]['error']['confirmation']['id']] + $options, $token);
}

/** A file upload: the bytes as the body, the name in X-File-Name (sent as `$type`) */
function upload(string $base, string $method, string $path, string $bytes, string $name, string $token, string $type = 'application/octet-stream', array $extraHeaders = []): array
{
    $headers = ['Origin: http://localhost:5173', "Content-Type: $type", "X-File-Name: $name", "Authorization: Bearer $token", ...$extraHeaders];
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true, 'content' => $bytes]]);
    $response = file_get_contents($base . $path, false, $context);
    $status = (int) explode(' ', $http_response_header[0])[1];
    return [$status, $response === '' ? null : json_decode($response, true), $http_response_header];
}

/** A surface's reference image URL as the scenes overview shows it (#314), null: none */
function SurfaceRef(string $base, string $token, string $scene, string $surface): ?string
{
    [, $overview] = call($base, 'GET', '/editor/experiences/surfaced/scenes', null, $token);
    foreach ($overview['scenes'] ?? [] as $s) {
        if ($s['id'] !== $scene) continue;
        foreach ($s['surfaces'] as $f) if ($f['id'] === $surface) return $f['reference']['url'] ?? null;
    }
    return null;
}

/**
 * A PNG of one colour, written by hand (no GD in the test): `$alpha` < 255 makes it RGBA – a picture with transparency.
 * Distinct colours give distinct pictures, so uploads under the image rule (#298) stay distinct assets.
 */
function pngOf(int $width, int $height, int $rgb, int $alpha = 255): string
{
    $pixel = chr(($rgb >> 16) & 255) . chr(($rgb >> 8) & 255) . chr($rgb & 255) . ($alpha < 255 ? chr($alpha) : '');
    $row = "\0" . str_repeat($pixel, $width);
    $chunk = static fn(string $type, string $body): string => pack('N', strlen($body)) . $type . $body . pack('N', crc32($type . $body));
    return "\x89PNG\r\n\x1a\n" . $chunk('IHDR', pack('NN', $width, $height) . chr(8) . chr($alpha < 255 ? 6 : 2) . "\0\0\0")
        . $chunk('IDAT', (string) gzcompress(str_repeat($row, $height), 9)) . $chunk('IEND', '');
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
    [$status, $data] = call($api, 'POST', '/auth/request', ['email' => 'a@b.example', 'options' => ['buildingfictions' => 'yes']]);
    check($status === 400 && $data['error']['code'] === 'invalid-options', 'non-boolean option → 400');
    [$status, $data] = call($api, 'POST', '/auth/request', ['email' => ' Reader@Example.com ', 'language' => 'de', 'options' => ['buildingfictions' => true]]);
    check($status === 202 && is_string($data['requestId']), 'request → 202 with a request id');
    $requestId = $data['requestId'];
    $mail = lastMail($mailLog);
    check($mail['code'] !== null && $mail['token'] !== null, 'mail contains the code and the link');
    check(str_contains($mail['text'], 'https://app.example') === false && str_contains($mail['text'], 'http://localhost:5173/about?login='), 'link points to the calling allowed origin');
    check(str_contains($mail['text'], 'Neuigkeiten von Building Fictions'), 'the German mail names the chosen option (#325: Building Fictions)');

    echo "verify by code\n";
    [$status, $data] = call($api, 'POST', '/auth/verify', ['requestId' => $requestId, 'code' => '000000' === $mail['code'] ? '111111' : '000000']);
    check($status === 400 && $data['error']['code'] === 'invalid-code', 'wrong code → 400');
    [$status, $data] = call($api, 'POST', '/auth/verify', ['requestId' => $requestId, 'code' => substr($mail['code'], 0, 3) . ' ' . substr($mail['code'], 3)]);
    check($status === 200 && $data['created'] === true, 'right code (with a space) → session, new user');
    check($data['user']['email'] === 'reader@example.com', 'email stored lowercase and trimmed');
    check($data['user']['options'] === ['buildingfictions' => true], 'the option from the form (#325: one, Building Fictions)');
    $session = $data['session'];
    [$status, $data] = call($api, 'POST', '/auth/verify', ['token' => $mail['token']]);
    check($status === 410 && $data['error']['code'] === 'already-used', 'link of a used request → 410');

    echo "verify by link (existing user keeps its options)\n";
    call($api, 'POST', '/auth/request', ['email' => 'reader@example.com', 'options' => ['buildingfictions' => false]]);
    $mail = lastMail($mailLog);
    check(!str_contains($mail['text'], 'signed up for'), 'mail for an existing user lists no options');
    [$status, $data] = call($api, 'POST', '/auth/verify', ['token' => $mail['token']]);
    check($status === 200 && $data['created'] === false && $data['user']['options']['buildingfictions'] === true, 'link → session, options unchanged');
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
    [$status, $data] = call($api, 'PATCH', '/user', ['options' => ['buildingfictions' => false], 'language' => 'fr'], $session);
    check($status === 200 && $data['user']['options']['buildingfictions'] === false && $data['user']['language'] === 'fr', 'options and language changed');

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
    $record = ['format' => 1, 'experienceId' => 'osct', 'appVersions' => ['1.1.0'], 'unlocked' => new stdClass(), 'consulted' => ['e1' => 5], 'lastScene' => null, 'lastCategory' => null, 'onboarded' => true];
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
    check($status === 400 && $data['error']['code'] === 'invalid-record', 'record of another experience → 400');

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
    [$status] = call($api, 'GET', '/editor/experiences', null, $data['session']);
    check($status === 200, 'and may use the editor');
    [$status] = call($api, 'GET', '/editor/experiences');
    check($status === 401, 'editor endpoints without a token → 401');
    [$status, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
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
    [$status, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
    check($status === 200 && $data['experiences'] === [], 'the editor sees the (empty) experience list');
    [$status] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 404, 'no experience before an import → 404');

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
    check($data['users'][0]['options']['buildingfictions'] === false && $data['users'][0]['language'] === 'en' && is_string($data['users'][0]['lastSeenAt']), 'a user comes with options, language and last seen');
    // Arrivals by source (#324): counts only, from anyone; the admin reads them
    [$status] = call($api, 'POST', '/arrivals', ['source' => 'bk1', 'device' => 'phone', 'first' => true]);
    check($status === 204, 'POST /arrivals counts an arrival (204, no session)');
    call($api, 'POST', '/arrivals', ['source' => 'BK1', 'device' => 'phone', 'first' => false]);
    call($api, 'POST', '/arrivals', ['source' => 'lp1', 'device' => 'nonsense', 'first' => true]);
    [$status, $data] = call($api, 'POST', '/arrivals', ['source' => 'no spaces!']);
    check($status === 400 && $data['error']['code'] === 'invalid-source', 'a malformed source → 400 invalid-source');
    [$status] = call($api, 'GET', '/admin/arrivals', null, $editor);
    check($status === 403, 'arrivals are for admins only');
    [$status, $data] = $withSecret('GET', '/admin/arrivals?days=7');
    $bySource = array_column($data['sources'] ?? [], null, 'source');
    check($status === 200 && $data['days'] === 7 && array_keys($bySource) === ['bk1', 'lp1'], 'GET /admin/arrivals: every source, most arrivals first (the source in lowercase)');
    check(($bySource['bk1']['arrivals'] ?? 0) === 2 && $bySource['bk1']['firstArrivals'] === 1 && $bySource['bk1']['devices']['phone'] === 2
        && $bySource['bk1']['firstDay'] === gmdate('Y-m-d') && $bySource['bk1']['recent'] === [['day' => gmdate('Y-m-d'), 'arrivals' => 2]],
        'a source: arrivals, first arrivals, by device, first and last day, the recent days');
    check(($bySource['lp1']['devices']['desktop'] ?? 0) === 1, 'an unknown device counts as desktop');
    [, $data] = $withSecret('GET', '/admin/roles');
    check(array_column($data['roles'], 'name') === ['reader', 'editor', 'admin'], 'GET /admin/roles: reader, editor, admin with fixed ids');
    // An address in ADMINS (config) is an admin from its first sign-in – the instance's first admin without the secret
    call($api, 'POST', '/auth/request', ['email' => 'chief@example.com', 'options' => ['buildingfictions' => true]]);
    [, $data] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    $chief = $data['session'];
    check($data['user']['roles'] === ['reader', 'admin'] && $data['user']['role'] === 'reader', 'an address listed in ADMINS signs in as an admin (not an editor)');
    [$status, $data] = call($api, 'GET', '/admin/users?role=admin', null, $chief);
    check($status === 200 && count($data['users']) === 1 && $data['users'][0]['grants'][1]['grantedBy'] === 'config', 'the admin may use the admin API; the grant says config');
    [$status, $data] = call($api, 'GET', '/editor/experiences', null, $chief);
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
    [$status] = call($api, 'GET', '/editor/experiences', null, $editor);
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
    // A grant that loses the race to a parallel one: simulated by a trigger that refuses the row as a duplicate (#209)
    $pdo = connect('test');
    $pdo->exec($mysql ? "CREATE TRIGGER fake_parallel_grant BEFORE INSERT ON user_roles FOR EACH ROW SIGNAL SQLSTATE '23000' SET MYSQL_ERRNO = 1062, MESSAGE_TEXT = 'Duplicate entry'"
        : "CREATE TRIGGER fake_parallel_grant BEFORE INSERT ON user_roles BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: user_roles.user_id, user_roles.role_id'); END");
    [$status, $data] = call($api, 'PUT', "/admin/users/$chiefId/roles/editor", null, $chief);
    $pdo->exec('DROP TRIGGER fake_parallel_grant');
    $pdo = null;
    check($status === 200 && $data['changed'] === false, '#209: a grant whose row a parallel grant wrote first → already granted (changed false), no 500');
    [$status, $data] = call($api, 'PUT', "/admin/users/$authorId/roles/editor", null, $chief);
    check($status === 200 && $data['user']['role'] === 'editor', 'the author is an editor again');
    [$status] = call($api, 'GET', '/editor/experiences', null, $editor);
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
    check($lines[0] === 'email,language,buildingfictions,createdAt', 'the CSV header names the options');
    check(count($lines) === 2 && str_starts_with($lines[1], 'chief@example.com,en,yes,'), 'newsletter=1: only the users with the option on (the reader turned theirs off)');
    $csv = (string) file_get_contents("$api/admin/users.csv?option=buildingfictions", false, $csvContext);
    check(count(array_filter(explode("\n", trim($csv)))) === 2 && str_contains($csv, 'chief@example.com'), 'option=buildingfictions narrows to that option');
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
        'version' => ['version' => '1.9.0', 'timestamp' => '2026-01-01T00:00:00.000Z', 'hash' => str_repeat('ab', 32), 'schema' => '5.0'],
        'experience' => ['id' => 'osct', 'title' => 'Test Experience', 'book' => ['author' => 'Someone', 'publisher' => 'Building Fictions']],
        'initialScene' => 's1',
        'scenes' => [
            ['id' => 's1', 'label' => '1–2', 'surfaces' => [['id' => 'surface', 'widthMm' => 460, 'heightMm' => 320, 'place' => ['x' => 0, 'y' => 0, 'z' => 0, 'rx' => 0, 'ry' => 0, 'rz' => 0]]]],
            ['id' => 's2', 'label' => '3–4', 'surfaces' => [['id' => 'surface', 'widthMm' => 460, 'heightMm' => 320, 'place' => ['x' => 0, 'y' => 0, 'z' => 0, 'rx' => 0, 'ry' => 0, 'rz' => 0]]], 'note' => 'an extra field'],
        ],
        'entries' => [
            ['id' => 'racoon', 'category' => 'glossary', 'title' => 'Racoon', 'scene' => 's1', 'body' => 'A beast.', 'tags' => [], 'target' => [
                'id' => 'racoon', 'imageSrc' => '/assets/content/entries/racoon/img.jpg',
                'entity' => ['type' => 'model', 'assets' => [['id' => 'racoon-0', 'assetType' => 'glb', 'src' => '/assets/content/entries/racoon/racoon.glb']], 'params' => ['scale' => 0.5]]]],
            ['id' => 'castle', 'category' => 'video', 'title' => 'Castle', 'scene' => 's2', 'body' => '', 'image' => '/assets/content/entries/castle/cover.jpg', 'tags' => ['x'], 'target' => [
                'id' => 'castle-target', 'imageSrc' => '/assets/content/entries/castle/img.jpg', 'entity' => ['ref' => 'castle']]],
            ['id' => 'link', 'category' => 'link', 'title' => 'A link', 'scene' => 's2', 'body' => '', 'media' => 'https://example.com', 'tags' => []],
            ['id' => 'lost', 'category' => 'text', 'title' => 'Lost', 'scene' => 's2', 'body' => 'Read in the list only.', 'tags' => []],
        ],
        'entities' => ['castle' => ['type' => 'video', 'assets' => [['id' => 'castle-0', 'assetType' => 'video', 'src' => '/assets/content/entities/castle/c.mp4']], 'params' => new stdClass(), 'filters' => [['type' => 'chromaKey', 'color' => '#00ff00']]]],
        // What the plugin registered, recorded by the content build (#90): the API tells a typo from its node type
        'plugins' => [['id' => 'tint', 'src' => '/assets/content/plugins/tint/plugin.js', 'api' => '1.0', 'registered' => [
            'components' => ['tint' => ['description' => 'Tints.', 'params' => ['opacity' => ['kind' => 'number', 'default' => 0.3, 'min' => 0, 'max' => 1, 'description' => 'How much.']]]],
            'nodeTypes' => ['sparkle' => ['description' => 'Points.', 'params' => ['count' => ['kind' => 'number', 'default' => 50, 'min' => 1, 'max' => 500, 'description' => 'How many.']]]],
            'passes' => new stdClass(),
        ]]],
    ];
    $files = ['/assets/content/entries/racoon/racoon.glb' => ['size' => 1234, 'v' => 'abcdef012345'], '/assets/content/entries/racoon/img.jpg' => ['size' => 10, 'v' => '0123456789ab']];
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200 && $data['counts'] === ['scenes' => 2, 'entries' => 4, 'targets' => 2, 'entities' => 1], 'import → counts');
    check(preg_match('/^[0-9a-f]{12}$/', $data['draft']['build'] ?? '') === 1 && $data['experience']['importedHash'] === str_repeat('ab', 32), 'import answers with the draft build and the imported hash');
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => ['experience' => []]]));
    check($status === 400 && $data['error']['code'] === 'invalid-configuration', 'a configuration without a schema → 400');
    $bad = $configuration;
    $bad['entities']['castle']['type'] = 'hologram';
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $bad], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'an unknown entity type → 400 invalid-entity');
    $bad = $configuration;
    $bad['entries'][1]['target']['entity'] = ['ref' => 'ghost'];
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $bad], $flags));
    check($status === 400 && $data['error']['code'] === 'unknown-entity', 'a ref to no entity → 400 unknown-entity');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/import', ['source' => 'cdn'], $editor);
    check($status === 400 && $data['error']['code'] === 'no-content-base', 'source cdn without CONTENT_BASE_URL → 400');
    // #204: the rows go under the path's id, the configuration keeps its own experience.id – the two must agree
    [, $before] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    [$status, $data] = importing($api, 'other', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-configuration' && str_contains($data['error']['message'], '"osct"') && str_contains($data['error']['message'], '"other"'),
        '#204: a configuration of experience osct imported as other → 400 invalid-configuration naming both ids');
    [$status] = call($api, 'GET', '/editor/experiences/other', null, $editor);
    [, $after] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 404 && $after === $before, '… nothing imported under either id');
    $badId = $configuration;
    $badId['experience']['id'] = 'My Experience';
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $badId, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-id', '#204: an experience.id that is no id → 400 invalid-id');

    echo "editor: tree, entities\n";
    [$status, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
    check($status === 200 && count($data['experiences']) === 1 && $data['experiences'][0]['scenes'] === 2 && $data['experiences'][0]['initialScene'] === 's1' && $data['experiences'][0]['lastPublish'] === null && $data['experiences'][0]['experience']['book']['publisher'] === 'Building Fictions'
        && !isset($data['experiences'][0]['author']), 'experience list: one experience, two scenes, not published, its printed book in experience.book');
    [$status, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && count($tree['scenes']) === 2 && $tree['scenes'][0]['id'] === 's1' && $tree['scenes'][0]['label'] === '1–2' && $tree['scenes'][1]['note'] === 'an extra field'
        && !isset($tree['spreads']) && !isset($tree['unassigned']) && $tree['groups'] === [], 'tree: scenes in order with every field (no spreads, no unassigned)');
    check(($tree['scenes'][0]['entries'][0]['target']['entity']['type'] ?? null) === 'model' && $tree['scenes'][0]['entries'][0]['scene'] === 's1', 'tree: an inline entity under its entry, the entry names its scene');
    check(($tree['scenes'][1]['entries'][0]['target']['entity']['ref'] ?? null) === 'castle' && $tree['scenes'][1]['entries'][1]['target'] === null, 'tree: a ref, and an entry without a target');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($status === 200 && array_keys($data['entities']) === ['castle'] && $data['entities']['castle']['type'] === 'video', 'the shared entities');

    echo "editor: draft\n";
    [$status, $manifest, $headers] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json?t=1', null, $editor);
    check($status === 200 && preg_match('/^[0-9a-f]{12}$/', $manifest['build']) === 1 && strlen($manifest['hash']) === 64 && str_starts_with($manifest['hash'], $manifest['build'])
        && $manifest['schema'] === '5.0' && $manifest['version'] === $appVersion && isset($manifest['activatedAt']), 'draft latest.json is a content manifest');
    check(in_array('Cache-Control: no-store', $headers, true), 'the draft is never cached');
    $withToken = stream_context_create(['http' => ['header' => "Authorization: Bearer $editor"]]);
    $rawDraft = (string) file_get_contents("$api/editor/experiences/osct/draft/{$manifest['build']}/game.config.json", false, $withToken);
    $draft = json_decode($rawDraft, true);
    check($draft['version']['hash'] === $manifest['hash'] && $draft['version']['version'] === $appVersion && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/', $draft['version']['timestamp']) === 1
        && array_keys($draft['version']) === ['version', 'timestamp', 'hash', 'schema'], 'game.config.json carries the version block');
    $expected = json_decode(json_encode($configuration, $flags), true);
    unset($expected['version'], $draft['version']);
    check(!isset($draft['tutorial']) && !isset($draft['spreads']) && !isset($draft['initialSpreadId']), 'the draft is 3.0: no tutorial, no spreads (#319)');
    check(!isset($draft['experience']['sourceOfTruth']) && !isset($draft['experience']['author']), 'the draft is 4.0: no sourceOfTruth, the author only in experience.book (#320)');
    check($draft === $expected, 'import → draft round-trips the configuration unchanged (keys, order, extra fields)');
    check(str_contains($rawDraft, '"params":{}') && str_contains($rawDraft, '"tags":[]'), 'empty objects and lists keep their kind');
    [$status, $data] = call($api, 'GET', "/editor/experiences/osct/draft/{$manifest['build']}/files.json", null, $editor);
    check($status === 200 && $data === $files, 'files.json as imported');
    [$status] = call($api, 'GET', "/editor/experiences/osct/draft/{$manifest['build']}/game.config.json");
    check($status === 401, 'the draft needs the token');

    echo "editor: edit\n";
    $castle = $configuration['entities']['castle'];
    $castle['params'] = ['scale' => 2];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $editor);
    check($status === 200 && $data['entity']['params']['scale'] === 2, 'PUT entity → saved');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', ['type' => 'hologram', 'assets' => []], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'an unknown type → 400 invalid-entity');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', ['type' => 'video'], $editor);
    check($status === 400, 'without assets → 400');
    $racoon = $configuration['entries'][0]['target']['entity'];
    $racoon['params'] = ['position' => [0, 0.1, 0], 'scale' => 0.5];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['entity' => $racoon], $editor);
    check($status === 200 && $data['target']['id'] === 'racoon' && $data['target']['entity']['params']['position'] === [0, 0.1, 0], 'PUT target → the inline entity changed');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/targets/nope', ['entity' => $racoon], $editor);
    check($status === 404, 'unknown target → 404');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['ref' => 'nope'], $editor);
    check($status === 400 && $data['error']['code'] === 'unknown-entity', 'a ref to an unknown entity → 400');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    check($data['build'] !== $manifest['build'], 'an edit changes the draft build');
    $edited = json_decode((string) file_get_contents("$api/editor/experiences/osct/draft/{$data['build']}/game.config.json", false, $withToken), true);
    check($edited['entities']['castle']['params']['scale'] === 2 && $edited['entries'][0]['target']['entity']['params']['position'] === [0, 0.1, 0], 'the draft has both edits');
    unset($edited['version'], $edited['entities']['castle']['params'], $edited['entries'][0]['target']['entity']['params']);
    $rest = $expected;
    unset($rest['entities']['castle']['params'], $rest['entries'][0]['target']['entity']['params']);
    check($edited === $rest, 'everything else is as imported');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/changes', null, $editor);
    check($status === 200 && count($data['changes']) === 2 && $data['changes'][0]['kind'] === 'target' && $data['changes'][0]['ref'] === 'racoon' && $data['changes'][0]['user'] === 'author@example.com'
        && $data['changes'][1]['kind'] === 'entity' && $data['changes'][1]['ref'] === 'castle' && $data['changes'][1]['after']['params']['scale'] === 2 && $data['changes'][1]['before']['params'] === [], 'change log: two entries, newest first, before/after and the user');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    check(count($data['changes']) === 1, 'limit');

    echo "editor: publish (local store)\n";
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'No where!'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-env', 'an env that is no environment name → 400');
    foreach (['staging', 'production', 'nowhere'] as $env) {
        [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => $env], $editor);
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
    [$status, $first] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local', 'note' => 'first'], $editor);
    check($status === 200 && $first['env'] === 'local' && preg_match('/^[0-9a-f]{12}$/', $first['build']) === 1 && str_starts_with($first['hash'], $first['build']) && isset($first['publishedAt']), 'publish → env, build, hash');
    check(is_file("$storeDir/local/osct/{$first['build']}/game.config.json") && is_file("$storeDir/local/osct/{$first['build']}/files.json") && is_file("$storeDir/local/osct/latest.json") && is_file("$storeDir/local/osct/versions.json"), 'the version folder, versions.json and latest.json are in the store dir');
    [$status, $data, $headers] = call($api, 'GET', '/content/local/osct/latest.json');
    check($status === 200 && $data['build'] === $first['build'] && $data['hash'] === $first['hash'] && $data['schema'] === '5.0' && $data['version'] === $appVersion && isset($data['activatedAt']), 'GET /content/local/latest.json serves the manifest (no token needed)');
    check(in_array('Cache-Control: no-cache', $headers, true), 'latest.json is revalidated');
    [$status, $data, $headers] = call($api, 'GET', "/content/local/osct/{$first['build']}/game.config.json");
    check($status === 200 && $data['version']['hash'] === $first['hash'] && $data['entities']['castle']['params']['scale'] === 2, 'the published game.config.json is the draft');
    check((bool) preg_grep('/^Cache-Control: public, max-age=31536000, immutable$/', $headers), 'version files are immutable');
    [, $data] = call($api, 'GET', '/content/local/osct/versions.json');
    check(count($data) === 1 && $data[0]['build'] === $first['build'] && $data[0]['retiredAt'] === null && $data[0]['uploadedAt'] === $data[0]['activatedAt'], 'versions.json has the one version, current');
    [$status] = call($api, 'GET', '/content/local/osct/../test.sqlite');
    [$status2] = call($api, 'GET', "/content/local/osct/{$first['build']}/game.config.txt");
    [$status3] = call($api, 'GET', '/content/Local/osct/latest.json');
    check($status === 404 && $status2 === 404 && $status3 === 404, 'only the json files of a version: no traversal, other names and envs → 404');
    $castle['params'] = ['scale' => 3];
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $editor);
    [$status, $second] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200 && $second['build'] !== $first['build'], 'a second publish makes a new version');
    [, $data] = call($api, 'GET', '/content/local/osct/versions.json');
    check(count($data) === 2 && $data[0]['build'] === $first['build'] && is_string($data[0]['retiredAt']) && $data[1]['build'] === $second['build'] && $data[1]['retiredAt'] === null, 'versions.json: the first retired, the second current');
    [, $data] = call($api, 'GET', '/content/local/osct/latest.json');
    check($data['build'] === $second['build'] && is_file("$storeDir/local/osct/{$first['build']}/game.config.json"), 'latest.json moved, the first version folder stays');
    $written = file_get_contents("$storeDir/local/osct/{$second['build']}/game.config.json");
    [$status, $again] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    [, $data] = call($api, 'GET', '/content/local/osct/versions.json');
    check($status === 200 && $again['build'] === $second['build'] && count($data) === 2 && file_get_contents("$storeDir/local/osct/{$second['build']}/game.config.json") === $written, 'publishing the same draft again rewrites no version folder and adds no version');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/versions', null, $editor);
    check($status === 200 && count($data['versions']) === 3 && $data['versions'][2]['note'] === 'first' && $data['versions'][0]['publishedBy'] === 'author@example.com', 'the publish log: three publishes, newest first');
    [, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
    check($data['experiences'][0]['lastPublish']['env'] === 'local' && $data['experiences'][0]['lastPublish']['build'] === $second['build'], 'the experience list shows the last publish');

    echo "editor: a store per experience in every environment (#87)\n";
    [, $data] = call($api, 'GET', '/content/local/osct/latest.json');
    [, $versions] = call($api, 'GET', '/content/local/osct/versions.json');
    check(($data['experience'] ?? null) === 'osct' && array_column($versions, 'experience') === ['osct', 'osct'], 'latest.json and versions.json name the experience');
    [, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
    check($data['experiences'][0]['live'] === [['env' => 'local', 'build' => $second['build'], 'since' => $data['experiences'][0]['live'][0]['since'] ?? null]] && is_string($data['experiences'][0]['live'][0]['since']), 'the experience list: the experience is live on local, with its build and since when');
    check($data['environments'] === [], 'the experience list names no environment: every store could be read');
    $manifest = json_decode((string) file_get_contents("$storeDir/local/osct/latest.json"), true);
    $withExperience = file_get_contents("$storeDir/local/osct/latest.json");
    unset($manifest['experience']);
    file_put_contents("$storeDir/local/osct/latest.json", json_encode($manifest));
    [, $data] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check(($data['experience']['live'][0]['env'] ?? null) === 'local', "a manifest without experience: its version's game.config.json tells (the tree shows it live)");
    file_put_contents("$storeDir/local/osct/latest.json", $withExperience);
    $demo = $configuration;
    $demo['experience'] = ['id' => 'demo', 'title' => 'Demo'];
    [$status] = importing($api, 'demo', $editor, json_encode(['configuration' => $demo], $flags));
    check($status === 200, 'a second experience: demo');
    [, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
    $byId = array_column($data['experiences'], null, 'id');
    check($byId['demo']['live'] === [] && count($byId['osct']['live']) === 1, 'the demo is draft only');
    // #244: an import without `files` reads <assetsBase>/files.json – served by a second built-in server standing in for
    // the CDN (the API's own handles one request at a time, so it cannot fetch from itself)
    $cdnDir = "$tmp/cdn/demo/abc";
    mkdir($cdnDir, 0777, true);
    file_put_contents("$cdnDir/files.json", json_encode($files, $flags));
    $cdnPort = freePort();
    $cdnLog = ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a'];
    $processes[] = proc_open([PHP_BINARY, '-S', "127.0.0.1:$cdnPort", '-t', "$tmp/cdn"], [1 => $cdnLog, 2 => $cdnLog], $cdnPipes, "$tmp/cdn");
    for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $cdnPort); $i++) usleep(100000);
    [$status] = importing($api, 'demo', $editor, json_encode(['configuration' => $demo, 'assetsBase' => "http://127.0.0.1:$cdnPort/nowhere"], $flags));
    [$status2, $data] = call($api, 'GET', '/editor/experiences/demo/assets', null, $editor);
    check($status === 200 && $status2 === 200 && ($data['assets'] ?? null) === [], '#244: a base without a files.json imports as before – no imported files');
    [$status] = importing($api, 'demo', $editor, json_encode(['configuration' => $demo, 'assetsBase' => "http://127.0.0.1:$cdnPort/demo/abc"], $flags));
    [$status2, $data] = call($api, 'GET', '/editor/experiences/demo/assets', null, $editor);
    $names = array_column($data['assets'] ?? [], 'name');
    check($status === 200 && $status2 === 200 && $names === ['racoon.glb', 'img.jpg'] && ($data['assets'][0]['imported'] ?? null) === true
        && str_starts_with((string) ($data['assets'][0]['url'] ?? ''), "http://127.0.0.1:$cdnPort/demo/abc/"),
        '#244: an import without files reads <assetsBase>/files.json – the Library lists the imported files below the base');
    // #277: a credits line per file, by its URL – an imported file's too
    $imgUrl = (string) ($data['assets'][1]['url'] ?? '');
    check(array_key_exists('credits', $data['assets'][1] ?? []) && $data['assets'][1]['credits'] === null, '#277: a file without credits lists null');
    [$status, $saved] = call($api, 'PUT', '/editor/experiences/demo/assets/credits', ['items' => [['url' => $imgUrl, 'credits' => "  Book Golem by\nTER-JAN / DeviantArt "]]], $editor);
    [, $data] = call($api, 'GET', '/editor/experiences/demo/assets', null, $editor);
    check($status === 200 && ($saved['credits'][$imgUrl] ?? null) === 'Book Golem by TER-JAN / DeviantArt'
        && ($data['assets'][1]['credits'] ?? null) === 'Book Golem by TER-JAN / DeviantArt' && array_key_exists('credits', $data['assets'][0] ?? []) && $data['assets'][0]['credits'] === null,
        '#277: credits are saved per file url (white space folded) and listed with the file');
    $demoDraft = function () use ($api, $editor, $withToken): array {
        [, $manifest] = call($api, 'GET', '/editor/experiences/demo/draft/latest.json', null, $editor);
        return json_decode((string) file_get_contents("$api/editor/experiences/demo/draft/{$manifest['build']}/game.config.json", false, $withToken), true);
    };
    $config = $demoDraft();
    check(($config['credits'] ?? null) === [$imgUrl => 'Book Golem by TER-JAN / DeviantArt'] && $config['entries'][0]['target']['imageSrc'] === $imgUrl,
        '#292: the draft carries the credit line of a file the experience uses, by the URL the configuration names');
    [$status, $refused] = call($api, 'PUT', '/editor/experiences/demo/assets/credits', ['items' => [['url' => $imgUrl, 'credits' => 'x'], ['url' => 'https://elsewhere/x.jpg', 'credits' => 'y']]], $editor);
    check($status === 400 && ($refused['error']['code'] ?? null) === 'invalid-credits', '#277: a url that is no file of the Library refuses the whole request');
    [$status] = call($api, 'PUT', '/editor/experiences/demo/assets/credits', ['items' => [['url' => $imgUrl, 'credits' => '']]], $editor);
    [, $data] = call($api, 'GET', '/editor/experiences/demo/assets', null, $editor);
    check($status === 200 && array_key_exists('credits', $data['assets'][1] ?? []) && $data['assets'][1]['credits'] === null, '#277: an empty line removes the credits');
    check(!array_key_exists('credits', $demoDraft()), '#292: … and an experience without credit lines has no credits');
    // #330: an imported file renamed by hand – its name kept by URL, the URL and the draft unchanged
    $importedId = (string) ($data['assets'][1]['id'] ?? '');
    [$status, $renamed] = call($api, 'PUT', "/editor/experiences/demo/assets/$importedId", ['name' => 'Golem page'], $editor);
    [, $data] = call($api, 'GET', '/editor/experiences/demo/assets', null, $editor);
    check($status === 200 && ($renamed['asset']['name'] ?? null) === 'Golem page.jpg' && ($renamed['changed'] ?? null) === true
        && ($data['assets'][1]['name'] ?? null) === 'Golem page.jpg' && ($data['assets'][1]['url'] ?? null) === $imgUrl && $demoDraft()['entries'][0]['target']['imageSrc'] === $imgUrl,
        '#330: PUT assets/{import-…} { name } renames an imported file – the extension added, the URL and the draft unchanged');
    [$status, $renamed] = call($api, 'PUT', "/editor/experiences/demo/assets/$importedId", ['name' => 'img.JPG'], $editor);
    check($status === 200 && ($renamed['asset']['name'] ?? null) === 'img.JPG', '#330: … a name that ends with the extension (any case) keeps it as typed');
    [$status] = call($api, 'PUT', "/editor/experiences/demo/assets/$importedId", ['name' => 'img.jpg'], $editor);
    check($status === 200, '#330: … and back to its own name');
    [$status, $demoPublish] = call($api, 'POST', '/editor/experiences/demo/publish', ['env' => 'local'], $editor);
    check($status === 200 && !array_key_exists('replaced', $demoPublish) && is_file("$storeDir/local/demo/{$demoPublish['build']}/game.config.json"),
        'another experience publishes to the same environment into its own store – no replace, nothing to confirm (#87)');
    check(json_decode((string) file_get_contents("$storeDir/local/osct/latest.json"), true)['build'] === $second['build'], '… and the first experience\'s store is untouched');
    [$status, $data] = call($api, 'GET', '/content/local/demo/latest.json');
    check($status === 200 && $data['build'] === $demoPublish['build'] && $data['experience'] === 'demo', 'GET /content/local/demo/latest.json serves the demo\'s current version');
    [, $data] = call($api, 'GET', '/editor/experiences', null, $editor);
    $byId = array_column($data['experiences'], null, 'id');
    check(($byId['demo']['live'][0]['build'] ?? null) === $demoPublish['build'] && ($byId['osct']['live'][0]['build'] ?? null) === $second['build'], 'both experiences are live on local, each with its own build');
    [$status, $data] = call($api, 'POST', '/editor/experiences/demo/publish', ['env' => 'local', 'replace' => true], $editor);
    check($status === 200 && $data['build'] === $demoPublish['build'], 'replace is no field any more – a body that still sends it publishes as before');
    [, $versions] = call($api, 'GET', '/content/local/osct/versions.json');
    $current = array_values(array_filter($versions, fn($v) => $v['retiredAt'] === null));
    check(count($current) === 1 && $current[0]['build'] === $second['build'] && $current[0]['experience'] === 'osct', "the first experience's versions.json still has its own version current");
    [$status] = call($api, 'GET', '/content/local/no%20such/latest.json');
    [$status2] = call($api, 'GET', '/content/local/latest.json');
    check($status === 404 && $status2 === 404, 'the content route needs an experience id: a bad one or none → 404');

    echo "editor: export (#322)\n";
    [$status, $export] = call($api, 'GET', '/editor/experiences/osct/export', null, $editor);
    [, $draftManifest] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    $byUrl = array_column($export['files'] ?? [], null, 'url');
    check($status === 200 && $export['experience'] === 'osct' && $export['source'] === ['kind' => 'draft'] && $export['build'] === $draftManifest['build'] && $export['hash'] === $draftManifest['hash']
        && $export['schema'] === '5.0' && $export['appVersion'] === $appVersion && $export['configuration']['experience']['id'] === 'osct' && $export['configuration']['version']['hash'] === $export['hash'],
        'export: the draft\'s configuration with its build and hash, as the draft endpoints assemble it');
    check(($byUrl['/assets/content/entries/racoon/racoon.glb'] ?? null) === ['url' => '/assets/content/entries/racoon/racoon.glb', 'path' => '/assets/content/entries/racoon/racoon.glb', 'origin' => 'import', 'size' => 1234, 'sha256' => null, 'v' => 'abcdef012345'],
        'export: a file of the import with its size and v from files.json (no full sha256 recorded)');
    check(($byUrl['/assets/content/entities/castle/c.mp4']['origin'] ?? null) === 'unknown' && $byUrl['/assets/content/entities/castle/c.mp4']['size'] === null
        && $export['unknown'] === count(array_filter($export['files'], fn(array $f): bool => $f['origin'] === 'unknown')) && $export['unknown'] > 0 && !isset($byUrl['https://example.com']),
        'export: a named file the import\'s files do not hold is unknown – counted; a link is no file');
    check($export['layout'] === null && $export['plugins'] === [] && $export['credits'] === [], 'export: no layout, no plugin sources, no credit lines');
    [$status, $published] = call($api, 'GET', "/editor/experiences/osct/export?build={$first['build']}", null, $editor);
    check($status === 200 && $published['source']['kind'] === 'published' && $published['source']['env'] === 'local' && $published['source']['publishedBy'] === 'author@example.com' && is_string($published['source']['publishedAt'])
        && $published['build'] === $first['build'] && $published['hash'] === $first['hash'] && $published['configuration']['entities']['castle']['params']['scale'] === 2,
        'export ?build=: a published version as the content store holds it');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/export?build=nope', null, $editor);
    [$status2, $data2] = call($api, 'GET', '/editor/experiences/osct/export?build=ffffffffffff', null, $editor);
    [$status3, $data3] = call($api, 'GET', "/editor/experiences/demo/export?build={$first['build']}", null, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-build' && $status2 === 404 && $data2['error']['code'] === 'unknown-build' && $status3 === 404 && $data3['error']['code'] === 'unknown-build',
        'export ?build=: no build → 400 invalid-build; a build the publish log does not have for this experience → 404 unknown-build');
    $versionFile = "$storeDir/local/osct/{$first['build']}/game.config.json";
    rename($versionFile, "$versionFile.away");
    [$status, $data] = call($api, 'GET', "/editor/experiences/osct/export?build={$first['build']}", null, $editor);
    rename("$versionFile.away", $versionFile);
    check($status === 404 && $data['error']['code'] === 'build-missing' && $data['error']['env'] === 'local', 'export ?build=: a logged version the store lost → 404 build-missing');
    [$status] = call($api, 'GET', '/editor/experiences/osct/export', null, $chief);
    [$status2] = call($api, 'GET', '/editor/experiences/nothing/export', null, $editor);
    check($status === 403 && $status2 === 404, 'export: editors only (an admin without the editor role → 403); no such experience → 404');
    // The print layout and a Library upload: the demo again, its files with a layout, a model of the Library on its castle
    $layoutFiles = $files + ['/assets/content/layout/layout.json' => ['size' => 50, 'v' => '111111111111'], '/assets/content/layout/sheets/cover-front.jpg' => ['size' => 900, 'v' => '222222222222']];
    $demoBase = "http://127.0.0.1:$cdnPort/demo/abc";
    [$status] = importing($api, 'demo', $editor, json_encode(['configuration' => $demo, 'files' => $layoutFiles, 'assetsBase' => $demoBase], $flags));
    $glb = "glTF export test\n";
    [$status2, $uploaded] = upload($api, 'POST', '/editor/experiences/demo/assets', $glb, 'Thing.glb', $editor);
    $glbUrl = (string) ($uploaded['asset']['url'] ?? '');
    [$status3] = call($api, 'PUT', '/editor/experiences/demo/entities/castle', ['type' => 'model', 'assets' => [['id' => 'castle-0', 'assetType' => 'glb', 'src' => $glbUrl]], 'params' => new stdClass()], $editor);
    [$status4] = call($api, 'PUT', '/editor/experiences/demo/assets/credits', ['items' => [['url' => $glbUrl, 'credits' => 'A thing by someone']]], $editor);
    check($status === 200 && $status2 === 201 && $status3 === 200 && $status4 === 200, "export: the demo with a layout and an uploaded model (setup: $status $status2 $status3 $status4)");
    [$status, $export] = call($api, 'GET', '/editor/experiences/demo/export', null, $editor);
    $byUrl = array_column($export['files'] ?? [], null, 'url');
    check($status === 200 && ($byUrl[$glbUrl] ?? null) === ['url' => $glbUrl, 'path' => null, 'origin' => 'upload', 'size' => strlen($glb), 'sha256' => hash('sha256', $glb), 'v' => substr(hash('sha256', $glb), 0, 12)]
        && $export['credits'] === [$glbUrl => 'A thing by someone'],
        'export: a Library upload with its size and full sha256 from its asset row; the Library\'s credit lines');
    check($export['layout'] === ['file' => "$demoBase/assets/content/layout/layout.json", 'files' => ["$demoBase/assets/content/layout/layout.json", "$demoBase/assets/content/layout/sheets/cover-front.jpg"]]
        && ($byUrl["$demoBase/assets/content/layout/sheets/cover-front.jpg"] ?? null) === ['url' => "$demoBase/assets/content/layout/sheets/cover-front.jpg", 'path' => '/assets/content/layout/sheets/cover-front.jpg', 'origin' => 'import', 'size' => 900, 'sha256' => null, 'v' => '222222222222']
        && ($byUrl["$demoBase/assets/content/entries/racoon/img.jpg"]['path'] ?? null) === '/assets/content/entries/racoon/img.jpg',
        'export: the print layout (layout.json and its sheets) from the import\'s files, listed with their content paths');

    echo "editor: import with a version comparison before it overwrites (#183)\n";
    $raw = fn(array $body) => call($api, 'POST', '/editor/experiences/osct/import', null, $editor, 'http://localhost:5173', json_encode($body, $flags));
    $incoming = $configuration;
    $incoming['version'] = ['version' => '1.42.0', 'timestamp' => '2026-10-30T08:00:00.000Z', 'hash' => str_repeat('cd', 32), 'schema' => '5.1'];
    [, $before] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files]);
    $comparison = $data['error']['comparison'] ?? [];
    $confirmation = $data['error']['confirmation'] ?? [];
    check($status === 409 && $data['error']['code'] === 'confirm-import' && preg_match('/^\d{10}\.[0-9a-f]{32}$/', $confirmation['id'] ?? '') === 1 && strtotime($confirmation['expiresAt'] ?? '') > time(),
        'an import over an existing experience → 409 confirm-import with a confirmation id that expires');
    check(($comparison['experience'] ?? null) === ['id' => 'osct', 'title' => 'Test Experience'] && $comparison['incoming']['build'] === 'cdcdcdcdcdcd' && $comparison['incoming']['date'] === '2026-10-30T08:00:00.000Z'
        && $comparison['incoming']['appVersion'] === '1.42.0' && $comparison['incoming']['schema'] === '5.1' && $comparison['incoming']['source'] === 'configuration' && !isset($comparison['incoming']['digest']),
        'the comparison: the incoming build, its date, app and schema version');
    $basedOn = $comparison['draft']['basedOn'] ?? [];
    check(($basedOn['build'] ?? null) === 'abababababab' && $basedOn['date'] === '2026-01-01T00:00:00.000Z' && $basedOn['appVersion'] === '1.9.0' && $basedOn['importedBy'] === 'author@example.com' && is_string($basedOn['importedAt']),
        '… against what the draft is based on: build, date, app version, who imported it and when');
    check($comparison['draft']['edits'] === 3 && $comparison['draft']['recentEdits'][0]['kind'] === 'entity' && $comparison['draft']['recentEdits'][0]['ref'] === 'castle' && $comparison['draft']['recentEdits'][0]['user'] === 'author@example.com'
        && preg_match('/^[0-9a-f]{12}$/', $comparison['draft']['build']) === 1 && $comparison['same'] === false && ($comparison['draft']['live'][0]['env'] ?? null) === 'local',
        "… and the draft's unpublished edits since the import (the change log), its build and where it is live");
    [, $after] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($after === $before, 'the first step changes nothing');
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => substr($confirmation['id'], 0, -1) . (str_ends_with($confirmation['id'], '0') ? '1' : '0')]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void' && isset($data['error']['comparison'], $data['error']['confirmation']), 'a forged confirmation → 409 confirmation-void, with a new comparison');
    [$status, $data] = $raw(['configuration' => $configuration, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void', 'the id is bound to the incoming content: another configuration → void');
    $castleNow = $before['entities']['castle'];
    $castleNow['params'] = ['scale' => 4];
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castleNow, $editor);
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void' && $data['error']['comparison']['draft']['edits'] === 4, 'an edit after the comparison voids the id; the new comparison counts it');
    $confirmation = $data['error']['confirmation'];
    call($api, 'POST', '/auth/request', ['email' => 'listed@example.com']);
    [, $other] = call($api, 'POST', '/auth/verify', ['token' => lastMail($mailLog)['token']]);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/import', null, $other['session'], 'http://localhost:5173', json_encode(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']], $flags));
    check($status === 409 && $data['error']['code'] === 'confirmation-void', "another editor cannot use someone's confirmation");
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 200 && $data['experience']['importedHash'] === str_repeat('cd', 32) && $data['imported']['build'] === 'cdcdcdcdcdcd' && $data['imported']['appVersion'] === '1.42.0' && $data['imported']['importedBy'] === 'author@example.com',
        'the second step with the id imports and answers what the draft is now based on');
    [$status, $data] = $raw(['configuration' => $incoming, 'files' => $files, 'confirm' => $confirmation['id']]);
    check($status === 409 && $data['error']['code'] === 'confirmation-void', 'the id is used up: the same import again needs a new comparison');
    check($data['error']['comparison']['draft']['edits'] === 0 && $data['error']['comparison']['same'] === true && $data['error']['comparison']['draft']['basedOn']['build'] === 'cdcdcdcdcdcd',
        'after the import: no edits since, the same build comes in');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'back to the first configuration (both steps)');

    echo "editor: the import's preview (#182)\n";
    $preview = fn(string $base, array $body) => call($base, 'POST', '/editor/import/preview', null, $editor, 'http://localhost:5173', json_encode($body, $flags));
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    [$status, $data] = $preview($api, ['configuration' => $incoming, 'files' => $files, 'assetsBase' => 'https://cdn.example/x/']);
    check($status === 200 && $data['source'] === 'configuration' && $data['contentBase'] === null && $data['manifest'] === null
        && $data['incoming']['experience'] === 'osct' && $data['incoming']['title'] === 'Test Experience' && $data['incoming']['build'] === 'cdcdcdcdcdcd' && $data['incoming']['appVersion'] === '1.42.0'
        && $data['incoming']['from'] === 'https://cdn.example/x' && !isset($data['incoming']['digest']),
        'preview of a configuration: the experience, its build, app version and assets base');
    check(($data['counts'] ?? null) === ['scenes' => 2, 'entries' => 4, 'targets' => 2, 'entities' => 1], '… the scenes, entries, targets and entities it holds');
    check(($data['existing']['experience'] ?? null) === ['id' => 'osct', 'title' => 'Test Experience'] && $data['existing']['draft']['basedOn']['build'] === 'abababababab' && $data['existing']['draft']['edits'] === 0
        && $data['existing']['same'] === false && !isset($data['existing']['confirmation']),
        '… and the draft of that id it would replace, as the import\'s comparison (no confirmation)');
    [, $after] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($after === $tree, 'the preview imports nothing');
    $fresh = $configuration;
    $fresh['experience']['id'] = 'fresh';
    [$status, $data] = $preview($api, ['configuration' => $fresh]);
    check($status === 200 && $data['incoming']['experience'] === 'fresh' && $data['existing'] === null, 'an experience that is not here: existing null');
    $badId = $configuration;
    $badId['experience']['id'] = 'My Experience';
    [$status, $data] = $preview($api, ['configuration' => $badId]);
    check($status === 400 && $data['error']['code'] === 'invalid-id', '#204: the preview refuses an experience.id the import would refuse');
    [$status] = call($api, 'GET', '/editor/experiences/fresh', null, $editor);
    check($status === 404, '… and still not here');
    [$status, $data] = $preview($api, ['configuration' => ['version' => $configuration['version'], 'experience' => ['title' => 'No id']]]);
    check($status === 400 && $data['error']['code'] === 'invalid-id', 'a configuration without experience.id → 400 invalid-id');
    $bad = $configuration;
    $bad['entities']['castle']['type'] = 'hologram';
    [$status, $data] = $preview($api, ['configuration' => $bad]);
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'checked as the import checks it: an unknown entity type → 400');
    [$status, $data] = $preview($api, ['source' => 'cdn']);
    check($status === 400 && $data['error']['code'] === 'invalid-experience', 'source cdn without an experience on an instance without a default (EXPERIENCE) → 400 invalid-experience');
    [$status, $data] = $preview($api, ['source' => 'cdn', 'experience' => 'osct']);
    check($status === 400 && $data['error']['code'] === 'no-content-base', 'source cdn without CONTENT_BASE_URL → 400 no-content-base');
    [$status] = call($api, 'POST', '/editor/import/preview', ['source' => 'cdn']);
    check($status === 401, 'without a token → 401');
    // An instance whose content base is what the first one published to local (one request at a time per PHP server)
    [, $latest] = call($api, 'GET', '/content/local/osct/latest.json');
    $cdnApi = startApi(['CONTENT_BASE_URL' => "$api/content/local/", 'EXPERIENCE' => 'osct'] + $settings);
    [$status, $data] = $preview($cdnApi, ['source' => 'cdn']);
    check($status === 200 && $data['source'] === 'cdn' && $data["contentBase"] === "$api/content/local/osct" && $data['manifest']['url'] === "$api/content/local/osct/latest.json"
        && $data['manifest']['build'] === $latest['build'] && $data['manifest']['activatedAt'] === $latest['activatedAt'] && $data['incoming']['source'] === 'cdn'
        && $data['incoming']['from'] === "$api/content/local/osct/{$latest['build']}" && $data['incoming']['experience'] === 'osct' && $data['existing']['experience']['id'] === 'osct',
        'preview of the CDN: the default experience\'s store below the environment base (#87), its latest.json (build, activated), the experience in it and the draft it replaces');
    [$status, $data] = call($cdnApi, 'POST', '/editor/experiences/osct/import', ['source' => 'cdn'], $editor);
    check($status === 409 && $data['error']['code'] === 'confirm-import' && $data['error']['comparison']['incoming']['from'] === "$api/content/local/osct/{$latest['build']}",
        '… and the import of the CDN (the store of the path\'s experience) then answers with the comparison as before');
    [$status, $data] = $preview($cdnApi, ['source' => 'cdn', 'experience' => 'nobody']);
    check($status === 502 && $data['error']['code'] === 'content-fetch-failed' && $data['error']['url'] === "$api/content/local/nobody/latest.json", 'a named experience is read from its own store – one never published has none');
    $missing = startApi(['CONTENT_BASE_URL' => "$api/content/nowhere", 'EXPERIENCE' => 'osct'] + $settings);
    [$status, $data] = $preview($missing, ['source' => 'cdn']);
    check($status === 502 && $data['error']['code'] === 'content-fetch-failed' && $data['error']['url'] === "$api/content/nowhere/osct/latest.json" && str_contains($data['error']['message'], "$api/content/nowhere/osct/latest.json answered 404"),
        'a content base without latest.json → 502 content-fetch-failed with the URL');
    $withBuild = file_get_contents("$storeDir/local/osct/latest.json");
    file_put_contents("$storeDir/local/osct/latest.json", json_encode(['experience' => 'osct']));
    [$status, $data] = $preview($cdnApi, ['source' => 'cdn']);
    file_put_contents("$storeDir/local/osct/latest.json", $withBuild);
    check($status === 502 && $data['error']['code'] === 'content-fetch-failed' && $data['error']['url'] === "$api/content/local/osct/latest.json" && str_contains($data['error']['message'], 'names no content version'),
        'a latest.json that names no build → 502 with the URL');
    echo "editor: assets base\n";
    $base = 'https://cdn.example/osct/staging/0123456789ab';
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files, 'assetsBase' => "$base/"], $flags));
    check($status === 200, 're-import with an assets base');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    [, $data] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check($data['entries'][0]['target']['imageSrc'] === "$base/assets/content/entries/racoon/img.jpg"
        && $data['entries'][0]['target']['entity']['assets'][0]['src'] === "$base/assets/content/entries/racoon/racoon.glb"
        && $data['entries'][1]['image'] === "$base/assets/content/entries/castle/cover.jpg"
        && $data['entities']['castle']['assets'][0]['src'] === "$base/assets/content/entities/castle/c.mp4"
        && $data['entries'][2]['media'] === 'https://example.com', 'content paths become URLs below the base (src, imageSrc, image); other strings stay');
    [, $data] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/files.json", null, $editor);
    check(array_keys($data) === ["$base/assets/content/entries/racoon/racoon.glb", "$base/assets/content/entries/racoon/img.jpg"], 'files.json keys rewritten, in order');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes', null, $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check(count($data['changes']) === 4 && $tree['scenes'][0]['entries'][0]['target']['entity']['params'] === ['scale' => 0.5], 're-import replaced the edited rows; the change log stays');

    echo "editor: node trees (content schema 2.0)
";
    $castle = $configuration['entities']['castle'];
    // The entity as a tree of nodes
    $tree = ['type' => 'group', 'assets' => [], 'children' => [
        $castle,
        ['type' => 'text', 'assets' => [], 'text' => '{{entry.title}}', 'color' => '#f3cc94', 'params' => ['position' => [0, -0.5, 0.01]]],
    ]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $tree, $editor);
    check($status === 200 && count($data['entity']['children']) === 2 && $data['entity']['children'][1]['type'] === 'text', 'PUT entity with children → saved as a tree');
    $bad = $tree;
    $bad['children'][1]['color'] = 'gold';
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $bad, $editor);
    check($status === 400 && str_contains($data['error']['message'] ?? '', 'children[1].color'), 'a bad child → 400 with its path');
    // Every node may carry a name (the editor's tree shows it)
    $named = $tree;
    $named['name'] = 'Castle and title';
    $named['children'][1]['name'] = 'Title';
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $named, $editor);
    check($status === 200 && $data['entity']['name'] === 'Castle and title' && $data['entity']['children'][1]['name'] === 'Title', 'PUT entity with node names → kept');
    $named['children'][0]['name'] = 7;
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $named, $editor);
    check($status === 400 && str_contains($data['error']['message'] ?? '', 'children[0].name'), 'a name that is no string → 400 with its path');
    $deep = ['type' => 'group', 'assets' => []];
    for ($i = 0; $i < 9; $i++) $deep = ['type' => 'group', 'assets' => [], 'children' => [$deep]];
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $deep, $editor);
    check($status === 400, 'nodes deeper than 8 levels → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $editor);
    check($status === 200 && !isset($data['entity']['children']), 'back to one node');

    echo "editor: plugins (the Code tab's sources)\n";
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/plugins', null, $editor);
    check($status === 200 && $data['plugins'] === [], 'no plugin sources yet');
    $source = "export const register = (api) => { api.log('hi'); };\n";
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/plugins/glow', ['source' => $source], $editor);
    check($status === 200 && $data['plugin']['id'] === 'glow' && $data['plugin']['source'] === $source && $data['plugin']['size'] === strlen($source) && $data['plugin']['updatedBy'] === 'author@example.com', 'PUT a plugin source → saved with size and author');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/plugins/Glow', ['source' => $source], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-plugin', 'an upper-case id → 400 invalid-plugin');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/plugins/glow', ['source' => 3], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-plugin', 'a source that is no string → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/plugins/glow', ['source' => str_repeat('x', 262145)], $editor);
    check($status === 413, 'a source above 256 KB → 413');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/plugins/glow', ['source' => "$source// v2\n"], $editor);
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/plugins/glow', null, $editor);
    check($status === 200 && str_ends_with($data['plugin']['source'], "// v2\n"), 'GET the plugin → the new source');
    [$status, $export] = call($api, 'GET', '/editor/experiences/osct/export', null, $editor);
    check($status === 200 && array_column($export['plugins'], 'id') === ['glow'] && $export['plugins'][0]['source'] === $data['plugin']['source'], '#322: the export carries the Code tab\'s sources with their text');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/plugins', null, $editor);
    check($status === 200 && count($data['plugins']) === 1 && $data['plugins'][0]['id'] === 'glow' && !isset($data['plugins'][0]['source']), 'the list names the plugin without its source');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=2', null, $editor);
    check($data['changes'][0]['kind'] === 'plugin' && $data['changes'][0]['ref'] === 'glow' && str_ends_with($data['changes'][0]['after'], "// v2\n") && $data['changes'][1]['before'] === null, 'every save is a change with the source before and after');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    $rawDraft = (string) file_get_contents("$api/editor/experiences/osct/draft/{$m['build']}/game.config.json", false, $withToken);
    check(!str_contains($rawDraft, 'glow') && str_contains($rawDraft, '"plugins":[{"id":"tint","src":"' . $base . '/assets/content/plugins/tint/plugin.js","api":"1.0","registered":{"components":{"tint":'), 'the draft declares the imported compiled plugins (below the assets base) with what they recorded, never an editor source');
    [$status] = call($api, 'DELETE', '/editor/experiences/osct/plugins/glow', null, $editor);
    [$status2] = call($api, 'GET', '/editor/experiences/osct/plugins/glow', null, $editor);
    check($status === 204 && $status2 === 404, 'DELETE → 204, then 404');
    // Publishing content whose nodes use a component no plugin of the content can provide is refused
    $castle = $configuration['entities']['castle'];
    $castle['components'] = [['type' => 'tint', 'opacity' => 0.4]];
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $editor);
    [$status] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'with a plugin declared, a node may use its component');
    $noPlugins = $configuration;
    unset($noPlugins['plugins']);
    importing($api, 'osct', $editor, json_encode(['configuration' => $noPlugins, 'files' => $files], $flags));
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $editor);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-components' && $data['error']['components'] === ['tint'], 'without one, publish → 409 unknown-components naming the types');

    echo "editor: the publish carries the Code tab's plugins (#78)\n";
    // A saved source, carried by the publish as the editor transpiled it, provides the component
    $tintSource = "import type { PluginApi } from \"osct-plugin-api\";\nexport const register = (api: PluginApi): void => { api.registerLayer('tint', { description: 'x', params: {} }, { glsl: 'return rgba;' }); };\n";
    $tintCode = "\nexport const register = (api) => { api.registerLayer('tint', { description: 'x', params: {} }, { glsl: 'return rgba;' }); };\n";
    $carry = static fn(array $plugins): string => json_encode(['env' => 'local', 'plugins' => $plugins], $flags);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', null, $editor, 'http://localhost:5173', $carry([['id' => 'tint', 'code' => $tintCode, 'api' => '1.7']]));
    check($status === 400 && $data['error']['code'] === 'invalid-plugins' && str_contains($data['error']['message'], 'no saved source "tint"'), 'carrying a plugin the experience has no saved source of → 400 invalid-plugins');
    call($api, 'PUT', '/editor/experiences/osct/plugins/tint', ['source' => $tintSource], $editor);
    foreach ([
        [['id' => 'tint', 'code' => '  ', 'api' => '1.7']],
        [['id' => 'tint', 'code' => $tintCode, 'api' => 'one']],
        [['id' => 'Tint', 'code' => $tintCode, 'api' => '1.7']],
        [['id' => 'tint', 'code' => $tintCode, 'api' => '1.7'], ['id' => 'tint', 'code' => $tintCode, 'api' => '1.7']],
        [['id' => 'tint', 'code' => $tintCode, 'api' => '1.7', 'registered' => ['components' => [1]]]],
        'tint',
    ] as $badPlugins) {
        [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', null, $editor, 'http://localhost:5173', $carry(is_array($badPlugins) ? $badPlugins : [$badPlugins]));
        check($status === 400 && $data['error']['code'] === 'invalid-plugins', 'carried plugins that are no list of { id, code, api, registered? } (' . substr(json_encode($badPlugins), 0, 60) . ') → 400');
    }
    $registered = '{"components":{"tint":{"description":"x","params":{}}}}';
    $raw = '{"env":"local","plugins":[{"id":"tint","code":' . json_encode($tintCode) . ',"api":"1.7","registered":' . $registered . '}]}';
    [$status, $carried] = call($api, 'POST', '/editor/experiences/osct/publish', null, $editor, 'http://localhost:5173', $raw);
    check($status === 200, 'publish carrying the saved source → 200: the component is provided');
    $src = '/assets/content/plugins/tint/plugin-' . substr(hash('sha256', $tintCode), 0, 12) . '.js';
    $publishedConfig = json_decode((string) file_get_contents("$storeDir/local/osct/{$carried['build']}/game.config.json"));
    check(is_file("$storeDir/local/osct/{$carried['build']}$src") && file_get_contents("$storeDir/local/osct/{$carried['build']}$src") === $tintCode, 'the module is in the version folder, named after its code');
    check(count($publishedConfig->plugins) === 1 && $publishedConfig->plugins[0]->id === 'tint' && $publishedConfig->plugins[0]->src === $src && $publishedConfig->plugins[0]->api === '1.7'
        && $publishedConfig->plugins[0]->registered->components->tint->params instanceof stdClass, 'the configuration declares it by its content path, with the specs as sent ({} stays an object)');
    $servedPlugin = (string) @file_get_contents("$api/content/local/osct/{$carried['build']}$src", false, stream_context_create(['http' => ['ignore_errors' => true]]));
    check($servedPlugin === $tintCode && (bool) preg_grep('#^Content-Type: text/javascript#', $http_response_header) && (bool) preg_grep('/^Access-Control-Allow-Origin: \*$/', $http_response_header),
        'the local store serves it as JavaScript to any origin');
    [$status] = call($api, 'GET', "/content/local/osct/{$carried['build']}/assets/content/plugins/tint/plugin.js");
    check($status === 404, 'nothing else below the version\'s plugins folder is served');
    $stale = '{"env":"local","plugins":[{"id":"tint","code":' . json_encode($tintCode) . ',"api":"1.7","registered":{"components":{"glow":{"description":"x","params":{}}}}}]}';
    [$status, $staleBuild] = call($api, 'POST', '/editor/experiences/osct/publish', null, $editor, 'http://localhost:5173', $stale);
    $staleConfig = json_decode((string) file_get_contents("$storeDir/local/osct/{$staleBuild['build']}/game.config.json"));
    check($status === 200 && !property_exists($staleConfig->plugins[0], 'registered'), 'specs naming other types than the saved source → declared without them');
    $otherCode = str_replace('rgba', 'rgba * 0.5', $tintCode);
    [$status, $changed] = call($api, 'POST', '/editor/experiences/osct/publish', null, $editor, 'http://localhost:5173', $carry([['id' => 'tint', 'code' => $otherCode, 'api' => '1.7']]));
    check($status === 200 && $changed['build'] !== $carried['build'], 'other code is another version');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-components', 'a publish that carries nothing is refused as before');
    call($api, 'DELETE', '/editor/experiences/osct/plugins/tint?force=1', null, $editor);

    echo "editor: a plugin's node type (#77)\n";
    // A node type outside ENTITY_TYPES passes only in an experience with plugins (declared, or sources of the Code tab)
    $sparkly = $configuration['entities']['castle'];
    $sparkly['children'] = [['type' => 'sparkle', 'assets' => [], 'params' => ['position' => [0, 0.1, 0], 'count' => 120]]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $sparkly, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'children[0].type') && str_contains($data['error']['message'], 'needs a plugin'), 'an experience without plugins: a plugin node type → 400 invalid-entity');
    call($api, 'PUT', '/editor/experiences/osct/plugins/sparkle', ['source' => "export const register = (api) => api.registerNodeType('sparkle', { description: 'x', params: {} }, ({ three }) => ({ object: new three.Points() }));\n"], $editor);
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $sparkly, $editor);
    check($status === 200 && $data['entity']['children'][0]['type'] === 'sparkle' && $data['entity']['children'][0]['params']['count'] === 120, 'with a source in the Code tab, the node type passes, its params kept');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['entity' => ['type' => 'sparkle', 'assets' => []]], $editor);
    check($status === 200 && $data['target']['entity']['type'] === 'sparkle', 'a target\'s own entity may be one too');
    foreach (['Sparkle', 'spark-le', str_repeat('a', 33), 42] as $badType) {
        [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', ['type' => $badType, 'assets' => []], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-entity', 'a type not named like a plugin\'s (' . json_encode($badType) . ') → 400 even with plugins');
    }
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-node-types' && $data['error']['nodeTypes'] === ['sparkle'], 'without a declared plugin, publish → 409 unknown-node-types naming the types');
    // The source is used (#186): its delete is refused with the usages, its usages endpoint names them, force deletes
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/plugins/sparkle', null, $editor);
    check($status === 409 && $data['error']['code'] === 'plugin-in-use' && $data['error']['usages'] === [['kind' => 'target', 'ref' => 'racoon'], ['kind' => 'entity', 'ref' => 'castle']],
        'deleting a source whose node type the draft uses → 409 plugin-in-use with the usages');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/plugins/sparkle/usages', null, $editor);
    check($status === 200 && count($data['usages']) === 2 && $data['registers']['nodeTypes'] === ['sparkle'], 'its usages and what it registers');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/plugins', null, $editor);
    check($data['plugins'][0]['id'] === 'sparkle' && $data['plugins'][0]['usages'] === 2, 'the list counts its uses');
    [$status] = call($api, 'DELETE', '/editor/experiences/osct/plugins/sparkle?force=1', null, $editor);
    check($status === 204, 'a forced delete → 204');
    // The import: allowed with plugins declared, refused without (and without sources)
    $withNodes = $configuration;
    $withNodes['entities']['castle'] = $sparkly;
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $withNodes, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin node type with plugins declared → 200');
    [$status] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'with a plugin declared, a node may have its type');
    unset($withNodes['plugins']);
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $withNodes, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'import: a plugin node type without plugins → 400 invalid-entity');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the plugins');

    echo "editor: the plugins' recorded specs (#90)\n";
    // The declared plugins recorded what they register: their node type passes, any other name is a typo
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', ['type' => 'sparkel', 'assets' => []], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'a plugin of the experience registers (sparkle)'), 'a node type no declared plugin recorded → 400 naming the plugins\' node types');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['entity' => ['type' => 'sparkle', 'assets' => []]], $editor);
    check($status === 200, 'the recorded node type passes');
    $typo = $configuration;
    $typo['entities']['castle'] = ['type' => 'sparkel', 'assets' => []];
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $typo, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity', 'import: a node type the configuration\'s plugins did not record → 400');
    // A component no declared plugin recorded is refused at publish, although the experience declares plugins; the built-in
    // behaviour (#88) is no plugin's
    $glowing = $configuration['entities']['castle'];
    $glowing['components'] = [['type' => 'glow'], ['type' => 'behaviour', 'rules' => [['on' => 'tap', 'do' => ['emit' => 'rattled']]]]];
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $glowing, $editor);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-components' && $data['error']['components'] === ['glow'], 'publish: a component the declared plugins did not record → 409 unknown-components (the built-in behaviour not among them)');
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
    // A node's material is a plugin's: the recorded materials pass, any other is a typo; the publish checks
    $watery = $configuration;
    $watery['plugins'][0]['registered']['materials'] = ['water' => ['description' => 'Water.', 'params' => [
        'caustics' => ['kind' => 'texture', 'default' => '', 'description' => 'The caustics.'],
    ]]];
    $watery['plugins'][0]['registered']['textures'] = ['caustics' => ['description' => 'Light on the floor.', 'params' => new stdClass()]];
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $watery, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin with recorded materials and textures → 200');
    $tank = $configuration['entities']['castle'];
    $tank['material'] = ['type' => 'water', 'params' => ['caustics' => 'caustics']];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $tank, $editor);
    check($status === 200 && $data['entity']['material']['type'] === 'water' && $data['entity']['material']['params']['caustics'] === 'caustics', 'a recorded material passes, its params kept');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', ['type' => 'group', 'assets' => [], 'material' => ['type' => 'lava']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'material.type') && str_contains($data['error']['message'], '(water)'), 'a material no declared plugin recorded → 400 naming the plugins\' materials');
    foreach ([['type' => 'Water'], ['params' => new stdClass()], 'water', ['type' => 'water', 'params' => [1, 2]]] as $badMaterial) {
        [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', ['type' => 'group', 'assets' => [], 'material' => $badMaterial], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-entity', 'a material that is no { type, params? } (' . json_encode($badMaterial) . ') → 400');
    }
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $tank, $editor);
    [$status] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'publish: a node with a recorded material → 200');
    // A Code tab source may register anything: the save passes, the publish refuses a material no compiled plugin provides
    call($api, 'PUT', '/editor/experiences/osct/plugins/lava', ['source' => "export const register = (api) => api.registerMaterial('lava', { description: 'x', params: {} }, ({ three }) => new three.MeshBasicMaterial());\n"], $editor);
    $lava = $tank;
    $lava['material'] = ['type' => 'lava'];
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $lava, $editor);
    check($status === 200, 'with a source in the Code tab, a material it may register passes');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-materials' && $data['error']['materials'] === ['lava'], 'publish: a material no compiled plugin provides → 409 unknown-materials naming it');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/plugins/lava', null, $editor);
    check($status === 409 && $data['error']['usages'] === [['kind' => 'entity', 'ref' => 'castle']], 'a source whose material a node carries is in use (#186)');
    call($api, 'DELETE', '/editor/experiences/osct/plugins/lava?force=1', null, $editor);
    $dry = $noPlugins;
    $dry['entities']['castle'] = $tank;
    [$status, $data] = importing($api, 'osct', $editor, json_encode(['configuration' => $dry, 'files' => $files], $flags));
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'no plugins'), 'import: a material in an experience without plugins → 400');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the recorded plugins');

    echo "editor: a plugin's pass (#216)\n";
    // A pass the declared plugins recorded passes in a scene's and the experience's list; another name is a typo
    $scanning = $configuration;
    $scanning['plugins'][0]['registered']['passes'] = ['scanLines' => ['description' => 'Scan lines.', 'params' => [
        'lines' => ['kind' => 'number', 'default' => 200, 'min' => 10, 'max' => 800, 'description' => 'How many.'],
    ]]];
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $scanning, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin with a recorded pass → 200');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s1', ['passes' => [['type' => 'vignette'], ['type' => 'scanLines', 'lines' => 300]]], $editor);
    check($status === 200 && $data['scene']['passes'] === [['type' => 'vignette'], ['type' => 'scanLines', 'lines' => 300]], 'a scene names the recorded pass, in its place, its params kept');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => [['type' => 'scanLine']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes' && str_contains($data['error']['message'], 'a plugin of the experience registers (scanLines)'), 'a pass no declared plugin recorded → 400 naming the plugins\' passes');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => [['type' => 'scanLines']]], $editor);
    check($status === 200 && $data['passes'] === [['type' => 'scanLines']], 'the experience\'s master names it too');
    [$status] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'publish: a recorded plugin pass → 200');
    // A Code tab source may register any pass: the save passes, the publish refuses one no compiled plugin provides
    call($api, 'PUT', '/editor/experiences/osct/plugins/grain', ['source' => "export const register = (api) => api.registerPass('filmGrain', { description: 'x', params: {} }, ({ shaderPass }) => shaderPass('void main() {}'));\n"], $editor);
    [$status] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2', ['passes' => [['type' => 'filmGrain', 'amount' => 0.1]]], $editor);
    check($status === 200, 'with a source in the Code tab, a pass it may register passes');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2', ['passes' => [['type' => 'Film-grain']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-scene', 'a pass not named like a plugin\'s → 400 even with sources');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-passes' && $data['error']['passes'] === ['filmGrain'], 'publish: a pass no compiled plugin provides → 409 unknown-passes naming it');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/plugins/grain', null, $editor);
    check($status === 409 && $data['error']['usages'] === [['kind' => 'scene', 'ref' => 's2']], 'a source whose pass a scene names is in use');
    call($api, 'DELETE', '/editor/experiences/osct/plugins/grain?force=1', null, $editor);
    // Without plugins a plugin's pass is refused
    importing($api, 'osct', $editor, json_encode(['configuration' => $noPlugins, 'files' => $files], $flags));
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s1', ['passes' => [['type' => 'scanLines']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-scene' && str_contains($data['error']['message'], 'needs a plugin'), 'an experience without plugins: a plugin pass → 400');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the recorded plugins');

    echo "editor: a plugin's look (#265)\n";
    // A look the declared plugins recorded passes in the experience's appearance; another name is a typo
    $fading = $configuration;
    $fading['plugins'][0]['registered']['appearances'] = ['softFade' => ['description' => 'Fades.', 'params' => [
        'duration' => ['kind' => 'number', 'default' => 800, 'min' => 50, 'max' => 10000, 'description' => 'How long.'],
    ]]];
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $fading, 'files' => $files], $flags));
    check($status === 200, 'import: a plugin with a recorded look → 200');
    $pluginLooks = ['found' => ['type' => 'softFade', 'duration' => 500], 'lost' => ['type' => 'fade']];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => $pluginLooks], $editor);
    check($status === 200 && $data['appearance'] === $pluginLooks, 'a moment names the recorded look, its params kept, next to a built-in one');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['found' => ['type' => 'softFad']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance' && str_contains($data['error']['message'], 'a plugin of the experience registers (softFade)'), 'a look no declared plugin recorded → 400 naming the plugins\' looks');
    [$status] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'publish: a recorded plugin look → 200');
    // An entity's own looks (#268): the components reveal, found and lost are built in; a plugin's look they name must be provided
    $ownLooks = $configuration['entities']['castle'];
    $ownLooks['components'] = [['type' => 'reveal', 'look' => 'softFade', 'duration' => 400], ['type' => 'found', 'look' => 'fade'], ['type' => 'lost']];
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $ownLooks, $editor);
    [$status] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200, 'publish: an entity\'s own looks – built in components, a recorded plugin look → 200');
    $ownLooks['components'][0]['look'] = 'nowhere';
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $ownLooks, $editor);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-appearances' && $data['error']['appearances'] === ['nowhere'], 'publish: an entity\'s look no compiled plugin provides → 409 unknown-appearances naming it');
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $configuration['entities']['castle'], $editor);
    // A Code tab source may register any look: the save passes, the publish refuses one no compiled plugin provides
    call($api, 'PUT', '/editor/experiences/osct/plugins/looks', ['source' => "export const register = (api) => api.registerAppearance('popIn', { description: 'x', params: {} }, () => ({ duration: 300, update: () => {} }));\n"], $editor);
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['reveal' => ['type' => 'popIn']]], $editor);
    check($status === 200 && $data['appearance'] === ['reveal' => ['type' => 'popIn']], 'with a source in the Code tab, a look it may register passes');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['reveal' => ['type' => 'Pop-in']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance', 'a look not named like a plugin\'s → 400 even with sources');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 409 && $data['error']['code'] === 'unknown-appearances' && $data['error']['appearances'] === ['popIn'], 'publish: a look no compiled plugin provides → 409 unknown-appearances naming it');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/plugins/looks/usages', null, $editor);
    check($status === 200 && $data['registers']['appearances'] === ['popIn'] && $data['usages'] === [['kind' => 'experience', 'ref' => 'osct']], 'the source registers the look, and the experience uses it');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/plugins/looks', null, $editor);
    check($status === 409 && $data['error']['usages'] === [['kind' => 'experience', 'ref' => 'osct']], 'a source whose look the experience names is in use');
    call($api, 'DELETE', '/editor/experiences/osct/plugins/looks?force=1', null, $editor);
    // Without plugins a plugin's look is refused
    importing($api, 'osct', $editor, json_encode(['configuration' => $noPlugins, 'files' => $files], $flags));
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['found' => ['type' => 'softFade']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance' && str_contains($data['error']['message'], 'needs a plugin'), 'an experience without plugins: a plugin look → 400');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again with the recorded plugins');

    echo "editor: assets\n";
    // A 1×1 PNG and a tiny glb-like file (the API checks the type by the name, not the bytes)
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $png, 'Dot.png', $editor);
    $asset = $data['asset'] ?? null;
    // The image rule (#298): with GD (and WebP) the API stores pictures as WebP – what follows expects either
    $converting = ($data['converted'] ?? null) === true;
    check(is_bool($data['converted'] ?? null), '#298: an image upload says whether it was converted (' . ($converting ? 'it was: GD with WebP' : 'it was not: no GD with WebP in this PHP') . ')');
    $ext = $converting ? 'webp' : 'png';
    $stored = static fn(string $name): string => $converting ? (string) preg_replace('/\.(png|jpe?g)$/i', '.webp', $name) : $name;
    check($status === 201 && $asset && $asset['kind'] === 'image' && $asset['width'] === 1 && $asset['height'] === 1 && $asset['version'] === 1 && str_ends_with($asset['url'], "/v1.$ext"), 'upload → 201 image asset with its size');
    check(str_starts_with($asset['url'], "$api/content/assets/osct/"), 'the local store\'s URL is this API\'s content route');
    [$status, $same] = upload($api, 'POST', '/editor/experiences/osct/assets', $png, 'again.png', $editor);
    check($status === 200 && $same['asset']['id'] === $asset['id'], 'the same bytes again → the same asset');
    check($same['asset']['name'] === $stored('again.png') && $same['asset']['url'] === $asset['url'] && $same['asset']['version'] === 1,
        '#258: the same bytes under another name → the asset takes the name it was uploaded with last, its file and version stay');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets?kind=image', null, $editor);
    check(count(array_filter($data['assets'], static fn(array $a) => !$a['imported'] && in_array($a['name'], [$stored('Dot.png'), $stored('again.png')], true))) === 1, '#258: and the Library lists it once, under that name');
    [$status, $same] = upload($api, 'POST', '/editor/experiences/osct/assets', $png, 'Dot.png', $editor);
    check($status === 200 && $same['asset']['name'] === $stored('Dot.png'), '#258: uploaded under its first name again, it has that one');
    [, $data] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check(($data['experience']['libraryBase'] ?? null) === "$api/content/assets/osct/" && str_starts_with($asset['url'], $data['experience']['libraryBase']),
        '#258: the experience names the folder of its uploads – every Library file lies below it');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', 'not a model', 'thing.exe', $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-file', 'an unsupported type → 400 invalid-file');
    [$status] = upload($api, 'POST', '/editor/experiences/osct/assets', '', 'empty.png', $editor);
    check($status === 400, 'an empty file → 400');
    $file = file_get_contents($asset['url']);
    $isStored = static fn(string|false $file): bool => $converting ? is_string($file) && str_starts_with($file, 'RIFF') && substr($file, 8, 4) === 'WEBP' : $file === $png;
    check($isStored($file), 'the file is served by the content route');
    check(in_array("Content-Type: image/$ext", $http_response_header, true) && in_array('Access-Control-Allow-Origin: *', $http_response_header, true), 'with its type and open CORS');
    // Rows that cannot be written take their file with them (#209): the version row refused by a trigger
    $storedFiles = static fn() => glob("$storeDir/assets/osct/*/*") ?: [];
    $filesBefore = $storedFiles();
    $pdo = connect('test');
    $pdo->exec($mysql ? "CREATE TRIGGER block_asset_version BEFORE INSERT ON asset_versions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'blocked'"
        : "CREATE TRIGGER block_asset_version BEFORE INSERT ON asset_versions BEGIN SELECT RAISE(ABORT, 'blocked'); END");
    [$uploadStatus] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(1, 1, 0x123456), 'orphan.png', $editor);
    [$replaceStatus] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$asset['id']}/file", $png . 'v2', 'Dot.png', $editor);
    $pdo->exec('DROP TRIGGER block_asset_version');
    $pdo = null;
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    $dot = array_column($data['assets'], null, 'id')[$asset['id']] ?? [];
    check($uploadStatus === 500 && $replaceStatus === 500 && $storedFiles() === $filesBefore && !in_array('orphan.png', array_column($data['assets'], 'name'), true) && ($dot['version'] ?? null) === 1,
        '#209: an upload or a replace whose rows fail leaves no file and no row behind (the asset stays at version 1)');
    // #205: every experience id the editor accepts (Editor::ID: capitals, _) has its uploads served by the local store
    $mixed = $configuration;
    $mixed['experience']['id'] = 'My_Experience';
    [$status] = importing($api, 'My_Experience', $editor, json_encode(['configuration' => $mixed], $flags));
    [$uploaded, $data] = upload($api, 'POST', '/editor/experiences/My_Experience/assets', $png, 'dot.png', $editor);
    $mixedUrl = $data['asset']['url'] ?? '';
    check($status === 200 && in_array($uploaded, [200, 201], true) && str_starts_with($mixedUrl, "$api/content/assets/My_Experience/"), '#205: an upload to experience My_Experience on the directory store');
    $file = @file_get_contents($mixedUrl);
    check($isStored($file) && str_ends_with($http_response_header[0] ?? '', '200 OK') && in_array("Content-Type: image/$ext", $http_response_header, true), '… is served: GET answers 200 with the file');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    check($status === 200 && count($data['assets']) === 3 && $data['assets'][0]['id'] === $asset['id'] && $data['assets'][0]['usages'] === 0 && $data['assets'][0]['imported'] === false, 'the list: the upload, unused, first');
    $imported = array_values(array_filter($data['assets'], fn($a) => $a['imported']));
    check(count($imported) === 2 && $imported[0]['name'] === 'racoon.glb' && $imported[0]['kind'] === 'glb' && $imported[0]['size'] === 1234 && $imported[0]['url'] === '/assets/content/entries/racoon/racoon.glb' && $imported[1]['kind'] === 'image', 'and the files of the import (files.json) after it');
    check($imported[0]['usages'] === 1 && $imported[1]['usages'] === 1, 'an imported file counts its uses (the entity in the target, the target image)');
    // Below an assets base the list shows CDN URLs, the rows still name the content paths: the uses count all the same (#121)
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files, 'assetsBase' => 'https://cdn.example/osct/staging/0123456789ab/'], $flags));
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    $based = array_values(array_filter($data['assets'], fn($a) => $a['imported']));
    check($status === 200 && $based[0]['url'] === 'https://cdn.example/osct/staging/0123456789ab/assets/content/entries/racoon/racoon.glb' && $based[0]['usages'] === 1 && $based[1]['usages'] === 1, 'an imported file used by a target counts 1 below an assets base too');
    [$status] = importing($api, 'osct', $editor, json_encode(['configuration' => $configuration, 'files' => $files], $flags));
    check($status === 200, 'import again without the base');
    [, $filtered] = call($api, 'GET', '/editor/experiences/osct/assets?kind=image', null, $editor);
    check(count($filtered['assets']) === 2 && array_column($filtered['assets'], 'kind') === ['image', 'image'], 'the kind filter applies to both');
    [$status, $data] = call($api, 'DELETE', "/editor/experiences/osct/assets/{$imported[0]['id']}", null, $editor);
    check($status === 404, 'an imported file is read-only (no delete, replace or usages: 404)');
    // Media levels (#331, content schema 4.3): checked per kind, smallest first
    $levelled = ['type' => 'image', 'assets' => [['id' => 'castle-img', 'assetType' => 'image', 'src' => $asset['url'], 'levels' => [['level' => 2048, 'src' => $asset['url']], ['level' => 512, 'src' => $asset['url']]]]]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $levelled, $editor);
    check($status === 200 && array_column($data['entity']['assets'][0]['levels'], 'level') === [512, 2048], 'a node\'s image with levels → 200, the levels smallest first');
    $levelled['assets'][0]['levels'] = [['level' => 720, 'src' => $asset['url']]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $levelled, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], '512, 1024, 2048'), 'a level that is not one of the image\'s → 400');
    // Used by a node: the usages know, delete refuses, replace relinks
    $image = ['type' => 'image', 'assets' => [['id' => 'castle-img', 'assetType' => 'image', 'src' => $asset['url']]]];
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $image, $editor);
    check($status === 200, 'a node takes the asset\'s URL');
    [$status, $data] = call($api, 'GET', "/editor/experiences/osct/assets/{$asset['id']}/usages", null, $editor);
    check($status === 200 && $data['usages'] === [['kind' => 'entity', 'ref' => 'castle']], 'usages: the entity');
    [$status, $data] = call($api, 'DELETE', "/editor/experiences/osct/assets/{$asset['id']}", null, $editor);
    check($status === 409 && $data['error']['code'] === 'asset-in-use' && $data['error']['usages'][0]['ref'] === 'castle', 'delete while used → 409 with the usages');
    $png2 = pngOf(2, 2, 0x445566);
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$asset['id']}/file", $png2, 'dot2.png', $editor);
    check($status === 200 && $data['asset']['version'] === 2 && str_ends_with($data['asset']['url'], "/v2.$ext") && $data['relinked'] === 1, 'replace → version 2 at a new path, one row relinked');
    $v2 = $data['asset']['url'];
    [, $data] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($data['entities']['castle']['assets'][0]['src'] === $v2, 'the node names the new version');
    // A target's recognition data (#306) is made from its printed image: a new version of that image drops it
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $racoonImage = $tree['scenes'][0]['entries'][0]['target']['imageSrc'];
    [, $print] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(3, 4, 0x998877), 'racoon-print.png', $editor);
    $recognition = ['imageSrc' => 'https://cdn.example/racoon_recognition.webp', 'width' => 900, 'height' => 1200];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['imageSrc' => $print['asset']['url'], 'recognition' => $recognition], $editor);
    check($status === 200 && $data['target']['recognition'] === $recognition, 'PUT target: image and its recognition data in one body');
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$print['asset']['id']}/file", pngOf(3, 4, 0x112233), 'racoon-print2.png', $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $racoon = $tree['scenes'][0]['entries'][0]['target'];
    check($status === 200 && $data['relinked'] === 1 && $racoon['imageSrc'] === $data['asset']['url'] && !array_key_exists('recognition', $racoon),
        'replacing the printed image relinks the target and drops its recognition data (#306)');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['imageSrc' => $racoonImage], $editor);
    [$deleted] = call($api, 'DELETE', "/editor/experiences/osct/assets/{$print['asset']['id']}?force=1", null, $editor);
    check($status === 200 && $deleted === 204, 'the target names its image again');
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$asset['id']}/file", 'glb bytes', 'tree.glb', $editor);
    check($status === 400, 'a replace of another kind → 400');
    [$status] = call($api, 'DELETE', "/editor/experiences/osct/assets/{$asset['id']}?force=1", null, $editor);
    check($status === 204, 'forced delete → 204');
    [$status] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    check(array_column($data['assets'], 'imported') === [true, true], 'gone from the list (the imported files stay)');
    $gone = @file_get_contents($v2);
    check($gone === false, 'and from the store');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    $change = $data['changes'][0] ?? [];
    check(($change['kind'] ?? null) === 'asset' && $change['ref'] === $asset['id'] && $change['after'] === null && ($change['before']['url'] ?? null) === $v2
        && array_column($change['before']['versions'] ?? [], 'version') === [1, 2], '#209: the forced delete is a change in the log (kind asset, before = the asset with its versions)');

    echo "editor: the image rule at upload (#298)\n";
    $tooLarge = "\x89PNG\r\n\x1a\n" . pack('N', 13) . 'IHDR' . pack('NN', 10000, 6000) . "\x08\x02\0\0\0" . pack('N', 0) . 'no image data';
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $tooLarge, 'huge.png', $editor);
    check($status === 413 && ($data['error']['code'] ?? null) === 'image-too-large', '#298: a picture above 50 MP → 413 image-too-large, read from its header, never decoded');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets?fit=poster', $png, 'Dot.png', $editor);
    check($status === 400 && ($data['error']['code'] ?? null) === 'invalid-fit', '#298: an unknown fit → 400 invalid-fit');
    if (!$converting) {
        echo "  skipped: the conversion checks – this PHP has no GD with WebP (OSCT_TEST_PHP_ARGS=\"-d extension=gd\" where the extension is there but not loaded)\n";
    } else {
        $made = [];
        $wide = pngOf(3000, 1000, 0x3366cc);
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $wide, 'Wide.png', $editor);
        $made[] = $wideAsset = $data['asset'] ?? [];
        $file = @file_get_contents((string) ($wideAsset['url'] ?? ''));
        check($status === 201 && $data['converted'] === true && $wideAsset['name'] === 'Wide.webp' && $wideAsset['mime'] === 'image/webp' && str_ends_with($wideAsset['url'], '/v1.webp')
            && $wideAsset['width'] === 2048 && $wideAsset['height'] === 683 && $wideAsset['size'] === strlen((string) $file) && substr((string) $file, 8, 4) === 'WEBP'
            && in_array('Content-Type: image/webp', $http_response_header, true),
            '#298: a 3000 px PNG → WebP, its longest side 2048, named .webp, its size and type those of the stored file');
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $wide, 'Wide.png', $editor);
        check($status === 200 && ($data['asset']['id'] ?? null) === $wideAsset['id'], '#298: the same picture again → the same asset (duplicates go by the stored bytes)');
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets?fit=target', $wide, 'Wide.png', $editor);
        $made[] = $data['asset'] ?? [];
        check($status === 201 && ($data['asset']['width'] ?? null) === 1200 && $data['asset']['height'] === 400 && $data['asset']['id'] !== $wideAsset['id'],
            '#298: ?fit=target → its longest side 1200 (another file, so another asset)');
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', (string) $file, 'Kept.webp', $editor);
        check($status === 200 && $data['converted'] === false && ($data['asset']['id'] ?? null) === $wideAsset['id'], '#298: a WebP within the rule is stored as it came (here: the stored file itself, the same asset)');
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(30, 20, 0xff0000, 0), 'Eye.png', $editor);
        $made[] = $data['asset'] ?? [];
        $file = (string) @file_get_contents((string) ($data['asset']['url'] ?? ''));
        check($status === 201 && $data['converted'] === true && $data['asset']['width'] === 30 && substr($file, 12, 4) === 'VP8L', '#298: a picture with transparency → lossless WebP (never scaled up)');
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(30, 20, 0x00ff00), 'Opaque.png', $editor);
        $made[] = $data['asset'] ?? [];
        $file = (string) @file_get_contents((string) ($data['asset']['url'] ?? ''));
        check($status === 201 && substr($file, 12, 4) === 'VP8 ', '#298: an opaque picture → lossy WebP');
        // 40 × 20 px, EXIF orientation 6 (turn 90° clockwise to view): stored upright, 20 × 40, no EXIF left
        $turned = base64_decode('/9j/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAAAAD/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBxdWFsaXR5ID0gODAK/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgAFAAoAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A+gK8F+J3/I8al/2y/wDRSV71XgvxO/5HjUv+2X/opK+E8Lv+RtU/69v/ANKgc3EX+7R/xL8mctRRRX70fGhRRRQB9R14L8Tv+R41L/tl/wCikoor8F8Lv+RtU/69v/0qB9lxF/u0f8S/JnLUUUV+9HxoUUUUAf/Z');
        [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $turned, 'Photo.JPG', $editor);
        $made[] = $data['asset'] ?? [];
        $file = (string) @file_get_contents((string) ($data['asset']['url'] ?? ''));
        check($status === 201 && $data['asset']['name'] === 'Photo.webp' && $data['asset']['width'] === 20 && $data['asset']['height'] === 40 && !str_contains($file, 'Exif') && !str_contains($file, 'gd-jpeg'),
            '#298: a JPEG with EXIF orientation 6 → stored upright (20 × 40), its metadata dropped');
        [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$wideAsset['id']}/file?fit=target", $wide, 'Wide.png', $editor);
        check($status === 200 && $data['converted'] === true && $data['asset']['version'] === 2 && str_ends_with($data['asset']['url'], '/v2.webp') && $data['asset']['width'] === 1200 && $data['asset']['mime'] === 'image/webp',
            '#298: a replace goes under the rule too (?fit=target → 1200)');
        foreach ($made as $one) if (isset($one['id'])) call($api, 'DELETE', "/editor/experiences/osct/assets/{$one['id']}?force=1", null, $editor);
    }

    echo "editor: the Library's code files – shaders as assets, scripts as plugin sources (#186)\n";
    $shader = "// a test shader\nuniform float time;\nvoid main() { gl_FragColor = vec4(vec3(0.5 + 0.5 * sin(time)), 1.0); }\n";
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $shader, 'Pulse.frag', $editor, 'text/plain');
    $glsl = $data['asset'] ?? null;
    check($status === 201 && $glsl && $glsl['kind'] === 'shader' && $glsl['size'] === strlen($shader) && $glsl['width'] === null && str_ends_with($glsl['url'], '/v1.frag'), 'a shader → 201 asset of the kind shader');
    check(file_get_contents($glsl['url']) === $shader && in_array('Content-Type: text/x-glsl; charset=utf-8', $http_response_header, true), 'served as text with open CORS');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', "@vertex fn main() {}\n", 'grid.wgsl', $editor);
    check($status === 201 && $data['asset']['kind'] === 'shader' && $data['asset']['mime'] === 'text/wgsl; charset=utf-8', 'a WGSL file sent as octet-stream → a shader too');
    $wgsl = $data['asset'];
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $shader, 'pulse.hlsl', $editor, 'text/plain');
    check($status === 400 && $data['error']['code'] === 'invalid-file', 'a wrong extension → 400 invalid-file');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $shader, 'pulse.ts', $editor, 'text/plain');
    check($status === 400 && str_contains($data['error']['message'], 'POST …/plugins'), 'a script sent as an asset → 400 pointing at the plugins');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $png, 'picture.glsl', $editor, 'image/png');
    check($status === 400 && str_contains($data['error']['message'], 'image/png'), 'a shader sent as a picture → 400 (content type)');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $png, 'picture.glsl', $editor);
    check($status === 400 && str_contains($data['error']['message'], 'no text file'), 'binary bytes named .glsl → 400 (content)');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', str_repeat('/', 262145), 'huge.glsl', $editor);
    check($status === 413 && $data['error']['code'] === 'body-too-large', 'a shader above 256 KB → 413');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets?kind=shader', null, $editor);
    check(array_column($data['assets'], 'id') === [$wgsl['id'], $glsl['id']] && $data['assets'][1]['usages'] === 0, 'the list by kind: the two shaders, unused');
    // A plugin source that loads the shader uses it: delete refused, replace relinks the source
    $loader = "export const register = (api) => { void api.loadText('{$glsl['url']}'); };\n";
    call($api, 'PUT', '/editor/experiences/osct/plugins/pulse', ['source' => $loader], $editor);
    [$status, $data] = call($api, 'GET', "/editor/experiences/osct/assets/{$glsl['id']}/usages", null, $editor);
    check($status === 200 && $data['usages'] === [['kind' => 'plugin', 'ref' => 'pulse']] && $data['asset']['usages'] === 1, 'usages: the plugin source that names its URL');
    [$status, $data] = call($api, 'DELETE', "/editor/experiences/osct/assets/{$glsl['id']}", null, $editor);
    check($status === 409 && $data['error']['code'] === 'asset-in-use' && $data['error']['usages'][0]['kind'] === 'plugin', 'delete while a source loads it → 409 asset-in-use');
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$glsl['id']}/file", "$shader// v2\n", 'pulse.frag', $editor, 'text/plain');
    check($status === 200 && $data['asset']['version'] === 2 && $data['relinked'] === 1, 'replace → version 2, the source relinked');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/plugins/pulse', null, $editor);
    check(str_contains($data['plugin']['source'], str_replace('/v1.frag', '/v2.frag', $glsl['url'])) && !str_contains($data['plugin']['source'], '/v1.frag'), 'the source names the new version');
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$glsl['id']}/file", $png, 'dot.png', $editor, 'image/png');
    check($status === 400, 'a shader replaced by a picture → 400');
    // Scripts: a file becomes a plugin source, named after the file
    $script = "\xEF\xBB\xBFexport const register = (api) => api.registerComponent('wobble', { description: 'x', params: {} }, () => ({}));\n";
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins', $script, 'Wobble Effect.ts', $editor, 'video/mp2t');
    check($status === 201 && $data['plugin']['id'] === 'wobble-effect' && str_starts_with($data['plugin']['source'], 'export const') && $data['plugin']['updatedBy'] === 'author@example.com',
        'a script → 201 plugin source, its id from the name, the byte order mark dropped (Windows sends .ts as video/mp2t)');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins?id=wobble3', $script, 'wobble.ts', $editor, 'video/vnd.dlna.mpeg-tts');
    check($status === 201, 'a .ts sent as the other MPEG stream type of Windows passes too');
    call($api, 'DELETE', '/editor/experiences/osct/plugins/wobble3', null, $editor);
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins', $script, 'wobble-effect.js', $editor, 'text/javascript');
    check($status === 409 && $data['error']['code'] === 'plugin-exists' && $data['error']['plugin'] === 'wobble-effect', 'the same id again → 409 plugin-exists');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins?id=wobble2', $script, 'wobble-effect.js', $editor, 'text/javascript');
    check($status === 201 && $data['plugin']['id'] === 'wobble2', '?id= names it');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins', $shader, 'pulse.glsl', $editor, 'text/plain');
    check($status === 400 && $data['error']['code'] === 'invalid-file' && str_contains($data['error']['message'], 'POST …/assets'), 'a shader sent as a script → 400 pointing at the assets');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins', $script, '42.ts', $editor, 'text/plain');
    check($status === 400 && $data['error']['code'] === 'invalid-plugin', 'a name that gives no id → 400 invalid-plugin');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/plugins', $png, 'binary.ts', $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-file', 'binary bytes named .ts → 400');
    [$status] = upload($api, 'POST', '/editor/experiences/osct/plugins', str_repeat('/', 262145), 'big.ts', $editor);
    check($status === 413, 'a script above 256 KB → 413');
    [$status, $data] = upload($api, 'PUT', '/editor/experiences/osct/plugins/wobble2/file', "// v2\n$script", 'anything.ts', $editor, 'text/plain');
    check($status === 200 && str_starts_with($data['plugin']['source'], '// v2'), 'replace a source with a file → 200');
    [$status] = upload($api, 'PUT', '/editor/experiences/osct/plugins/nothere/file', $script, 'x.ts', $editor, 'text/plain');
    check($status === 404, 'replace an unknown plugin → 404');
    [$status] = call($api, 'DELETE', '/editor/experiences/osct/plugins/wobble2', null, $editor);
    check($status === 204, 'an unused source is deleted at once');
    foreach (['pulse', 'wobble-effect'] as $plugin) call($api, 'DELETE', "/editor/experiences/osct/plugins/$plugin?force=1", null, $editor);
    foreach ([$glsl, $wgsl] as $made) call($api, 'DELETE', "/editor/experiences/osct/assets/{$made['id']}?force=1", null, $editor);

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
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $mp4, 'Clip.mp4', $editor);
    $video = $data['asset'] ?? null;
    check($status === 201 && $video['kind'] === 'video' && $video['width'] === 640 && $video['height'] === 360 && $video['durationMs'] === 2500, 'upload of an mp4 → its width, height and duration');
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(1, 1, 0x223344), 'still.png', $editor);
    $still = $data['asset'];
    check($still['width'] === 1 && $still['durationMs'] === null, 'an image has no duration');
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', 'no header here', 'broken.mp4', $editor);
    $broken = $data['asset'];
    check($broken['width'] === null && $broken['height'] === null && $broken['durationMs'] === null, 'a video whose header cannot be read uploads with nulls');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets?kind=video', null, $editor);
    $listed = array_values(array_filter($data['assets'], fn($a) => $a['id'] === $video['id']))[0] ?? null;
    check($listed && $listed['width'] === 640 && $listed['height'] === 360 && $listed['durationMs'] === 2500, 'the list answers them');
    [$status, $data] = call($api, 'GET', "/editor/experiences/osct/assets/{$video['id']}/usages", null, $editor);
    check($status === 200 && $data['usages'] === [] && $data['asset']['durationMs'] === 2500 && $data['asset']['width'] === 640, 'the usages answer the asset with them');
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$video['id']}/file", $webm, 'clip.webm', $editor);
    check($status === 200 && $data['asset']['width'] === 1080 && $data['asset']['height'] === 1920 && $data['asset']['durationMs'] === 4200, 'a replace (a webm) records the new file\'s numbers');
    foreach ([$video, $still, $broken] as $uploaded) call($api, 'DELETE', "/editor/experiences/osct/assets/{$uploaded['id']}?force=1", null, $editor);

    echo "editor: a video's subtitles – WebVTT files that belong to it by their names (#257)\n";
    $vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n";
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', mp4File(1000, 3000, [[320, 180, 'vide']]), 'Speak.mp4', $editor);
    $speak = $data['asset'];
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $vtt, 'Speak.en.vtt', $editor, 'text/vtt');
    $subtitleEn = $data['asset'] ?? null;
    check($status === 201 && $subtitleEn && $subtitleEn['kind'] === 'subtitles' && $subtitleEn['mime'] === 'text/vtt; charset=utf-8' && str_ends_with($subtitleEn['url'], '/v1.vtt'),
        'a .vtt file → 201 asset of the kind subtitles');
    check(file_get_contents($subtitleEn['url']) === $vtt && in_array('Content-Type: text/vtt; charset=utf-8', $http_response_header, true), 'served as text/vtt');
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', str_replace('Hello', 'Bonjour', $vtt), 'Speak.fr.vtt', $editor);
    $subtitleFr = $data['asset'];
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', str_replace('Hello', 'Hallo', $vtt), 'Other.de.vtt', $editor);
    $subtitleOther = $data['asset'];
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', $png, 'Speak.nl.vtt', $editor, 'image/png');
    check($status === 400 && $data['error']['code'] === 'invalid-file', 'a picture renamed .vtt → 400 invalid-file');
    $draftSubtitles = function () use ($api, $editor, $withToken): mixed {
        [, $manifest] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
        return json_decode((string) file_get_contents("$api/editor/experiences/osct/draft/{$manifest['build']}/game.config.json", false, $withToken), true)['subtitles'] ?? null;
    };
    check($draftSubtitles() === [['media' => $speak['url'], 'tracks' => ['en' => $subtitleEn['url'], 'fr' => $subtitleFr['url']]]],
        'the draft lists the files named like the video with it, per language – a file whose name fits no video is left out');
    [$status] = deleting($api, "/editor/experiences/osct/assets/{$subtitleEn['id']}", $editor);
    check($status === 204 && $draftSubtitles() === [['media' => $speak['url'], 'tracks' => ['fr' => $subtitleFr['url']]]], 'a deleted subtitle file leaves the list');
    foreach ([$subtitleFr, $subtitleOther, $speak] as $gone) deleting($api, "/editor/experiences/osct/assets/{$gone['id']}", $editor);
    check($draftSubtitles() === null, 'an experience without subtitle files has no list');

    echo "editor: targets and entries\n";
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['imageSrc' => 'https://cdn.example/racoon-v2.jpg', 'place' => ['x' => 250, 'y' => 30, 'width' => 80]], $editor);
    check($status === 200 && $data['target']['imageSrc'] === 'https://cdn.example/racoon-v2.jpg' && $data['target']['place'] === ['x' => 250, 'y' => 30, 'width' => 80], 'PUT target: image and place');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['place' => ['x' => 'left', 'y' => 1, 'width' => 1]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'a place that is no number → 400 invalid-target');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['enabled' => false], $editor);
    check($status === 200 && $data['target']['enabled'] === false && $data['target']['place']['width'] === 80, 'PUT target: switched off (#249), its other values kept');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['enabled' => 'off'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'enabled other than true or false → 400 invalid-target');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['enabled' => true], $editor);
    check($status === 200 && !array_key_exists('enabled', $data['target']), 'switched on again: the field goes, on is the default');
    $recognition = ['imageSrc' => 'https://cdn.example/racoon-v2_recognition.webp', 'width' => 900, 'height' => 1200];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognition' => $recognition], $editor);
    check($status === 200 && $data['target']['recognition'] === $recognition && $data['target']['place']['width'] === 80, 'PUT target: its recognition data made ahead (#306)');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognition' => ['imageSrc' => 'x.webp', 'width' => 0, 'height' => 1.5]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'recognition data without whole px → 400 invalid-target');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['imageSrc' => 'https://cdn.example/racoon-v2.jpg'], $editor);
    check($status === 200 && $data['target']['recognition'] === $recognition, 'the same image again keeps the recognition data');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['imageSrc' => 'https://cdn.example/racoon-v3.jpg'], $editor);
    check($status === 200 && !array_key_exists('recognition', $data['target']), 'another image drops the recognition data – it was made from the old one');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['imageSrc' => 'https://cdn.example/racoon-v2.jpg', 'recognition' => $recognition], $editor);
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognition' => $recognition, 'madeFrom' => 'https://cdn.example/racoon-v1.jpg'], $editor);
    check($status === 409 && $data['error']['code'] === 'stale-image', 'recognition data made from an image the target no longer has → 409 stale-image');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognition' => null], $editor);
    check($status === 200 && !array_key_exists('recognition', $data['target']) && $data['target']['imageSrc'] === 'https://cdn.example/racoon-v2.jpg', 'recognition null removes it');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognitionOff' => true], $editor);
    check($status === 200 && $data['target']['recognitionOff'] === true, 'PUT target: recognitionOff true keeps it on its printed image (#306)');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognitionOff' => 'yes'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'recognitionOff not true / false → 400 invalid-target');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['recognitionOff' => false], $editor);
    check($status === 200 && !array_key_exists('recognitionOff', $data['target']), 'recognitionOff false removes it – the experience decides');
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($tree['scenes'][0]['entries'][0]['target']['place']['x'] === 250, 'the tree carries the place');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Shadows & Light', 'scene' => 's1', 'target' => ['imageSrc' => 'https://cdn.example/shadows.jpg', 'place' => ['x' => 10, 'y' => 10, 'width' => 60]]], $editor);
    check($status === 201 && $data['entry']['id'] === 's1-shadows-light' && $data['entry']['target']['id'] === 's1-shadows-light' && $data['scene'] === 's1', 'POST entry → 201 with a slug id, on its scene');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Shadows & Light', 'scene' => 's1', 'target' => ['imageSrc' => 'x.jpg']], $editor);
    check($status === 409 && $data['error']['code'] === 'duplicate-id', 'the same id again → 409');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'No target', 'scene' => 's1', 'target' => ['place' => null]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'a target without its image → 400');
    [, $manifest2] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    $draft2 = json_decode((string) file_get_contents("$api/editor/experiences/osct/draft/{$manifest2['build']}/game.config.json", false, $withToken), true);
    $added = array_values(array_filter($draft2['entries'], fn($e) => $e['id'] === 's1-shadows-light'));
    check(count($added) === 1 && $added[0]['target']['place']['x'] === 10 && $added[0]['tags'] === [] && $added[0]['scene'] === 's1', 'the draft has the new entry with its target');
    [$status] = deleting($api, '/editor/experiences/osct/entries/s1-shadows-light', $editor);
    check($status === 200, 'DELETE entry, confirmed → 200');
    [$status] = call($api, 'DELETE', '/editor/experiences/osct/entries/s1-shadows-light', null, $editor);
    check($status === 404, 'again → 404');
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check(!in_array('s1-shadows-light', array_column($tree['scenes'][0]['entries'], 'id'), true), 'gone from the tree');

    echo "editor: texts – entries, the experience, the onboarding (#223)\n";
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Onion', 'scene' => 's1', 'category' => 'glossary', 'body' => 'A *bulb*.', 'caption' => ' Image: an onion '], $editor);
    check($status === 201 && $data['entry']['id'] === 's1-onion' && !isset($data['entry']['target']) && $data['scene'] === 's1' && $data['entry']['caption'] === 'Image: an onion',
        'POST entry without a target → 201, read in the list only; its caption trimmed (#289)');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Leek', 'scene' => 's1', 'caption' => ['x']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'POST entry: a caption that is no text → 400');
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $onion = array_values(array_filter($tree['scenes'][0]['entries'], fn($e) => $e['id'] === 's1-onion'))[0] ?? null;
    check($onion !== null && $onion['target'] === null, 'the tree lists it on its scene, without a target');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/entries', null, $editor);
    $byId = array_column($data['entries'] ?? [], null, 'id');
    check($status === 200 && $byId['racoon']['body'] === 'A beast.' && $byId['racoon']['scene'] === 's1' && $byId['racoon']['target'] === ['id' => 'racoon', 'imageSrc' => 'https://cdn.example/racoon-v2.jpg']
        && $byId['castle']['image'] === '/assets/content/entries/castle/cover.jpg' && $byId['lost']['scene'] === 's2' && $byId['s1-onion']['target'] === null,
        'GET entries: every field as written, the scene and the target');
    $body = "A **beast** with a [mask](https://example.org/racoon).\n\n{hasKey: It opens the door.|It looks at you.}";
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/racoon', ['body' => $body, 'author' => ' Kévin Bray ', 'tags' => [' animal ', 'mask', 'animal', ''], 'title' => 'Racoon '], $editor);
    check($status === 200 && $data['entry']['body'] === $body && $data['entry']['author'] === 'Kévin Bray' && $data['entry']['tags'] === ['animal', 'mask'] && $data['entry']['title'] === 'Racoon'
        && $data['scene'] === 's1' && $data['previousScene'] === 's1' && !isset($data['entry']['target']), 'PUT entry: body (Markdown kept as written), author and title trimmed, tags once each');
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    check($log['changes'][0]['kind'] === 'entry' && $log['changes'][0]['ref'] === 'racoon' && $log['changes'][0]['before']['body'] === 'A beast.' && $log['changes'][0]['after']['body'] === $body,
        'the change log has the entry before and after');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/racoon', ['scene' => 's2'], $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && $data['scene'] === 's2' && $data['previousScene'] === 's1' && in_array('racoon', array_column($tree['scenes'][1]['entries'], 'id'), true)
        && !in_array('racoon', array_column($tree['scenes'][0]['entries'], 'id'), true), 'a scene moves the entry');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/racoon', ['scene' => 's1', 'author' => null, 'image' => '/assets/content/entries/racoon/img.jpg'], $editor);
    check($status === 200 && $data['scene'] === 's1' && !isset($data['entry']['author']) && $data['entry']['image'] === '/assets/content/entries/racoon/img.jpg',
        'back on its scene; null removes the author; a picture of the import is a Library image');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/link', ['media' => 'https://example.org/new', 'category' => 'link'], $editor);
    check($status === 200 && $data['entry']['media'] === 'https://example.org/new', 'a link\'s URL');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['caption' => ' Image: anatomical illustration by Kevin Hong '], $editor);
    check($status === 200 && $data['entry']['caption'] === 'Image: anatomical illustration by Kevin Hong' && $data['entry']['image'] === '/assets/content/entries/castle/cover.jpg',
        'PUT entry: the caption under the picture (#289), trimmed');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['caption' => null], $editor);
    check($status === 200 && !isset($data['entry']['caption']), 'null removes the caption');
    // The picture in several sizes (#331, content schema 4.3): pictures of the Library, sizes of the image levels
    $cover = '/assets/content/entries/castle/cover.jpg';
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['imageLevels' => [['level' => 2048, 'src' => $cover], ['level' => 1024, 'src' => $cover]]], $editor);
    check($status === 200 && $data['entry']['imageLevels'] === [['level' => 1024, 'src' => $cover], ['level' => 2048, 'src' => $cover]], 'PUT entry: imageLevels, smallest first (#331)');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['imageLevels' => [['level' => 1080, 'src' => $cover]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'imageLevels: a level that is not an image size → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['imageLevels' => [['level' => 512, 'src' => 'https://elsewhere.example/x.webp']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'imageLevels: a file outside the Library → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['imageLevels' => null], $editor);
    check($status === 200 && !isset($data['entry']['imageLevels']) && $data['entry']['image'] === $cover, 'null removes the levels, the picture stays');
    $refusals = [
        [['category' => 'poem'], 'an unknown category'], [['media' => 'javascript:alert(1)'], 'a link that is not http(s)'], [['media' => 'https://'], 'a link without a host'],
        [['title' => '  '], 'an empty title'], [['image' => 'https://evil.example/x.jpg'], 'an image that is no Library picture'], [['image' => '/assets/content/entries/racoon/racoon.glb'], 'a Library file that is no picture'],
        [['page' => 1], 'a page (2.x)'], [['tags' => 'a, b'], 'tags that are no list'], [['target' => null], 'a field the PUT does not change'],
        [['body' => ['x']], 'a body that is no text'], [['caption' => str_repeat('x', 501)], 'a caption longer than 500 characters'], [['caption' => 7], 'a caption that is no text'],
    ];
    foreach ($refusals as [$change, $what]) {
        [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/link', $change, $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-entry', "PUT entry: $what → 400 invalid-entry");
    }
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entries/ghost', ['title' => 'Ghost'], $editor);
    check($status === 404, 'PUT a missing entry → 404');
    [, $manifestTexts] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    $draftTexts = json_decode((string) file_get_contents("$api/editor/experiences/osct/draft/{$manifestTexts['build']}/game.config.json", false, $withToken), true);
    $draftRacoon = array_values(array_filter($draftTexts['entries'], fn($e) => $e['id'] === 'racoon'))[0];
    check($draftRacoon['body'] === $body && $draftRacoon['tags'] === ['animal', 'mask'] && $draftRacoon['target']['id'] === 'racoon', 'the draft has the edited entry, its target kept');
    [$status] = deleting($api, '/editor/experiences/osct/entries/s1-onion', $editor);
    check($status === 200, 'an entry without a target is removed like any');

    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['title' => ' Onion Skin ', 'book' => ['publisher' => null]], $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && $data['experience']['title'] === 'Onion Skin' && $data['experience']['book'] === ['author' => 'Someone']
        && $tree['experience']['title'] === 'Onion Skin' && !isset($tree['experience']['experience']['book']['publisher']), 'PUT experience: the title (in the list and the tree too), book.publisher null removes it');
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    check($log['changes'][0]['kind'] === 'experience' && $log['changes'][0]['before']['title'] === 'Test Experience' && $log['changes'][0]['before']['book']['publisher'] === 'Building Fictions', 'the experience\'s change with the experience before');
    foreach ([[['book' => ['author' => '']], 'an empty author'], [['subtitle' => 'x'], 'an unknown field'], [['author' => 'x'], 'a top-level author (#320)'],
        [['sourceOfTruth' => 'digital'], 'sourceOfTruth (gone, #320)'], [['book' => ['isbn' => 'x']], 'an unknown book field'], [['book' => 'x'], 'a book that is no object']] as [$change, $what]) {
        [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', $change, $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-experience', "PUT experience: $what → 400 invalid-experience");
    }
    // The printed book (#320): removed with null, a new one needs its author, and it sits after the title
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['book' => null], $editor);
    check($status === 200 && !isset($data['experience']['book']), 'PUT experience: book null removes the printed book');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['book' => ['publisher' => 'Building Fictions']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-experience', 'PUT experience: a new printed book without an author → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['title' => 'Test Experience', 'book' => ['publisher' => 'Building Fictions', 'author' => 'Someone']], $editor);
    check($status === 200 && $data['experience']['book'] === ['author' => 'Someone', 'publisher' => 'Building Fictions']
        && array_slice(array_keys($data['experience']), 0, 3) === ['id', 'title', 'book'], 'PUT experience: a new printed book, author first, right after the title');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    [, $draftExperience] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftExperience['experience']['book'] ?? null) === ['author' => 'Someone', 'publisher' => 'Building Fictions'], 'the draft carries the printed book');
    // The recognition path (#306, schema 4.2): only "prepared" is stored, the default is none
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['recognition' => 'prepared'], $editor);
    check($status === 200 && $data['experience']['recognition'] === 'prepared', 'PUT experience: recognition prepared');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    [, $draftExperience] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftExperience['experience']['recognition'] ?? null) === 'prepared', 'the draft carries the recognition path');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['recognition' => 'original'], $editor);
    check($status === 200 && !array_key_exists('recognition', $data['experience']), 'PUT experience: recognition original is the default – stored as none');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct', ['recognition' => 'compiled'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-experience', 'PUT experience: an unknown recognition path → 400');

    // The onboarding is the reader's (#236): no route of the API reads or writes it
    [$status] = call($api, 'GET', '/editor/experiences/osct/tutorial', null, $editor);
    [$status2] = call($api, 'PUT', '/editor/experiences/osct/tutorial', ['tutorial' => []], $editor);
    check($status === 404 && $status2 === 404, 'GET and PUT …/tutorial → 404 (the onboarding is the app\'s)');
    $pdo = connect('test');
    check(!hasColumn($pdo, 'experiences', 'tutorial_json'), 'the experiences table has no tutorial_json');
    $pdo = null;

    echo "editor: no source of truth, no print data on the top level (#320)\n";
    // Every experience adds and removes its scenes (#307, #322): no print-first mode, no 409 print-first
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes', ['preset' => 'wall', 'id' => 'pf-wall'], $editor);
    [$status2] = deleting($api, '/editor/experiences/osct/scenes/pf-wall', $editor);
    check($status === 201 && $data['scene']['id'] === 'pf-wall' && $status2 === 200, 'an experience with a printed book takes a new scene and loses it again');
    $noBook = $configuration;
    unset($noBook['experience']['book']);
    [$status] = call($api, 'POST', '/editor/import/preview', ['configuration' => $noBook], $editor);
    check($status === 200, 'a configuration without a printed book passes the import check');
    foreach ([['author', 'Someone'], ['publisher', 'Building Fictions'], ['sourceOfTruth', 'digital']] as [$key, $value]) {
        $badConfig = $configuration;
        $badConfig['experience'][$key] = $value;
        [$status, $data] = call($api, 'POST', '/editor/import/preview', ['configuration' => $badConfig], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-configuration', "an import with a top-level experience.$key → 400 (schema 4)");
    }
    $badConfig = $configuration;
    $badConfig['experience']['book'] = ['publisher' => 'Building Fictions'];
    [$status, $data] = call($api, 'POST', '/editor/import/preview', ['configuration' => $badConfig], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-configuration', 'an import whose printed book has no author → 400');
    $oldConfig = $configuration;
    $oldConfig['version']['schema'] = '4.3';
    [$status, $data] = call($api, 'POST', '/editor/import/preview', ['configuration' => $oldConfig], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-configuration' && str_contains($data['error']['message'], 'convert:5'), 'a 4.x configuration → 400, convert it');

    echo "editor: scenes – add, change, move, group, remove (content schema 3.0, #319)\n";
    $sceneList = static function () use ($api, $editor): array {
        [, $list] = call($api, 'GET', '/editor/experiences/osct/scenes', null, $editor);
        return $list;
    };
    $draftOf = function () use ($api, $editor): array {
        [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json?t=' . mt_rand(), null, $editor);
        [, $d] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
        return [$m['build'], $d];
    };
    $flat = ['x' => 0, 'y' => 0, 'z' => 0, 'rx' => 0, 'ry' => 0, 'rz' => 0];
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes', ['preset' => 'double'], $editor);
    check($status === 201 && $data['scene'] === ['id' => 'scene-1', 'label' => 'New scene', 'surfaces' => [['id' => 'surface', 'widthMm' => 460, 'heightMm' => 320, 'place' => $flat]]]
        && $data['position'] === 2, 'POST scenes → a double page last: one surface twice the page\'s width, placed, labelled New scene');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes', ['preset' => 'single', 'position' => 0, 'id' => 'cover', 'label' => ' Cover '], $editor);
    check($status === 201 && $data['position'] === 0 && $data['scene']['label'] === 'Cover' && $data['scene']['surfaces'][0]['widthMm'] === 230, 'a single scene first: the cover (no cover preset)');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes', ['preset' => 'wall', 'id' => 'studio', 'label' => 'Studio wall', 'after' => 'scene-1'], $editor);
    check($status === 201 && $data['position'] === 4 && $data['scene']['surfaces'] === [['id' => 'wall', 'widthMm' => 2000, 'heightMm' => 1500, 'place' => ['x' => 0, 'y' => 750, 'z' => 0, 'rx' => 90, 'ry' => 0, 'rz' => 0]]],
        'a wall: 2000 × 1500 mm standing on the table (rx 90)');
    foreach ([[['preset' => 'cover'], 400, 'invalid-scene', 'a preset that is gone (cover)'], [['id' => 's1'], 409, 'duplicate-id', 'a scene id that exists'],
        [['after' => 'ghost'], 400, 'unknown-scene', 'after an unknown scene'], [['label' => ' '], 400, 'invalid-scene', 'an empty label'],
        [['surfaces' => []], 400, 'invalid-scene', 'no surface'], [['surfaces' => [['id' => 'a', 'side' => 'left', 'widthMm' => 1, 'heightMm' => 1]]], 400, 'invalid-scene', 'a surface with a side (2.x)'],
        [['group' => 'ghost'], 400, 'unknown-group', 'an unknown group']] as [$body, $code, $error, $what]) {
        [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes', $body, $editor);
        check($status === $code && ($data['error']['code'] ?? null) === $error, "POST scenes: $what → $code $error");
    }
    $list = $sceneList();
    $byId = array_column($list['scenes'], null, 'id');
    check(array_column($list['scenes'], 'id') === ['cover', 's1', 's2', 'scene-1', 'studio'] && array_column($list['scenes'], 'position') === [0, 1, 2, 3, 4]
        && $byId['s1']['entries'] === 1 && $byId['s1']['targets'] === 1 && $byId['s1']['surfaces'][0]['reference'] === null && $byId['s1']['label'] === '1–2'
        && !isset($byId['s1']['firstPage']) && !isset($byId['s1']['group']), 'GET scenes: in order, SceneData + position, entries and targets counted, every surface with its reference');

    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/studio', ['label' => 'Studio', 'surfaces' => [
        ['id' => 'wall', 'widthMm' => 2000, 'heightMm' => 1500, 'place' => ['x' => 0, 'y' => 750, 'z' => -500, 'rx' => 90]], ['id' => 'poster', 'label' => 'Poster', 'widthMm' => 600, 'heightMm' => 800]]], $editor);
    check($status === 200 && $data['scene']['label'] === 'Studio' && $data['scene']['surfaces'][0]['place'] === ['x' => 0, 'y' => 750, 'z' => -500, 'rx' => 90, 'ry' => 0, 'rz' => 0]
        && $data['scene']['surfaces'][1]['place'] === ['x' => 1000, 'y' => 0, 'z' => 0, 'rx' => 0, 'ry' => 0, 'rz' => 0] && $data['cleared'] === ['entries' => [], 'targets' => []],
        'PUT scene: the label, the whole surfaces list – rotations default to 0, a surface without a place lies in a row');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/studio', ['apply' => false], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-scene', 'PUT scene without a field → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/studio', ['surfaces' => [['id' => 'wall', 'widthMm' => 2000, 'heightMm' => 1500, 'place' => ['x' => 0, 'y' => 0]]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-scene', 'a place without z → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/ghost', ['label' => 'x'], $editor);
    check($status === 404, 'PUT an unknown scene → 404');

    // Entries and targets on a surface
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'On the poster', 'scene' => 'studio', 'surface' => 'poster', 'target' => ['imageSrc' => 'https://cdn.example/poster.jpg', 'place' => ['surface' => 'poster', 'x' => 10, 'y' => 20, 'width' => 100]]], $editor);
    check($status === 201 && $data['scene'] === 'studio' && $data['entry']['id'] === 'studio-on-the-poster' && $data['entry']['scene'] === 'studio' && $data['entry']['surface'] === 'poster'
        && $data['entry']['target']['place'] === ['surface' => 'poster', 'x' => 10, 'y' => 20, 'width' => 100], 'POST entry on a surface, its target placed on it');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Nowhere', 'scene' => 'studio', 'target' => ['imageSrc' => 'x.jpg', 'place' => ['x' => 1, 'y' => 1, 'width' => 1]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'a place without its surface on a scene of several → 400');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'No scene'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'an entry without a scene → 400');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Ghost', 'scene' => 'ghost'], $editor);
    check($status === 400 && $data['error']['code'] === 'unknown-scene', 'an unknown scene → 400 unknown-scene');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Ghost', 'scene' => 'studio', 'surface' => 'floor'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entry', 'a surface the scene does not have → 400');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/studio', ['surfaces' => [['id' => 'wall', 'widthMm' => 2000, 'heightMm' => 1500]]], $editor);
    check($status === 409 && $data['error']['code'] === 'surfaces-in-use' && array_column($data['error']['entries'], 'id') === ['studio-on-the-poster'] && array_column($data['error']['targets'], 'id') === ['studio-on-the-poster'],
        'removing a surface entries and targets lie on → 409 surfaces-in-use naming both');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/studio', ['surfaces' => [['id' => 'wall', 'widthMm' => 2000, 'heightMm' => 1500]], 'apply' => true], $editor);
    check($status === 200 && $data['cleared'] === ['entries' => ['studio-on-the-poster'], 'targets' => ['studio-on-the-poster']], '… with apply: the entry keeps its scene without a surface, the target loses its place');
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $poster = array_column(array_column($tree['scenes'], null, 'id')['studio']['entries'], null, 'id')['studio-on-the-poster'];
    check(!isset($poster['surface']) && !isset($poster['target']['place']), '… the tree shows it');
    // A target placed on a scene's one surface keeps lying on it when more surfaces come
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['place' => ['x' => 20, 'y' => 30, 'width' => 80]], $editor);
    check($status === 200 && $data['target']['place'] === ['x' => 20, 'y' => 30, 'width' => 80], 'PUT target: a place on the scene\'s one surface');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['place' => ['surface' => 'flap', 'x' => 1, 'y' => 1, 'width' => 1]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'a place on a surface the scene does not have → 400 invalid-target');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/targets/racoon', ['print' => ['surface' => 'left', 'x' => 1, 'y' => 1, 'width' => 1]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-target', 'print (2.x) → 400 invalid-target');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s1', ['surfaces' => [['id' => 'surface', 'widthMm' => 460, 'heightMm' => 320], ['id' => 'flap', 'widthMm' => 230, 'heightMm' => 320]]], $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && $tree['scenes'][1]['entries'][0]['target']['place'] === ['surface' => 'surface', 'x' => 20, 'y' => 30, 'width' => 80], '… a second surface: its place names the surface it lies on');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s1', ['surfaces' => [['id' => 'surface', 'widthMm' => 460, 'heightMm' => 320, 'place' => $flat]]], $editor);
    check($status === 200 && $data['cleared'] === ['entries' => [], 'targets' => []], '… and the flap goes again: nothing lay on it');

    // Entries move by scene
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/link', ['scene' => 's1'], $editor);
    check($status === 200 && $data['scene'] === 's1' && $data['previousScene'] === 's2' && $data['entry']['scene'] === 's1' && !isset($data['entry']['page']), 'PUT entry { scene } moves it');
    foreach ([[['scene' => null], 'invalid-entry', 'scene null'], [['scene' => 'ghost'], 'unknown-scene', 'an unknown scene'], [['surface' => 'nope'], 'invalid-entry', 'a surface the scene does not have'],
        [['page' => 3], 'invalid-entry', 'a page (2.x)']] as [$body, $code, $what]) {
        [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entries/link', $body, $editor);
        check($status === 400 && $data['error']['code'] === $code, "PUT entry: $what → 400 $code");
    }
    call($api, 'PUT', '/editor/experiences/osct/entries/link', ['scene' => 's2'], $editor);

    // Move and group
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes/move', ['scenes' => ['studio'], 'position' => 0], $editor);
    check($status === 200 && $data['applied'] === false && $data['plan']['order'] === ['studio', 'cover', 's1', 's2', 'scene-1'] && $data['plan']['moved'] === ['studio'] && !isset($data['plan']['pages'])
        && array_column($sceneList()['scenes'], 'id')[0] === 'cover', 'POST scenes/move: the plan, nothing written');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/scenes/move', ['scenes' => ['studio'], 'position' => 0, 'apply' => true], $editor);
    check($status === 200 && $data['applied'] === true && array_column($sceneList()['scenes'], 'id') === ['studio', 'cover', 's1', 's2', 'scene-1'], '… applied');
    call($api, 'POST', '/editor/experiences/osct/scenes/move', ['scenes' => ['studio'], 'after' => 'scene-1', 'apply' => true], $editor);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/groups', ['label' => 'Studios', 'scenes' => ['scene-1', 'studio'], 'apply' => true], $editor);
    $list = $sceneList();
    check($status === 200 && $data['plan']['group'] === ['id' => 'studios', 'label' => 'Studios'] && $list['groups'] === [['id' => 'studios', 'label' => 'Studios', 'scenes' => ['scene-1', 'studio']]]
        && array_column($list['scenes'], 'group', 'id') === ['scene-1' => 'studios', 'studio' => 'studios'], 'POST groups: a group of the picked scenes, the scenes name it');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/groups/studios', ['label' => 'Rooms'], $editor);
    check($status === 200 && $data['group'] === ['id' => 'studios', 'label' => 'Rooms'], 'PUT groups: renamed');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $editor);
    [, $draftScenes] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check($draftScenes['groups'] === [['id' => 'studios', 'label' => 'Rooms']] && array_column($draftScenes['scenes'], 'id') === ['cover', 's1', 's2', 'scene-1', 'studio']
        && ($draftScenes['scenes'][4]['group'] ?? null) === 'studios' && array_keys($draftScenes['scenes'][4]) === ['id', 'label', 'group', 'surfaces'], 'the draft: the scenes in order, the groups, a scene\'s keys in the content\'s order');
    $posterDraft = array_column($draftScenes['entries'], null, 'id')['studio-on-the-poster'];
    check(array_slice(array_keys($posterDraft), 0, 4) === ['id', 'category', 'title', 'scene'] && !isset($posterDraft['page']) && !isset($posterDraft['target']['place']), 'an entry in the draft: its scene after its title, no page');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/groups/studios', null, $editor);
    check($status === 200 && $data === ['ungrouped' => 'studios', 'scenes' => ['scene-1', 'studio']] && $sceneList()['groups'] === [], 'DELETE groups: ungrouped, the scenes stay');

    // Removing a scene: two steps
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/scenes/s1', null, $editor);
    check($status === 409 && $data['error']['code'] === 'initial-scene', 'the scene the experience opens on is never removed → 409 initial-scene');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/scenes/studio', null, $editor);
    $impact = $data['error']['impact'] ?? [];
    check($status === 409 && $data['error']['code'] === 'confirm-delete' && ($impact['kind'] ?? null) === 'scene' && ($impact['scene'] ?? null) === ['id' => 'studio', 'label' => 'Studio']
        && ($impact['entries'][0] ?? null) === ['id' => 'studio-on-the-poster', 'title' => 'On the poster', 'scene' => 'studio', 'category' => 'glossary'] && !isset($impact['pagesBack']),
        'DELETE scene: 409 confirm-delete with the impact – the scene, its entries');
    [$status, $data] = deleting($api, '/editor/experiences/osct/scenes/studio', $editor);
    check($status === 200 && $data['deleted']['scene'] === 'studio' && $data['deleted']['entries'] === ['studio-on-the-poster'] && !isset($data['moved']), '… confirmed: the scene goes with its entry and target');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/entries/link', null, $editor);
    check($status === 409 && ($data['error']['impact']['entry'] ?? null) === ['id' => 'link', 'title' => 'A link', 'category' => 'link', 'scene' => 's2'], 'DELETE entry: the impact names its scene');
    deleting($api, '/editor/experiences/osct/scenes/cover', $editor);
    deleting($api, '/editor/experiences/osct/scenes/scene-1', $editor);
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=500', null, $editor);
    check(array_column($sceneList()['scenes'], 'id') === ['s1', 's2'] && in_array('scene', array_column($log['changes'], 'kind'), true) && !in_array('spread', array_column($log['changes'], 'kind'), true),
        'the experience is back to its two scenes; the log names scene changes (no scene)');

    echo "editor: the experience's environment (content schema 2.8)\n";
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => false]], $editor);
    check($status === 200 && $data['environment'] === ['world' => 'cafe', 'onionSky' => false], 'PUT environment');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json?t=3', null, $editor);
    [, $draftNow] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftNow['experience']['environment'] ?? null) === ['world' => 'cafe', 'onionSky' => false], 'the draft carries the environment');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => ['world' => 'moon', 'onionSky' => true]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-environment', 'an unknown world is refused');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => ['world' => 'cafe']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-environment', 'onionSky is required');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/environment', ['world' => 'cafe'], $editor);
    check($status === 400, 'the body needs environment');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => null], $editor);
    check($status === 200 && !isset($data['environment']), 'environment: null removes it – the default applies');

    echo "editor: reference images, named by use (#314, #298)\n";
    $extOf = static fn(string $url): string => strtolower(pathinfo((string) parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets?fit=reference&scene=s2&surface=surface', pngOf(4, 2, 0x22aa44), 'scan.png', $editor);
    $refUrl = (string) ($data['asset']['url'] ?? '');
    check($status === 201 && ($data['asset']['name'] ?? null) === 's2_surface.' . $extOf($refUrl), '?fit=reference&scene=s2&surface=surface → s2_surface');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets?fit=reference&scene=s2&surface=nope', pngOf(4, 2, 0x22aa45), 'scan.png', $editor);
    check($status === 400 && ($data['error']['code'] ?? null) === 'invalid-use', 'a surface the scene does not have → 400 invalid-use');
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets?fit=page&page=2', pngOf(4, 2, 0x22aa46), 'scan.png', $editor);
    check($status === 400 && ($data['error']['code'] ?? null) === 'invalid-fit', '?fit=page (2.x) → 400 invalid-fit');
    [, $plain] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(4, 2, 0x22aa47), 'photo.png', $editor);
    $plainUrl = (string) ($plain['asset']['url'] ?? '');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2/surfaces/surface/reference', ['url' => $plainUrl], $editor);
    check($status === 200 && $data['changed'] === true && $data['reference'] === ['url' => $plainUrl, 'name' => $plain['asset']['name'], 'fit' => 'cover'], 'PUT reference: a Library image on the surface');
    $list = $sceneList();
    check(array_column($list['scenes'], null, 'id')['s2']['surfaces'][0]['reference']['url'] === $plainUrl, 'GET scenes shows it');
    [, $usages] = call($api, 'GET', "/editor/experiences/osct/assets/{$plain['asset']['id']}/usages", null, $editor);
    check(($usages['usages'] ?? null) === [['kind' => 'reference', 'ref' => 's2/surface']], 'a reference is a use of its file');
    [, $data] = call($api, 'POST', '/editor/experiences/osct/assets/names', ['apply' => false], $editor);
    $renames = array_column($data['plan']['renames'] ?? [], null, 'url');
    check(($renames[$plainUrl]['to'] ?? null) === 's2_surface.' . $extOf($plainUrl) && ($renames[$plainUrl]['use'] ?? null) === ['kind' => 'reference', 'ref' => 's2/surface', 'scene' => 's2'],
        'the names plan: a reference image takes <scene>_<surface>');
    // #330: one file renamed by hand
    $plainPath = "/editor/experiences/osct/assets/{$plain['asset']['id']}";
    $plainExt = $extOf($plainUrl);
    [$status, $renamed] = call($api, 'PUT', $plainPath, ['name' => "  Desk \t photo.$plainExt "], $editor);
    [, $assets] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    $listed = array_column($assets['assets'], null, 'url')[$plainUrl] ?? [];
    check($status === 200 && ($renamed['asset'] ?? null) === ['id' => $plain['asset']['id'], 'url' => $plainUrl, 'name' => "Desk photo.$plainExt", 'imported' => false]
        && ($renamed['changed'] ?? null) === true && ($listed['name'] ?? null) === "Desk photo.$plainExt" && ($listed['usages'] ?? null) === 1,
        '#330: PUT assets/{id} { name } renames an upload – white space folded, its URL and its use unchanged');
    [$status, $renamed] = call($api, 'PUT', $plainPath, ['name' => 'Desk photo'], $editor);
    check($status === 200 && ($renamed['asset']['name'] ?? null) === "Desk photo.$plainExt" && ($renamed['changed'] ?? null) === false, '#330: … the extension is the stored file\'s (added), the same name changes nothing');
    foreach (['', '  ', '.', "..", 'a/b', 'a\\b', "a\x01b", str_repeat('x', 300)] as $bad) {
        [$status, $refused] = call($api, 'PUT', $plainPath, ['name' => $bad], $editor);
        check($status === 400 && ($refused['error']['code'] ?? null) === 'invalid-name', '#330: … refuses the name ' . json_encode(mb_substr($bad, 0, 12)) . ' (400 invalid-name)');
    }
    [$status, $refused] = call($api, 'PUT', $plainPath, ['name' => 42], $editor);
    check($status === 400 && ($refused['error']['code'] ?? null) === 'invalid-name', '#330: … a name that is no text → 400');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/assets/00000000-0000-4000-8000-000000000000', ['name' => 'x'], $editor);
    check($status === 404, '#330: … an asset that is not there → 404');
    [$status] = call($api, 'PUT', $plainPath, ['name' => 'x']);
    check($status === 401, '#330: … signed in only');
    [, $assets] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    check((array_column($assets['assets'], null, 'url')[$plainUrl]['place'] ?? null) === ['scene' => 's2', 'order' => 1, 'more' => 0], 'the Library places it at its scene (the scenes\' order)');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2/surfaces/surface/reference', ['url' => null], $editor);
    check($status === 200 && $sceneList()['scenes'][1]['surfaces'][0]['reference'] === null, 'null removes it');
    foreach (['/pages', '/page-images', '/matter', '/spreads', '/spreads/s1', '/scenes/migrate', '/scenes/references/migrate'] as $gone) {
        [$status] = call($api, $gone === '/pages' ? 'GET' : ($gone === '/page-images' || $gone === '/spreads/s1' ? 'PUT' : 'POST'), "/editor/experiences/osct$gone", ['apply' => false], $editor);
        check($status === 404, "$gone is gone (404)");
    }

    echo "editor: one list of a file's uses – the Library's count, the delete check and the names agree (#298 phase 2)\n";
    $usesExperience = $configuration;
    $usesExperience['experience'] = ['id' => 'uses', 'title' => 'Uses', 'book' => ['author' => 'Someone']];
    unset($usesExperience['plugins']);
    $layoutFiles = ['/assets/content/layout/layout.json' => ['size' => 100, 'v' => 'aaaaaaaaaaaa'], '/assets/content/layout/sheets/s1.jpg' => ['size' => 20, 'v' => 'bbbbbbbbbbbb'],
        '/assets/content/layout/sheets/s1@sharp.jpg' => ['size' => 40, 'v' => 'cccccccccccc']];
    $usesFiles = $files + $layoutFiles + ['/assets/content/extra/loose.jpg' => ['size' => 5, 'v' => 'dddddddddddd']];
    [$status] = importing($api, 'uses', $editor, json_encode(['configuration' => $usesExperience, 'files' => $usesFiles], $flags));
    check($status === 200, '#298: an experience with a print layout (layout/layout.json, a sheet and its sharp image) and a loose imported file');
    $usesKinds = ['entry', 'target', 'inline', 'shared', 'plugin', 'reference', 'environment', 'scene', 'experience'];
    $usesMade = [];
    foreach ($usesKinds as $i => $kind) {
        [, $data] = upload($api, 'POST', '/editor/experiences/uses/assets', pngOf(2 + $i, 1, [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff, 0x808080, 0x804000, 0x004080][$i]), "$kind.png", $editor);
        $usesMade[$kind] = $data['asset'] ?? ['id' => 'none', 'url' => 'none'];
    }
    $usesLibrary = static function () use ($api, $editor): array {
        [, $list] = call($api, 'GET', '/editor/experiences/uses/assets', null, $editor);
        return array_column($list['assets'] ?? [], null, 'url');
    };
    $library = $usesLibrary();
    check(array_map(static fn(array $a) => $library[$a['url']]['usages'] ?? null, $usesMade) === array_fill_keys($usesKinds, 0), '#298: the uploads, unused, count 0');
    $u = static fn(string $kind): string => (string) $usesMade[$kind]['url'];
    $usesPuts = [
        'entry' => ['/editor/experiences/uses/entries/racoon', ['image' => $u('entry')]],
        'target' => ['/editor/experiences/uses/targets/racoon', ['imageSrc' => $u('target')]],
        'inline' => ['/editor/experiences/uses/targets/castle-target', ['entity' => ['type' => 'image', 'assets' => [['id' => 'pic', 'assetType' => 'image', 'src' => $u('inline')]]]]],
        'shared' => ['/editor/experiences/uses/entities/castle', ['type' => 'image', 'assets' => [['id' => 'castle-img', 'assetType' => 'image', 'src' => $u('shared')]]]],
        'plugin' => ['/editor/experiences/uses/plugins/glow', ['source' => "export const register = (api) => { api.loadText('" . $u('plugin') . "'); };\n"]],
        'reference' => ['/editor/experiences/uses/scenes/s2/surfaces/surface/reference', ['url' => $u('reference')]],
        'environment' => ['/editor/experiences/uses/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'skySrc' => $u('environment')]]],
        'scene' => ['/editor/experiences/uses/scenes/s2', ['passes' => [['type' => 'bloom', 'texture' => $u('scene')]]]],
        'experience' => ['/editor/experiences/uses/passes', ['passes' => [['type' => 'vignette', 'texture' => $u('experience')]]]],
    ];
    $statuses = [];
    foreach ($usesPuts as $kind => [$path, $body]) $statuses[$kind] = call($api, 'PUT', $path, $body, $editor)[0];
    check($statuses === array_fill_keys($usesKinds, 200), '#298: each upload gets one use – ' . json_encode($statuses));
    $expected = [
        'entry' => ['kind' => 'entry', 'ref' => 'racoon'], 'target' => ['kind' => 'target', 'ref' => 'racoon'], 'inline' => ['kind' => 'target', 'ref' => 'castle-target'],
        'shared' => ['kind' => 'entity', 'ref' => 'castle'], 'plugin' => ['kind' => 'plugin', 'ref' => 'glow'], 'reference' => ['kind' => 'reference', 'ref' => 's2/surface'],
        'environment' => ['kind' => 'environment', 'ref' => 'uses'], 'scene' => ['kind' => 'scene', 'ref' => 's2'], 'experience' => ['kind' => 'experience', 'ref' => 'uses'],
    ];
    $library = $usesLibrary();
    $labels = ['entry' => 'an entry\'s image', 'target' => 'a target image', 'inline' => 'a target\'s inline entity', 'shared' => 'a shared entity', 'plugin' => 'a plugin source',
        'reference' => 'a reference image (#314)', 'environment' => 'the experience\'s environment', 'scene' => 'a scene\'s own file (its pass)', 'experience' => 'an experience setting\'s file (its pass)'];
    foreach ($usesKinds as $kind) {
        $asset = $usesMade[$kind];
        [, $usages] = call($api, 'GET', "/editor/experiences/uses/assets/{$asset['id']}/usages", null, $editor);
        [$deleted, $refused] = call($api, 'DELETE', "/editor/experiences/uses/assets/{$asset['id']}", null, $editor);
        check(($library[$asset['url']]['usages'] ?? null) === 1 && ($usages['usages'] ?? null) === [$expected[$kind]] && ($usages['asset']['usages'] ?? null) === 1
            && $deleted === 409 && ($refused['error']['usages'] ?? null) === [$expected[$kind]],
            "#298: {$labels[$kind]} – the Library counts the use, the usages name it, the delete is refused without force");
    }
    check(($library[$u('scene')]['place'] ?? null) === ['scene' => 's2', 'order' => 1, 'more' => 0] && ($library[$u('experience')]['place'] ?? null) === ['scene' => null, 'order' => -1, 'more' => 0],
        '#298: a scene\'s file is placed at its scene, an experience setting\'s experience-wide');
    $sheets = array_values(array_filter($library, static fn(array $a) => str_contains($a['url'], '/assets/content/layout/sheets/')));
    $loose = array_values(array_filter($library, static fn(array $a) => str_ends_with($a['url'], '/extra/loose.jpg')))[0] ?? [];
    check(count($sheets) === 2 && array_column($sheets, 'usages') === [1, 1] && ($sheets[0]['place'] ?? null) === ['scene' => null, 'order' => -1, 'more' => 0] && ($loose['usages'] ?? null) === 0,
        '#298: a layout sheet and its sharp image count as used (the stage reads them through layout.json) – a loose imported file does not');
    [$status, $data] = call($api, 'DELETE', "/editor/experiences/uses/assets/{$sheets[0]['id']}", null, $editor);
    check($status === 404, '#298: … and, imported, it cannot be deleted at all (read-only)');
    [, $data] = call($api, 'POST', '/editor/experiences/uses/assets/names', ['apply' => false], $editor);
    $renamed = array_column($data['plan']['renames'] ?? [], 'to', 'url');
    check(!isset($renamed[$u('scene')]) && !isset($renamed[$u('experience')]) && !array_filter(array_keys($renamed), static fn(string $url) => str_contains($url, '/layout/'))
        && ($renamed[$u('target')] ?? null) === 'racoon_target.' . $extOf($u('target')) && ($data['plan']['unused'] ?? null) === 2,
        '#298: the names plan reads the same uses – a scene\'s, an experience setting\'s and the layout\'s use name nothing; unused only the loose file and the target image the upload replaced');
    // Without layout.json the layout's files are no use
    $noLayout = $usesFiles;
    unset($noLayout['/assets/content/layout/layout.json']);
    [$status] = importing($api, 'uses', $editor, json_encode(['configuration' => $usesExperience, 'files' => $noLayout], $flags));
    $sheets = array_values(array_filter($usesLibrary(), static fn(array $a) => str_contains($a['url'], '/assets/content/layout/sheets/')));
    check($status === 200 && array_column($sheets, 'usages') === [0, 0], '#298: without the experience\'s layout.json the sheets are unused');

    echo "editor: the experience's passes – the master, scenes override (#149)\n";
    $experiencePasses = [['type' => 'grade', 'reach' => 'all', 'exposure' => 0.5], ['type' => 'vignette', 'strength' => 0.4]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => $experiencePasses], $editor);
    check($status === 200 && $data['passes'] === $experiencePasses, 'PUT experience passes');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2', ['passes' => []], $editor);
    check($status === 200, 'a scene turns them off with a list of its own');
    [, $draftNow] = $draftOf();
    $draftScenes = array_column($draftNow['scenes'], null, 'id');
    check(($draftNow['experience']['passes'] ?? null) === $experiencePasses, 'the draft carries the experience passes');
    check(!array_key_exists('passes', $draftScenes['s1']) && ($draftScenes['s2']['passes'] ?? null) === [], 'the draft: s1 has no list (the experience’s apply), s2 its own empty one');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => [['type' => 'glow']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'an unknown pass type is refused');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => ['type' => 'bloom']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'passes must be a list');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => [['type' => 'bloom', 'strength' => [1]]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'a parameter must be a scalar');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['type' => 'bloom'], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes', 'the body needs passes');
    // A pass switched off keeps its place and values (#233); enabled is true or false, nothing else
    $offPasses = [['type' => 'bloom', 'enabled' => false, 'strength' => 0.5], ['type' => 'vignette', 'enabled' => true]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2', ['passes' => $offPasses], $editor);
    check($status === 200 && $data['scene']['passes'] === $offPasses, 'a scene\'s pass that is off is kept with its values (enabled: false)');
    [, $draftNow] = $draftOf();
    check((array_column($draftNow['scenes'], null, 'id')['s2']['passes'] ?? null) === $offPasses, 'the draft carries enabled');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => [['type' => 'bloom', 'enabled' => 'no']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-passes' && str_contains($data['error']['message'], 'passes[0].enabled must be true or false'), 'the experience\'s: enabled must be true or false');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2', ['passes' => [['type' => 'vignette', 'enabled' => 1]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-scene', 'a scene\'s: enabled 1 is refused');
    [$status] = call($api, 'PUT', '/editor/experiences/nowhere/passes', ['passes' => null], $editor);
    check($status === 404, 'an unknown experience → 404');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => null], $editor);
    [, $draftNow] = $draftOf();
    check($status === 200 && $data['passes'] === null && !array_key_exists('passes', $draftNow['experience']), 'passes: null removes them from the experience');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/scenes/s2', ['passes' => null], $editor);
    check($status === 200, 'the scene back to the experience’s');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=500', null, $editor);
    check(count(array_filter($data['changes'], fn($c) => $c['kind'] === 'passes' && $c['ref'] === 'osct')) === 3, 'the change log has both experience passes edits (and the plugin pass edit of #216)');

    echo "editor: the experience's appearance – a look per moment (#265)\n";
    $looks = ['reveal' => ['type' => 'inflateDissolve'], 'found' => ['type' => 'printLift', 'duration' => 900], 'lost' => ['type' => 'fade', 'outDuration' => 250]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => $looks], $editor);
    check($status === 200 && $data['appearance'] === $looks, 'PUT experience appearance: a look per moment, its params kept');
    [, $draftNow] = $draftOf();
    check(($draftNow['experience']['appearance'] ?? null) === $looks, 'the draft carries the experience appearance');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['lost' => ['type' => 'fade']]], $editor);
    [, $draftNow] = $draftOf();
    check($status === 200 && ($draftNow['experience']['appearance'] ?? null) === ['lost' => ['type' => 'fade']], 'a save replaces the whole appearance: a moment left out has no look of its own');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['unlock' => ['type' => 'fade']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance' && str_contains($data['error']['message'], 'appearance.unlock is not a moment (reveal, found, lost)'), 'an unknown moment is refused, the moments named');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['found' => ['type' => 'glow']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance' && str_contains($data['error']['message'], 'appearance.found.type must be one of inflateDissolve, printLift, fade'), 'an unknown look is refused, the built-in looks named');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => [['type' => 'fade']]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance', 'appearance must be an object of moments');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['found' => ['duration' => 500]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance' && str_contains($data['error']['message'], 'appearance.found needs a type'), 'a look needs a type');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => ['found' => ['type' => 'fade', 'duration' => [500]]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance', 'a parameter must be a scalar');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['found' => ['type' => 'fade']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-appearance', 'the body needs appearance');
    [, $draftNow] = $draftOf();
    check(($draftNow['experience']['appearance'] ?? null) === ['lost' => ['type' => 'fade']], 'a refused save leaves the appearance as it was');
    [$status] = call($api, 'PUT', '/editor/experiences/nowhere/appearance', ['appearance' => null], $editor);
    check($status === 404, 'an unknown experience → 404');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => new stdClass()], $editor);
    [, $draftNow] = $draftOf();
    check($status === 200 && $data['appearance'] === null && !array_key_exists('appearance', $draftNow['experience']), 'an appearance without a moment removes the field');
    call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => $looks], $editor);
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/appearance', ['appearance' => null], $editor);
    [, $draftNow] = $draftOf();
    check($status === 200 && $data['appearance'] === null && !array_key_exists('appearance', $draftNow['experience']), 'appearance: null removes it from the experience – the default look plays');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=500', null, $editor);
    check(count(array_filter($data['changes'], fn($c) => $c['kind'] === 'appearance' && $c['ref'] === 'osct')) === 7, 'the change log has the five appearance edits (and the two plugin look edits)');

    echo "editor: a scene's and the experience's logic (content schema 5.0, #334)\n";
    [, $draftNow] = $draftOf();
    $logicScene = (string) $draftNow['scenes'][0]['id'];
    $sceneLogic = ['rules' => [['on' => 'groupTapped', 'when' => 'tapped && !shown', 'do' => [['show' => 'target:racoon/caption'], ['goto' => "scene:$logicScene"]]]],
        'canvas' => ['notes' => [['id' => 'n1', 'text' => 'A note', 'x' => 1, 'y' => 2.5]], 'folds' => ['rule:0'], 'exposed' => ['node:racoon/0' => ['src', 'p:hum.volume']]]];
    [$status, $data] = call($api, 'PUT', "/editor/experiences/osct/scenes/$logicScene", ['logic' => $sceneLogic], $editor);
    check($status === 200 && ($data['scene']['logic'] ?? null) === $sceneLogic, 'PUT …/scenes/{sid} { logic }: the scene\'s rules stored with their canvas');
    foreach ([
        [['rules' => [['on' => 'tap', 'do' => ['show' => 'target:racoon']]]], "node's own event", 'a node event in a scene\'s rule'],
        [['rules' => [['on' => 'ping', 'do' => 'hide']]], 'acts on the rule\'s own node', 'a shorthand (no own node)'],
        [['rules' => [['on' => 'ping', 'do' => ['hide' => 'caption']]]], 'by address', 'a node named without an address'],
        [['rules' => [['on' => 'ping', 'when' => ['hasKey' => true], 'do' => ['goto' => 'scene:s1']]]], 'expression', 'the object form of a condition'],
        [['rules' => [['on' => 'ping', 'do' => ['goto' => 'cover']]]], 'scene:<id>', 'a goto that is no scene address'],
        [['rules' => [], 'canvas' => ['notes' => [['id' => 'n']]]], '{ id, text, x, y }', 'a note without its text and place'],
        [['rules' => [], 'view' => 1], 'unknown field of logic', 'a field beside rules and canvas'],
        [['rules' => [], 'canvas' => ['exposed' => ['node:racoon/0' => ['', 2]]]], 'list of port ids', 'exposed ports that are no port ids (schema 5.1)'],
    ] as [$bad, $words, $what]) {
        [$status, $data] = call($api, 'PUT', "/editor/experiences/osct/scenes/$logicScene", ['logic' => $bad], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-scene' && str_contains($data['error']['message'], $words), "$what → 400 invalid-scene");
    }
    $experienceLogic = ['rules' => [['on' => 'targetUnlocked', 'when' => 'unlocks > 2', 'do' => [['set' => ['chapterDone' => true], 'scope' => 'experience'], ['goto' => "scene:$logicScene"]]],
        ['on' => '', 'do' => ['emit' => 'nothing']]], 'canvas' => ['groups' => [['id' => 'g', 'label' => 'Chapter', 'members' => ['rule:0']]]]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/logic', ['logic' => $experienceLogic], $editor);
    check($status === 200 && $data['logic'] === $experienceLogic, 'PUT …/logic: the experience\'s rules (an empty on is kept – the Logic view lists it)');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/logic', ['logic' => ['rules' => [['on' => 'found', 'do' => ['goto' => 'scene:s1']]]]], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-logic', 'the experience\'s rules: a node event → 400 invalid-logic');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/logic', ['rules' => []], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-logic', 'the body needs logic');
    [, $draftNow] = $draftOf();
    check(($draftNow['experience']['logic'] ?? null) === $experienceLogic && ($draftNow['scenes'][0]['logic'] ?? null) === $sceneLogic, 'the draft carries both, canvas included (the editor reads it)');
    [, $export] = call($api, 'GET', '/editor/experiences/osct/export', null, $editor);
    check(($export['configuration']['experience']['logic']['canvas'] ?? null) === $experienceLogic['canvas'], 'the export carries the canvas');
    [$status, $published] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    $readers = json_decode((string) @file_get_contents("$storeDir/local/osct/{$published['build']}/game.config.json"), true);
    check($status === 200 && ($readers['experience']['logic'] ?? null) === ['rules' => $experienceLogic['rules']] && !isset($readers['scenes'][0]['logic']['canvas'])
        && ($readers['scenes'][0]['logic']['rules'] ?? null) === $sceneLogic['rules'], 'a publish carries the rules, never the canvas');
    $entity = $draftNow['entities']['castle'];
    $entity['components'] = [['type' => 'behaviour', 'rules' => [['on' => 'tap', 'when' => ['hasKey' => true], 'do' => 'play']]]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $entity, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-entity' && str_contains($data['error']['message'], 'expression'), 'a node\'s behaviour with the object form of a condition → 400 invalid-entity');
    $entity['components'] = [['type' => 'behaviour', 'rules' => [['on' => 'tap', 'when' => 'hasKey', 'do' => ['goto' => "scene:$logicScene"]]]]];
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $entity, $editor);
    check($status === 200, 'a node\'s behaviour with an expression and a goto is stored');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=500', null, $editor);
    check(count(array_filter($data['changes'], fn($c) => $c['kind'] === 'logic' && $c['ref'] === 'osct')) === 1, 'the experience\'s logic is a change of kind logic');
    $variables = ['taps' => ['type' => 'integer', 'scope' => 'stage', 'default' => 0], 'speed' => ['type' => 'number', 'default' => 2]];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/variables', ['variables' => $variables], $editor);
    check($status === 200 && $data['variables'] === $variables, "PUT …/variables: the rules' typed variables (an integer default for a number is fine)");
    foreach ([[['taps' => ['type' => 'float']], 'type'], [['taps' => ['type' => 'integer', 'default' => 1.5]], 'default'], [['Taps' => ['type' => 'integer']], 'variable name'], [['taps' => ['type' => 'string', 'scope' => 'world']], 'scope']] as [$bad, $words]) {
        [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/variables', ['variables' => $bad], $editor);
        check($status === 400 && $data['error']['code'] === 'invalid-variables' && str_contains($data['error']['message'], $words), "variables: a wrong $words → 400 invalid-variables");
    }
    $entity['components'] = [['type' => 'behaviour', 'rules' => [['on' => 'tap', 'do' => ['set' => ['taps' => 'taps + 1', 'mood' => '"calm"', 'ok' => true]]]]]];
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $entity, $editor);
    $entity['components'][0]['rules'][0]['do']['set'] = ['taps' => ['x' => 1]];
    [$status2, $data] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $entity, $editor);
    check($status === 200 && $status2 === 400 && str_contains($data['error']['message'], 'expression'), 'a set value is an expression, a number or true / false – an object is refused');
    call($api, 'PUT', '/editor/experiences/osct/variables', ['variables' => null], $editor);
    call($api, 'PUT', '/editor/experiences/osct/logic', ['logic' => null], $editor);
    call($api, 'PUT', "/editor/experiences/osct/scenes/$logicScene", ['logic' => null], $editor);
    [, $draftNow] = $draftOf();
    check(!array_key_exists('logic', $draftNow['experience']) && !array_key_exists('logic', $draftNow['scenes'][0]), 'logic: null removes it from the experience and the scene');

    echo "editor: the environment's world and sky as assets (content schema 2.10)
";
    [, $sky] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(2, 1, 0x87ceeb), 'sky.png', $editor);
    [, $world] = upload($api, 'POST', '/editor/experiences/osct/assets', 'glTF world', 'world.glb', $editor);
    $environment = ['world' => 'cafe', 'onionSky' => true, 'worldSrc' => $world['asset']['url'], 'skySrc' => $sky['asset']['url']];
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => $environment], $editor);
    check($status === 200 && $data['environment'] === $environment, 'PUT environment with a world model and a sky');
    [, $m] = call($api, 'GET', '/editor/experiences/osct/draft/latest.json?t=4', null, $editor);
    [, $draftNow] = call($api, 'GET', "/editor/experiences/osct/draft/{$m['build']}/game.config.json", null, $editor);
    check(($draftNow['experience']['environment'] ?? null) === $environment, 'the draft carries the asset references');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'worldSrc' => $sky['asset']['url']]], $editor);
    check($status === 400 && $data['error']['message'] === 'environment.worldSrc must be a glTF model (.glb, .gltf).', 'an image as the world is refused');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'skySrc' => 'sky.jpg']], $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-environment', 'a relative path is refused');
    [$status, $data] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => ['world' => 'cafe', 'onionSky' => true, 'skySrc' => '/assets/content/environment/sky.webp']], $editor);
    check($status === 200, 'a content path is taken');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => $environment], $editor);
    [, $data] = call($api, 'GET', "/editor/experiences/osct/assets/{$sky['asset']['id']}/usages", null, $editor);
    check($data['usages'] === [['kind' => 'environment', 'ref' => 'osct']], 'the sky usages: the experience environment');
    [, $data] = call($api, 'GET', '/editor/experiences/osct/assets', null, $editor);
    $listed = array_values(array_filter($data['assets'], fn($a) => $a['id'] === $world['asset']['id']));
    check(($listed[0]['usages'] ?? null) === 1, 'the list counts the world model use');
    [$status, $data] = call($api, 'DELETE', "/editor/experiences/osct/assets/{$world['asset']['id']}", null, $editor);
    check($status === 409 && $data['error']['usages'][0]['kind'] === 'environment', 'delete while the environment uses it → 409');
    [$status, $data] = upload($api, 'PUT', "/editor/experiences/osct/assets/{$sky['asset']['id']}/file", pngOf(2, 1, 0x4682b4), 'sky.png', $editor);
    check($status === 200 && $data['relinked'] === 1, 'replace the sky → the environment relinked');
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check(($tree['experience']['experience']['environment']['skySrc'] ?? null) === $data['asset']['url'] && $tree['experience']['experience']['environment']['worldSrc'] === $world['asset']['url'], 'the experience names the new version, the world stays');
    [$status] = call($api, 'PUT', '/editor/experiences/osct/environment', ['environment' => null], $editor);
    check($status === 200, 'environment removed again');

    echo "editor: reverting saved changes – one, a set, back to a point (#312)\n";
    [, $data] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    $ref = array_key_first($data['entities']);
    $original = $data['entities'][$ref];
    $edit = $original;
    $edit['params'] = ['scale' => 3];
    call($api, 'PUT', "/editor/experiences/osct/entities/$ref", $edit, $editor);
    $edit['params'] = ['scale' => 4];
    call($api, 'PUT', "/editor/experiences/osct/entities/$ref", $edit, $editor);
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=2', null, $editor);
    [$second, $first] = $log['changes'];
    check($first['ref'] === $ref && $second['ref'] === $ref && $first['notRevertable'] === null && $first['set'] === null && $first['reverts'] === null, 'the log says a change can be reverted');
    [$status, $data] = call($api, 'POST', "/editor/experiences/osct/changes/{$first['id']}/revert", null, $editor);
    [, $entities] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($status === 200 && $data['applied'] === false && $data['plan']['counts']['revert'] === 2 && $data['plan']['later'] === 1 && $data['plan']['changes'][0]['id'] === $second['id']
        && $data['plan']['changes'][0]['later'] === true && $entities['entities'][$ref]['params'] === ['scale' => 4], 'the plan: the change and the later one of the same entity, nothing written');
    [$status, $data] = call($api, 'POST', "/editor/experiences/osct/changes/{$first['id']}/revert", ['apply' => true], $editor);
    [, $entities] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($status === 200 && $data['applied'] === true && count($data['written']) === 2 && $entities['entities'][$ref] == $original, 'applied: the entity is as before the first change');
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=2', null, $editor);
    check($log['changes'][0]['set'] === $data['set'] && $log['changes'][1]['set'] === $data['set'] && in_array($log['changes'][0]['reverts'], [$first['id'], $second['id']], true), 'the reverts are new changes of one set, each naming the change it took back');
    // The revert reverted: the editor's redo
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert', ['ids' => $data['written'], 'apply' => true], $editor);
    [, $entities] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($status === 200 && $data['applied'] === true && $entities['entities'][$ref]['params'] === ['scale' => 4], 'a revert can be reverted');
    // A change outside the log: a conflict, listed and never overwritten
    $pdo = connect('test');
    $outside = $edit;
    $outside['params'] = ['scale' => 9];
    $pdo->prepare('UPDATE entities SET data_json = ? WHERE experience_id = ? AND ref = ?')->execute([json_encode($outside), 'osct', $ref]);
    $pdo = null;
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert', ['ids' => [$log['changes'][0]['id']], 'apply' => true], $editor);
    [, $entities] = call($api, 'GET', '/editor/experiences/osct/entities', null, $editor);
    check($status === 200 && $data['applied'] === false && $data['plan']['counts']['conflict'] === 1 && $data['plan']['changes'][0]['status'] === 'conflict'
        && $entities['entities'][$ref]['params'] === ['scale' => 9], 'a conflict is listed, nothing overwritten');
    call($api, 'PUT', "/editor/experiences/osct/entities/$ref", $original, $editor);
    // Back to a point: the experience's fields – the passes stay, the title after the point goes back
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $title = $tree['experience']['title'];
    call($api, 'PUT', '/editor/experiences/osct/passes', ['passes' => []], $editor);
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    $point = $log['changes'][0];
    call($api, 'PUT', '/editor/experiences/osct', ['title' => 'A title for a while'], $editor);
    [$otherStatus] = call($api, 'PUT', "/editor/experiences/osct/entities/$ref", $edit, $other['session']);
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert-to', ['after' => $point['id']], $editor);
    check($otherStatus === 200 && $status === 200 && $data['applied'] === false && $data['plan']['counts']['revert'] === 2 && $data['plan']['others'] === ['listed@example.com'],
        'revert-to plans every change after the point, naming other people');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert-to', ['after' => $point['id'], 'apply' => true], $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && $data['applied'] === true && $tree['experience']['title'] === $title && $tree['experience']['experience']['passes'] === [], 'back to the point: the title as it was, the passes of the point stay');
    [$status, $data] = call($api, 'POST', "/editor/experiences/osct/changes/{$point['id']}/revert", ['apply' => true], $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && $data['applied'] === true && !isset($tree['experience']['experience']['passes']), 'the experience\'s passes reverted alone');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert-to', ['after' => '00000000-0000-0000-0000-000000000000'], $editor);
    check($status === 404, 'an unknown change → 404');
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=500', null, $editor);
    $removal = array_values(array_filter($log['changes'], fn($c) => $c['after'] === null && $c['kind'] !== 'reference'));
    check(!$removal || is_string($removal[0]['notRevertable']), 'a removal is not revertable');


    echo "editor: a publisher's delivery through the API – compare, apply, conflicts, revert (#322)\n";
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(2, 2, 0x112233), 'delivery-a.png', $editor);
    $fileA = $data['asset'];
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(2, 2, 0x445566), 'delivery-b.png', $editor);
    $fileB = $data['asset'];
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', pngOf(2, 2, 0x778899), 'delivery-c.png', $editor);
    $fileC = $data['asset'];
    [, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', mp4File(1000, 2000, [[320, 180, 'vide']]), 'delivery.mp4', $editor);
    $fileV = $data['asset'];
    $firstScene = $sceneList()['scenes'][0]['id'];
    $plan = ['name' => '2026-11-test', 'source' => 'delivery folder', 'scenes' => [['id' => $firstScene], ['id' => 'd90-91', 'label' => '90–91']], 'entries' => [
        ['id' => 'del-new', 'scene' => 'd90-91', 'category' => 'video', 'title' => 'A delivered video', 'image' => $fileA['id'], 'target' => ['imageSrc' => $fileA['url'], 'video' => $fileV['url']]],
        ['id' => 'del-off', 'scene' => 'd90-91', 'category' => 'glossary', 'title' => 'Switched off', 'tags' => ['artwork'], 'target' => ['imageSrc' => $fileB['url'], 'enabled' => false]],
    ]];
    [$status] = call($api, 'POST', '/editor/experiences/osct/deliveries', $plan);
    check($status === 401, 'POST deliveries without a session → 401');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', $plan, $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $byKind = static fn(array $items): array => array_map(static fn(array $i) => "{$i['kind']}:{$i['id']}:{$i['status']}", $items);
    check($status === 200 && $data['applied'] === false && $data['delivery']['id'] === null && $data['counts'] === ['new' => 5, 'changed' => 0, 'same' => 1, 'conflict' => 0]
        && $byKind($data['items']) === ["scene:$firstScene:same", 'scene:d90-91:new', 'entry:del-new:new', 'target:del-new:new', 'entry:del-off:new', 'target:del-off:new']
        && $data['problems'] === [] && $data['written'] === [] && !in_array('d90-91', array_column($tree['scenes'], 'id'), true), 'without apply: the comparison per item, nothing written');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['entries' => [['id' => 'x', 'scene' => $firstScene, 'category' => 'text', 'title' => 'X', 'note' => 'n']]] + $plan, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-delivery' && str_contains($data['error']['message'], 'note'), 'an unknown field (a mapping\'s note) → 400 invalid-delivery');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['name' => ''] + $plan, $editor);
    check($status === 400 && $data['error']['code'] === 'invalid-delivery', 'a delivery without a name → 400');
    $unknown = $plan;
    $unknown['entries'][0]['target']['imageSrc'] = 'https://elsewhere.example/a.png';
    $unknown['entries'][1]['scene'] = 'nowhere';
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', $unknown, $editor);
    check($status === 200 && count($data['problems']) === 2 && str_contains($data['problems'][0], 'Library') && str_contains($data['problems'][1], 'nowhere'), 'a file outside the Library and an unknown scene are problems');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['apply' => true] + $unknown, $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 409 && $data['error']['code'] === 'delivery-problems' && count($data['error']['comparison']['problems']) === 2 && !in_array('d90-91', array_column($tree['scenes'], 'id'), true),
        'apply with problems → 409 delivery-problems with the comparison, nothing written');

    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['apply' => true] + $plan, $editor);
    $firstDelivery = $data['delivery']['id'] ?? null;
    check($status === 200 && $data['applied'] === true && is_string($firstDelivery) && count($data['written']) === 5, 'apply: the scene, the entries and their targets written – five changes');
    $order = array_column($sceneList()['scenes'], 'id');
    check(array_search('d90-91', $order, true) === array_search($firstScene, $order, true) + 1, 'the new scene goes after the plan\'s scene before it');
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $delivered = array_column(array_merge(...array_map(static fn(array $s) => $s['entries'], $tree['scenes'])), null, 'id');
    $newTarget = $delivered['del-new']['target'] ?? [];
    check(($newTarget['imageSrc'] ?? null) === $fileA['url'] && ($newTarget['entity'] ?? null) === ['type' => 'video', 'assets' => [['id' => 'del-new-media', 'assetType' => 'video', 'src' => $fileV['url']]]]
        && ($delivered['del-off']['target']['enabled'] ?? null) === false && ($delivered['del-off']['scene'] ?? $delivered['del-off']['surface'] ?? null) !== null, 'the target with its video, the switched-off target off');
    [, $entries] = call($api, 'GET', '/editor/experiences/osct/entries', null, $editor);
    $entryList = array_column($entries['entries'], null, 'id');
    check(($entryList['del-new']['image'] ?? null) === $fileA['url'] && ($entryList['del-off']['tags'] ?? null) === ['artwork'] && ($entryList['del-off']['scene'] ?? null) === 'd90-91', 'the entries: the picture by its URL (sent as the asset\'s id), the tags, the scene');
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=5', null, $editor);
    check(array_unique(array_column($log['changes'], 'delivery')) === [$firstDelivery] && array_filter(array_column($log['changes'], 'notRevertable')) === []
        && array_column($log['changes'], 'kind') === ['target', 'entry', 'target', 'entry', 'scene'], 'every write a change of its row\'s kind naming the delivery – revertable');
    $pdo = connect('test');
    $record = $pdo->query("SELECT name, source, counts_json FROM deliveries WHERE id = " . $pdo->quote($firstDelivery))->fetch(PDO::FETCH_ASSOC);
    $pdo = null;
    check(($record['name'] ?? null) === '2026-11-test' && ($record['source'] ?? null) === 'delivery folder' && json_decode((string) ($record['counts_json'] ?? ''), true)['new'] === 5, 'the delivery recorded in deliveries');

    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', $plan, $editor);
    check($status === 200 && $data['counts'] === ['new' => 0, 'changed' => 0, 'same' => 6, 'conflict' => 0], 'the same delivery again: all same');
    // An existing entry keeps its texts; its picture follows the delivery
    $second = $plan;
    $second['entries'][0]['title'] = 'Another title';
    $second['entries'][0]['image'] = $fileB['url'];
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['apply' => true] + $second, $editor);
    [, $entries] = call($api, 'GET', '/editor/experiences/osct/entries', null, $editor);
    $entryList = array_column($entries['entries'], null, 'id');
    check($status === 200 && $data['items'][2] === ['kind' => 'entry', 'id' => 'del-new', 'scene' => 'd90-91', 'status' => 'changed', 'fields' => ['image']] && count($data['written']) === 1
        && $entryList['del-new']['image'] === $fileB['url'] && $entryList['del-new']['title'] === 'A delivered video', 'an existing entry: the picture changed, the title kept');
    // Edited in the editor since: a conflict, left as it is – unless overwrite
    call($api, 'PUT', '/editor/experiences/osct/targets/del-new', ['imageSrc' => $fileB['url']], $editor);
    $third = $second;
    $third['entries'][0]['target']['imageSrc'] = $fileC['url'];
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['apply' => true] + $third, $editor);
    $targetItem = array_values(array_filter($data['items'], static fn(array $i) => $i['kind'] === 'target' && $i['id'] === 'del-new'))[0] ?? [];
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $delivered = array_column(array_merge(...array_map(static fn(array $s) => $s['entries'], $tree['scenes'])), null, 'id');
    check($status === 200 && ($targetItem['status'] ?? null) === 'conflict' && str_contains((string) ($targetItem['reason'] ?? ''), 'imageSrc') && $data['written'] === []
        && $delivered['del-new']['target']['imageSrc'] === $fileB['url'], 'the target\'s image edited in the editor since: a conflict, left as it is');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', ['apply' => true, 'overwrite' => true] + $third, $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $delivered = array_column(array_merge(...array_map(static fn(array $s) => $s['entries'], $tree['scenes'])), null, 'id');
    check($status === 200 && count($data['written']) === 1 && $delivered['del-new']['target']['imageSrc'] === $fileC['url'], 'with overwrite the conflict is written');
    // The applied deliveries, newest first (a comparison leaves no row)
    [$status] = call($api, 'GET', '/editor/experiences/osct/deliveries');
    check($status === 401, 'GET deliveries without a session → 401');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/deliveries', null, $editor);
    $listed = $data['deliveries'] ?? [];
    $oldest = end($listed) ?: [];
    check($status === 200 && count($listed) === 4 && ($oldest['id'] ?? null) === $firstDelivery && ($oldest['name'] ?? null) === '2026-11-test' && ($oldest['source'] ?? null) === 'delivery folder'
        && ($oldest['counts']['new'] ?? null) === 5 && ($oldest['changes'] ?? null) === 5 && ($listed[0]['changes'] ?? null) === 1 && ($listed[1]['changes'] ?? null) === 0
        && is_string($oldest['user'] ?? null) && is_string($oldest['createdAt'] ?? null), 'GET deliveries: the four applied ones newest first, with counts and the number of their changes');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct/deliveries?limit=1', null, $editor);
    check($status === 200 && count($data['deliveries']) === 1 && $data['deliveries'][0]['id'] === $listed[0]['id'], '… limit');
    // At most MAX_TARGETS_PER_SCENE switched on (RULES #3)
    $crowded = ['name' => 'crowded', 'scenes' => [['id' => 'd92-93']], 'entries' => array_map(static fn(int $n) => ['id' => "crowd-$n", 'scene' => 'd92-93', 'category' => 'text', 'title' => "Crowd $n",
        'target' => ['imageSrc' => $fileA['url']]], range(1, 11))];
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', $crowded, $editor);
    check($status === 200 && count($data['problems']) === 1 && str_contains($data['problems'][0], 'at most 10'), 'eleven targets switched on in one scene: a problem');
    $crowded['entries'][10]['target']['enabled'] = false;
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/deliveries', $crowded, $editor);
    check($status === 200 && $data['problems'] === [], '… ten on and one off: none');

    // The first delivery taken back – with the later changes of the same rows, its new rows removed
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=50', null, $editor);
    $ids = array_column(array_filter($log['changes'], static fn(array $c) => $c['delivery'] === $firstDelivery), 'id');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert', ['ids' => $ids], $editor);
    check($status === 200 && $data['applied'] === false && $data['plan']['counts'] === ['revert' => 8, 'conflict' => 0, 'notRevertable' => 0] && $data['plan']['later'] === 3, 'the revert\'s plan: the five changes and the three later ones of the same rows');
    [$status, $data] = call($api, 'POST', '/editor/experiences/osct/changes/revert', ['ids' => $ids, 'apply' => true], $editor);
    [, $tree] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    $entryIds = array_merge(...array_map(static fn(array $s) => array_column($s['entries'], 'id'), $tree['scenes']));
    check($status === 200 && $data['applied'] === true && !in_array('d90-91', array_column($tree['scenes'], 'id'), true) && !array_intersect(['del-new', 'del-off'], $entryIds)
        && array_column($sceneList()['scenes'], 'id') === array_values(array_diff($order, ['d90-91'])), 'applied: the delivered scene, entries and targets are gone, the order closes up');
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    check(is_string($log['changes'][0]['notRevertable']) && $log['changes'][0]['after'] === null, 'the removal a revert wrote is not revertable itself');
    foreach ([$fileA, $fileB, $fileC, $fileV] as $file) call($api, 'DELETE', "/editor/experiences/osct/assets/{$file['id']}?force=1", null, $editor);

    echo "editor: publish to bunny (test double)\n";
    $storagePort = freePort();
    $bunnyDir = "$tmp/bunny";
    $testLog = [1 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a'], 2 => ['file', sys_get_temp_dir() . '/osct-api-test.log', 'a']];
    $processes[] = proc_open([PHP_BINARY, '-S', "127.0.0.1:$storagePort", __DIR__ . '/fake-storage.php'], $testLog, $pipes, __DIR__, ['STORAGE_DIR' => $bunnyDir, 'STORAGE_KEY' => 'zone-key'] + getenv());
    for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $storagePort); $i++) usleep(100000);
    $bunny = ['CONTENT_STORE' => 'bunny', 'BUNNY_STORAGE_ZONE' => 'osct', 'BUNNY_STORAGE_ENDPOINT' => "http://127.0.0.1:$storagePort", 'BUNNY_STORAGE_PASSWORD' => 'zone-key'];
    // A staging instance with the CDN connected: it publishes to staging only, and staging goes to the zone (#183)
    $bunnyApi = startApi(['ENV' => 'staging'] + $bunny + $settings);
    [$status, $data] = call($bunnyApi, 'POST', '/editor/experiences/osct/publish', ['env' => 'staging'], $editor);
    check($status === 200 && is_file("$bunnyDir/osct/osct/staging/osct/{$data['build']}/game.config.json") && is_file("$bunnyDir/osct/osct/staging/osct/{$data['build']}/files.json"), 'staging goes to the storage zone: <title>/<env>/<experience>/<build>/ (osct/staging/osct/)');
    $latest = json_decode((string) @file_get_contents("$bunnyDir/osct/osct/staging/osct/latest.json"), true);
    $versions = json_decode((string) @file_get_contents("$bunnyDir/osct/osct/staging/osct/versions.json"), true);
    check(($latest['build'] ?? null) === $data['build'] && count($versions ?? []) === 1 && $versions[0]['build'] === $data['build'] && $versions[0]['retiredAt'] === null, 'latest.json and versions.json on the zone');
    check(($latest['experience'] ?? null) === 'osct' && ($versions[0]['experience'] ?? null) === 'osct', 'the zone\'s latest.json and versions.json name the experience');
    [, $data] = call($bunnyApi, 'GET', '/editor/experiences', null, $editor);
    check(in_array('staging', array_column(array_column($data['experiences'], null, 'id')['osct']['live'], 'env'), true), 'the experience list reads the zone: live on staging');
    [$status] = call($bunnyApi, 'GET', '/content/staging/osct/latest.json');
    check($status === 404, 'nothing local for staging on a bunny host');
    foreach (['local', 'production'] as $env) {
        [$status, $data] = call($bunnyApi, 'POST', '/editor/experiences/osct/publish', ['env' => $env], $editor);
        check($status === 403 && $data['error']['code'] === 'other-environment' && $data['error']['env'] === 'staging', "a staging instance refuses $env → 403 other-environment (no cross-environment publish)");
    }
    [, $data] = call($bunnyApi, 'GET', '/editor/environments', null, $editor);
    $byEnv = array_column($data['environments'], null, 'env');
    check($data['env'] === 'staging' && array_keys($byEnv) === ['staging', 'production'], 'a deployed instance lists no local');
    check($byEnv['staging']['store'] === 'cdn' && $byEnv['staging']['publish'] === true && $byEnv['staging']['warning'] === null && $byEnv['production']['store'] === 'cdn' && $byEnv['production']['publish'] === false,
        'the CDN has priority: staging · CDN, no warning');
    [, $data] = call($bunnyApi, 'GET', '/editor/experiences', null, $editor);
    check($data['environments'] === [], 'the experience list reads no local store on a deployed instance, and every store on the zone could be read');
    // A developer's machine with the CDN's key: local still stays in the directory store – with the warning
    $localBunny = startApi($bunny + $settings);
    [$status, $data] = call($localBunny, 'POST', '/editor/experiences/osct/publish', ['env' => 'local'], $editor);
    check($status === 200 && $data['store'] === 'server' && is_file("$storeDir/local/osct/{$data['build']}/game.config.json"), 'the environment local stays in the directory store');
    [, $data] = call($localBunny, 'GET', '/editor/environments', null, $editor);
    $byEnv = array_column($data['environments'], null, 'env');
    check($byEnv['local']['store'] === 'server' && is_string($byEnv['local']['warning']) && $byEnv['staging']['store'] === 'cdn' && $byEnv['staging']['publish'] === false, 'local · this server (warned), staging · CDN (not a target here)');
    // An instance without a CDN: its own environment goes to the directory store, and the editor warns
    $plainStaging = startApi(['ENV' => 'staging'] + $settings);
    [, $data] = call($plainStaging, 'GET', '/editor/environments', null, $editor);
    check($data['environments'][0]['env'] === 'staging' && $data['environments'][0]['store'] === 'server' && str_starts_with((string) $data['environments'][0]['warning'], 'No CDN connected'), 'staging without a CDN: staging · this server, with the warning');
    [$status, $data] = call($plainStaging, 'POST', '/editor/experiences/osct/publish', ['env' => 'staging'], $editor);
    check($status === 200 && $data['store'] === 'server' && is_file("$storeDir/staging/osct/{$data['build']}/game.config.json"), '… and publishes there');
    // A deployed instance builds the URLs of stored files from APP_URL, never from the client's host headers (#209)
    $forged = ['X-Forwarded-Host: evil.example', 'X-Forwarded-Proto: http'];
    [$status, $data] = upload($plainStaging, 'POST', '/editor/experiences/osct/assets', pngOf(1, 1, 0x030201), 'forged.png', $editor, 'application/octet-stream', $forged);
    $forgedAsset = $data['asset'] ?? [];
    check($status === 201 && str_starts_with((string) ($forgedAsset['url'] ?? ''), 'https://app.example/api/content/assets/osct/'), '#209: a forged X-Forwarded-Host does not reach a stored URL – APP_URL\'s host');
    [$status, $data] = upload($plainStaging, 'PUT', "/editor/experiences/osct/assets/{$forgedAsset['id']}/file", pngOf(1, 1, 0x010203), 'forged.png', $editor, 'application/octet-stream', $forged);
    check($status === 200 && str_starts_with((string) ($data['asset']['url'] ?? ''), 'https://app.example/api/content/assets/osct/') && str_ends_with($data['asset']['url'], "/v2.$ext"), '#209: … nor a replaced version\'s');
    call($plainStaging, 'DELETE', "/editor/experiences/osct/assets/{$forgedAsset['id']}?force=1", null, $editor);
    [, $data] = call($plainStaging, 'GET', '/editor/environments', null, $editor, 'http://localhost:5173', null, $forged);
    check(($data['environments'][0]['url'] ?? null) === 'https://app.example/api/content/staging', '#209: the environments list names APP_URL\'s host for the server store too');
    $cdnAssets = startApi(['ENV' => 'staging', 'CONTENT_BASE_URL' => 'https://cdn.example/osct/staging/'] + $bunny + $settings);
    [$status, $data] = upload($cdnAssets, 'POST', '/editor/experiences/osct/assets', pngOf(1, 1, 0x0a0b0c), 'cdn.png', $editor);
    $cdnAsset = $data['asset'] ?? [];
    check($status === 201 && preg_match('#^https://cdn\.example/assets/osct/[0-9a-f-]{36}/v1\.' . $ext . '$#', (string) ($cdnAsset['url'] ?? '')) === 1
        && is_file("$bunnyDir/osct/assets/" . substr((string) ($cdnAsset['url'] ?? ''), strlen('https://cdn.example/assets/'))), '#254: an upload\'s CDN URL is where the storage zone has the file – next to the environment, not in it');
    [, $data] = call($cdnAssets, 'GET', '/editor/experiences/osct', null, $editor);
    check(($data['experience']['libraryBase'] ?? null) === 'https://cdn.example/assets/osct/', '#258: on a CDN the Library folder of an experience is the zone\'s – the stage frame admits it before a row names a file');
    call($cdnAssets, 'DELETE', "/editor/experiences/osct/assets/" . ($cdnAsset['id'] ?? 'none') . "?force=1", null, $editor);
    $noAppUrl = startApi(['ENV' => 'staging', 'APP_URL' => ''] + $settings);
    $filesBefore = $storedFiles();
    [$status, $data] = upload($noAppUrl, 'POST', '/editor/experiences/osct/assets', pngOf(1, 1, 0x0c0b0a), 'nowhere.png', $editor);
    check($status === 500 && $data['error']['code'] === 'not-configured' && $storedFiles() === $filesBefore, '#209: a deployed instance without APP_URL refuses the upload (500 not-configured) and stores nothing');
    [$status, $data] = call($noAppUrl, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && ($data['experience']['libraryBase'] ?? null) === '', '#258: without a public URL for stored files the experience names no Library folder – and still opens');
    $wrongKey = startApi(['ENV' => 'production', 'BUNNY_STORAGE_PASSWORD' => 'wrong'] + $bunny + $settings);
    [$status, $data] = call($wrongKey, 'POST', '/editor/experiences/osct/publish', ['env' => 'production'], $editor);
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
        mkdir("$api/db/content/local/osct/0123456789ab", 0777, true);
        file_put_contents("$api/db/content/local/osct/latest.json", json_encode(['build' => '0123456789ab', 'experience' => 'osct']));
        file_put_contents("$api/db/content/local/osct/0123456789ab/game.config.json", '{"experience":{"id":"osct"}}');
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
    check(is_file("$dev/content-store/local/osct/latest.json") && is_file("$dev/content-store/local/osct/0123456789ab/game.config.json") && !file_exists("$devApi/db/content"),
        'the content store moved from server/api/db/content to content-store/ at the top level');
    [$status, $data] = call($devBase, 'GET', '/content/local/osct/latest.json');
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
    check(is_file("$both/server/api/db/content/local/osct/latest.json") && is_file("$both/content-store/staging/latest.json") && !file_exists("$both/content-store/local"),
        'when the content store is not empty, the old folder stays where it is (both kept, the new one used)');

    // A setting that points elsewhere (a test, a mounted volume): used as it is, the old folder is never touched
    $elsewhere = "$tmp/elsewhere-checkout";
    $apiCopy("$elsewhere/server/api");
    $legacyStore("$elsewhere/server/api");
    $elsewhereBase = $startCopy("$elsewhere/server/api", $copySecret + ['CONTENT_STORE_DIR' => "$tmp/mounted-store", 'DB_SQLITE_PATH' => "$tmp/elsewhere.sqlite", 'LOG_PATH' => "$tmp/elsewhere-error.log"]);
    [$status] = call($elsewhereBase, 'GET', '/content/local/osct/latest.json');
    check($status === 404 && is_file("$elsewhere/server/api/db/content/local/osct/latest.json") && !file_exists("$tmp/mounted-store/local"), 'OSCT_CONTENT_STORE_DIR elsewhere: nothing moves into it');

    // A deployed layout (the API at <docroot>/api, the FTPS staging): the store and var/ inside the API's folder, where
    // every request goes through index.php – outside the uploaded code, which the upload never deletes
    $site = "$tmp/site";
    $apiCopy("$site/api");
    $legacyStore("$site/api");
    file_put_contents("$site/api/db/error.log", "an old staging error\n");
    $siteBase = $startCopy("$site/api", $copySecret + ['DB_SQLITE_PATH' => "$tmp/site.sqlite", 'ENV' => 'staging']);
    [$status, $data] = call($siteBase, 'GET', '/content/local/osct/latest.json');
    check(is_file("$site/api/content-store/local/osct/latest.json") && !file_exists("$site/api/db/content") && $status === 200,
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
    [$status, $data] = call($api, 'GET', '/editor/experiences', null, $aiToken);
    check($status === 200 && in_array('osct', array_column($data['experiences'], 'id'), true), 'a token reads the editor API');
    [$status, $data] = call($api, 'POST', '/editor/import/preview', ['configuration' => $configuration], $aiToken);
    check($status === 200 && $data['incoming']['experience'] === 'osct' && $data['existing']['experience']['id'] === 'osct', 'a token previews an import, as it may import');
    $castle = $configuration['entities']['castle'];
    $castle['params'] = ['scale' => 4];
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $aiToken);
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    check($status === 200 && $data['changes'][0]['ref'] === 'castle' && $data['changes'][0]['user'] === 'author@example.com' && $data['changes'][0]['token'] === 'Claude on my laptop',
        'a save through a token records the token\'s name in the change log');
    call($api, 'PUT', '/editor/experiences/osct/entities/castle', $castle, $editor);
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=1', null, $editor);
    check($data['changes'][0]['token'] === null, 'a save in the editor records none');
    // The experience's texts are the draft's, not the account (#223): a token writes them like its person
    [$status] = call($api, 'PUT', '/editor/experiences/osct/entries/castle', ['body' => 'Written by an *AI*.'], $aiToken);
    [$status2] = call($api, 'PUT', '/editor/experiences/osct', ['book' => ['author' => 'Someone']], $aiToken);
    [, $data] = call($api, 'GET', '/editor/experiences/osct/changes?limit=2', null, $editor);
    check($status === 200 && $status2 === 200 && array_column($data['changes'], 'kind') === ['experience', 'entry']
        && array_unique(array_column($data['changes'], 'token')) === ['Claude on my laptop'], 'a token edits an entry and the experience\'s texts; the change log names it');
    // A token uploads code files as its person does (#186): a shader, a script
    [$status, $data] = upload($api, 'POST', '/editor/experiences/osct/assets', "void main() {}\n", 'ai.vert', $aiToken, 'text/plain');
    [$status2, $data2] = upload($api, 'POST', '/editor/experiences/osct/plugins', "export const register = () => {};\n", 'ai-script.ts', $aiToken, 'text/plain');
    check($status === 201 && $data['asset']['kind'] === 'shader' && $status2 === 201 && $data2['plugin']['id'] === 'ai-script', 'a token uploads a shader and a script');
    call($api, 'DELETE', "/editor/experiences/osct/assets/{$data['asset']['id']}", null, $aiToken);
    call($api, 'DELETE', '/editor/experiences/osct/plugins/ai-script', null, $aiToken);

    // A token removes like its person – only through the same two steps (#198); its confirmation is its own
    [$status] = call($api, 'POST', '/editor/experiences/osct/entries', ['title' => 'Robot', 'scene' => 's1', 'id' => 'robot', 'target' => ['imageSrc' => 'https://cdn.example/robot.jpg']], $aiToken);
    [$status2, $data] = call($api, 'DELETE', '/editor/experiences/osct/entries/robot', null, $aiToken);
    check($status === 201 && $status2 === 409 && $data['error']['code'] === 'confirm-delete' && $data['error']['impact']['counts']['targets'] === 1,
        'a token\'s removal: first 409 confirm-delete with the impact');
    $tokenId = $data['error']['confirmation']['id'];
    [, $data] = call($api, 'DELETE', '/editor/experiences/osct/entries/robot', null, $editor);
    [$status] = call($api, 'DELETE', '/editor/experiences/osct/entries/robot', ['confirm' => $data['error']['confirmation']['id']], $aiToken);
    [$status2] = call($api, 'DELETE', '/editor/experiences/osct/entries/robot', ['confirm' => $tokenId], $editor);
    check($status === 409 && $status2 === 409, 'the person\'s id does not work for the token, nor the token\'s for the person');
    [$status, $data] = call($api, 'DELETE', '/editor/experiences/osct/entries/robot', ['confirm' => $tokenId], $aiToken);
    [, $log] = call($api, 'GET', '/editor/experiences/osct/changes?limit=2', null, $editor);
    check($status === 200 && $data['deleted']['entries'] === ['robot'] && array_column($log['changes'], 'token') === ['Claude on my laptop', 'Claude on my laptop']
        && $log['changes'][0]['after'] === null, 'confirmed with its own id → removed; the change log names the token');

    // What a token never does: publish (any environment), its own tokens, the password, the account
    foreach (['local', 'staging', 'production'] as $env) {
        [$status, $data] = call($api, 'POST', '/editor/experiences/osct/publish', ['env' => $env], $aiToken);
        check($status === 403 && $data['error']['code'] === 'not-for-ai', "a token cannot publish to $env → 403 not-for-ai");
    }
    $refused = [
        ['GET', '/user/tokens', null], ['POST', '/user/tokens', ['name' => 'Another']], ['POST', "/user/tokens/{$made['apiToken']['id']}/renew", null],
        ['DELETE', "/user/tokens/{$made['apiToken']['id']}", null], ['PUT', '/user/password', ['password' => 'from the robot']], ['DELETE', '/user', null],
        ['GET', '/admin/users', null], ['GET', '/admin/roles', null], ['POST', '/admin/editors', ['email' => 'robot@example.com']],
        // Consent (the update options) and the language are the person's own (#203, RULES #33)
        ['PATCH', '/user', ['options' => ['buildingfictions' => true], 'language' => 'nl']], ['PATCH', '/user', ['language' => 'nl']],
    ];
    [, $data] = call($api, 'GET', '/user', null, $editor);
    $account = $data['user'];
    foreach ($refused as [$method, $path, $body]) {
        [$status, $data] = call($api, $method, $path, $body, $aiToken);
        check($status === 403 && $data['error']['code'] === 'not-for-ai', "a token: $method $path → 403 not-for-ai");
    }
    [$status, $data] = call($api, 'GET', '/user', null, $editor);
    check($status === 200 && $data['user']['hasPassword'] === false, 'the account is still there, its password unchanged');
    check($data['user']['options'] === $account['options'] && $data['user']['language'] === $account['language'], '#203: the update options and the language unchanged');
    $flipped = !$account['options']['buildingfictions'];
    [$status, $data] = call($api, 'PATCH', '/user', ['options' => ['buildingfictions' => $flipped]], $editor);
    check($status === 200 && $data['user']['options']['buildingfictions'] === $flipped, '#203: the person\'s own session still changes them');
    call($api, 'PATCH', '/user', ['options' => ['buildingfictions' => !$flipped]], $editor);

    // Renew, revoke, expire – the person's own sign-in; another editor's token is as unknown as none
    [$status] = call($api, 'POST', "/user/tokens/{$made['apiToken']['id']}/renew", null, $otherEditor);
    [$status2] = call($api, 'DELETE', "/user/tokens/{$made['apiToken']['id']}", null, $otherEditor);
    check($status === 404 && $status2 === 404, 'another editor cannot renew or revoke it → 404');
    $pdo = connect('test');
    $pdo->exec("UPDATE api_tokens SET expires_at = '2000-01-01 00:00:00' WHERE id = " . $pdo->quote($made['apiToken']['id']));
    $pdo = null;
    [$status, $data] = call($api, 'GET', '/editor/experiences', null, $aiToken);
    check($status === 401 && $data['error']['code'] === 'token-expired', 'an expired token → 401 token-expired');
    [, $data] = call($api, 'GET', '/user/tokens', null, $editor);
    check($data['tokens'][0]['expired'] === true, 'the list says it expired');
    [$status, $data] = call($api, 'POST', "/user/tokens/{$made['apiToken']['id']}/renew", null, $editor);
    $days = (strtotime($data['apiToken']['expiresAt'] ?? 'now') - time()) / 86400;
    check($status === 200 && $data['apiToken']['expired'] === false && $days > 181.9, 'renew → expires 182 days from now');
    [$status] = call($api, 'GET', '/editor/experiences', null, $aiToken);
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

    echo "browser session: the HttpOnly cookie and the CSRF token (#207)\n";
    // A database of its own: the main one's hourly sign-in limits are spent by now
    $cookieApi = startApi(database('cookie') + $settings);
    $jar = new CookieJar();
    [, $pending] = call($cookieApi, 'POST', '/auth/request', ['email' => 'listed@example.com']);
    $code = lastMail($mailLog)['code'];
    [$status, $data, $headers] = browser($jar, $cookieApi, 'POST', '/auth/verify', ['requestId' => $pending['requestId'], 'code' => $code, 'session' => 'cookie']);
    $line = $jar->lines['osct_session'] ?? '';
    $csrf = $data['csrfToken'] ?? '';
    check($status === 200 && !array_key_exists('session', $data) && strlen($csrf) > 20 && in_array('editor', $data['user']['roles'], true),
        'a browser\'s code sign-in (session: cookie) → 200 { csrfToken, user } – no session token in the body');
    check(isset($jar->cookies['osct_session']) && !str_contains(json_encode($data), $jar->cookies['osct_session']), 'the session is the cookie osct_session, in no answer a script reads');
    check((bool) preg_match('/;\s*HttpOnly/i', $line) && (bool) preg_match('/;\s*SameSite=Strict/i', $line) && (bool) preg_match('/;\s*path=\/api(;|$)/i', $line),
        'the cookie: HttpOnly, SameSite=Strict, Path=/api – ' . $line);
    check((bool) preg_match('/;\s*Max-Age=31536000\b/i', $line) && !preg_match('/;\s*secure/i', $line),
        'the cookie lives as long as a session (SESSION_TTL_DAYS) and is not Secure on a local instance over plain http');
    [$status, $data] = browser($jar, $cookieApi, 'GET', '/user');
    check($status === 200 && $data['user']['email'] === 'listed@example.com' && ($data['csrfToken'] ?? null) === $csrf, 'GET /user by cookie needs no CSRF token and answers it');
    [$status, $data] = browser($jar, $cookieApi, 'GET', '/editor/experiences');
    check($status === 200 && $data['experiences'] === [], 'the editor API reads by cookie');
    [$status, $data] = browser($jar, $cookieApi, 'PATCH', '/user', ['language' => 'nl']);
    check($status === 403 && $data['error']['code'] === 'csrf', 'a cookie write without the CSRF token → 403 csrf');
    // a token that differs in its first character, whatever that character is
    [$status, $data] = browser($jar, $cookieApi, 'PATCH', '/user', ['language' => 'nl'], ($csrf[0] === 'x' ? 'y' : 'x') . substr($csrf, 1));
    check($status === 403 && $data['error']['code'] === 'csrf', 'a wrong CSRF token → 403 csrf');
    [$status, $data] = browser($jar, $cookieApi, 'PATCH', '/user', ['language' => 'nl'], $csrf);
    check($status === 200 && $data['user']['language'] === 'nl', 'with the CSRF token the write goes through');
    foreach (['cross-site', 'same-site'] as $site) {
        [$status, $data] = browser($jar, $cookieApi, 'PATCH', '/user', ['language' => 'fr'], $csrf, ["Sec-Fetch-Site: $site"]);
        check($status === 403 && $data['error']['code'] === 'csrf', "Sec-Fetch-Site: $site → 403 csrf, even with the token");
    }
    [$status] = browser($jar, $cookieApi, 'PUT', '/progress/osct', ['record' => ['experienceId' => 'osct', 'consulted' => ['e1' => 1]], 'baseUpdatedAt' => null], $csrf, ['Sec-Fetch-Site: same-origin']);
    check($status === 200, 'a progress save by cookie with the token, from the same origin');
    [$status, $made] = browser($jar, $cookieApi, 'POST', '/user/tokens', ['name' => 'Cookie test'], $csrf);
    $cookieAi = $made['token'] ?? '';
    check($status === 201 && str_starts_with($cookieAi, 'osct_'), 'the person\'s own session by cookie makes an AI connection\'s token (Auth::session)');
    [$status] = browser($jar, $cookieApi, 'PUT', '/user/password', ['password' => 'cookie password'], $csrf);
    check($status === 200, 'and sets the password (signed in by email just now)');

    // A Bearer AI token: no CSRF token, never a cookie, never the person's own session
    [$status, $data] = call($cookieApi, 'POST', '/editor/experiences/cookie-experience/entries', ['title' => 'x', 'scene' => 's1', 'target' => ['imageSrc' => 'https://cdn.example/x.jpg']], $cookieAi);
    check($status !== 403 && $status !== 401, "a Bearer AI token writes without a CSRF token (→ $status, not 401/403)");
    [$status, $data] = call($cookieApi, 'PATCH', '/user', ['language' => 'de'], $cookieAi);
    check($status === 403 && $data['error']['code'] === 'not-for-ai', 'a Bearer AI token still cannot act as the person (PATCH /user → 403 not-for-ai)');
    $aiJar = new CookieJar();
    $aiJar->cookies['osct_session'] = $cookieAi;
    [$status] = browser($aiJar, $cookieApi, 'GET', '/user');
    check($status === 401 && !isset($aiJar->cookies['osct_session']), 'an AI token sent as the cookie is no session → 401, and the cookie is cleared');
    [$status, $data] = call($cookieApi, 'POST', '/auth/cookie', null, $cookieAi);
    check($status === 403 && $data['error']['code'] === 'not-for-ai', 'an AI token never becomes a cookie (POST /auth/cookie → 403 not-for-ai)');
    [$status, $data] = browser($jar, $cookieApi, 'PATCH', '/user', ['language' => 'en'], null, ["Authorization: Bearer $cookieAi"]);
    check($status === 403 && $data['error']['code'] === 'not-for-ai', 'a Bearer token wins over the cookie (the AI token, refused as the person)');

    // A second browser signs in with the password over https: Secure; its CSRF token is not the first's
    $jar2 = new CookieJar();
    [$status, $data] = browser($jar2, $cookieApi, 'POST', '/auth/password', ['email' => 'listed@example.com', 'password' => 'cookie password', 'session' => 'cookie'], null, ['X-Forwarded-Proto: https']);
    $csrf2 = $data['csrfToken'] ?? '';
    check($status === 200 && !array_key_exists('session', $data) && $csrf2 !== '' && $csrf2 !== $csrf, 'a browser\'s password sign-in → the cookie and a CSRF token of its own');
    check((bool) preg_match('/;\s*secure/i', $jar2->lines['osct_session'] ?? ''), 'over https the cookie is Secure');
    [$status, $data] = browser($jar, $cookieApi, 'PATCH', '/user', ['language' => 'en'], $csrf2);
    check($status === 403 && $data['error']['code'] === 'csrf', 'another session\'s CSRF token → 403 csrf');

    // Non-browser clients (the MCP server's sign-in pair) keep the Bearer session: no cookie, no CSRF token
    [$status, $data, $headers] = call($cookieApi, 'POST', '/auth/password', ['email' => 'listed@example.com', 'password' => 'cookie password']);
    $bearer = $data['session'] ?? '';
    check($status === 200 && $bearer !== '' && !array_key_exists('csrfToken', $data) && setCookies($headers) === [], 'without session: cookie → the token in the body, no cookie (non-browser clients)');
    [$status] = call($cookieApi, 'PATCH', '/user', ['language' => 'en'], $bearer);
    check($status === 200, 'a Bearer session writes without a CSRF token');

    // The migration: a token kept in localStorage before #207 becomes the cookie, once
    $jar3 = new CookieJar();
    [$status] = browser($jar3, $cookieApi, 'POST', '/auth/cookie');
    check($status === 401, 'POST /auth/cookie without a Bearer token → 401');
    [$status, $data] = browser($jar3, $cookieApi, 'POST', '/auth/cookie', null, null, ["Authorization: Bearer $bearer"]);
    $csrf3 = $data['csrfToken'] ?? '';
    check($status === 200 && $data['user']['email'] === 'listed@example.com' && $csrf3 !== '' && isset($jar3->cookies['osct_session']) && $jar3->cookies['osct_session'] !== $bearer,
        'POST /auth/cookie with the stored token → 200 { user, csrfToken } and a new token as the cookie');
    check((bool) preg_match('/;\s*HttpOnly/i', $jar3->lines['osct_session'] ?? ''), 'the exchanged cookie is HttpOnly too');
    [$status] = call($cookieApi, 'GET', '/user', null, $bearer);
    check($status === 401, 'the stored token stops working once exchanged');
    [$status] = browser($jar3, $cookieApi, 'PATCH', '/user', ['language' => 'en'], $csrf3);
    check($status === 200, 'the exchanged session writes with its CSRF token');
    [$status] = call($cookieApi, 'POST', '/auth/cookie', null, $bearer);
    check($status === 401, 'an invalid (already exchanged) token → 401: the client signs in normally');
    $pdo = connect('cookie');
    $method = $pdo->query("SELECT method FROM sessions WHERE token_hash = " . $pdo->quote(hash('sha256', $jar3->cookies['osct_session'])))->fetchColumn();
    $pdo = null;
    check($method === 'password', 'the session keeps how it signed in (the password-change rule reads it)');

    // A new sign-in in the same browser ends the session its cookie held
    $before = $jar2->cookies['osct_session'];
    [, $pending] = call($cookieApi, 'POST', '/auth/request', ['email' => 'listed@example.com']);
    [$status] = browser($jar2, $cookieApi, 'POST', '/auth/verify', ['requestId' => $pending['requestId'], 'code' => lastMail($mailLog)['code'], 'session' => 'cookie']);
    $staleJar = new CookieJar();
    $staleJar->cookies['osct_session'] = $before;
    [$status2, , $headers] = browser($staleJar, $cookieApi, 'GET', '/user');
    check($status === 200 && $jar2->cookies['osct_session'] !== $before && $status2 === 401, 'signing in again in a browser ends the session its cookie held');
    check(!isset($staleJar->cookies['osct_session']) && (bool) preg_grep('/^Set-Cookie:\s*osct_session=deleted.*Max-Age=0/i', $headers), 'a cookie of a session that is gone → 401 and the cookie cleared');

    // Logout: the cookie session ends like a write – with the CSRF token – and the cookie is cleared
    [$status, $data] = browser($jar, $cookieApi, 'POST', '/auth/logout');
    check($status === 403 && $data['error']['code'] === 'csrf' && isset($jar->cookies['osct_session']), 'logout by cookie without the CSRF token → 403 csrf, still signed in');
    $kept = $jar->cookies['osct_session'];
    [$status, , $headers] = browser($jar, $cookieApi, 'POST', '/auth/logout', null, $csrf);
    check($status === 204 && !isset($jar->cookies['osct_session']) && (bool) preg_match('/;\s*path=\/api/i', setCookies($headers)[0] ?? ''), 'logout with it → 204 and the cookie cleared (on its path)');
    $staleJar->cookies['osct_session'] = $kept;
    [$status] = browser($staleJar, $cookieApi, 'GET', '/user');
    check($status === 401, 'the logged-out session no longer works, with the old cookie either');
    [$status] = browser($jar2, $cookieApi, 'GET', '/user');
    check($status === 200, 'the other browser stays signed in');

    echo "deploy keeps the data\n";
    foreach (glob(dirname(__DIR__) . '/api/db/schema.*.sql') as $schema) {
        // The exceptions (RULES #25): a removed feature's column, by name – never a table, never rows; and an old index name
        // that SQLite rebuilt under a new one (#320 – an index holds no data)
        $sql = preg_replace(['/^ALTER TABLE `?\w+`? DROP COLUMN `?\w+`?;$/m', '/^DROP INDEX IF EXISTS \w+;$/m'], '', (string) file_get_contents($schema));
        check(!preg_match('/\b(DROP|TRUNCATE)\b|^\s*DELETE\b/im', $sql), basename($schema) . ' only adds (no DROP / TRUNCATE / DELETE but a removed feature\'s column or an old index name)');
    }
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => 'X-Admin-Secret: ' . str_repeat('s', 40), 'ignore_errors' => true]]);
    file_get_contents("$api/admin/migrate", false, $context);
    [$status, $data] = call($api, 'GET', '/user', null, $session);
    check($status === 200 && $data['user']['email'] === 'reader@example.com', 'migrate again (as every deploy does): users and sessions still there');
    [, $data] = call($api, 'GET', '/progress/osct', null, $session);
    check(($data['record']['consulted']['e1'] ?? null) === 5, 'migrate again: progress still there');
    [$status, $data] = call($api, 'GET', '/editor/experiences/osct', null, $editor);
    check($status === 200 && count($data['scenes']) === 2, "migrate again: the editor's experience still there (its two scenes)");

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

    echo "migrate a books table from before #236 (the onboarding's column)\n";
    // The schema of 2.1 (content schema 3.0, before #320) – the tables as an old database has them
    $schemaText = (string) file_get_contents(__DIR__ . '/fixtures/schema-3.0.' . ($mysql ? 'mysql' : 'sqlite') . '.sql');
    preg_match('/CREATE TABLE IF NOT EXISTS `?books`?.*?\n\)[^;]*;/s', $schemaText, $booksTable);
    $withSteps = preg_replace('/(\n\s*`?book_json`?[^\n]*\n)/', "$1  " . ($mysql ? '`tutorial_json` MEDIUMTEXT NOT NULL,' : 'tutorial_json TEXT NOT NULL,') . "\n", $booksTable[0], 1);
    $stepsSettings = database('steps', $withSteps);
    $stepsDb = connect('steps');
    $stepsDb->exec("INSERT INTO books (id, title, author, book_json, tutorial_json, initial_scene, files_json, content_schema, created_at, updated_at)
        VALUES ('old', 'Old', 'Someone', '{\"id\":\"old\",\"title\":\"Old\",\"author\":\"Someone\"}', '[]', 's1', '{}', '2.24', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $stepsDb = null;
    $stepsApi = startApi($stepsSettings + $settings);
    file_get_contents("$stepsApi/admin/migrate", false, $context);
    file_get_contents("$stepsApi/admin/migrate", false, $context);
    $stepsDb = connect('steps');
    check(!hasColumn($stepsDb, 'experiences', 'tutorial_json') && hasColumn($stepsDb, 'experiences', 'imported_json')
        && $stepsDb->query("SELECT title FROM experiences WHERE id = 'old'")->fetchColumn() === 'Old', 'migrated twice: tutorial_json removed once, the book kept (an experience now)');
    $stepsDb = null;

    echo "migrate the 2.x names (#319): spreads → scenes, spread_id → scene_id, the page columns gone\n";
    $tableOf = static function (string $name) use ($schemaText): string {
        preg_match('/CREATE TABLE IF NOT EXISTS `?' . $name . '`?.*?\n\)[^;]*;/s', $schemaText, $match);
        return $match[0];
    };
    $q = static fn(string $name) => $mysql ? "`$name`" : $name;
    $oldBooks = str_replace($q('initial_scene'), $q('initial_spread_id'), $tableOf('books'));
    $oldScenes = str_replace([$q('scenes') . ' (', $q('label'), 'scenes_book_fk'], [$q('spreads') . ' (', $q('title'), 'spreads_book_fk'], $tableOf('scenes'));
    $oldScenes = preg_replace('/(\n\s*`?title`?[^\n]*\n)/', "$1  " . ($mysql ? '`first_page` INT NOT NULL,' . "\n  " . '`last_page` INT NOT NULL,' : "first_page INTEGER NOT NULL,\n  last_page INTEGER NOT NULL,") . "\n", $oldScenes, 1);
    $oldEntries = str_replace([$q('scene_id'), 'entries_scene'], [$q('spread_id'), 'entries_spread'], $tableOf('entries'));
    $oldEntries = preg_replace('/(\n\s*`?title`?[^\n]*\n)/', "$1  " . ($mysql ? '`page` INT NOT NULL,' : 'page INTEGER NOT NULL,') . "\n", $oldEntries, 1);
    $pageImages = $mysql
        ? "CREATE TABLE `page_images` (`book_id` VARCHAR(64) NOT NULL, `page` INT NOT NULL, `facing` TINYINT NOT NULL DEFAULT 0, `url` VARCHAR(512) NOT NULL, `name` VARCHAR(255) NOT NULL, `updated_by` CHAR(36) NULL DEFAULT NULL, `updated_at` BIGINT NOT NULL, PRIMARY KEY (`book_id`, `page`, `facing`)) ENGINE=InnoDB;"
        : "CREATE TABLE page_images (book_id TEXT NOT NULL, page INTEGER NOT NULL, facing INTEGER NOT NULL DEFAULT 0, url TEXT NOT NULL, name TEXT NOT NULL, updated_by TEXT NULL DEFAULT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (book_id, page, facing));";
    $namesSettings = database('names', "$oldBooks\n$oldScenes\n$oldEntries\n" . ($mysql ? '' : "CREATE INDEX entries_spread ON entries (book_id, spread_id);\n") . $pageImages);
    $namesDb = connect('names');
    $namesDb->exec("INSERT INTO books (id, title, author, book_json, initial_spread_id, files_json, content_schema, created_at, updated_at)
        VALUES ('old', 'Old', 'Someone', '{\"id\":\"old\",\"title\":\"Old\",\"author\":\"Someone\"}', 's1', '{}', '3.0', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $namesDb->exec("INSERT INTO spreads (book_id, id, position, title, first_page, last_page, data_json) VALUES ('old', 's1', 0, '1–2', 0, 0, '{\"id\":\"s1\",\"label\":\"1–2\"}')");
    $namesDb->exec("INSERT INTO entries (book_id, id, spread_id, position, category, title, page, data_json) VALUES ('old', 'e1', 's1', 0, 'text', 'One', 0, '{}')");
    $namesDb = null;
    $namesApi = startApi($namesSettings + $settings);
    file_get_contents("$namesApi/admin/migrate", false, $context);
    file_get_contents("$namesApi/admin/migrate", false, $context);
    $namesDb = connect('names');
    $tables = array_map('strval', $namesDb->query($mysql ? 'SHOW TABLES' : "SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN));
    check(!in_array('spreads', $tables, true) && in_array('scenes', $tables, true)
        && hasColumn($namesDb, 'scenes', 'label') && !hasColumn($namesDb, 'scenes', 'title') && !hasColumn($namesDb, 'scenes', 'first_page')
        && hasColumn($namesDb, 'entries', 'scene_id') && !hasColumn($namesDb, 'entries', 'spread_id') && !hasColumn($namesDb, 'entries', 'page')
        && hasColumn($namesDb, 'experiences', 'initial_scene') && !hasColumn($namesDb, 'experiences', 'initial_spread_id'),
        'migrated twice: tables and columns renamed once, the page columns gone');
    check($namesDb->query("SELECT label FROM scenes WHERE id = 's1'")->fetchColumn() === '1–2'
        && $namesDb->query("SELECT scene_id FROM entries WHERE id = 'e1'")->fetchColumn() === 's1'
        && $namesDb->query("SELECT initial_scene FROM experiences WHERE id = 'old'")->fetchColumn() === 's1'
        && $namesDb->query("SELECT experience_id FROM page_images")->fetchAll() === [], 'the rows kept their data under the new names (page_images renamed too, unread)');
    $namesDb = null;

    echo "migrate a 2.1 database (content schema 3.0) to the experience (#320)\n";
    $v3 = (string) file_get_contents(__DIR__ . '/fixtures/schema-3.0.' . ($mysql ? 'mysql' : 'sqlite') . '.sql');
    $v3Settings = database('v3', $v3);
    $v3Db = connect('v3');
    $j = static fn(mixed $value): string => $v3Db->quote(json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $v3Db->exec("INSERT INTO users (id, email, language, book_updates, created_at, confirmed_at, updated_at) VALUES ('u3', 'v3@example.com', 'en', 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $v3Db->exec("INSERT INTO login_requests (id, email, token_hash, code_hash, book_updates, ip_hash, created_at, expires_at) VALUES ('r3', 'v3@example.com', 'th3', 'ch3', 1, 'ip', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $v3Db->exec("INSERT INTO progress (user_id, book_id, record, updated_at) VALUES ('u3', 'osct', " . $j(['bookId' => 'osct', 'consulted' => ['e1' => 2]]) . ", 1)");
    $book = ['id' => 'osct', 'title' => 'Onion Skin', 'author' => 'Kévin Bray', 'publisher' => 'Building Fictions', 'sourceOfTruth' => 'digital', 'passes' => []];
    $v3Db->exec("INSERT INTO books (id, title, author, book_json, initial_scene, files_json, content_schema, plugins_json, groups_json, created_at, updated_at)
        VALUES ('osct', 'Onion Skin', 'Kévin Bray', " . $j($book) . ", 's1', '{}', '3.0', '[]', '[]', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $wall = ['id' => 'wall', 'title' => 'A wall', 'author' => 'Nobody', 'sourceOfTruth' => 'print'];
    $v3Db->exec("INSERT INTO books (id, title, author, book_json, initial_scene, files_json, content_schema, created_at, updated_at)
        VALUES ('wall', 'A wall', 'Nobody', " . $j($wall) . ", 's1', '{}', '2.26', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $rule = ['type' => 'behaviour', 'rules' => [['on' => 'found', 'set' => ['scope' => 'book', 'key' => 'seen', 'value' => true]]]];
    $text = ['type' => 'text', 'text' => 'Welcome to {{book.title}} – {{ book.title }}', 'components' => [$rule], 'note' => 'a book and its scope: book'];
    $v3Db->exec("INSERT INTO scenes (book_id, id, position, label, data_json) VALUES ('osct', 's1', 0, '1–2', " . $j(['id' => 's1', 'label' => '1–2', 'surfaces' => [['id' => 'surface', 'widthMm' => 460, 'heightMm' => 320, 'place' => ['x' => 0, 'y' => 0, 'z' => 0, 'rx' => 0, 'ry' => 0, 'rz' => 0]]], 'components' => [$rule]]) . ")");
    $v3Db->exec("INSERT INTO entries (book_id, id, scene_id, position, category, title, data_json) VALUES ('osct', 'e1', 's1', 0, 'text', 'One', " . $j(['id' => 'e1', 'category' => 'text', 'title' => 'One', 'scene' => 's1', 'body' => 'In {{book.title}}', 'tags' => []]) . ")");
    $v3Db->exec("INSERT INTO targets (book_id, id, entry_id, image_src, data_json) VALUES ('osct', 't1', 'e1', 'a.jpg', " . $j(['id' => 't1', 'imageSrc' => 'a.jpg', 'entity' => $text]) . ")");
    $v3Db->exec("INSERT INTO entities (book_id, ref, position, type, data_json) VALUES ('osct', 'sign', 0, 'text', " . $j($text) . ")");
    $v3Db->exec("INSERT INTO book_versions (id, book_id, env, build, hash, published_at) VALUES ('v1', 'osct', 'local', 'abcdefabcdef', 'h', 5)");
    $v3Db->exec("INSERT INTO changes (id, book_id, kind, ref, before_json, after_json, created_at) VALUES ('c1', 'osct', 'book', 'osct', " . $j($book) . ", " . $j(['title' => 'Onion Skin'] + $book) . ", 7)");
    $v3Db->exec("INSERT INTO changes (id, book_id, kind, ref, before_json, after_json, created_at) VALUES ('c2', 'osct', 'entity', 'sign', 'null', " . $j($text) . ", 8)");
    $v3Db->exec("INSERT INTO changes (id, book_id, kind, ref, before_json, after_json, created_at) VALUES ('c3', 'osct', 'plugin', 'p', 'null', " . $j("api.vars.set('x', 1, 'book')") . ", 9)");
    $v3Db->exec("INSERT INTO assets (id, book_id, name, kind, mime, size, sha256, path, url, created_at, updated_at) VALUES ('a1', 'osct', 'a.jpg', 'image', 'image/jpeg', 1, 'sha', 'osct/a1/v1.jpg', 'https://cdn.example/assets/osct/a1/v1.jpg', 1, 1)");
    $v3Db->exec("INSERT INTO plugins (book_id, id, source, created_at, updated_at) VALUES ('osct', 'p', " . $v3Db->quote("export const register = (api) => api.vars.set('x', 1, \"book\");") . ", 1, 1)");
    foreach (['asset_credits' => ['url', 'credits'], 'asset_names' => ['url', 'name']] as $table => [$a, $b]) {
        $v3Db->exec("INSERT INTO $table (book_id, $a, $b, updated_at) VALUES ('osct', 'https://cdn.example/x.jpg', 'x', 1)");
    }
    $v3Db->exec("INSERT INTO surface_references (book_id, scene_id, surface_id, url, name, updated_at) VALUES ('osct', 's1', 'surface', 'https://cdn.example/x.jpg', 'x', 1)");
    $v3Db = null;
    $v3Api = startApi($v3Settings + $settings);
    file_get_contents("$v3Api/admin/migrate", false, $context);
    $v3Db = connect('v3');
    $snapshot = static function (PDO $db) use ($mysql): array {
        $tables = array_map('strval', $db->query($mysql ? 'SHOW TABLES' : "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN));
        sort($tables);
        $rows = [];
        foreach ($tables as $table) $rows[$table] = $db->query("SELECT * FROM $table ORDER BY 1, 2")->fetchAll(PDO::FETCH_ASSOC);
        return $rows;
    };
    $first = $snapshot($v3Db);
    $v3Db = null;
    file_get_contents("$v3Api/admin/migrate", false, $context);
    $v3Db = connect('v3');
    check($snapshot($v3Db) === $first, 'migrated twice: the second run changes nothing');
    $tables = array_keys($first);
    check(!in_array('books', $tables, true) && !in_array('book_versions', $tables, true) && in_array('experiences', $tables, true) && in_array('experience_versions', $tables, true),
        'books → experiences, book_versions → experience_versions');
    $left = [];
    foreach ($tables as $table) {
        foreach (['book_id', 'book_json', 'book_updates'] as $column) if (hasColumn($v3Db, $table, $column)) $left[] = "$table.$column";
    }
    check($left === [] && !hasColumn($v3Db, 'experiences', 'author') && hasColumn($v3Db, 'users', 'buildingfictions_updates') && !hasColumn($v3Db, 'users', 'experience_updates') && hasColumn($v3Db, 'login_requests', 'buildingfictions_updates') && !hasColumn($v3Db, 'login_requests', 'artist_updates'),
        'no book_id, book_json or book_updates left, no author column' . ($left ? ' – ' . implode(', ', $left) : ''));
    $count = static fn(string $table) => count($first[$table]);
    check($count('scenes') === 1 && $count('entries') === 1 && $count('targets') === 1 && $count('entities') === 1 && $count('experience_versions') === 1 && $count('changes') === 3
        && $count('assets') === 1 && $count('plugins') === 1 && $count('asset_credits') === 1 && $count('asset_names') === 1 && $count('surface_references') === 1 && $count('progress') === 1,
        'every row kept');
    $experience = json_decode($v3Db->query("SELECT experience_json FROM experiences WHERE id = 'osct'")->fetchColumn(), true);
    check($experience === ['id' => 'osct', 'title' => 'Onion Skin', 'book' => ['author' => 'Kévin Bray', 'publisher' => 'Building Fictions'], 'passes' => []],
        'the experience: author and publisher in book (after the title), no sourceOfTruth');
    check($v3Db->query("SELECT content_schema FROM experiences WHERE id = 'osct'")->fetchColumn() === '5.1'
        && $v3Db->query("SELECT content_schema FROM experiences WHERE id = 'wall'")->fetchColumn() === '2.26', 'a 3.0 experience is of the current schema (5.1) now, an older one stays refused');
    check(json_decode($v3Db->query("SELECT experience_json FROM experiences WHERE id = 'wall'")->fetchColumn(), true) === ['id' => 'wall', 'title' => 'A wall', 'book' => ['author' => 'Nobody']],
        'an experience without a publisher: book { author }');
    $sign = json_decode($v3Db->query("SELECT data_json FROM entities WHERE ref = 'sign'")->fetchColumn(), true);
    $expectedSign = ['type' => 'text', 'text' => 'Welcome to {{experience.title}} – {{experience.title}}',
        'components' => [['type' => 'behaviour', 'rules' => [['on' => 'found', 'set' => ['scope' => 'experience', 'key' => 'seen', 'value' => true]]]]], 'note' => 'a book and its scope: book'];
    check($sign === $expectedSign, 'an entity: scope book → experience, {{book.title}} → {{experience.title}}, other text unchanged');
    check(json_decode($v3Db->query("SELECT data_json FROM targets WHERE id = 't1'")->fetchColumn(), true)['entity'] === $expectedSign
        && json_decode($v3Db->query("SELECT data_json FROM scenes WHERE id = 's1'")->fetchColumn(), true)['components'] === $expectedSign['components']
        && json_decode($v3Db->query("SELECT data_json FROM entries WHERE id = 'e1'")->fetchColumn(), true)['body'] === 'In {{experience.title}}',
        'a target\'s entity, a scene and an entry the same');
    $changes = [];
    foreach ($first['changes'] as $row) $changes[$row['id']] = $row;
    check($changes['c1']['kind'] === 'experience' && json_decode($changes['c1']['before_json'], true) === $experience
        && json_decode($changes['c2']['after_json'], true) === $expectedSign && $changes['c2']['before_json'] === 'null'
        && json_decode($changes['c3']['after_json'], true) === "api.vars.set('x', 1, 'book')", 'the change log: kind experience, reshaped like the rows (a plugin source untouched)');
    check(json_decode($first['progress'][0]['record'], true) === ['bookId' => 'osct', 'consulted' => ['e1' => 2]] && $first['progress'][0]['experience_id'] === 'osct',
        'a progress record stays as the app wrote it (the reader reads the old one)');
    check(str_contains($first['plugins'][0]['source'], '"book"'), 'a plugin source is never rewritten');
    $v3Db = null;
    // And the API reads it: the list, the tree, the draft, a reader's options, a revert of the old change
    $v3Session = str_repeat('v', 43);
    $v3Db = connect('v3');
    $v3Db->exec("INSERT INTO sessions (id, user_id, token_hash, created_at, last_used_at) VALUES ('s3', 'u3', '" . hash('sha256', $v3Session) . "', '2026-01-01 00:00:00', '2099-01-01 00:00:00')");
    $v3Db->exec("UPDATE users SET role = 'editor' WHERE id = 'u3'");
    $v3Db->exec("INSERT INTO user_roles (user_id, role_id, granted_at) VALUES ('u3', 2, '2026-01-01 00:00:00')");
    $v3Db = null;
    [$status, $data] = call($v3Api, 'GET', '/user', null, $v3Session);
    check($status === 200 && $data['user']['options'] === ['buildingfictions' => true], 'a reader\'s book_updates choice is their buildingfictions option (#325)');
    [$status, $data] = call($v3Api, 'GET', '/editor/experiences/osct', null, $v3Session);
    check($status === 200 && $data['experience']['experience']['book']['author'] === 'Kévin Bray' && count($data['scenes']) === 1 && $data['scenes'][0]['entries'][0]['id'] === 'e1',
        'the migrated experience opens in the editor');
    [$status, $manifest] = call($v3Api, 'GET', '/editor/experiences/osct/draft/latest.json', null, $v3Session);
    check($status === 200 && $manifest['schema'] === '5.1', 'its draft is of the current content schema (5.1)');
    [$status] = call($v3Api, 'GET', '/editor/experiences/wall', null, $v3Session);
    check($status === 409, 'the 2.x experience stays refused (409 old-schema)');
    [$status] = call($oldApi, 'PUT', '/user/password', ['password' => 'a new password'], $oldToken);
    check($status === 200, 'the old user can set a password');
    [$status] = call($oldApi, 'POST', '/auth/password', ['email' => 'old@example.com', 'password' => 'a new password']);
    check($status === 200, 'and sign in with it');

    echo "migrate a 4.x database to content schema 5.0: conditions become expressions (#334)\n";
    $v5Settings = database('v5', (string) file_get_contents("$root/api/db/" . ($mysql ? 'schema.mysql.sql' : 'schema.sqlite.sql')));
    $v5Db = connect('v5');
    $j = static fn(mixed $value): string => $v5Db->quote(json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $behaviour = ['type' => 'behaviour', 'rules' => [
        ['on' => 'found', 'when' => ['hasKey' => true], 'do' => ['hide' => 'hint']],
        ['on' => 'tap', 'when' => ['any' => ['mood' => 'say "hi"', 'tries' => ['not' => 2.5]]], 'do' => 'play'],
        ['on' => 'tap', 'when' => ['doorOpen' => null, 'lamp' => ['not' => null]], 'do' => 'show'],
        ['on' => 'tap', 'when' => new stdClass(), 'do' => 'show'],
        ['on' => 'tap', 'when' => 'already && done', 'do' => 'show'],
        ['on' => 'tap', 'when' => ['and' => true], 'do' => 'show'],
        ['on' => 'sets', 'do' => [['set' => ['mood' => 'say "hi"', 'tries' => 1], 'scope' => 'stage'], ['set' => ['tries' => 2.5, 'flag' => true, 'gone' => null]], ['set' => ['flag' => 'yes']]]],
    ]];
    $expectedSets = ['on' => 'sets', 'do' => [['set' => ['mood' => '"say \"hi\""', 'tries' => 1], 'scope' => 'stage'], ['set' => ['tries' => 2.5, 'flag' => true, 'gone' => null]], ['set' => ['flag' => '"yes"']]]];
    $expected = ['type' => 'behaviour', 'rules' => [
        ['on' => 'found', 'when' => 'hasKey == true', 'do' => ['hide' => 'hint']],
        ['on' => 'tap', 'when' => 'mood == "say \"hi\"" || tries != 2.5', 'do' => 'play'],
        ['on' => 'tap', 'when' => '!doorOpen && lamp', 'do' => 'show'],
        ['on' => 'tap', 'do' => 'show'],
        ['on' => 'tap', 'when' => 'already && done', 'do' => 'show'],
        ['on' => 'tap', 'when' => ['and' => true], 'do' => 'show'],
        $expectedSets,
    ]];
    $node =['type' => 'group', 'assets' => [], 'children' => [['type' => 'text', 'text' => 'x', 'components' => [$behaviour]]]];
    $v5Db->exec("INSERT INTO experiences (id, title, experience_json, initial_scene, files_json, content_schema, created_at, updated_at)
        VALUES ('four', 'Four', " . $j(['id' => 'four', 'title' => 'Four']) . ", 's1', '{}', '4.3', '2026-01-01 00:00:00', '2026-01-01 00:00:00')");
    $v5Db->exec("INSERT INTO scenes (experience_id, id, position, label, data_json) VALUES ('four', 's1', 0, '1–2', " . $j(['id' => 's1', 'label' => '1–2', 'surfaces' => []]) . ")");
    $v5Db->exec("INSERT INTO entities (experience_id, ref, position, type, data_json) VALUES ('four', 'door', 0, 'group', " . $j($node) . ")");
    $v5Db->exec("INSERT INTO entities (experience_id, ref, position, type, data_json) VALUES ('four', 'plain', 1, 'text', " . $j(['type' => 'text', 'assets' => [], 'text' => 'when: never']) . ")");
    $v5Db->exec("INSERT INTO changes (id, experience_id, kind, ref, before_json, after_json, created_at) VALUES ('c5', 'four', 'entity', 'door', 'null', " . $j($node) . ", 8)");
    $v5Db->exec("INSERT INTO changes (id, experience_id, kind, ref, before_json, after_json, created_at) VALUES ('c6', 'four', 'plugin', 'p', 'null', " . $j('{"on":"x","when":{"a":1}}') . ", 9)");
    $v5Db = null;
    $snapshot5 = static function () use ($mysql): array {
        $db = connect('v5');
        $rows = [];
        foreach (['experiences', 'scenes', 'entities', 'changes'] as $table) $rows[$table] = $db->query("SELECT * FROM $table ORDER BY 1, 2")->fetchAll(PDO::FETCH_ASSOC);
        return $rows;
    };
    $planOf = static function () use ($v5Settings, $root): array {
        $env = getenv();
        foreach ($v5Settings as $key => $value) $env["OSCT_$key"] = $value;
        $env['OSCT_CONFIG_FILE'] = '/nonexistent';
        $run = proc_open([PHP_BINARY, "$root/deploy/migrate.php", '--plan-5'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $root, $env);
        $out = stream_get_contents($pipes[1]);
        proc_close($run);
        return json_decode((string) $out, true) ?? ['out' => $out];
    };
    $before5 = $snapshot5();
    $plan = $planOf();
    check(($plan['rows'] ?? null) === ['entities' => 1, 'changes' => 1, 'experiences' => 1] && $plan['schema'] === 1 && $plan['rules'] === 8
        && count($plan['approximate']) === 4 && count($plan['unconvertible']) === 2
        && str_contains($plan['unconvertible'][0]['reason'], '"and"') && $plan['unconvertible'][0]['where'] === 'entities four/door',
        'the dry run (migrate.php --plan-5) counts rows per table, the schema, the conditions, the approximate and unconvertible ones');
    check($plan['sets'] === 4 && $plan['variables'] === ['four' => ['mood' => 'string', 'tries' => 'number']] && $plan['conflicts'] === ['four: flag – boolean, string'],
        'the dry run names the set texts it quotes, the variables it declares and the conflicts (B2, B7)');
    check($snapshot5() === $before5, 'the dry run writes nothing');
    $v5Api = startApi($v5Settings + $settings);
    file_get_contents("$v5Api/admin/migrate", false, $context);
    $first5 = $snapshot5();
    $door = json_decode((string) $first5['entities'][0]['data_json'], true);
    check($door['children'][0]['components'][0] === $expected, 'every condition in a node tree an expression: == / != / && / ||, texts quoted, not set → a truth test, no tests → none, a text kept, an unwritable one kept');
    check($first5['entities'][1]['data_json'] === $before5['entities'][1]['data_json'], 'a row without a rule is not touched');
    check($first5['experiences'][0]['content_schema'] === '5.1', 'a 4.x experience is of the current schema (5.1) now');
    check(json_decode((string) $first5['experiences'][0]['experience_json'], true)['variables'] === ['mood' => ['type' => 'string', 'scope' => 'stage'], 'tries' => ['type' => 'number']],
        'its variables declared from their sets: a type, the scope when every set names the same one; a conflict not declared');
    $changes5 = array_column($first5['changes'], null, 'id');
    check(json_decode((string) $changes5['c5']['after_json'], true)['children'][0]['components'][0] === $expected && $changes5['c6']['after_json'] === $before5['changes'][1]['after_json'],
        'the change log: an entity change converted, a plugin source untouched');
    file_get_contents("$v5Api/admin/migrate", false, $context);
    check($snapshot5() === $first5, 'migrated twice: the second run changes nothing');
    $plan = $planOf();
    check($plan['rules'] === 0 && $plan['sets'] === 0 && $plan['rows'] === [] && $plan['schema'] === 0 && count($plan['unconvertible']) === 2, 'the dry run after it: nothing left to convert, the unwritable ones still listed');

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
