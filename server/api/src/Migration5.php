<?php
declare(strict_types=1);

/**
 * The data step of content schema 5.0 (#334): every behaviour rule's `when` in the object form of 2.19–4.x becomes an
 * expression – the rules of `scripts/src/convert-content-5.ts` (its tests and this class's in server/tests/api-test.php
 * check the same cases):
 *
 * - each test `name: value` → `name == value`, `name: { not: value }` → `name != value` (a text in double quotes with `\"`
 *   and `\\`, numbers and true / false as they are); the plain form's tests joined with ` && `, `{ any: … }`'s with ` || `;
 * - `name: null` → `!name`, `name: { not: null }` → `name` – approximate (the language has no "not set"), counted apart;
 * - a test it cannot write (a variable named like a word of the language, a value that is no text, number or true / false)
 *   leaves the condition as it is – listed with the reason; the editor then shows the rule's problem and an author
 *   rewrites it.
 *
 * Where: `experiences.experience_json` (whose 4.x `content_schema` becomes 5.0 – the editor reads only 5.x), the
 * `data_json` of entities, targets, entries and scenes, and the change log's `before_json` / `after_json` (so a revert
 * never writes the old shape back). Any object with a text `on` and an object `when` is a rule – the JSON is walked, so
 * a behaviour anywhere in a node tree is found. Published versions in the content store are not rewritten: a publish
 * after the migration writes a 5.0 version.
 *
 * Idempotent (a text `when` is never touched; a second run changes nothing) and dry-runnable: `plan()` counts what `run()`
 * would change without writing – `php server/deploy/migrate.php --plan-5`. `Db::migrate` runs it after `Migration4`, so
 * every deploy (the container's entrypoint, `server/deploy/migrate.php`) and `POST /admin/migrate` apply it.
 */
final class Migration5
{
    /** The change kinds whose before / after are the whole experience JSON (Reverts::EXPERIENCE_KINDS) */
    private const EXPERIENCE_KINDS = ['experience', 'environment', 'passes', 'appearance', 'logic'];
    /** The change kinds whose before / after are a row's data_json */
    private const ROW_KINDS = ['entity', 'target', 'entry', 'scene'];
    /** What the last `run()` reported (`Db::migrate` keeps it for `server/deploy/migrate.php`'s line) */
    public static ?array $last = null;
    /** The words of the expression language a variable cannot be named (shared/text/expressions.ts) */
    private const WORDS = ['and', 'or', 'not', 'mod', 'true', 'false'];

    /**
     * What `run()` would change, without writing: rows per table, experiences whose schema goes to 5.0, the conditions
     * converted, the approximate ones and the ones it cannot convert (where, the condition, why)
     * @return array{rows: array<string, int>, schema: int, rules: int, approximate: list<string>, unconvertible: list<array{where: string, when: mixed, reason: string}>}
     */
    public static function plan(): array
    {
        return self::walk(false);
    }

    /** Converts every condition it can; returns the same report as `plan()` */
    public static function run(): array
    {
        return self::walk(true);
    }

    /** @return array{rows: array<string, int>, schema: int, rules: int, approximate: list<string>, unconvertible: list<array{where: string, when: mixed, reason: string}>} */
    private static function walk(bool $apply): array
    {
        $report = ['rows' => [], 'schema' => 0, 'rules' => 0, 'approximate' => [], 'unconvertible' => []];
        if (!Db::hasTable('experiences') || !Db::hasColumn('experiences', 'experience_json')) return $report;
        $count = static function (string $table) use (&$report): void {
            $report['rows'][$table] = ($report['rows'][$table] ?? 0) + 1;
        };

        foreach (Db::run('SELECT id, experience_json, content_schema FROM experiences')->fetchAll() as $row) {
            $json = self::rewrite((string) $row['experience_json'], "experience {$row['id']}", $report);
            $schema = str_starts_with((string) $row['content_schema'], '4.') ? Editor::CONTENT_SCHEMA : (string) $row['content_schema'];
            if ($schema !== $row['content_schema']) $report['schema']++;
            if ($json === null && $schema === $row['content_schema']) continue;
            $count('experiences');
            if ($apply) {
                Db::run('UPDATE experiences SET experience_json = :json, content_schema = :schema WHERE id = :id',
                    ['json' => $json ?? $row['experience_json'], 'schema' => $schema, 'id' => $row['id']]);
            }
        }
        foreach (['entities' => 'ref', 'targets' => 'id', 'entries' => 'id', 'scenes' => 'id'] as $table => $key) {
            if (!Db::hasTable($table)) continue;
            $rows = Db::run("SELECT experience_id, $key, data_json FROM $table WHERE data_json LIKE :like", ['like' => '%"when"%'])->fetchAll();
            foreach ($rows as $row) {
                $json = self::rewrite((string) $row['data_json'], "$table {$row['experience_id']}/{$row[$key]}", $report);
                if ($json === null) continue;
                $count($table);
                if ($apply) {
                    Db::run("UPDATE $table SET data_json = :json WHERE experience_id = :experience AND $key = :key",
                        ['json' => $json, 'experience' => $row['experience_id'], 'key' => $row[$key]]);
                }
            }
        }
        if (Db::hasTable('changes')) {
            $rows = Db::run('SELECT id, kind, before_json, after_json FROM changes WHERE before_json LIKE :before OR after_json LIKE :after',
                ['before' => '%"when"%', 'after' => '%"when"%'])->fetchAll();
            foreach ($rows as $row) {
                if (!in_array($row['kind'], self::EXPERIENCE_KINDS, true) && !in_array($row['kind'], self::ROW_KINDS, true)) continue;
                $where = "change {$row['id']} ({$row['kind']})";
                $before = $row['before_json'] === null ? null : self::rewrite((string) $row['before_json'], $where, $report);
                $after = $row['after_json'] === null ? null : self::rewrite((string) $row['after_json'], $where, $report);
                if ($before === null && $after === null) continue;
                $count('changes');
                if ($apply) {
                    Db::run('UPDATE changes SET before_json = :before, after_json = :after WHERE id = :id',
                        ['before' => $before ?? $row['before_json'], 'after' => $after ?? $row['after_json'], 'id' => $row['id']]);
                }
            }
        }
        return $report;
    }

    /** $json with its conditions converted, or null when nothing changed (or it is no JSON object / list) */
    private static function rewrite(string $json, string $where, array &$report): ?string
    {
        $value = json_decode($json);
        if (!is_object($value) && !is_array($value)) return null;
        $changed = false;
        $value = self::rules($value, $where, $changed, $report);
        return $changed ? Editor::encode($value) : null;
    }

    /** Any JSON: every rule's (an object with a text `on`) object `when` → an expression */
    private static function rules(mixed $value, string $where, bool &$changed, array &$report): mixed
    {
        if (is_array($value)) {
            foreach ($value as $i => $item) $value[$i] = self::rules($item, $where, $changed, $report);
            return $value;
        }
        if (!$value instanceof stdClass) return $value;
        if (is_string($value->on ?? null) && property_exists($value, 'when') && ($value->when instanceof stdClass || is_array($value->when))) {
            $converted = self::expression($value->when);
            if (isset($converted['error'])) {
                $report['unconvertible'][] = ['where' => $where, 'when' => $value->when, 'reason' => $converted['error']];
            } else {
                $report['rules']++;
                foreach ($converted['approximate'] as $name) $report['approximate'][] = "$where: $name";
                // No tests: the rule runs always – the field goes
                if ($converted['expression'] === null) unset($value->when);
                else $value->when = $converted['expression'];
                $changed = true;
            }
        }
        foreach (get_object_vars($value) as $key => $item) {
            if ($key !== 'when') $value->$key = self::rules($item, $where, $changed, $report);
        }
        return $value;
    }

    /**
     * A condition of 2.19–4.x as an expression (null: no tests), with the not-set tests that became truth tests – or why not
     * @return array{expression: ?string, approximate: list<string>}|array{error: string}
     */
    public static function expression(mixed $when): array
    {
        if (is_array($when) && $when === []) return ['expression' => null, 'approximate' => []];
        if (!$when instanceof stdClass) return ['error' => 'not a condition: ' . Editor::encode($when)];
        $keys = array_keys(get_object_vars($when));
        $any = $keys === ['any'] && $when->any instanceof stdClass;
        $tests = get_object_vars($any ? $when->any : $when);
        $parts = [];
        $approximate = [];
        foreach ($tests as $name => $raw) {
            $name = (string) $name;
            if (!preg_match('/^[a-z][a-zA-Z0-9]{0,39}$/', $name) || in_array($name, self::WORDS, true)) {
                return ['error' => "the variable \"$name\" cannot be named in an expression (a word of the language, or no camelCase name)"];
            }
            $negated = $raw instanceof stdClass && array_keys(get_object_vars($raw)) === ['not'];
            $value = $negated ? $raw->not : $raw;
            if ($value === null) {
                $parts[] = $negated ? $name : "!$name";
                $approximate[] = $name;
            } elseif (is_string($value) || is_bool($value) || is_int($value) || (is_float($value) && is_finite($value))) {
                $parts[] = $name . ($negated ? ' != ' : ' == ') . self::literal($value);
            } else {
                return ['error' => "the test of \"$name\" has no value an expression can write: " . Editor::encode($raw)];
            }
        }
        return ['expression' => $parts ? implode($any ? ' || ' : ' && ', $parts) : null, 'approximate' => $approximate];
    }

    /** A value as an expression's literal (shared/text/expressions.ts `expressionLiteral`) */
    public static function literal(string|int|float|bool $value): string
    {
        if (is_string($value)) return '"' . preg_replace('/(["\\\\])/', '\\\\$1', $value) . '"';
        if (is_bool($value)) return $value ? 'true' : 'false';
        if (is_int($value)) return (string) $value;
        // As the language prints a number: whole ones plain, fractions without float noise
        return floor($value) === $value && abs($value) < 1e15 ? (string) (int) $value : (string) (float) sprintf('%.12g', $value);
    }
}
