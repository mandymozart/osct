<?php
/**
 * Deploy step (the container's entrypoint, server/docker/entrypoint.sh): creates the missing tables and columns
 * with the API's settings – OSCT_* environment variables, else api/config.local.php. The same as
 * POST /admin/migrate, without the web server.
 *
 *   OSCT_DB_HOST=… OSCT_DB_PASS=… php server/deploy/migrate.php
 *   php server/deploy/migrate.php --plan-5     a dry run of content schema 5.0's data step (Migration5): what it would
 *                                              change (rows per table, conditions, the ones it cannot convert) as JSON –
 *                                              nothing is written, no schema statement runs
 *   php server/deploy/migrate.php --plan-6     a dry run of content schema 6.0's data step (Migration6, #341): the
 *                                              experiences that go to 6.0, the recorded uses.hears renamed, the plugin
 *                                              sources that still say "hear" (osct plugins listen rewrites those)
 *
 * OSCT_API_DIR points at the api folder when it is not next to this script's parent (the image).
 * Exit 1 when the database is not reachable or a statement fails.
 */
declare(strict_types=1);

$api = getenv('OSCT_API_DIR') ?: dirname(__DIR__) . '/api';
foreach (['Version', 'Config', 'Paths', 'Db', 'Editor', 'Migration4', 'Migration5', 'Migration6'] as $class) {
    require "$api/src/$class.php";
}

try {
    if (in_array('--plan-5', $argv, true)) {
        echo json_encode(Migration5::plan(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
        exit(0);
    }
    if (in_array('--plan-6', $argv, true)) {
        echo json_encode(Migration6::plan(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "
";
        exit(0);
    }
    $statements = Db::migrate();
    echo 'osct ' . Version::APP . ": schema up to date ($statements statements)\n";
    $five = Migration5::$last;
    if ($five && ($five['rules'] || $five['schema'] || $five['unconvertible'])) {
        echo "osct: content schema 5.0 – {$five['rules']} conditions → expressions, {$five['schema']} experiences → 5.0"
            . ($five['unconvertible'] ? ', ' . count($five['unconvertible']) . ' conditions left as they were (php server/deploy/migrate.php --plan-5 lists them)' : '') . "\n";
    }
    $six = Migration6::$last;
    if ($six && ($six['schema'] || $six['uses'] || $six['sources'])) {
        echo "osct: content schema 6.0 – {$six['schema']} experiences → 6.0, " . array_sum($six['uses']) . ' recorded uses.hears → uses.listens'
            . ($six['sources'] ? ', ' . count($six['sources']) . ' plugin sources still say "hear" (osct plugins listen --all rewrites them)' : '') . "
";
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'osct: migration failed – ' . $error->getMessage() . "\n");
    exit(1);
}
