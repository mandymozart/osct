<?php
declare(strict_types=1);

/**
 * A publisher's delivery through the API (#322, docs/server.md "Deliveries"): `POST /editor/experiences/{id}/deliveries`
 * takes a **delivery plan** – the scenes its entries need, the entries with their targets, and the files they name as
 * Library files already uploaded (an asset's id or URL; the uploads stay the Assets API's job) – and compares it with
 * the draft. Without `apply: true` nothing is written: the answer is the comparison per item (`new`, `changed`, `same`,
 * `conflict`) with the problems that stop it. With `apply: true` the comparison is made again inside one transaction and
 * written: every write a change of the log with the delivery's id (`changes.delivery_id`), the delivery itself a row of
 * `deliveries` (its name, source, plan and counts). The changes are the rows' own kinds (`scene`, `entry`, `target`), so
 * the revert (`Reverts`) finds them and the later edits of the same rows like any save, and takes a delivery back –
 * its new rows too.
 *
 * The rules (the content folder's import before it, `scripts/src/import-delivery.ts`):
 * - A scene that exists is kept as it is; a new one is placed after the plan's scene before it (or before the one after
 *   it), else at the end – the plan lists its scenes in the book's order.
 * - An entry that exists keeps its texts, category and scene – only its picture (`image`) follows the delivery. A new
 *   entry gets the plan's texts.
 * - A target's printed image and its video follow the delivery when the file differs (another file is another URL: the
 *   Library keeps one file per content, by sha256). `enabled: false` switches a new target off; an existing target keeps
 *   its switch.
 * - A **conflict** is an item the delivery would change whose same fields were edited outside a delivery since the last
 *   delivery that wrote that row (none: since the experience's import) – read from the change log. A conflict is listed
 *   and left as it is, unless the request sends `overwrite: true`.
 * - A scene has at most MAX_TARGETS_PER_SCENE targets switched on (RULES #3): a delivery that adds targets beyond it is a
 *   problem. Problems stop `apply` (409 `delivery-problems`, with the comparison).
 */
final class Deliveries
{
    /** At most this many targets switched on per scene – the engine tracks 4 at once (RULES #3; shared/api/rules.ts `MAX_TARGETS_PER_SCENE`) */
    public const MAX_TARGETS_PER_SCENE = 10;
    /** At most this many scenes and entries in one plan */
    public const ITEMS_MAX = 2000;
    /** A delivery's name, at most */
    public const NAME_MAX = 200;
    /** A file's id or URL, at most (characters) */
    private const FILE_MAX = 2048;
    /** The fields of a plan's entry and of its target */
    private const ENTRY_FIELDS = ['id', 'scene', 'surface', 'category', 'title', 'author', 'body', 'caption', 'media', 'tags', 'image', 'target'];
    private const TARGET_FIELDS = ['imageSrc', 'enabled', 'video'];
    private const SCENE_FIELDS = ['id', 'label', 'preset', 'surfaces'];

    /**
     * POST /editor/experiences/{id}/deliveries { name, source?, scenes?, entries, apply?, overwrite? } → { delivery, applied,
     * items, counts, problems, warnings, written }. 400 `invalid-delivery` for a plan of the wrong shape; 409
     * `delivery-problems` { comparison } when `apply` meets a problem.
     */
    public static function post(string $experienceId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $body = Editor::body();
        $plan = self::readPlan($body);
        $apply = ($body->apply ?? false) === true;
        $overwrite = ($body->overwrite ?? false) === true;
        $run = static function () use ($experienceId, $plan, $apply, $overwrite, $user): array {
            $comparison = self::compare($experienceId, $plan, $overwrite, $apply);
            if (!$apply) return self::answer($plan, $comparison, null, []);
            if ($comparison['problems']) {
                throw new ApiError(409, 'delivery-problems', 'The delivery has problems – nothing was written. Fix them and send it again.',
                    ['comparison' => self::answer($plan, $comparison, null, [])]);
            }
            [$id, $written] = self::write($experienceId, $plan, $comparison, $user);
            return self::answer($plan, $comparison, $id, $written);
        };
        Http::json(200, $apply ? Db::transaction($run) : $run());
    }

    // ── The plan ─────────────────────────────────────────────────────────────────────────────────

    /**
     * The plan of the body, checked for its shape (400 `invalid-delivery`); the files stay as sent (`compare` resolves them)
     * @return array{name: string, source: ?string, scenes: list<array{id: string, label: string, surfaces: list<stdClass>}>, entries: list<array<string, mixed>>}
     */
    private static function readPlan(stdClass $body): array
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-delivery', $message);
        $unknown = array_diff(array_keys(get_object_vars($body)), ['name', 'source', 'scenes', 'entries', 'apply', 'overwrite']);
        if ($unknown) $fail('Unknown field ' . implode(', ', $unknown) . ' – send name, source?, scenes?, entries, apply?, overwrite?.');
        $name = is_string($body->name ?? null) ? trim($body->name) : '';
        if ($name === '' || mb_strlen($name) > self::NAME_MAX) $fail('name is the delivery\'s name: text of 1–' . self::NAME_MAX . ' characters.');
        $source = null;
        if (isset($body->source)) {
            if (!is_string($body->source) || mb_strlen($body->source) > 500) $fail('source must be text of at most 500 characters (where the delivery came from).');
            $source = trim($body->source) === '' ? null : trim($body->source);
        }
        foreach (['apply', 'overwrite'] as $flag) {
            if (property_exists($body, $flag) && !is_bool($body->{$flag})) $fail("$flag must be true or false.");
        }
        $scenesIn = $body->scenes ?? [];
        $entriesIn = $body->entries ?? null;
        if (!is_array($scenesIn)) $fail('scenes must be a list of { id, label?, preset? | surfaces? }.');
        if (!is_array($entriesIn)) $fail('entries must be a list of { id, scene, category, title, … }.');
        if (!$scenesIn && !$entriesIn) $fail('The delivery is empty – send its entries (and the scenes they need).');
        if (count($scenesIn) + count($entriesIn) > self::ITEMS_MAX) $fail('At most ' . self::ITEMS_MAX . ' scenes and entries in one delivery.');

        $scenes = [];
        foreach (array_values($scenesIn) as $i => $s) {
            $path = "scenes[$i]";
            if (!$s instanceof stdClass) $fail("$path must be an object { id, label?, preset? | surfaces? }.");
            $extra = array_diff(array_keys(get_object_vars($s)), self::SCENE_FIELDS);
            if ($extra) $fail("$path: unknown field " . implode(', ', $extra) . '.');
            $id = self::id($s->id ?? null, "$path.id");
            if (isset($scenes[$id])) $fail("$path.id: the scene \"$id\" is there twice.");
            $label = $s->label ?? $id;
            if (!is_string($label) || trim($label) === '' || mb_strlen(trim($label)) > ExperienceTexts::TEXT_MAX_LENGTH) $fail("$path.label must be text of 1–" . ExperienceTexts::TEXT_MAX_LENGTH . ' characters.');
            if (isset($s->preset) && isset($s->surfaces)) $fail("$path: send preset or surfaces, not both.");
            if (isset($s->surfaces)) {
                try {
                    $surfaces = Scenes::checkSurfaces($s->surfaces, 'invalid-delivery');
                } catch (ApiError $error) {
                    $fail("$path: " . $error->getMessage());
                }
            } else {
                $preset = $s->preset ?? 'double';
                if (!in_array($preset, Scenes::PRESETS, true)) $fail("$path.preset must be one of " . implode(', ', Scenes::PRESETS) . '.');
                $surfaces = Scenes::presetSurfaces($preset);
            }
            $scenes[$id] = ['id' => $id, 'label' => trim($label), 'surfaces' => $surfaces];
        }

        $entries = [];
        foreach (array_values($entriesIn) as $i => $e) {
            $path = "entries[$i]";
            if (!$e instanceof stdClass) $fail("$path must be an object { id, scene, category, title, … }.");
            $extra = array_diff(array_keys(get_object_vars($e)), self::ENTRY_FIELDS);
            if ($extra) $fail("$path: unknown field " . implode(', ', $extra) . ' – an entry has ' . implode(', ', self::ENTRY_FIELDS) . '.');
            $id = self::id($e->id ?? null, "$path.id");
            if (isset($entries[$id])) $fail("$path.id: the entry \"$id\" is there twice.");
            $path = "entries.$id";
            $category = $e->category ?? null;
            if (!is_string($category) || !in_array($category, Editor::ENTRY_CATEGORIES, true)) $fail("$path.category must be one of " . implode(', ', Editor::ENTRY_CATEGORIES) . '.');
            $entry = [
                'id' => $id,
                'scene' => self::id($e->scene ?? null, "$path.scene"),
                'surface' => isset($e->surface) ? self::id($e->surface, "$path.surface") : null,
                'category' => $category,
                'title' => self::text($e->title ?? null, "$path.title", true),
                'author' => isset($e->author) ? self::text($e->author, "$path.author") : null,
                'caption' => isset($e->caption) ? self::text($e->caption, "$path.caption") : null,
                'media' => isset($e->media) ? self::text($e->media, "$path.media") : null,
                'body' => null,
                'tags' => [],
                'image' => isset($e->image) ? self::text($e->image, "$path.image", true, self::FILE_MAX) : null,
                'target' => null,
            ];
            if ($entry['media'] !== null && $entry['media'] !== '' && !ExperienceTexts::isLinkUrl($entry['media'])) $fail("$path.media must be an http(s) link.");
            if (isset($e->body)) {
                if (!is_string($e->body) || mb_strlen($e->body) > ExperienceTexts::BODY_MAX_LENGTH) $fail("$path.body must be text of at most " . ExperienceTexts::BODY_MAX_LENGTH . ' characters (Markdown).');
                $entry['body'] = str_replace("\r\n", "\n", $e->body);
            }
            if (isset($e->tags)) {
                if (!is_array($e->tags)) $fail("$path.tags must be a list of words.");
                foreach ($e->tags as $tag) {
                    if (!is_string($tag) || mb_strlen(trim($tag)) > ExperienceTexts::TAG_MAX_LENGTH) $fail("$path.tags: words of at most " . ExperienceTexts::TAG_MAX_LENGTH . ' characters.');
                    if (trim($tag) !== '' && !in_array(trim($tag), $entry['tags'], true)) $entry['tags'][] = trim($tag);
                }
                if (count($entry['tags']) > ExperienceTexts::TAGS_MAX) $fail("$path.tags: at most " . ExperienceTexts::TAGS_MAX . '.');
            }
            if (isset($e->target)) {
                $t = $e->target;
                if (!$t instanceof stdClass) $fail("$path.target must be an object { imageSrc, enabled?, video? }.");
                $extra = array_diff(array_keys(get_object_vars($t)), self::TARGET_FIELDS);
                if ($extra) $fail("$path.target: unknown field " . implode(', ', $extra) . '.');
                if (property_exists($t, 'enabled') && !is_bool($t->enabled)) $fail("$path.target.enabled must be true or false.");
                $entry['target'] = [
                    'imageSrc' => self::text($t->imageSrc ?? null, "$path.target.imageSrc", true, self::FILE_MAX),
                    'enabled' => ($t->enabled ?? true) !== false,
                    'video' => isset($t->video) ? self::text($t->video, "$path.target.video", true, self::FILE_MAX) : null,
                ];
            }
            $entries[$id] = $entry;
        }
        return ['name' => $name, 'source' => $source, 'scenes' => array_values($scenes), 'entries' => array_values($entries)];
    }

    private static function id(mixed $value, string $path): string
    {
        try {
            return Editor::id($value, $path);
        } catch (ApiError $error) {
            throw new ApiError(400, 'invalid-delivery', $error->getMessage());
        }
    }

    /** A text of the plan, trimmed: at most `$max` characters (a file's id or URL: FILE_MAX) */
    private static function text(mixed $value, string $path, bool $required = false, int $max = ExperienceTexts::TEXT_MAX_LENGTH): string
    {
        if (!is_string($value)) throw new ApiError(400, 'invalid-delivery', "$path must be text.");
        $value = trim($value);
        if ($required && $value === '') throw new ApiError(400, 'invalid-delivery', "$path must not be empty.");
        if (mb_strlen($value) > $max) throw new ApiError(400, 'invalid-delivery', "$path is longer than $max characters.");
        return $value;
    }

    // ── The comparison ───────────────────────────────────────────────────────────────────────────

    /**
     * The plan against the draft: per item its status, what it would write, the problems and warnings. `$lock` inside the
     * applying transaction.
     * @param array<string, mixed> $plan
     * @return array{items: list<array<string, mixed>>, problems: list<string>, warnings: list<string>, scenes: list<array<string, mixed>>, entries: list<array<string, mixed>>}
     */
    private static function compare(string $experienceId, array $plan, bool $overwrite, bool $lock): array
    {
        $params = ['experience' => $experienceId];
        $context = Scenes::context($experienceId, $lock);
        $importedAt = self::importedAt($experienceId);
        $items = [];
        $problems = [];
        $warnings = [];
        $sceneWrites = [];
        $entryWrites = [];

        // Scenes: new or kept
        $planScenes = [];
        foreach ($plan['scenes'] as $scene) {
            $planScenes[$scene['id']] = $scene;
            $exists = isset($context['data'][$scene['id']]);
            $items[] = ['kind' => 'scene', 'id' => $scene['id'], 'status' => $exists ? 'same' : 'new'];
            if (!$exists) $sceneWrites[] = $scene;
        }
        $surfacesOf = static fn(string $sceneId): ?array => isset($context['data'][$sceneId])
            ? Scenes::surfaceIds($context['data'][$sceneId])
            : (isset($planScenes[$sceneId]) ? array_map(static fn(stdClass $s) => (string) $s->id, $planScenes[$sceneId]['surfaces']) : null);

        // The rows the plan names, read once
        $ids = array_column($plan['entries'], 'id');
        $entryRows = [];
        $targetsByEntry = [];
        $targetIds = [];
        if ($ids) {
            foreach (Db::run('SELECT * FROM entries WHERE experience_id = :experience' . Db::forUpdate(), $params)->fetchAll() as $row) {
                if (in_array($row['id'], $ids, true)) $entryRows[(string) $row['id']] = $row;
            }
            foreach (Db::run('SELECT * FROM targets WHERE experience_id = :experience ORDER BY id' . Db::forUpdate(), $params)->fetchAll() as $row) {
                $targetIds[(string) $row['id']] = (string) $row['entry_id'];
                $targetsByEntry[(string) $row['entry_id']] ??= $row;
            }
        }
        $files = self::files($experienceId);
        $resolve = static function (string $ref, string $kind, string $path) use ($files, &$problems): string {
            $url = $files[$kind][$ref] ?? null;
            if ($url !== null) return $url;
            $problems[] = "$path: \"$ref\" is no " . ($kind === 'image' ? 'picture' : 'video') . ' of the experience\'s Library – upload it first (POST …/assets).';
            return $ref;
        };

        // New targets per scene, switched on
        $added = [];
        foreach ($plan['entries'] as $entry) {
            $id = $entry['id'];
            $path = "entries.$id";
            $image = $entry['image'] !== null ? $resolve($entry['image'], 'image', "$path.image") : null;
            $target = $entry['target'];
            if ($target !== null) {
                $target['imageSrc'] = $resolve($target['imageSrc'], 'image', "$path.target.imageSrc");
                if ($target['video'] !== null) $target['video'] = $resolve($target['video'], 'video', "$path.target.video");
            }
            $row = $entryRows[$id] ?? null;
            if ($row === null) {
                // A new entry: on a scene of the experience or of the plan, a surface of that scene
                $surfaces = $surfacesOf($entry['scene']);
                if ($surfaces === null) {
                    $problems[] = "$path.scene: no scene \"{$entry['scene']}\" – neither in the experience nor in the delivery's scenes.";
                } elseif ($entry['surface'] !== null && !in_array($entry['surface'], $surfaces, true)) {
                    $problems[] = "$path.surface: the scene \"{$entry['scene']}\" has no surface \"{$entry['surface']}\" (" . implode(', ', $surfaces) . ').';
                }
                $items[] = ['kind' => 'entry', 'id' => $id, 'status' => 'new', 'scene' => $entry['scene']];
                $write = ['entry' => $entry, 'image' => $image, 'new' => true];
                if ($target !== null) {
                    if (isset($targetIds[$id])) $problems[] = "$path.target: a target \"$id\" exists – it belongs to the entry \"{$targetIds[$id]}\".";
                    $items[] = ['kind' => 'target', 'id' => $id, 'status' => 'new', 'entry' => $id];
                    $write['target'] = ['new' => true, 'id' => $id] + $target;
                    if ($target['enabled']) $added[$entry['scene']][] = $id;
                }
                $entryWrites[] = $write;
                continue;
            }

            // An entry that exists: its texts, category and scene stay; its picture follows the delivery
            $sceneId = (string) $row['scene_id'];
            if ($sceneId !== $entry['scene']) $warnings[] = "$path: lies on the scene \"$sceneId\", the delivery says \"{$entry['scene']}\" – it stays where it is.";
            $data = Editor::decode($row['data_json']);
            $fields = $image !== null && $image !== ($data->image ?? null) ? ['image'] : [];
            $item = ['kind' => 'entry', 'id' => $id, 'scene' => $sceneId] + self::status($experienceId, 'entry', $id, $fields, $importedAt);
            $items[] = $item;
            $write = ['entry' => $entry, 'image' => $image, 'new' => false, 'row' => $row, 'fields' => $fields, 'write' => self::writes($item, $overwrite)];

            // Its target
            if ($target !== null) {
                $targetRow = $targetsByEntry[$id] ?? null;
                if ($targetRow === null) {
                    if (isset($targetIds[$id])) $problems[] = "$path.target: a target \"$id\" exists – it belongs to the entry \"{$targetIds[$id]}\".";
                    $items[] = ['kind' => 'target', 'id' => $id, 'status' => 'new', 'entry' => $id];
                    $write['target'] = ['new' => true, 'id' => $id] + $target;
                    if ($target['enabled']) $added[$sceneId][] = $id;
                } else {
                    $targetId = (string) $targetRow['id'];
                    $current = Editor::decode($targetRow['data_json']);
                    $fields = $target['imageSrc'] !== ($current->imageSrc ?? null) ? ['imageSrc'] : [];
                    $blocked = null;
                    if ($target['video'] !== null) {
                        $entity = $current->entity ?? null;
                        $isVideo = $entity instanceof stdClass && ($entity->type ?? null) === 'video' && !property_exists($entity, 'ref');
                        $src = $isVideo && ($entity->assets[0] ?? null) instanceof stdClass ? ($entity->assets[0]->src ?? null) : null;
                        if ($entity !== null && !$isVideo) $blocked = 'The target shows another entity than a video – the delivery\'s video is not put on it.';
                        elseif ($src !== $target['video']) $fields[] = 'video';
                    }
                    if (!$target['enabled'] && ($current->enabled ?? true) !== false) {
                        $warnings[] = "$path.target: the delivery switches it off – it stays on (switch it off in the editor).";
                    }
                    $item = ['kind' => 'target', 'id' => $targetId, 'entry' => $id] + self::status($experienceId, 'target', $targetId, $fields, $importedAt);
                    if ($blocked !== null) $item = ['status' => 'conflict', 'reason' => $blocked] + $item;
                    $items[] = $item;
                    $write['target'] = ['new' => false, 'id' => $targetId, 'row' => $targetRow, 'fields' => $fields,
                        'write' => $blocked === null && self::writes($item, $overwrite)] + $target;
                }
            }
            $entryWrites[] = $write;
        }

        // At most MAX_TARGETS_PER_SCENE switched on where the delivery adds targets (RULES #3)
        foreach ($added as $sceneId => $new) {
            $on = 0;
            foreach (Db::run('SELECT t.data_json FROM targets t JOIN entries e ON e.experience_id = t.experience_id AND e.id = t.entry_id WHERE t.experience_id = :experience AND e.scene_id = :scene',
                $params + ['scene' => (string) $sceneId])->fetchAll() as $row) {
                if ((Editor::decode($row['data_json'])->enabled ?? true) !== false) $on++;
            }
            if ($on + count($new) > self::MAX_TARGETS_PER_SCENE) {
                $problems[] = "scenes.$sceneId: " . ($on + count($new)) . ' targets switched on with the delivery – a scene has at most ' . self::MAX_TARGETS_PER_SCENE . ' (switch some off with enabled: false).';
            }
        }
        return ['items' => $items, 'problems' => $problems, 'warnings' => $warnings, 'scenes' => $sceneWrites, 'entries' => $entryWrites];
    }

    /**
     * An existing row's status: `same` when the delivery changes none of its fields; `conflict` when one of them was
     * edited outside a delivery since the last delivery that wrote the row (none: since the import); else `changed`
     * @param list<string> $fields
     * @return array{status: string, fields?: list<string>, reason?: string}
     */
    private static function status(string $experienceId, string $kind, string $ref, array $fields, int $importedAt): array
    {
        if (!$fields) return ['status' => 'same'];
        $params = ['experience' => $experienceId, 'kind' => $kind, 'ref' => $ref];
        $since = Db::value('SELECT MAX(created_at) FROM changes WHERE experience_id = :experience AND kind = :kind AND ref = :ref AND delivery_id IS NOT NULL', $params);
        $since = $since === null ? $importedAt : (int) $since;
        $edited = [];
        foreach (Db::run('SELECT before_json, after_json FROM changes WHERE experience_id = :experience AND kind = :kind AND ref = :ref AND delivery_id IS NULL AND created_at > :since',
            $params + ['since' => $since])->fetchAll() as $row) {
            $before = Editor::decode($row['before_json']);
            $after = Editor::decode($row['after_json']);
            $before = $before instanceof stdClass ? get_object_vars($before) : [];
            $after = $after instanceof stdClass ? get_object_vars($after) : [];
            foreach (array_unique([...array_keys($before), ...array_keys($after)]) as $key) {
                if (Reverts::canon($before[$key] ?? null) !== Reverts::canon($after[$key] ?? null)) $edited[$key === 'entity' ? 'video' : (string) $key] = true;
            }
        }
        $both = array_values(array_intersect($fields, array_keys($edited)));
        if ($both) return ['status' => 'conflict', 'fields' => $fields, 'reason' => 'Edited in the editor since the last delivery: ' . implode(', ', $both) . '.'];
        return ['status' => 'changed', 'fields' => $fields];
    }

    /** Whether an item of the comparison is written: changed, or a conflict with `overwrite` */
    private static function writes(array $item, bool $overwrite): bool
    {
        return $item['status'] === 'changed' || ($item['status'] === 'conflict' && $overwrite);
    }

    /** When the experience was imported (ms), 0 when that was not recorded */
    private static function importedAt(string $experienceId): int
    {
        $imported = Editor::decode(Experiences::experienceRow($experienceId)['imported_json'] ?? null);
        return is_object($imported) && is_int($imported->at ?? null) ? $imported->at : 0;
    }

    /**
     * The experience's Library pictures and videos, each by its id and its URL → its URL
     * @return array{image: array<string, string>, video: array<string, string>}
     */
    private static function files(string $experienceId): array
    {
        $files = ['image' => [], 'video' => []];
        foreach (Db::run("SELECT id, kind, url FROM assets WHERE experience_id = :experience AND status = 'active' AND kind IN ('image', 'video')", ['experience' => $experienceId])->fetchAll() as $asset) {
            $files[$asset['kind']][(string) $asset['id']] = (string) $asset['url'];
            $files[$asset['kind']][(string) $asset['url']] = (string) $asset['url'];
        }
        return $files;
    }

    // ── Applying ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Writes the comparison's new and changed rows (inside the caller's transaction), each a change with the delivery's id,
     * and the delivery's row
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $comparison
     * @param array<string, mixed> $user
     * @return array{0: string, 1: list<string>} the delivery's id and the changes written
     */
    private static function write(string $experienceId, array $plan, array $comparison, array $user): array
    {
        $delivery = Db::uuid();
        $params = ['experience' => $experienceId];
        $written = [];
        $change = static function (string $kind, string $ref, ?string $before, string $after) use ($experienceId, $user, $delivery, &$written): void {
            $written[] = Experiences::recordChange($experienceId, $user, $kind, $ref, $before, $after, null, null, $delivery);
        };

        // New scenes, each after the plan's scene before it (or before the one after it), else last
        if ($comparison['scenes']) {
            $order = array_map(static fn(array $row) => (string) $row['id'], Scenes::rows($experienceId, true));
            $planIds = array_column($plan['scenes'], 'id');
            foreach ($comparison['scenes'] as $scene) {
                $at = array_search($scene['id'], $planIds, true);
                $index = count($order);
                for ($i = $at - 1; $i >= 0; $i--) {
                    $found = array_search($planIds[$i], $order, true);
                    if ($found !== false) { $index = $found + 1; break; }
                }
                if ($index === count($order)) {
                    for ($i = $at + 1; $i < count($planIds); $i++) {
                        $found = array_search($planIds[$i], $order, true);
                        if ($found !== false) { $index = $found; break; }
                    }
                }
                array_splice($order, $index, 0, [$scene['id']]);
                $data = (object) ['id' => $scene['id'], 'label' => $scene['label'], 'surfaces' => $scene['surfaces']];
                $json = Editor::encode($data);
                Db::run('INSERT INTO scenes (experience_id, id, position, label, data_json) VALUES (:experience, :id, :position, :label, :data)',
                    $params + ['id' => $scene['id'], 'position' => $index, 'label' => $scene['label'], 'data' => $json]);
                $change(Scenes::KIND, $scene['id'], null, $json);
            }
            Scenes::writePositions($experienceId, Scenes::rows($experienceId, true), $order);
        }

        $position = (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM entries WHERE experience_id = :experience', $params);
        foreach ($comparison['entries'] as $write) {
            $entry = $write['entry'];
            $id = $entry['id'];
            if ($write['new']) {
                $data = (object) ['id' => $id, 'category' => $entry['category'], 'title' => $entry['title']];
                if ($entry['surface'] !== null) $data->surface = $entry['surface'];
                if ($entry['author'] !== null && $entry['author'] !== '') $data->author = $entry['author'];
                $data->body = $entry['body'] ?? '';
                if ($write['image'] !== null) $data->image = $write['image'];
                if ($entry['caption'] !== null && $entry['caption'] !== '') $data->caption = $entry['caption'];
                if ($entry['media'] !== null && $entry['media'] !== '') $data->media = $entry['media'];
                $data->tags = $entry['tags'];
                $json = Editor::encode($data);
                Db::run('INSERT INTO entries (experience_id, id, scene_id, position, category, title, data_json) VALUES (:experience, :id, :scene, :position, :category, :title, :data)',
                    $params + ['id' => $id, 'scene' => $entry['scene'], 'position' => $position++, 'category' => $entry['category'], 'title' => $entry['title'], 'data' => $json]);
                $change('entry', $id, null, $json);
            } elseif ($write['write']) {
                $data = Editor::decode($write['row']['data_json']);
                $data->image = $write['image'];
                unset($data->imageLevels);
                $json = Editor::encode($data);
                Db::run('UPDATE entries SET data_json = :data WHERE experience_id = :experience AND id = :id', $params + ['id' => $id, 'data' => $json]);
                $change('entry', $id, (string) $write['row']['data_json'], $json);
            }

            $target = $write['target'] ?? null;
            if ($target === null) continue;
            if ($target['new']) {
                $data = (object) ['id' => $target['id'], 'imageSrc' => $target['imageSrc']];
                if (!$target['enabled']) $data->enabled = false;
                if ($target['video'] !== null) $data->entity = self::video($target['id'], $target['video']);
                $json = Editor::encode($data);
                Db::run('INSERT INTO targets (experience_id, id, entry_id, image_src, entity_ref, data_json) VALUES (:experience, :id, :entry, :image, NULL, :data)',
                    $params + ['id' => $target['id'], 'entry' => $id, 'image' => $target['imageSrc'], 'data' => $json]);
                $change('target', $target['id'], null, $json);
            } elseif ($target['write']) {
                $data = Editor::decode($target['row']['data_json']);
                if (in_array('imageSrc', $target['fields'], true)) {
                    // Recognition data is made from the image: another image makes it stale (#306)
                    unset($data->recognition);
                    $data->imageSrc = $target['imageSrc'];
                }
                if (in_array('video', $target['fields'], true)) {
                    $entity = $data->entity ?? null;
                    if ($entity instanceof stdClass && ($entity->assets[0] ?? null) instanceof stdClass) {
                        $entity->assets[0]->src = $target['video'];
                        unset($entity->assets[0]->levels);
                    } else {
                        $data->entity = self::video($target['id'], $target['video']);
                    }
                }
                $json = Editor::encode($data);
                Db::run('UPDATE targets SET image_src = :image, data_json = :data WHERE experience_id = :experience AND id = :id',
                    $params + ['id' => $target['id'], 'image' => (string) $data->imageSrc, 'data' => $json]);
                $change('target', $target['id'], (string) $target['row']['data_json'], $json);
            }
        }

        if ($written) Experiences::touchExperience($experienceId);
        $counts = self::counts($comparison['items']);
        Db::run('INSERT INTO deliveries (id, experience_id, name, source, plan_json, counts_json, created_by, token_name, created_at) VALUES (:id, :experience, :name, :source, :plan, :counts, :user, :token, :at)',
            $params + ['id' => $delivery, 'name' => $plan['name'], 'source' => $plan['source'], 'plan' => Editor::encode($plan), 'counts' => Editor::encode($counts),
                'user' => $user['id'], 'token' => Auth::token()['name'] ?? null, 'at' => Editor::nowMs()]);
        return [$delivery, $written];
    }

    /** A target's video as the content build makes it from `entity: { type: video, src }` */
    private static function video(string $targetId, string $url): stdClass
    {
        return (object) ['type' => 'video', 'assets' => [(object) ['id' => "$targetId-media", 'assetType' => 'video', 'src' => $url]]];
    }

    // ── The answer ───────────────────────────────────────────────────────────────────────────────

    /** @return array{new: int, changed: int, same: int, conflict: int} */
    private static function counts(array $items): array
    {
        $counts = ['new' => 0, 'changed' => 0, 'same' => 0, 'conflict' => 0];
        foreach ($items as $item) $counts[$item['status']]++;
        return $counts;
    }

    /**
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $comparison
     * @param list<string> $written
     * @return array<string, mixed>
     */
    private static function answer(array $plan, array $comparison, ?string $id, array $written): array
    {
        return [
            'delivery' => ['id' => $id, 'name' => $plan['name'], 'source' => $plan['source']],
            'applied' => $id !== null,
            'items' => $comparison['items'],
            'counts' => self::counts($comparison['items']),
            'problems' => $comparison['problems'],
            'warnings' => $comparison['warnings'],
            'written' => $written,
        ];
    }
}
