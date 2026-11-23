<?php
declare(strict_types=1);

/**
 * The data step of content schema 6.0 (#341, plugin API 4.0 – Tilman, 2026-11-21: "you use the word hear for events. i
 * think it is listen"): a recorded spec's bus use is `uses.listens` (was `uses.hears`).
 *
 * - `experiences.content_schema`: a 5.x experience becomes 6.0 (the editor reads only 6.x; a 4.x one became 6.0 in
 *   `Migration5` already, before specs had `uses`).
 * - The plugins a configuration declares (`experiences.plugins_json`) and the imported configuration
 *   (`experiences.imported_json`): every object `uses` with a key `hears` gets it as `listens` – the JSON is walked, so a
 *   spec of any kind in `registered` is found. A declared module itself was built against plugin API 3.x and is not
 *   loaded by a 4.0 engine until the experience is published again.
 *
 * Not here: the Code tab's sources (`plugins.source`) – `osct plugins listen` rewrites them through the editor API, with a
 * dry run first (`plan()` lists the sources that still name the word); published versions in the content store – a publish
 * after the migration writes a 6.0 version.
 *
 * Idempotent (a second run finds no 5.x schema and no `hears`) and dry-runnable: `plan()` reports what `run()` would
 * change without writing – `php server/deploy/migrate.php --plan-6`. `Db::migrate` runs it after `Migration5`.
 */
final class Migration6
{
    /** What the last `run()` reported (`Db::migrate` keeps it for `server/deploy/migrate.php`'s line) */
    public static ?array $last = null;

    /**
     * What `run()` would change, without writing: experiences whose schema goes to 6.0, the `uses` renamed per experience
     * and the Code tab sources that still say "hear" (`experience/plugin` – for `osct plugins listen`)
     * @return array{schema: int, uses: array<string, int>, sources: list<string>}
     */
    public static function plan(): array
    {
        return self::walk(false);
    }

    /** Takes every 5.x experience to 6.0 and renames the recorded `uses.hears`; returns the same report as `plan()` */
    public static function run(): array
    {
        return self::walk(true);
    }

    /** @return array{schema: int, uses: array<string, int>, sources: list<string>} */
    private static function walk(bool $apply): array
    {
        $report = ['schema' => 0, 'uses' => [], 'sources' => []];
        if (!Db::hasTable('experiences')) return $report;
        $columns = array_values(array_filter(['plugins_json', 'imported_json'], static fn (string $column) => Db::hasColumn('experiences', $column)));
        $select = implode(', ', array_merge(['id', 'content_schema'], $columns));
        foreach (Db::run("SELECT $select FROM experiences")->fetchAll() as $row) {
            $id = (string) $row['id'];
            $set = [];
            $renamed = 0;
            foreach ($columns as $column) {
                if ($row[$column] === null || !str_contains((string) $row[$column], '"hears"')) continue;
                $value = Editor::decode((string) $row[$column]);
                $count = 0;
                $value = self::rename($value, $count);
                if ($count === 0) continue;
                $renamed += $count;
                $set[$column] = Editor::encode($value);
            }
            if (str_starts_with((string) $row['content_schema'], '5.')) {
                $set['content_schema'] = Editor::CONTENT_SCHEMA;
                $report['schema']++;
            }
            if ($renamed) $report['uses'][$id] = $renamed;
            if (!$set || !$apply) continue;
            $assignments = implode(', ', array_map(static fn (string $column) => "$column = :$column", array_keys($set)));
            Db::run("UPDATE experiences SET $assignments WHERE id = :id", $set + ['id' => $id]);
        }
        if (Db::hasTable('plugins')) {
            foreach (Db::run('SELECT experience_id, id, source FROM plugins ORDER BY experience_id, id')->fetchAll() as $row) {
                if (preg_match('/\bhear(s|d|ing)?\b/i', (string) $row['source'])) $report['sources'][] = "{$row['experience_id']}/{$row['id']}";
            }
        }
        return $report;
    }

    /** The value with every `uses: { hears }` as `uses: { listens }` (the key keeps its place); `$count` counts them */
    private static function rename(mixed $value, int &$count): mixed
    {
        if (is_array($value)) {
            // A loop, not array_map: an arrow function would count into a copy of $count
            foreach ($value as $index => $item) $value[$index] = self::rename($item, $count);
            return $value;
        }
        if (!$value instanceof stdClass) return $value;
        $out = new stdClass();
        foreach (get_object_vars($value) as $key => $item) {
            if ($key === 'uses' && $item instanceof stdClass && property_exists($item, 'hears')) {
                $uses = new stdClass();
                foreach (get_object_vars($item) as $use => $names) $uses->{$use === 'hears' ? 'listens' : $use} = $names;
                $item = $uses;
                $count++;
            }
            $out->{$key} = self::rename($item, $count);
        }
        return $out;
    }
}
