<?php
declare(strict_types=1);

/**
 * Scenes (content schema 3.0, #319 – agents/SCENES.md "Schema 3.0", docs/server.md "Scenes"): an experience is an ordered list of
 * scenes. A scene is a `scenes` row – its order is `scenes.position` and nothing else, its data_json the content's
 * `SceneData` { id, label, group?, surfaces, passes? }, `title` a copy of its label; the page columns of the table are
 * not used (0). The experience's groups live in `experiences.groups_json`, an entry's scene is `entries.scene_id` and its surface in
 * the entry's data_json; a target's `place` names the surface it lies on. Adding, moving or removing a scene changes
 * nothing else.
 *
 * The routes: `GET …/scenes`, `POST …/scenes` (a preset, anywhere), `PUT …/scenes/{id}` (label, group, surfaces, passes),
 * `POST …/scenes/move` (one or several, to a place or into / out of a group – a plan first, `apply: true` writes),
 * `DELETE …/scenes/{id}` (`Experiences::deleteScene`, two steps), `POST …/groups` (a group from picked scenes – plan, then
 * apply), `PUT …/groups/{gid}` (rename), `DELETE …/groups/{gid}` (ungroup: the scenes stay in place and order).
 */
final class Scenes
{
    /** The presets a new scene starts from (`POST …/scenes { preset }`, shared/api/editor.ts `SCENE_PRESETS`) */
    public const PRESETS = ['double', 'single', 'wall'];
    /** A page's size (the book's print format): a double page is twice its width */
    public const PAGE_MM = ['width' => 230, 'height' => 320];
    /** A wall's size */
    public const WALL_MM = ['width' => 2000, 'height' => 1500];
    /** The most surfaces one scene has */
    public const SURFACES_MAX = 32;
    /** The largest coordinate of a place (mm) and turn (degrees) */
    public const PLACE_MAX_MM = 1000000;
    public const PLACE_MAX_DEG = 3600;
    /** The change log's kind of a scene row */
    public const KIND = 'scene';
    /** A label when a request names none */
    public const DEFAULT_LABEL = 'New scene';
    /**
     * Scene ids the editor's own addresses take (`/editor/<experience>/landing/`, #356) – shared/api/names.ts
     * `RESERVED_SCENE_IDS` (mcp/test/php-rules.test.ts compares the two); compared lower-case
     */
    public const RESERVED_IDS = ['landing'];

    // ── Reading ──────────────────────────────────────────────────────────────────────────────────

    /**
     * The experience's scene rows in order (`scenes.position`); `$lock` inside a transaction that writes them back
     * @return list<array<string, mixed>>
     */
    public static function rows(string $experienceId, bool $lock = false): array
    {
        return Db::run('SELECT * FROM scenes WHERE experience_id = :experience ORDER BY position, id' . ($lock ? Db::forUpdate() : ''), ['experience' => $experienceId])->fetchAll();
    }

    /**
     * The rows in order, each scene's data and row by id
     * @return array{rows: list<array<string, mixed>>, data: array<string, stdClass>, row: array<string, array<string, mixed>>}
     */
    public static function context(string $experienceId, bool $lock = false): array
    {
        $rows = self::rows($experienceId, $lock);
        $data = [];
        $byId = [];
        foreach ($rows as $row) {
            $decoded = Editor::decode($row['data_json']);
            $data[(string) $row['id']] = $decoded instanceof stdClass ? $decoded : new stdClass();
            $byId[(string) $row['id']] = $row;
        }
        return ['rows' => $rows, 'data' => $data, 'row' => $byId];
    }

    /** @return list<stdClass> a scene's surfaces */
    public static function surfaces(stdClass $scene): array
    {
        return is_array($scene->surfaces ?? null) ? array_values(array_filter($scene->surfaces, static fn($s) => $s instanceof stdClass)) : [];
    }

    /** @return list<string> the ids of a scene's surfaces */
    public static function surfaceIds(stdClass $scene): array
    {
        return array_values(array_map(static fn(stdClass $s) => (string) ($s->id ?? ''), self::surfaces($scene)));
    }

    /**
     * The experience's groups (`experiences.groups_json`, the content's root `groups`)
     * @param array<string, mixed> $experience the experience row
     * @return list<stdClass>
     */
    public static function groups(array $experience): array
    {
        $groups = Editor::decode($experience['groups_json'] ?? '[]');
        return is_array($groups) ? array_values(array_filter($groups, static fn($g) => $g instanceof stdClass && is_string($g->id ?? null))) : [];
    }

    /**
     * Every scene as the content holds it, in order – a `group` the experience does not have left out
     * @param array{rows: list<array<string, mixed>>, data: array<string, stdClass>} $context
     * @param list<string> $groupIds
     * @return list<stdClass>
     */
    public static function shown(array $context, array $groupIds): array
    {
        $scenes = [];
        foreach ($context['rows'] as $row) {
            $scene = clone $context['data'][(string) $row['id']];
            if (property_exists($scene, 'group') && !in_array($scene->group, $groupIds, true)) unset($scene->group);
            $scenes[] = $scene;
        }
        return $scenes;
    }

    // ── GET …/scenes ─────────────────────────────────────────────────────────────────────────────

    /**
     * GET /editor/experiences/{id}/scenes → { scenes: [SceneData + position, surfaces with `reference` { url, name, fit } | null,
     * entries, targets], groups: [{ id, label, scenes }] }: the experience's scenes in order – `entries` / `targets` how many lie
     * on it; every surface with its reference image (#314, `SurfaceReferences` – editor-only, never in the content)
     */
    public static function list(string $experienceId): never
    {
        Editor::user();
        $experience = Experiences::experienceRow($experienceId);
        Http::json(200, self::overview($experienceId, $experience));
    }

    /**
     * @param array<string, mixed> $experience
     * @return array{scenes: list<array<string, mixed>>, groups: list<array<string, mixed>>}
     */
    public static function overview(string $experienceId, array $experience): array
    {
        $context = self::context($experienceId);
        $groups = self::groups($experience);
        $counts = [];
        foreach (Db::run('SELECT e.scene_id, COUNT(*) AS entries, COUNT(t.id) AS targets FROM entries e LEFT JOIN targets t ON t.experience_id = e.experience_id AND t.entry_id = e.id
                          WHERE e.experience_id = :experience AND e.scene_id IS NOT NULL GROUP BY e.scene_id', ['experience' => $experienceId])->fetchAll() as $row) {
            $counts[(string) $row['scene_id']] = ['entries' => (int) $row['entries'], 'targets' => (int) $row['targets']];
        }
        $references = SurfaceReferences::byScene($experienceId);
        $scenes = [];
        foreach (self::shown($context, array_map(static fn($g) => (string) $g->id, $groups)) as $position => $scene) {
            $id = (string) $scene->id;
            $summary = [];
            foreach (get_object_vars($scene) as $key => $value) {
                $summary[$key] = $key === 'surfaces'
                    ? array_map(static fn(stdClass $s) => (object) (get_object_vars($s) + ['reference' => $references[$id][(string) ($s->id ?? '')] ?? null]), self::surfaces($scene))
                    : $value;
            }
            $scenes[] = $summary + ['position' => $position, 'entries' => $counts[$id]['entries'] ?? 0, 'targets' => $counts[$id]['targets'] ?? 0];
        }
        $byGroup = [];
        foreach ($scenes as $scene) if (isset($scene['group'])) $byGroup[$scene['group']][] = $scene['id'];
        return ['scenes' => $scenes, 'groups' => array_map(static fn(stdClass $g) => ['id' => $g->id, 'label' => (string) ($g->label ?? ''), 'scenes' => $byGroup[$g->id] ?? []], $groups)];
    }

    // ── POST …/scenes ────────────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/experiences/{id}/scenes { preset?, after? | before? | position?, id?, label?, group?, surfaces? } → 201
     * { scene, position }: a new scene anywhere in the order. `preset` (default `double`): `double` – one surface twice the
     * page's width, `single` – one page, `wall` – a wall standing ahead (`rx` 90); `surfaces` replaces the preset's (a
     * surface without `place` lies in a row). The place: after the scene `after`, before `before`, or at `position` (0 =
     * first); none = last. The label: `label`, else "New scene". Its id is `id`, else the first free `scene-<n>`. 400
     * `invalid-scene`, `unknown-scene`, `unknown-group`, `reserved-id` (`RESERVED_IDS`); 409 `duplicate-id`.
     */
    public static function add(string $experienceId): never
    {
        $user = Editor::user();
        $experience = Experiences::experienceRow($experienceId);
        $body = Editor::body();
        $preset = $body->preset ?? 'double';
        if (!in_array($preset, self::PRESETS, true)) throw new ApiError(400, 'invalid-scene', 'preset must be one of ' . implode(', ', self::PRESETS) . ' (a cover is a single scene first in the order).');
        $id = property_exists($body, 'id') ? Editor::id($body->id, 'id') : null;
        if ($id !== null && in_array(strtolower($id), self::RESERVED_IDS, true)) {
            throw new ApiError(400, 'reserved-id', "\"$id\" is the editor's own address for the experience's landing page – a scene needs another id.", ['id' => $id]);
        }
        $placement = self::placement($body);
        [$scene, $position] = Db::transaction(static function () use ($experienceId, $experience, $preset, $id, $placement, $body, $user) {
            $before = self::context($experienceId, true);
            $ids = array_map(static fn(array $row) => (string) $row['id'], $before['rows']);
            if ($id === null) {
                for ($n = 1; in_array("scene-$n", $ids, true); $n++);
                $id = "scene-$n";
            } elseif (in_array($id, $ids, true)) {
                throw new ApiError(409, 'duplicate-id', "A scene \"$id\" exists.");
            }
            $position = self::insertAt($ids, $placement);
            $scene = (object) ['id' => $id, 'label' => self::DEFAULT_LABEL, 'surfaces' => self::presetSurfaces($preset)];
            $fields = new stdClass();
            foreach (['label', 'group', 'surfaces'] as $key) if (property_exists($body, $key)) $fields->{$key} = $body->{$key};
            self::edit($experience, $scene, $fields);
            array_splice($ids, $position, 0, [$id]);
            $json = Editor::encode($scene);
            Db::run('INSERT INTO scenes (experience_id, id, position, label, data_json) VALUES (:experience, :id, :position, :label, :data)',
                ['experience' => $experienceId, 'id' => $id, 'position' => $position, 'label' => $scene->label, 'data' => $json]);
            self::writePositions($experienceId, self::rows($experienceId, true), $ids);
            Experiences::touchExperience($experienceId);
            Experiences::recordChange($experienceId, $user, self::KIND, $id, null, $json);
            return [$scene, $position];
        });
        Http::json(201, ['scene' => $scene, 'position' => $position]);
    }

    /**
     * Where a request places scenes: `after` / `before` (a scene id) or `position` (an index) – at most one, null = none
     * @return array{after?: string, before?: string, position?: int}|null
     */
    public static function placement(stdClass $body): ?array
    {
        $given = array_values(array_filter(['after', 'before', 'position'], static fn(string $key) => property_exists($body, $key) && $body->{$key} !== null));
        if (count($given) > 1) throw new ApiError(400, 'invalid-scene', 'Send one of after, before or position.');
        if (!$given) return null;
        $key = $given[0];
        if ($key === 'position') {
            if (!is_int($body->position) || $body->position < 0) throw new ApiError(400, 'invalid-scene', 'position must be a whole number from 0.');
            return ['position' => $body->position];
        }
        return [$key => Editor::id($body->{$key}, $key)];
    }

    /**
     * The index a new scene goes to (none: last)
     * @param list<string> $ids
     * @param array{after?: string, before?: string, position?: int}|null $placement
     */
    private static function insertAt(array $ids, ?array $placement): int
    {
        if ($placement === null) return count($ids);
        if (isset($placement['position'])) return min($placement['position'], count($ids));
        $anchor = $placement['after'] ?? $placement['before'];
        $index = array_search($anchor, $ids, true);
        if ($index === false) throw new ApiError(400, 'unknown-scene', "No scene \"$anchor\" in this experience.");
        return isset($placement['after']) ? $index + 1 : $index;
    }

    /**
     * A preset's surfaces, placed
     * @return list<stdClass>
     */
    public static function presetSurfaces(string $preset): array
    {
        $place = static fn(float|int $y = 0, int $rx = 0) => (object) ['x' => 0, 'y' => $y, 'z' => 0, 'rx' => $rx, 'ry' => 0, 'rz' => 0];
        return match ($preset) {
            'double' => [(object) ['id' => 'surface', 'widthMm' => 2 * self::PAGE_MM['width'], 'heightMm' => self::PAGE_MM['height'], 'place' => $place()]],
            'single' => [(object) ['id' => 'surface', 'widthMm' => self::PAGE_MM['width'], 'heightMm' => self::PAGE_MM['height'], 'place' => $place()]],
            // Standing on the table at the origin, its face towards the reader
            'wall' => [(object) ['id' => 'wall', 'widthMm' => self::WALL_MM['width'], 'heightMm' => self::WALL_MM['height'], 'place' => $place(self::WALL_MM['height'] / 2, 90)]],
        };
    }

    // ── PUT …/scenes/{id} ────────────────────────────────────────────────────────────────────────

    /**
     * PUT /editor/experiences/{id}/scenes/{sceneId} { label?, group?, surfaces?, passes?, apply? } → { scene, cleared: { entries,
     * targets } }: the scene's label (non-empty text), group (a group of the experience, null takes it out – the scene stays where
     * it is), surfaces (the whole list, places included – a surface without one lies in a row) and post-processing passes
     * (a built-in type or a pass the experience's plugins register; null removes the list – the experience's apply –, `[]` turns them
     * off). Entries and targets that lie on surfaces that go are named first: 409 `surfaces-in-use` { entries, targets },
     * nothing written; with `apply: true` the entries stay on the scene without a surface and the targets lose their
     * `place` (`cleared`, a change each). A target placed without a surface on a scene of one surface keeps lying on it
     * when more surfaces come (its place names it). 400 `invalid-scene`, `unknown-group`; 404.
     */
    public static function put(string $experienceId, string $sceneId): never
    {
        $user = Editor::user();
        $experience = Experiences::experienceRow($experienceId);
        $body = Editor::body();
        $apply = ($body->apply ?? false) === true;
        [$scene, $cleared] = Db::transaction(static function () use ($experienceId, $experience, $sceneId, $body, $user, $apply) {
            $row = Db::one('SELECT * FROM scenes WHERE experience_id = :experience AND id = :id' . Db::forUpdate(), ['experience' => $experienceId, 'id' => $sceneId]);
            if (!$row) throw new ApiError(404, 'not-found', 'No such scene.');
            $scene = Editor::decode($row['data_json']);
            $before = self::surfaceIds($scene);
            $touched = self::edit($experience, $scene, $body);
            if (property_exists($body, 'passes')) {
                if ($body->passes === null) unset($scene->passes);
                else $scene->passes = Experiences::checkPasses($experienceId, $body->passes, 'invalid-scene');
                $touched = true;
            }
            // The scene's rules (content schema 5.0, #334): null removes them; the canvas is stored with them (a publish leaves it out)
            if (property_exists($body, 'logic')) {
                if ($body->logic === null) unset($scene->logic);
                else $scene->logic = Logic::check($body->logic, 'scene', 'logic', 'invalid-scene');
                $touched = true;
            }
            if (!$touched) throw new ApiError(400, 'invalid-scene', 'Send { label }, { group }, { surfaces }, { passes } and / or { logic }.');
            $after = self::surfaceIds($scene);
            $removed = array_values(array_diff($before, $after));
            // The one surface a target placed without one lies on
            $implicit = count($before) === 1 ? $before[0] : null;
            $entries = [];
            $targets = [];
            $named = [];
            foreach (Db::run('SELECT * FROM entries WHERE experience_id = :experience AND scene_id = :scene ORDER BY position, id', ['experience' => $experienceId, 'scene' => $sceneId])->fetchAll() as $entry) {
                $data = Editor::decode($entry['data_json']);
                if (in_array($data->surface ?? null, $removed, true)) $entries[] = ['row' => $entry, 'data' => $data];
                $target = Db::one('SELECT * FROM targets WHERE experience_id = :experience AND entry_id = :entry', ['experience' => $experienceId, 'entry' => $entry['id']]);
                $tData = $target ? Editor::decode($target['data_json']) : null;
                if (!$tData instanceof stdClass || !($tData->place ?? null) instanceof stdClass) continue;
                $on = $tData->place->surface ?? $implicit;
                if (in_array($on, $removed, true)) $targets[] = ['row' => $target, 'data' => $tData];
                elseif (!isset($tData->place->surface) && count($after) > 1 && $on !== null) $named[] = ['row' => $target, 'data' => $tData, 'surface' => $on];
            }
            if (($entries || $targets) && !$apply) {
                throw new ApiError(409, 'surfaces-in-use', 'Entries or targets lie on the surfaces that go (' . implode(', ', $removed) . ') – send again with apply: true to keep the entries on the scene without a surface and take the targets\' place.',
                    ['entries' => array_map(static fn(array $e) => ['id' => $e['row']['id'], 'title' => $e['row']['title'], 'surface' => $e['data']->surface], $entries),
                     'targets' => array_map(static fn(array $t) => ['id' => $t['row']['id'], 'entry' => $t['row']['entry_id'], 'surface' => $t['data']->place->surface ?? $implicit], $targets)]);
            }
            $json = Editor::encode($scene);
            Db::run('UPDATE scenes SET label = :label, data_json = :data WHERE experience_id = :experience AND id = :id', ['label' => $scene->label, 'data' => $json, 'experience' => $experienceId, 'id' => $sceneId]);
            $cleared = ['entries' => [], 'targets' => []];
            foreach ($entries as $e) {
                unset($e['data']->surface);
                $entryJson = Editor::encode($e['data']);
                Db::run('UPDATE entries SET data_json = :data WHERE experience_id = :experience AND id = :id', ['data' => $entryJson, 'experience' => $experienceId, 'id' => $e['row']['id']]);
                Experiences::recordChange($experienceId, $user, 'entry', (string) $e['row']['id'], $e['row']['data_json'], $entryJson);
                $cleared['entries'][] = (string) $e['row']['id'];
            }
            $writeTarget = static function (array $t) use ($experienceId, $user): void {
                $targetJson = Editor::encode($t['data']);
                Db::run('UPDATE targets SET data_json = :data WHERE experience_id = :experience AND id = :id', ['data' => $targetJson, 'experience' => $experienceId, 'id' => $t['row']['id']]);
                Experiences::recordChange($experienceId, $user, 'target', (string) $t['row']['id'], $t['row']['data_json'], $targetJson);
            };
            foreach ($targets as $t) {
                unset($t['data']->place);
                $writeTarget($t);
                $cleared['targets'][] = (string) $t['row']['id'];
            }
            foreach ($named as $t) {
                $t['data']->place = (object) (['surface' => $t['surface']] + get_object_vars($t['data']->place));
                $writeTarget($t);
            }
            // A surface that goes takes its reference image (#314)
            SurfaceReferences::drop($experienceId, $sceneId, $removed, $user);
            Experiences::touchExperience($experienceId);
            Experiences::recordChange($experienceId, $user, self::KIND, $sceneId, $row['data_json'], $json);
            return [$scene, $cleared];
        });
        Http::json(200, ['scene' => $scene, 'cleared' => $cleared]);
    }

    /**
     * Applies a request's `label`, `group` and `surfaces` to the scene (in place); returns whether any was sent. 400
     * `invalid-scene`, `unknown-group`.
     * @param array<string, mixed> $experience
     */
    public static function edit(array $experience, stdClass $scene, stdClass $body): bool
    {
        $touched = false;
        if (property_exists($body, 'label')) {
            if (!is_string($body->label) || trim($body->label) === '') throw new ApiError(400, 'invalid-scene', 'label must be a non-empty text (what the reader shows for the scene).');
            $label = trim($body->label);
            if (mb_strlen($label) > ExperienceTexts::TEXT_MAX_LENGTH) throw new ApiError(400, 'invalid-scene', 'label is longer than ' . ExperienceTexts::TEXT_MAX_LENGTH . ' characters.');
            $scene->label = $label;
            $touched = true;
        }
        if (property_exists($body, 'group')) {
            if ($body->group === null) unset($scene->group);
            else {
                $group = Editor::id($body->group, 'group');
                if (!in_array($group, array_map(static fn($g) => $g->id, self::groups($experience)), true)) throw new ApiError(400, 'unknown-group', "No group \"$group\" in this experience – make it with POST …/groups.");
                $scene->group = $group;
            }
            $touched = true;
        }
        if (property_exists($body, 'surfaces')) {
            $scene->surfaces = self::checkSurfaces($body->surfaces);
            $touched = true;
        }
        // The content's key order: id, label, group, surfaces, then the rest
        $ordered = new stdClass();
        foreach (['id', 'label', 'group', 'surfaces'] as $key) if (property_exists($scene, $key)) $ordered->{$key} = $scene->{$key};
        foreach (get_object_vars($scene) as $key => $value) if (!property_exists($ordered, $key)) $ordered->{$key} = $value;
        foreach (array_keys(get_object_vars($scene)) as $key) unset($scene->{$key});
        foreach (get_object_vars($ordered) as $key => $value) $scene->{$key} = $value;
        return $touched;
    }

    /**
     * A surfaces list as the content holds it (`SurfaceData`, schema 3.0): at least one, each { id, label?, widthMm,
     * heightMm, place? } – a label trimmed and left out when empty; `place` x, y, z (mm) required, rx, ry, rz (degrees)
     * default 0; every surface without a place lies where a row of all the scene's surfaces puts it (`rowPlaces`, as the
     * content build does). 400 `$code`.
     * @return list<stdClass>
     */
    public static function checkSurfaces(mixed $value, string $code = 'invalid-scene'): array
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (!is_array($value) || $value === []) $fail('surfaces must be a list of at least one { id, label?, widthMm, heightMm, place? }.');
        if (count($value) > self::SURFACES_MAX) $fail('A scene has at most ' . self::SURFACES_MAX . ' surfaces.');
        $surfaces = [];
        $ids = [];
        foreach (array_values($value) as $i => $s) {
            $path = "surfaces[$i]";
            if (!$s instanceof stdClass) $fail("$path must be an object { id, label?, widthMm, heightMm, place? }.");
            $id = Editor::id($s->id ?? null, "$path.id");
            if (in_array($id, $ids, true)) $fail("$path.id: \"$id\" is there twice.");
            $ids[] = $id;
            $surface = (object) ['id' => $id];
            if (property_exists($s, 'label') && $s->label !== null) {
                if (!is_string($s->label)) $fail("$path.label must be text.");
                $label = trim($s->label);
                if (mb_strlen($label) > ExperienceTexts::TEXT_MAX_LENGTH) $fail("$path.label is longer than " . ExperienceTexts::TEXT_MAX_LENGTH . ' characters.');
                if ($label !== '') $surface->label = $label;
            }
            foreach (['widthMm', 'heightMm'] as $key) {
                $size = $s->{$key} ?? null;
                if (!(is_int($size) || is_float($size)) || !is_finite((float) $size) || $size <= 0) $fail("$path.$key must be a size in mm (> 0).");
                $surface->{$key} = $size;
            }
            if (property_exists($s, 'place') && $s->place !== null) {
                try {
                    $surface->place = self::checkPlace($s->place, "$path.place");
                } catch (ApiError $error) {
                    $fail($error->getMessage());
                }
            }
            foreach (array_keys(get_object_vars($s)) as $key) {
                if (!in_array($key, ['id', 'label', 'widthMm', 'heightMm', 'place'], true)) $fail("$path.$key is not a field of a surface.");
            }
            $surfaces[] = $surface;
        }
        $row = self::rowPlaces(array_map(static fn(stdClass $s) => (float) $s->widthMm, $surfaces));
        foreach ($surfaces as $i => $surface) if (!isset($surface->place)) $surface->place = $row[$i];
        return $surfaces;
    }

    /**
     * Surfaces laid out in a row (agents/SCENES.md *Arrange in a row*, scripts/src/build/scenes.ts `rowPlaces`): side by
     * side, touching, flat, the row centred on the scene's origin
     * @param list<float> $widths
     * @return list<stdClass>
     */
    public static function rowPlaces(array $widths): array
    {
        $left = -array_sum($widths) / 2;
        $places = [];
        foreach ($widths as $width) {
            $x = round($left + $width / 2, 3);
            $left += $width;
            $places[] = (object) ['x' => $x == (int) $x ? (int) $x : $x, 'y' => 0, 'z' => 0, 'rx' => 0, 'ry' => 0, 'rz' => 0];
        }
        return $places;
    }

    /**
     * A surface's place in the scene (`SurfacePlace`): x, y, z required (mm), rx, ry, rz (degrees, Euler XYZ) default 0 –
     * finite numbers, no other field. 400 `invalid-scene`.
     */
    public static function checkPlace(mixed $value, string $path = 'place'): stdClass
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-scene', $message);
        if (!$value instanceof stdClass) $fail("$path must be an object { x, y, z, rx?, ry?, rz? } (mm, degrees).");
        $place = new stdClass();
        foreach (['x', 'y', 'z', 'rx', 'ry', 'rz'] as $key) {
            $required = in_array($key, ['x', 'y', 'z'], true);
            if (!property_exists($value, $key) || ($value->{$key} === null && !$required)) {
                if ($required) $fail("$path.$key is required (mm).");
                $place->{$key} = 0;
                continue;
            }
            $n = $value->{$key};
            $max = $required ? self::PLACE_MAX_MM : self::PLACE_MAX_DEG;
            if (!(is_int($n) || is_float($n)) || !is_finite((float) $n) || abs($n) > $max) $fail("$path.$key must be a number" . ($required ? ' in mm' : ' in degrees') . " (at most $max either way).");
            $place->{$key} = $n;
        }
        foreach (array_keys(get_object_vars($value)) as $key) {
            if (!in_array($key, ['x', 'y', 'z', 'rx', 'ry', 'rz'], true)) $fail("$path.$key is not a field of a place.");
        }
        return $place;
    }

    // ── POST …/scenes/move ───────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/experiences/{id}/scenes/move { scenes: [ids], after? | before? | position?, group?, apply? } → { plan, applied }:
     * moves one or several scenes as a block (in their present order) – after or before a scene, to `position` (an index
     * among the scenes that stay), or `group`: into that group (after its last scene, unless a place is given) or `null`
     * out of their group (they stay in place unless they sit inside it – then right after it). The plan: `order` (every id
     * in the new order), `moved` (the picked scenes whose place changes), `groups` (scene, from, to). Without `apply: true`
     * nothing is written; with it the order, the groups and a change per row in one transaction. 400 `invalid-move`,
     * `unknown-scene`, `unknown-group`.
     */
    public static function move(string $experienceId): never
    {
        $user = Editor::user();
        $experience = Experiences::experienceRow($experienceId);
        $body = Editor::body();
        $picked = self::picked($body->scenes ?? null, 'invalid-move');
        $placement = self::placement($body);
        $hasGroup = property_exists($body, 'group');
        $group = $hasGroup && $body->group !== null ? Editor::id($body->group, 'group') : null;
        if ($group !== null && !in_array($group, array_map(static fn($g) => $g->id, self::groups($experience)), true)) throw new ApiError(400, 'unknown-group', "No group \"$group\" in this experience.");
        if ($placement === null && !$hasGroup) throw new ApiError(400, 'invalid-move', 'Send where to: after, before, position or group.');
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($experienceId, $picked, $placement, $hasGroup, $group, $apply, $user): array {
            $context = self::context($experienceId, $apply);
            $order = self::orderAfterMove($context, $picked, $placement, $hasGroup, $group);
            $groups = [];
            if ($hasGroup) {
                foreach ($picked as $id) {
                    $from = $context['data'][$id]->group ?? null;
                    if ($from !== $group) $groups[] = ['scene' => $id, 'from' => $from, 'to' => $group];
                }
            }
            $plan = self::plan($context, $order, $picked, $groups);
            if ($apply) self::applyPlan($experienceId, $context, $plan, $user);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply && ($plan['moved'] || $plan['groups'])]);
    }

    /**
     * The scene ids a request picks: 1 or more distinct ids
     * @return list<string>
     */
    private static function picked(mixed $value, string $code): array
    {
        if (!is_array($value) || $value === []) throw new ApiError(400, $code, 'scenes must be a list of scene ids.');
        $ids = [];
        foreach ($value as $i => $id) {
            $id = Editor::id($id, "scenes[$i]");
            if (in_array($id, $ids, true)) throw new ApiError(400, $code, "scenes[$i]: \"$id\" is there twice.");
            $ids[] = $id;
        }
        return $ids;
    }

    /**
     * The order after moving the picked scenes as a block
     * @param array{rows: list<array<string, mixed>>, data: array<string, stdClass>} $context
     * @param list<string> $picked
     * @param array{after?: string, before?: string, position?: int}|null $placement
     * @return list<string>
     */
    private static function orderAfterMove(array $context, array $picked, ?array $placement, bool $hasGroup, ?string $group): array
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        foreach ($picked as $id) if (!in_array($id, $ids, true)) throw new ApiError(400, 'unknown-scene', "No scene \"$id\" in this experience.");
        $block = array_values(array_filter($ids, static fn(string $id) => in_array($id, $picked, true)));
        $rest = array_values(array_filter($ids, static fn(string $id) => !in_array($id, $picked, true)));
        // Where the block starts now, among the scenes that stay
        $here = array_search($block[0], $ids, true);
        $original = count(array_filter(array_slice($ids, 0, (int) $here), static fn(string $id) => !in_array($id, $picked, true)));
        $groupOf = static fn(string $id): ?string => $context['data'][$id]->group ?? null;
        if ($placement !== null) {
            if (isset($placement['position'])) $at = min($placement['position'], count($rest));
            else {
                $anchor = $placement['after'] ?? $placement['before'];
                if (in_array($anchor, $picked, true)) throw new ApiError(400, 'invalid-move', "\"$anchor\" is one of the scenes moved.");
                $index = array_search($anchor, $rest, true);
                if ($index === false) throw new ApiError(400, 'unknown-scene', "No scene \"$anchor\" in this experience.");
                $at = isset($placement['after']) ? $index + 1 : $index;
            }
        } elseif ($group !== null) {
            // Into the group: after its last scene; a group without other scenes – where the block is
            $members = array_keys(array_filter($rest, static fn(string $id) => $groupOf($id) === $group));
            $at = $members ? max($members) + 1 : $original;
        } else {
            // Out of the group: in place – unless scenes of the former group lie on both sides, then right after them
            $former = $groupOf($block[0]);
            $members = $former === null ? [] : array_keys(array_filter($rest, static fn(string $id) => $groupOf($id) === $former));
            $at = $members && min($members) < $original && max($members) >= $original ? max($members) + 1 : $original;
        }
        array_splice($rest, $at, 0, $block);
        return $rest;
    }

    /**
     * A plan of a new order (and group changes)
     * @param array{rows: list<array<string, mixed>>} $context
     * @param list<string> $order
     * @param list<string> $picked
     * @param list<array{scene: string, from: ?string, to: ?string}> $groups
     * @return array{order: list<string>, moved: list<string>, groups: list<array<string, mixed>>}
     */
    private static function plan(array $context, array $order, array $picked, array $groups): array
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        $moved = array_values(array_filter($picked, static fn(string $id) => array_search($id, $ids, true) !== array_search($id, $order, true)));
        return ['order' => $order, 'moved' => $moved, 'groups' => $groups];
    }

    /**
     * Writes a plan inside the transaction that made it: the positions, the scenes' groups, a change per row
     * @param array{rows: list<array<string, mixed>>, row: array<string, array<string, mixed>>} $context
     * @param array{order: list<string>, moved: list<string>, groups: list<array{scene: string, from: ?string, to: ?string}>} $plan
     * @param array<string, mixed> $user
     */
    private static function applyPlan(string $experienceId, array $context, array $plan, array $user): void
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        if ($ids !== $plan['order']) {
            self::writePositions($experienceId, $context['rows'], $plan['order']);
            Experiences::recordChange($experienceId, $user, 'order', $experienceId, Editor::encode($ids), Editor::encode($plan['order']));
        }
        foreach ($plan['groups'] as $change) {
            $row = $context['row'][$change['scene']];
            $scene = Editor::decode($row['data_json']);
            if ($change['to'] === null) unset($scene->group);
            else {
                $scene->group = $change['to'];
                self::edit([], $scene, new stdClass());
            }
            $json = Editor::encode($scene);
            Db::run('UPDATE scenes SET data_json = :data WHERE experience_id = :experience AND id = :id', ['data' => $json, 'experience' => $experienceId, 'id' => $change['scene']]);
            Experiences::recordChange($experienceId, $user, self::KIND, $change['scene'], $row['data_json'], $json);
        }
        if ($ids !== $plan['order'] || $plan['groups']) Experiences::touchExperience($experienceId);
    }

    /**
     * Every scene's position as `$order` says (0…n-1; null = the rows' order) – only the rows whose position changes
     * @param list<array<string, mixed>> $rows
     * @param list<string>|null $order
     */
    public static function writePositions(string $experienceId, array $rows, ?array $order): void
    {
        $order ??= array_map(static fn(array $row) => (string) $row['id'], $rows);
        $current = [];
        foreach ($rows as $row) $current[(string) $row['id']] = (int) $row['position'];
        foreach ($order as $position => $id) {
            if (($current[$id] ?? null) === $position) continue;
            Db::run('UPDATE scenes SET position = :position WHERE experience_id = :experience AND id = :id', ['position' => $position, 'experience' => $experienceId, 'id' => $id]);
        }
    }

    // ── Groups ───────────────────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/experiences/{id}/groups { label, scenes: [ids], id?, apply? } → { plan, applied }: a group of the picked
     * scenes – they come together where the first of them is (in their present order; a scene of another group leaves
     * it). The plan: `group` { id, label }, `order`, `moved`, `groups` (as a move's). Without `apply: true` nothing is
     * written. The id: `id`, else made from the label (`front-matter`), else the first free `group-<n>`. 400
     * `invalid-group`, `unknown-scene`; 409 `duplicate-id`.
     */
    public static function addGroup(string $experienceId): never
    {
        $user = Editor::user();
        $experience = Experiences::experienceRow($experienceId);
        $body = Editor::body();
        $label = self::groupLabel($body->label ?? null);
        $picked = self::picked($body->scenes ?? null, 'invalid-group');
        $existing = array_map(static fn($g) => $g->id, self::groups($experience));
        if (property_exists($body, 'id')) {
            $id = Editor::id($body->id, 'id');
            if (in_array($id, $existing, true)) throw new ApiError(409, 'duplicate-id', "A group \"$id\" exists.");
        } else {
            $id = self::groupId($label, $existing);
        }
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($experienceId, $label, $picked, $id, $apply, $user): array {
            $context = self::context($experienceId, $apply);
            $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
            foreach ($picked as $scene) if (!in_array($scene, $ids, true)) throw new ApiError(400, 'unknown-scene', "No scene \"$scene\" in this experience.");
            // Together where the first of them is
            $first = min(array_map(static fn(string $scene) => (int) array_search($scene, $ids, true), $picked));
            $order = self::orderAfterMove($context, $picked, ['position' => count(array_filter(array_slice($ids, 0, $first), static fn(string $s) => !in_array($s, $picked, true)))], false, null);
            $groups = array_map(static fn(string $scene) => ['scene' => $scene, 'from' => $context['data'][$scene]->group ?? null, 'to' => $id], array_values(array_filter($order, static fn($s) => in_array($s, $picked, true))));
            $plan = ['group' => ['id' => $id, 'label' => $label]] + self::plan($context, $order, $picked, $groups);
            if ($apply) {
                $row = Experiences::experienceRow($experienceId, true);
                self::writeGroups($experienceId, $row, [...self::groups($row), (object) ['id' => $id, 'label' => $label]], $user);
                self::applyPlan($experienceId, $context, $plan, $user);
            }
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply]);
    }

    /**
     * A group's id made from its label (`Front matter` → `front-matter`), else the first free `group-<n>`
     * @param list<string> $existing
     */
    public static function groupId(string $label, array $existing): string
    {
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $label) ?: $label)), '-');
        if ($slug !== '' && strlen($slug) <= 64 && !in_array($slug, $existing, true)) return $slug;
        for ($n = 1; in_array("group-$n", $existing, true); $n++);
        return "group-$n";
    }

    /** PUT /editor/experiences/{id}/groups/{gid} { label } → { group }: renames a group (a change recorded). 400 `invalid-group`, 404 */
    public static function putGroup(string $experienceId, string $groupId): never
    {
        $user = Editor::user();
        Experiences::experienceRow($experienceId);
        $label = self::groupLabel(Editor::body()->label ?? null);
        $group = Db::transaction(static function () use ($experienceId, $groupId, $label, $user) {
            $row = Experiences::experienceRow($experienceId, true);
            $groups = self::groups($row);
            $found = null;
            foreach ($groups as $group) if ($group->id === $groupId) $found = $group;
            if ($found === null) throw new ApiError(404, 'not-found', 'No such group.');
            $found->label = $label;
            self::writeGroups($experienceId, $row, $groups, $user);
            return $found;
        });
        Http::json(200, ['group' => $group]);
    }

    /**
     * DELETE /editor/experiences/{id}/groups/{gid} → { ungrouped, scenes }: ungroups – the group goes, its scenes stay in place
     * and in order, without a group. One step: nothing but the label goes. 404
     */
    public static function deleteGroup(string $experienceId, string $groupId): never
    {
        $user = Editor::user();
        Experiences::experienceRow($experienceId);
        $scenes = Db::transaction(static function () use ($experienceId, $groupId, $user) {
            $row = Experiences::experienceRow($experienceId, true);
            $groups = self::groups($row);
            $kept = array_values(array_filter($groups, static fn($g) => $g->id !== $groupId));
            if (count($kept) === count($groups)) throw new ApiError(404, 'not-found', 'No such group.');
            $scenes = [];
            foreach (self::rows($experienceId, true) as $scene) {
                $data = Editor::decode($scene['data_json']);
                if (($data->group ?? null) !== $groupId) continue;
                unset($data->group);
                $json = Editor::encode($data);
                Db::run('UPDATE scenes SET data_json = :data WHERE experience_id = :experience AND id = :id', ['data' => $json, 'experience' => $experienceId, 'id' => $scene['id']]);
                Experiences::recordChange($experienceId, $user, self::KIND, (string) $scene['id'], $scene['data_json'], $json);
                $scenes[] = (string) $scene['id'];
            }
            self::writeGroups($experienceId, $row, $kept, $user);
            return $scenes;
        });
        Http::json(200, ['ungrouped' => $groupId, 'scenes' => $scenes]);
    }

    private static function groupLabel(mixed $value): string
    {
        if (!is_string($value) || trim($value) === '') throw new ApiError(400, 'invalid-group', 'label must be a non-empty text.');
        $label = trim($value);
        if (mb_strlen($label) > ExperienceTexts::TEXT_MAX_LENGTH) throw new ApiError(400, 'invalid-group', 'label is longer than ' . ExperienceTexts::TEXT_MAX_LENGTH . ' characters.');
        return $label;
    }

    /**
     * The experience's groups written back, with a change (`groups`) – inside the caller's transaction, the experience row locked
     * @param array<string, mixed> $experience
     * @param list<stdClass> $groups
     * @param array<string, mixed> $user
     */
    public static function writeGroups(string $experienceId, array $experience, array $groups, array $user): void
    {
        $json = Editor::encode(array_values($groups));
        Db::run('UPDATE experiences SET groups_json = :groups WHERE id = :id', ['groups' => $json, 'id' => $experienceId]);
        Experiences::touchExperience($experienceId);
        Experiences::recordChange($experienceId, $user, 'groups', $experienceId, (string) ($experience['groups_json'] ?? '[]'), $json);
    }
}
