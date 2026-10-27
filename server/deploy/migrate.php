<?php
/**
 * Deploy step (the container's entrypoint, server/docker/entrypoint.sh): creates the missing tables and columns
 * with the API's settings – OSCT_* environment variables, else api/config.local.php. The same as
 * POST /admin/migrate, without the web server.
 *
 *   OSCT_DB_HOST=… OSCT_DB_PASS=… php server/deploy/migrate.php
 *
 * OSCT_API_DIR points at the api folder when it is not next to this script's parent (the image).
 * Exit 1 when the database is not reachable or a statement fails.
 */
declare(strict_types=1);

$api = getenv('OSCT_API_DIR') ?: dirname(__DIR__) . '/api';
foreach (['Version', 'Config', 'Db'] as $class) {
    require "$api/src/$class.php";
}

try {
    $statements = Db::migrate();
    echo 'osct ' . Version::APP . ": schema up to date ($statements statements)\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'osct: migration failed – ' . $error->getMessage() . "\n");
    exit(1);
}
