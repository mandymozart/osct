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
        'LOGIN_MAX_PER_EMAIL_HOUR' => '4',
    ];
    $api = startApi($settings);

    echo "health, CORS\n";
    [$status, $data, $headers] = call($api, 'GET', '/health');
    check($status === 200 && $data['db'] === 'ok', 'health answers with the database');
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
