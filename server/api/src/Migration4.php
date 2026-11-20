<?php
declare(strict_types=1);

/**
 * The data step of content schema 4.0 (#320, agents/REFACTOR-EXPERIENCE.md §4), run by `Db::migrate` after the schema
 * file's statements – JSON rewrites, which one SQL statement cannot write for both dialects. Each part changes only what
 * still has the old shape, so a second run changes nothing:
 *
 * - `experiences.experience_json`: the top-level `author` / `publisher` (the printed book) move into `book`
 *   (`{ author, publisher? }`); `sourceOfTruth` is dropped – at the top and inside `book`. No author: no `book`. A 3.x
 *   experience's `content_schema` becomes 4.0.
 * - The behaviour rules in `data_json` of entities, targets, entries and scenes: `scope: "book"` → `"experience"`; text
 *   nodes' `{{book.title}}` → `{{experience.title}}` (the JSON is walked: only `scope` keys and strings change).
 * - The change log: the same in `before_json` / `after_json` – the experience-wide kinds reshaped like the row, the
 *   others walked like their tables – so a revert never writes the old shape back.
 *
 * Progress rows are not rewritten (the reader reads an old record and writes the new one); plugin sources are not
 * either (`pluginsWithBookScope` lists those an author re-saves).
 */
final class Migration4
{
    /** The change kinds whose before / after are the whole experience JSON */
    private const EXPERIENCE_KINDS = ['experience', 'environment', 'passes', 'appearance'];
    /** The change kinds whose before / after are a row's data_json */
    private const ROW_KINDS = ['entity', 'target', 'entry', 'scene'];

    /** @return int rows rewritten */
    public static function run(): int
    {
        if (!Db::hasTable('experiences') || !Db::hasColumn('experiences', 'experience_json')) return 0;
        $count = 0;
        foreach (Db::run('SELECT id, experience_json, content_schema FROM experiences')->fetchAll() as $row) {
            $json = self::rewrite((string) $row['experience_json'], [self::class, 'experience']);
            // A 3.x experience is 4.0 now (its rows are rewritten below); an older MAJOR stays refused as before
            $schema = str_starts_with((string) $row['content_schema'], '3.') ? '4.0' : (string) $row['content_schema']; // Migration5 takes it on to 5.0
            if ($json === null && $schema === $row['content_schema']) continue;
            Db::run('UPDATE experiences SET experience_json = :json, content_schema = :schema WHERE id = :id',
                ['json' => $json ?? $row['experience_json'], 'schema' => $schema, 'id' => $row['id']]);
            $count++;
        }
        foreach (['entities' => 'ref', 'targets' => 'id', 'entries' => 'id', 'scenes' => 'id'] as $table => $key) {
            if (!Db::hasTable($table)) continue;
            $rows = Db::run("SELECT experience_id, $key, data_json FROM $table WHERE data_json LIKE :like", ['like' => '%book%'])->fetchAll();
            foreach ($rows as $row) {
                $json = self::rewrite((string) $row['data_json'], [self::class, 'rules']);
                if ($json === null) continue;
                Db::run("UPDATE $table SET data_json = :json WHERE experience_id = :experience AND $key = :key",
                    ['json' => $json, 'experience' => $row['experience_id'], 'key' => $row[$key]]);
                $count++;
            }
        }
        if (Db::hasTable('changes')) {
            // The experience-wide kinds all (their old shape has no word to find), the others where "book" occurs
            $rows = Db::run('SELECT id, kind, before_json, after_json FROM changes WHERE kind IN (:k1, :k2, :k3, :k4) OR before_json LIKE :before OR after_json LIKE :after',
                ['k1' => self::EXPERIENCE_KINDS[0], 'k2' => self::EXPERIENCE_KINDS[1], 'k3' => self::EXPERIENCE_KINDS[2], 'k4' => self::EXPERIENCE_KINDS[3],
                    'before' => '%book%', 'after' => '%book%'])->fetchAll();
            foreach ($rows as $row) {
                $shape = in_array($row['kind'], self::EXPERIENCE_KINDS, true) ? [self::class, 'experience']
                    : (in_array($row['kind'], self::ROW_KINDS, true) ? [self::class, 'rules'] : null);
                if ($shape === null) continue;
                $before = $row['before_json'] === null ? null : self::rewrite((string) $row['before_json'], $shape);
                $after = $row['after_json'] === null ? null : self::rewrite((string) $row['after_json'], $shape);
                if ($before === null && $after === null) continue;
                Db::run('UPDATE changes SET before_json = :before, after_json = :after WHERE id = :id',
                    ['before' => $before ?? $row['before_json'], 'after' => $after ?? $row['after_json'], 'id' => $row['id']]);
                $count++;
            }
        }
        return $count;
    }

    /**
     * The plugin sources that name the scope "book" (`experience id: plugin id`) – read-only: an author re-saves them in
     * the Code tab with "experience"
     * @return list<string>
     */
    public static function pluginsWithBookScope(): array
    {
        if (!Db::hasTable('plugins')) return [];
        $found = [];
        foreach (Db::run('SELECT experience_id, id, source FROM plugins WHERE source LIKE :like', ['like' => '%book%'])->fetchAll() as $row) {
            if (preg_match('/(["\'`])book\1/', (string) $row['source'])) $found[] = $row['experience_id'] . ': ' . $row['id'];
        }
        return $found;
    }

    /** $json rewritten by $shape, or null when nothing changed (or it is no JSON object / list) */
    private static function rewrite(string $json, callable $shape): ?string
    {
        $value = json_decode($json);
        if (!is_object($value) && !is_array($value)) return null;
        $changed = false;
        $value = $shape($value, $changed);
        return $changed ? Editor::encode($value) : null;
    }

    /** An experience (3.0 `BookData`): the print data into `book`, no `sourceOfTruth`, its rules walked */
    public static function experience(mixed $experience, bool &$changed): mixed
    {
        if (!$experience instanceof stdClass) return self::rules($experience, $changed);
        $author = $experience->author ?? null;
        $publisher = $experience->publisher ?? null;
        if (property_exists($experience, 'author') || property_exists($experience, 'publisher') || property_exists($experience, 'sourceOfTruth')) {
            $changed = true;
            $book = $experience->book ?? null;
            if (!$book instanceof stdClass && is_string($author) && $author !== '') {
                $book = (object) ['author' => $author];
                if (is_string($publisher) && $publisher !== '') $book->publisher = $publisher;
            }
            $out = new stdClass();
            foreach (get_object_vars($experience) as $key => $value) {
                if (in_array($key, ['author', 'publisher', 'sourceOfTruth', 'book'], true)) continue;
                $out->$key = $value;
                // the printed book right after the title, as experience.yaml has it
                if ($key === 'title' && $book instanceof stdClass) $out->book = $book;
            }
            if ($book instanceof stdClass && !isset($out->book)) $out->book = $book;
            $experience = $out;
        }
        if (isset($experience->book) && $experience->book instanceof stdClass && property_exists($experience->book, 'sourceOfTruth')) {
            unset($experience->book->sourceOfTruth);
            $changed = true;
        }
        return self::rules($experience, $changed);
    }

    /** Any JSON: every `scope: "book"` → `"experience"`, every `{{book.title}}` → `{{experience.title}}` */
    public static function rules(mixed $value, bool &$changed): mixed
    {
        if (is_string($value)) {
            $new = preg_replace('/\{\{\s*book\.title\s*\}\}/', '{{experience.title}}', $value);
            if ($new !== $value) $changed = true;
            return $new;
        }
        if (is_array($value)) {
            foreach ($value as $i => $item) $value[$i] = self::rules($item, $changed);
            return $value;
        }
        if ($value instanceof stdClass) {
            foreach (get_object_vars($value) as $key => $item) {
                if ($key === 'scope' && $item === 'book') {
                    $value->$key = 'experience';
                    $changed = true;
                } else {
                    $value->$key = self::rules($item, $changed);
                }
            }
        }
        return $value;
    }
}
