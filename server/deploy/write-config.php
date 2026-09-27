<?php
/**
 * Deploy step (.github/workflows/deploy-staging.yml): writes api/config.local.php from environment variables,
 * so the secrets live in GitHub (environment secrets / variables) and never in the repository.
 *
 *   OSCT_DB_PASS=… OSCT_SECRET=… php server/deploy/write-config.php server/api/config.local.php
 *
 * Every OSCT_<KEY> that is set becomes '<KEY>' => value (keys: api/src/Config.php).
 */
declare(strict_types=1);

$target = $argv[1] ?? '';
if ($target === '') {
    fwrite(STDERR, "Usage: php write-config.php <target file>\n");
    exit(1);
}

$config = [];
foreach (getenv() as $name => $value) {
    if (str_starts_with($name, 'OSCT_') && $value !== '') $config[substr($name, 5)] = $value;
}
// Every problem at once; in GitHub Actions also as an annotation (visible on the run page)
$problems = [];
foreach (['DB_NAME', 'DB_USER', 'DB_PASS', 'SECRET', 'APP_URL'] as $required) {
    if (!isset($config[$required])) $problems[] = "Missing OSCT_$required";
}
if (isset($config['SECRET']) && strlen($config['SECRET']) < 32) $problems[] = 'OSCT_SECRET must have at least 32 characters';
if ($problems) {
    foreach ($problems as $problem) {
        fwrite(STDERR, "$problem\n");
        if (getenv('GITHUB_ACTIONS')) echo "::error title=Server configuration::$problem\n";
    }
    exit(1);
}
ksort($config);

file_put_contents($target, "<?php\n// Written by server/deploy/write-config.php – do not edit on the server.\nreturn " . var_export($config, true) . ";\n");
echo 'Wrote ' . count($config) . " settings to $target\n";
