<?php
/**
 * One-off (#63): renames the zero-padded ids in the database – `s004-005` → `s4-5`, `p004-1` → `p4-1` (`IdRename`).
 * Never part of a deploy: run it by hand, a dry run first. With the API's settings (OSCT_* environment variables, else
 * api/config.local.php), like migrate.php:
 *
 *   php server/deploy/rename-ids.php --dry-run [--experience ID]   what would change: rows per table, a sample of renames,
 *                                                                  collisions; writes nothing
 *   php server/deploy/rename-ids.php --apply [--experience ID]     renames, one transaction per experience
 *
 * In the image: `kamal app exec -d <destination> 'php /opt/osct/rename-ids.php --dry-run'` (docs/server.md).
 * Idempotent: what is renamed already is not found again. An experience with a collision (a new id taken already, or
 * two padded ids that become the same one) is refused and left as it is.
 * Exit 0 = done (or nothing to do), 1 = error, 2 = collisions (nothing of those experiences written).
 */
declare(strict_types=1);

$api = getenv('OSCT_API_DIR') ?: dirname(__DIR__) . '/api';
foreach (['Version', 'Config', 'Paths', 'Db', 'Editor', 'Migration4', 'IdRename'] as $class) {
    require_once "$api/src/$class.php";
}

$args = array_slice($argv, 1);
$apply = in_array('--apply', $args, true);
$dry = in_array('--dry-run', $args, true);
$only = null;
foreach ($args as $i => $arg) {
    if ($arg === '--experience') $only = $args[$i + 1] ?? null;
    elseif (str_starts_with($arg, '--experience=')) $only = substr($arg, 13);
}
if ($apply === $dry || ($only === '' || (in_array('--experience', $args, true) && $only === null))) {
    fwrite(STDERR, "usage: php rename-ids.php --dry-run|--apply [--experience ID]\n");
    exit(1);
}

try {
    $report = IdRename::run($apply, $only);
    if ($only !== null && !$report) {
        fwrite(STDERR, "osct: no experience $only\n");
        exit(1);
    }
    $refused = 0;
    echo 'osct ' . Version::APP . ': ids without leading zeros (#63) – ' . ($apply ? 'apply' : 'dry run, nothing written') . "\n";
    foreach ($report as $plan) {
        $count = count($plan['renames']);
        echo "\n{$plan['experience']}: $count padded ids";
        if (!$count) {
            echo " – nothing to do\n";
            continue;
        }
        $kinds = ['s' => 0, 'p' => 0];
        foreach (array_keys($plan['renames']) as $id) $kinds[$id[0]]++;
        echo " ({$kinds['s']} scene, {$kinds['p']} entry / target / entity)\n";
        echo "  rows" . ($apply && $plan['applied'] ? ' changed' : ' to change') . ":\n";
        foreach ($plan['rows'] as $table => $rows) printf("    %-20s %d\n", $table, $rows);
        echo "  sample:\n";
        foreach (array_slice($plan['renames'], 0, 8, true) as $old => $new) echo "    $old → $new\n";
        if ($count > 8) echo "    … and " . ($count - 8) . " more\n";
        if ($plan['collisions']) {
            $refused++;
            echo "  REFUSED – " . count($plan['collisions']) . " collisions, nothing of this experience " . ($apply ? 'written' : 'would be written') . ":\n";
            foreach ($plan['collisions'] as $collision) echo "    $collision\n";
        } elseif ($apply) {
            echo "  renamed\n";
        }
    }
    $plugins = IdRename::pluginsNaming($only);
    if ($plugins) echo "\nplugin sources that name a padded id (code is not rewritten – check them in the Code tab):\n  " . implode("\n  ", $plugins) . "\n";
    echo "\nnot rewritten: published versions (the next publish carries the new ids), readers' progress (starts over), file paths\n";
    exit($refused ? 2 : 0);
} catch (Throwable $error) {
    fwrite(STDERR, 'osct: rename failed – ' . $error->getMessage() . "\n");
    exit(1);
}
