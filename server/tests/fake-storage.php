<?php
/**
 * Test double of bunny.net's Storage API for api-test.php: `php -S 127.0.0.1:<port> fake-storage.php` with
 * STORAGE_DIR (where files land) and STORAGE_KEY (the expected AccessKey header). PUT stores the body under
 * <dir>/<zone>/<path> and answers 201 (400 when its Checksum header is not the body's sha256), GET answers the file (200)
 * or 404, a GET of a folder (a path ending in /) its listing as the Storage API gives it (ObjectName, IsDirectory,
 * Checksum, Length; [] for no folder), anything with the wrong key 401. STORAGE_LOG (optional): every request as a line
 * "METHOD path" – what a publish asked of the zone (#345).
 */
declare(strict_types=1);

$dir = (string) getenv('STORAGE_DIR');
$key = (string) getenv('STORAGE_KEY');
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$file = $dir . '/' . trim(rawurldecode($path), '/');

$log = (string) getenv('STORAGE_LOG');
if ($log !== '') file_put_contents($log, ($_SERVER['REQUEST_METHOD'] ?? '?') . " $path\n", FILE_APPEND | LOCK_EX);
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
        $body = (string) file_get_contents('php://input');
        $checksum = (string) ($_SERVER['HTTP_CHECKSUM'] ?? '');
        if ($checksum !== '' && strtoupper(hash('sha256', $body)) !== $checksum) {
            http_response_code(400);
            echo '{"HttpCode":400,"Message":"Checksum mismatch."}';
            break;
        }
        @mkdir(dirname($file), 0777, true);
        file_put_contents($file, $body);
        http_response_code(201);
        echo '{"HttpCode":201,"Message":"File uploaded."}';
        break;
    case 'GET':
        if (str_ends_with($path, '/')) {
            $list = [];
            foreach (is_dir($file) ? scandir($file) : [] as $name) {
                if ($name === '.' || $name === '..') continue;
                $dirEntry = is_dir("$file/$name");
                $list[] = ['ObjectName' => $name, 'IsDirectory' => $dirEntry, 'Checksum' => $dirEntry ? null : strtoupper(hash_file('sha256', "$file/$name")),
                    'Length' => $dirEntry ? 0 : filesize("$file/$name")];
            }
            header('Content-Type: application/json');
            echo json_encode($list);
            break;
        }
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
