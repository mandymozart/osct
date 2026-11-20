<?php
declare(strict_types=1);

/**
 * The one-off rename of zero-padded ids (#63): `s004-005` → `s4-5`, `s001` → `s1`, `p004-1` → `p4-1`. Never run by
 * `Db::migrate` – only by hand, `server/deploy/rename-ids.php --dry-run | --apply` (docs/server.md "Ids without leading
 * zeros"). Each run renames only what is still padded, so a second one changes nothing.
 *
 * The ids it renames are those an experience's rows hold as ids: scenes, entries, targets, shared entities, the entries'
 * scene, the targets' entry and entity ref, a surface reference's scene, the initial scene and the refs of the change
 * log's entry / scene / target / entity / reference rows (a removed id too, so a revert stays consistent). Everywhere
 * they are stored:
 *
 * - the id columns of `scenes`, `entries`, `targets`, `entities`, `surface_references`, `experiences.initial_scene`,
 *   `changes.ref` (a reference's `<scene>/<surface>` by its scene part);
 * - the JSON of `experiences` (`experience_json`, `groups_json`), of the four content tables (`data_json`) and of the
 *   change log (`before_json` / `after_json`, not of plugin and asset rows): a string that is exactly one of those ids,
 *   an object key that is one, and a link `/scene/<id>` inside any string (a behaviour's goto, an entry's Markdown).
 *
 * Not rewritten: file paths and URLs (`image_src`, the Library's assets, credits and names – a file keeps its place,
 * `entries/p004-1/target.jpg`), published versions (they are built files on the CDN, never rows; the next publish
 * carries the new ids), readers' progress (keyed by the old ids – it starts over, CHANGELOG), plugin sources and the
 * compiled `plugins_json` (code – `pluginsNaming` lists those an author checks).
 *
 * Refused for an experience when a new id is taken already or two padded ids become the same one (`collisions`).
 */
final class IdRename
{
    /** The change kinds whose ref is an id this rename knows */
    private const ID_KINDS = ['entry', 'scene', 'target', 'entity'];
    /** The change kinds whose before / after hold no ids to walk (code, a Library file) */
    private const SKIPPED_KINDS = ['plugin', 'asset'];
    /** The change kind of a surface reference (`SurfaceReferences::KIND`): its ref is `<scene>/<surface>` */
    private const REFERENCE_KIND = 'reference';

    /** `s004-005` → `s4-5`, `p004-1` → `p4-1`, `p004-1-b` → `p4-1-b`; null when the id has no leading zero */
    public static function unpadded(string $id): ?string
    {
        if (!preg_match('/^([sp])(\d+)(?:-(\d+))?(\D.*)?$/', $id, $m)) return null;
        $number = static fn(string $digits): string => ltrim($digits, '0') === '' ? '0' : ltrim($digits, '0');
        $new = $m[1] . $number($m[2]) . (isset($m[3]) && $m[3] !== '' ? '-' . $number($m[3]) : '') . ($m[4] ?? '');
        return $new === $id ? null : $new;
    }

    /**
     * Plans – and with $apply makes – the rename of every experience (or only $only). Each experience is renamed in
     * one transaction, and not at all when it has collisions.
     * @return list<array{experience: string, renames: array<string, string>, collisions: list<string>, rows: array<string, int>, applied: bool}>
     */
    public static function run(bool $apply, ?string $only = null): array
    {
        $ids = $only === null
            ? array_map('strval', Db::run('SELECT id FROM experiences ORDER BY id')->fetchAll(PDO::FETCH_COLUMN))
            : (Db::value('SELECT id FROM experiences WHERE id = :id', ['id' => $only]) !== null ? [$only] : []);
        $report = [];
        foreach ($ids as $experience) {
            $plan = self::plan($experience);
            $plan['applied'] = false;
            if ($apply && $plan['renames'] && !$plan['collisions']) {
                Db::transaction(static function () use ($experience, &$plan): void {
                    // Planned again inside the transaction: what an editor saved meanwhile is renamed too
                    $plan = self::plan($experience, true);
                    if ($plan['collisions']) throw new RuntimeException("$experience: new collisions – " . implode('; ', $plan['collisions']));
                    self::write($experience, $plan['renames']);
                });
                $plan['applied'] = true;
            }
            $report[] = $plan;
        }
        return $report;
    }

    /**
     * The plugin sources that name a padded id (`experience id: plugin id`) – read-only: code is not rewritten, an
     * author checks them in the Code tab
     * @return list<string>
     */
    public static function pluginsNaming(?string $only = null): array
    {
        if (!Db::hasTable('plugins')) return [];
        $found = [];
        foreach (Db::run('SELECT experience_id, id, source FROM plugins ORDER BY experience_id, id')->fetchAll() as $row) {
            if ($only !== null && $row['experience_id'] !== $only) continue;
            if (preg_match('/\b[sp]0\d+(?:-\d+)?\b/', (string) $row['source'])) $found[] = $row['experience_id'] . ': ' . $row['id'];
        }
        return $found;
    }

    /** @return array{experience: string, renames: array<string, string>, collisions: list<string>, rows: array<string, int>} */
    private static function plan(string $experience, bool $lock = false): array
    {
        $params = ['experience' => $experience];
        $for = $lock ? Db::forUpdate() : '';
        $column = static fn(string $sql): array => array_map('strval', array_filter(Db::run($sql . $for, $params)->fetchAll(PDO::FETCH_COLUMN), 'is_string'));
        // The ids of each kind as the rows hold them: a collision is a new id its own kind has already
        $kinds = [
            'scene' => $column('SELECT id FROM scenes WHERE experience_id = :experience'),
            'entry' => $column('SELECT id FROM entries WHERE experience_id = :experience'),
            'target' => $column('SELECT id FROM targets WHERE experience_id = :experience'),
            'entity' => $column('SELECT ref FROM entities WHERE experience_id = :experience'),
        ];
        $referenced = array_merge(
            $column('SELECT scene_id FROM entries WHERE experience_id = :experience'),
            $column('SELECT entry_id FROM targets WHERE experience_id = :experience'),
            $column('SELECT entity_ref FROM targets WHERE experience_id = :experience'),
            $column('SELECT initial_scene FROM experiences WHERE id = :experience'),
        );
        if (Db::hasTable('surface_references')) $referenced = array_merge($referenced, $column('SELECT scene_id FROM surface_references WHERE experience_id = :experience'));
        foreach (Db::run('SELECT kind, ref FROM changes WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            if (in_array($row['kind'], self::ID_KINDS, true)) $referenced[] = (string) $row['ref'];
            elseif ($row['kind'] === self::REFERENCE_KIND) $referenced[] = explode('/', (string) $row['ref'], 2)[0];
        }

        $renames = [];
        foreach (array_unique(array_merge($referenced, ...array_values($kinds))) as $id) {
            $new = self::unpadded($id);
            if ($new !== null) $renames[$id] = $new;
        }
        ksort($renames, SORT_NATURAL);

        $collisions = [];
        foreach ($kinds as $kind => $list) {
            $kept = array_fill_keys(array_filter($list, static fn(string $id) => !isset($renames[$id])), true);
            $seen = [];
            foreach ($list as $id) {
                if (!isset($renames[$id])) continue;
                $new = $renames[$id];
                if (isset($kept[$new])) $collisions[] = "$kind $id → $new: $new exists already";
                elseif (isset($seen[$new])) $collisions[] = "$kind $id → $new: {$seen[$new]} becomes $new too";
                else $seen[$new] = $id;
            }
        }
        return ['experience' => $experience, 'renames' => $renames, 'collisions' => $collisions, 'rows' => $renames ? self::rows($experience, $renames) : []];
    }

    /**
     * The rows each table would change, by table (only tables with a change)
     * @param array<string, string> $renames
     * @return array<string, int>
     */
    private static function rows(string $experience, array $renames): array
    {
        $rows = [];
        foreach (self::updates($experience, $renames) as [$table]) $rows[$table] = ($rows[$table] ?? 0) + 1;
        return $rows;
    }

    /** @param array<string, string> $renames */
    private static function write(string $experience, array $renames): void
    {
        foreach (self::updates($experience, $renames) as [$table, $where, $set]) {
            $assignments = [];
            $params = [];
            foreach ($set as $column => $value) {
                $assignments[] = "$column = :set_$column";
                $params["set_$column"] = $value;
            }
            $conditions = [];
            foreach ($where as $column => $value) {
                $conditions[] = "$column = :where_$column";
                $params["where_$column"] = $value;
            }
            Db::run("UPDATE $table SET " . implode(', ', $assignments) . ' WHERE ' . implode(' AND ', $conditions), $params);
        }
    }

    /**
     * Every row update the rename makes: [table, where (column → old value), set (column → new value)]
     * @param array<string, string> $renames
     * @return list<array{0: string, 1: array<string, string>, 2: array<string, string>}>
     */
    private static function updates(string $experience, array $renames): array
    {
        $params = ['experience' => $experience];
        $id = static fn(?string $value): ?string => $value !== null && isset($renames[$value]) ? $renames[$value] : null;
        $json = static fn(?string $value): ?string => self::json($value, $renames);
        $updates = [];
        $add = static function (string $table, array $where, array $set) use (&$updates): void {
            $set = array_filter($set, static fn($value) => $value !== null);
            if ($set) $updates[] = [$table, $where, $set];
        };

        $row = Db::one('SELECT initial_scene, experience_json, groups_json FROM experiences WHERE id = :experience', $params);
        if ($row) {
            $add('experiences', ['id' => $experience], ['initial_scene' => $id($row['initial_scene']),
                'experience_json' => $json($row['experience_json']), 'groups_json' => $json($row['groups_json'])]);
        }
        foreach (Db::run('SELECT id, data_json FROM scenes WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $add('scenes', ['experience_id' => $experience, 'id' => $row['id']], ['id' => $id($row['id']), 'data_json' => $json($row['data_json'])]);
        }
        foreach (Db::run('SELECT id, scene_id, data_json FROM entries WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $add('entries', ['experience_id' => $experience, 'id' => $row['id']],
                ['id' => $id($row['id']), 'scene_id' => $id($row['scene_id']), 'data_json' => $json($row['data_json'])]);
        }
        foreach (Db::run('SELECT id, entry_id, entity_ref, data_json FROM targets WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $add('targets', ['experience_id' => $experience, 'id' => $row['id']], ['id' => $id($row['id']), 'entry_id' => $id($row['entry_id']),
                'entity_ref' => $id($row['entity_ref']), 'data_json' => $json($row['data_json'])]);
        }
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $add('entities', ['experience_id' => $experience, 'ref' => $row['ref']], ['ref' => $id($row['ref']), 'data_json' => $json($row['data_json'])]);
        }
        if (Db::hasTable('surface_references')) {
            foreach (Db::run('SELECT scene_id, surface_id FROM surface_references WHERE experience_id = :experience', $params)->fetchAll() as $row) {
                $add('surface_references', ['experience_id' => $experience, 'scene_id' => $row['scene_id'], 'surface_id' => $row['surface_id']],
                    ['scene_id' => $id($row['scene_id'])]);
            }
        }
        foreach (Db::run('SELECT id, kind, ref, before_json, after_json FROM changes WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $kind = (string) $row['kind'];
            $ref = null;
            if (in_array($kind, self::ID_KINDS, true)) {
                $ref = $id($row['ref']);
            } elseif ($kind === self::REFERENCE_KIND) {
                $parts = explode('/', (string) $row['ref'], 2);
                if (isset($renames[$parts[0]])) $ref = $renames[$parts[0]] . (isset($parts[1]) ? '/' . $parts[1] : '');
            }
            $walk = !in_array($kind, self::SKIPPED_KINDS, true);
            $add('changes', ['id' => $row['id']], ['ref' => $ref,
                'before_json' => $walk ? $json($row['before_json']) : null, 'after_json' => $walk ? $json($row['after_json']) : null]);
        }
        return $updates;
    }

    /**
     * $value (a *_json column) with the ids renamed, null when nothing changed or it is no JSON
     * @param array<string, string> $renames
     */
    private static function json(?string $value, array $renames): ?string
    {
        if ($value === null || $value === '') return null;
        try {
            $decoded = json_decode($value, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }
        $changed = false;
        $scenes = array_filter(array_keys($renames), static fn(string $id) => $id[0] === 's');
        $link = $scenes ? '#/scene/(' . implode('|', array_map(static fn(string $id) => preg_quote($id, '#'), $scenes)) . ')(?![\w-])#' : null;
        $walked = self::walk($decoded, $renames, $link, $changed);
        return $changed ? Editor::encode($walked) : null;
    }

    /** @param array<string, string> $renames */
    private static function walk(mixed $value, array $renames, ?string $link, bool &$changed): mixed
    {
        if (is_string($value)) {
            if (isset($renames[$value])) {
                $changed = true;
                return $renames[$value];
            }
            if ($link !== null && str_contains($value, '/scene/')) {
                $new = (string) preg_replace_callback($link, static fn(array $m) => '/scene/' . $renames[$m[1]], $value);
                if ($new !== $value) $changed = true;
                return $new;
            }
            return $value;
        }
        if (is_array($value)) {
            foreach ($value as $i => $item) $value[$i] = self::walk($item, $renames, $link, $changed);
            return $value;
        }
        if ($value instanceof stdClass) {
            $out = new stdClass();
            foreach (get_object_vars($value) as $key => $item) {
                $key = (string) $key;
                if (isset($renames[$key])) {
                    $changed = true;
                    $key = $renames[$key];
                }
                $out->$key = self::walk($item, $renames, $link, $changed);
            }
            return $out;
        }
        return $value;
    }
}
