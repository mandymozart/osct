<?php
/**
 * Test double of bunny.net's Storage API for api-test.php: `php -S 127.0.0.1:<port> fake-storage.php` with
 * STORAGE_DIR (where files land) and STORAGE_KEY (the expected AccessKey header). PUT stores the body under
 * <dir>/<zone>/<path> and answers 201, GET answers the file (200) or 404, anything with the wrong key 401.
 */
declare(strict_types=1);

$dir = (string) getenv('STORAGE_DIR');
$key = (string) getenv('STORAGE_KEY');
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$file = $dir . '/' . trim(rawurldecode($path), '/');

if (($_SERVER['HTTP_ACCESSKEY'] ?? '') !== $key) {
    http_response_code(401);
    exit;
}
if (str_contains($path, '..')) {
    http_response_code(400);
    exit;
}
switch ($_SERVER['REQUEST_METHOD']) {
    case 'PUT':
        @mkdir(dirname($file), 0777, true);
        file_put_contents($file, (string) file_get_contents('php://input'));
        http_response_code(201);
        echo '{"HttpCode":201,"Message":"File uploaded."}';
        break;
    case 'GET':
        if (!is_file($file)) {
            http_response_code(404);
            break;
        }
        header('Content-Type: application/json');
        readfile($file);
        break;
    default:
        http_response_code(405);
}
