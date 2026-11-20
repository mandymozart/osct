<?php
declare(strict_types=1);

/**
 * Library files named by where they are used (#298 phase 3, docs/server.md "Files named by use"). A file's **name** is
 * what the Library lists; its URL never changes with it, so no use breaks.
 *
 * - an entry's target image `p118-1_target.webp`, its colour picture `p118-1_image.webp`, another file of the entry or
 *   of its own entity `p118-1_<asset id or field>.ext` – an **upload** keeps its own name after the place:
 *   `fight_2_remesh_4096.jpg` → `p010-3_fight-2-remesh-4096.jpg` (Tilman, 2026-11-17: "keep their own part");
 * - a surface's reference image (#314) `<scene>_<surface>.webp` (`s118-119_surface.webp`);
 * - a shared entity's file `<entity ref>_<asset id>.ext` (an upload: `<entity ref>_<its own name>.ext`); the experience's environment `environment_world.glb`,
 *   `environment_sky.webp`;
 * - a file used in several places takes its first use in the scenes' order (the rest are "+N more"); a file only a
 *   plugin's source names, and an unused file, keep their names. Two files that would take the same name are told apart
 *   by `-2`, `-3` in that order.
 *
 * The Library groups files by the scene of their first use (`place`); uses without a scene (the environment, plugins,
 * a shared entity no target shows) are experience-wide. An uploaded file's name is its `assets` row's; an imported file
 * (#244: no row, read-only) is listed under a name kept in `asset_names` by URL (as `asset_credits`), else its own.
 * Names are no content: no change in the experience's log, no publish needed.
 */
final class AssetNames
{
    /** The longest file name */
    public const NAME_MAX = 255;
    /** The order of a use without a scene: after every scene */
    private const EXPERIENCE_WIDE = PHP_INT_MAX;
    /** A field's part of a name: `imageSrc` is the target image, `image` the entry's colour picture */
    private const PARTS = ['imageSrc' => 'target', 'image' => 'image', 'worldSrc' => 'world', 'skySrc' => 'sky'];
    /** The kinds of use that give a file its name (#298 phase 3) – a scene's, an experience setting's or the layout's use counts, but names nothing */
    private const NAMING = ['target', 'entry', 'entity', 'reference', 'environment', 'plugin'];
    /** A use's kind in the order of a file's uses (`rank`) */
    private const KIND_ORDER = ['target' => 0, 'entry' => 1, 'entity' => 2, 'scene' => 3, 'reference' => 4, 'environment' => 5, 'experience' => 6, 'plugin' => 7, 'layout' => 8];
    /** The print layout's folder in the content (editor/src/lib/stage/stage-layout.ts `LAYOUT_PATH`) and the file that lists its sheets */
    public const LAYOUT_PATH = '/assets/content/layout/';
    public const LAYOUT_FILE = self::LAYOUT_PATH . 'layout.json';

    /**
     * POST /editor/experiences/{id}/assets/names { apply? } → { plan: { renames, files, used, unused }, applied }: the names
     * every file of the Library takes by its use, in two steps. Without `apply: true`
     * nothing is written – `renames` lists each file whose name changes: { id, url, imported, from, to, use: { kind, ref,
     * scene }, more } (`more` = its further uses). With it the plan is made again and written in one transaction.
     */
    public static function plan(string $experienceId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $apply = (Editor::body()->apply ?? false) === true;
        $run = static function () use ($experienceId, $apply, $user): array {
            $plan = self::compute($experienceId);
            if ($apply) self::apply($experienceId, $plan['renames'], $user);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply && $plan['renames'] !== []]);
    }

    /**
     * What `plan` proposes
     * @return array{renames: list<array<string, mixed>>, files: int, used: int, unused: int}
     */
    public static function compute(string $experienceId): array
    {
        $files = Assets::libraryFiles($experienceId);
        $uses = self::usesOf($experienceId);
        $used = array_values(array_filter($files, static fn(array $f) => isset($uses[$f['url']])));
        // Only the uses that name (NAMING): a file only a scene, an experience setting or the layout uses keeps its name
        $naming = [];
        foreach ($used as $file) {
            $list = array_values(array_filter($uses[$file['url']], static fn(array $use) => in_array($use['kind'], self::NAMING, true)));
            if ($list) $naming[$file['url']] = $list;
        }
        $named = array_values(array_filter($used, static fn(array $f) => isset($naming[$f['url']])));
        // The first use in the scenes' order names first: a name two files would take goes to the earlier one
        usort($named, static fn(array $a, array $b) => self::rank($naming[$a['url']][0]) <=> self::rank($naming[$b['url']][0]) ?: strcmp($a['url'], $b['url']));
        $taken = [];
        $renames = [];
        foreach ($named as $file) {
            $first = $naming[$file['url']][0];
            if ($first['stem'] === null) continue;
            $stem = $first['stem'];
            // An upload named by its asset id keeps its own name after the place instead (`p010-3_fight-2-remesh-4096`)
            if (!$file['imported'] && ($first['prefix'] ?? null) !== null) {
                $own = self::own((string) $file['name'], (string) $first['prefix']);
                if ($own !== '') $stem = self::clean("{$first['prefix']}_{$own}");
            }
            $name = self::unique($stem, self::extension($file['url'], $file['name']), $taken);
            $taken[strtolower($name)] = true;
            if ($name === $file['name']) continue;
            $renames[] = ['id' => $file['id'], 'url' => $file['url'], 'imported' => $file['imported'], 'from' => $file['name'], 'to' => $name,
                'use' => ['kind' => $first['kind'], 'ref' => $first['ref'], 'scene' => $first['scene']], 'more' => count($uses[$file['url']]) - 1];
        }
        return ['renames' => $renames, 'files' => count($files), 'used' => count($used), 'unused' => count($files) - count($used)];
    }

    /**
     * Writes a plan's renames (inside the caller's transaction): an upload's row, an imported file's name by URL
     * @param list<array<string, mixed>> $renames
     * @param array<string, mixed> $user
     */
    private static function apply(string $experienceId, array $renames, array $user): void
    {
        $now = Editor::nowMs();
        foreach ($renames as $rename) {
            if ($rename['imported']) self::setImportedName($experienceId, (string) $rename['url'], (string) $rename['to'], $user['id'], $now);
            else Db::run('UPDATE assets SET name = :name, updated_at = :now WHERE experience_id = :experience AND id = :id', ['name' => $rename['to'], 'now' => $now, 'experience' => $experienceId, 'id' => $rename['id']]);
        }
    }

    /**
     * PUT /editor/experiences/{id}/assets/{assetId} { name } → { asset: { id, url, name, imported }, changed } (#330): one
     * file's name, given by hand – the Library's rename (F2, the details drawer). The URL never changes, so no use breaks;
     * an upload's `assets` row takes it, an imported file (`import-…`) keeps it in `asset_names` by URL as *Name by use*
     * does. The name is checked by `cleanName` (400 `invalid-name`); the stored file's extension stays. Names are no
     * content: no change in the experience's log, no publish needed.
     */
    public static function rename(string $experienceId, string $assetId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $raw = Editor::body()->name ?? null;
        if (!is_string($raw)) throw new ApiError(400, 'invalid-name', 'name must be text.');
        $file = null;
        foreach (Assets::libraryFiles($experienceId) as $candidate) {
            if ($candidate['id'] === $assetId) { $file = $candidate; break; }
        }
        if ($file === null) throw new ApiError(404, 'not-found', 'No such asset.');
        $name = self::cleanName($raw, self::extension($file['url'], $file['name']));
        $changed = $name !== $file['name'];
        if ($changed) {
            $now = Editor::nowMs();
            if ($file['imported']) self::setImportedName($experienceId, $file['url'], $name, $user['id'], $now);
            else Db::run('UPDATE assets SET name = :name, updated_at = :now WHERE experience_id = :experience AND id = :id', ['name' => $name, 'now' => $now, 'experience' => $experienceId, 'id' => $assetId]);
        }
        Http::json(200, ['asset' => ['id' => $file['id'], 'url' => $file['url'], 'name' => $name, 'imported' => $file['imported']], 'changed' => $changed]);
    }

    /**
     * A name given by hand (#330 – editor/src/lib/library-drag.ts `cleanAssetName` is the same rule): white space folded,
     * no slash, backslash or control character, not empty, `.` or `..`, at most NAME_MAX characters – and the stored
     * file's extension at its end (added when the name lacks it: `castle` → `castle.glb`). 400 `invalid-name` otherwise.
     */
    public static function cleanName(string $raw, string $extension): string
    {
        if (preg_match('#[/\\\\\x00-\x1f\x7f]#', str_replace(["\t", "\n", "\r"], ' ', $raw))) {
            throw new ApiError(400, 'invalid-name', 'A name holds no slash, backslash or control character.');
        }
        $name = trim((string) preg_replace('/\s+/u', ' ', $raw));
        $suffix = $extension === '' ? '' : ".$extension";
        // one typed in any case stays as typed (`img.JPG`)
        $typed = $suffix !== '' && str_ends_with(strtolower($name), $suffix);
        $stem = rtrim($typed ? substr($name, 0, -strlen($suffix)) : $name, ' .');
        if ($stem === '') throw new ApiError(400, 'invalid-name', 'The name is empty.');
        $name = $stem . ($typed ? substr($name, -strlen($suffix)) : $suffix);
        if (mb_strlen($name) > self::NAME_MAX) throw new ApiError(400, 'invalid-name', 'The name is longer than ' . self::NAME_MAX . ' characters.');
        return $name;
    }

    private static function setImportedName(string $experienceId, string $url, string $name, ?string $by, int $at): void
    {
        Db::run('DELETE FROM asset_names WHERE experience_id = :experience AND url = :url', ['experience' => $experienceId, 'url' => $url]);
        Db::run('INSERT INTO asset_names (experience_id, url, name, updated_by, updated_at) VALUES (:experience, :url, :name, :by, :at)',
            ['experience' => $experienceId, 'url' => $url, 'name' => $name, 'by' => $by, 'at' => $at]);
    }

    /** @return array<string, string> the imported files' names by URL (`asset_names`) */
    public static function importedNames(string $experienceId): array
    {
        $names = [];
        foreach (Db::run('SELECT url, name FROM asset_names WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $names[(string) $row['url']] = (string) $row['name'];
        }
        return $names;
    }

    /**
     * Where a file is placed in the Library: the scene of its first use (null: experience-wide), the order (the scene's
     * position, experience-wide −1) and how many uses follow – null for an unused file
     * @param list<array<string, mixed>> $uses a file's uses (`usesOf`)
     * @return ?array{scene: ?string, order: int, more: int}
     */
    public static function place(array $uses): ?array
    {
        if (!$uses) return null;
        $first = $uses[0];
        return ['scene' => $first['scene'], 'order' => $first['order'] === self::EXPERIENCE_WIDE ? -1 : $first['order'], 'more' => count($uses) - 1];
    }

    // ── Uses ─────────────────────────────────────────────────────────────────────────────────────

    /**
     * **The** list of every use of every Library file (#298: the one source of truth – the Library's count and place,
     * the delete check `Assets::usagesOf`, `Removal` and the names plan all read it; docs/server.md "What counts as a
     * use"), in the scenes' order, by the file's Library URL: { kind, ref, scene, order, stem, prefix }. The kinds:
     * - `target` (its printed image `imageSrc`, its own inline entity), `entry`, `entity` (a shared one) – the rows' JSON;
     * - `scene` – a scene's own data (its passes …), on the scene;
     * - `reference` – a surface's reference image (#314, ref `<scene>/<surface>`) on its scene – counted, relinked and
     *   deleted with the file; it names the file `<scene>_<surface>`;
     * - `environment` – the experience's environment (its world model, its sky); `experience` – any other setting of the experience
     *   (appearance, passes with a texture or a model …); both experience-wide;
     * - `plugin` – a plugin source naming the file's URL as text (a shader it loads), experience-wide;
     * - `layout` – a file of the print layout's folder (`layout/sheets/*.jpg`, `*@sharp.jpg`): the editor's stage and cards
     *   read them through `layout/layout.json`, never through a row – used whenever the experience's files hold that layout.json.
     * A row's JSON uses a file when one of its strings is the file's URL (or, for an imported file, its content path
     * `/assets/content/…`); a plugin source when its text contains it. Every table is read once – an experience has ~2,000 files.
     * `stem` is the name the use gives (without extension), null when it gives none (a plugin source, a scene, an experience
     * setting, the layout).
     * @return array<string, list<array<string, mixed>>>
     */
    public static function usesOf(string $experienceId): array
    {
        [$keys, $layout] = self::fileKeys($experienceId);
        if (!$keys) return [];
        // A scene's place in the order: its position
        $scenes = [];
        foreach (Scenes::rows($experienceId) as $i => $row) $scenes[(string) $row['id']] = $i;
        $uses = [];
        $add = static function (string $value, string $kind, string $ref, ?string $scene, int $order, ?string $stem, ?string $prefix = null) use (&$uses, $keys): void {
            $url = $keys[$value] ?? null;
            if ($url === null) return;
            foreach ($uses[$url] ?? [] as $use) if ($use['kind'] === $kind && $use['ref'] === $ref) return;
            $uses[$url][] = ['kind' => $kind, 'ref' => $ref, 'scene' => $scene, 'order' => $order, 'stem' => $stem === null ? null : self::clean($stem), 'prefix' => $prefix];
        };
        $at = static fn(?string $scene): array => $scene !== null && isset($scenes[$scene]) ? ['scene' => $scene, 'order' => $scenes[$scene]] : ['scene' => null, 'order' => self::EXPERIENCE_WIDE];

        // Entries: on their scene; the colour picture `_image`, other files by field
        $entries = [];
        foreach (Db::run('SELECT id, scene_id, data_json FROM entries WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $id = (string) $row['id'];
            $entries[$id] = $at($row['scene_id'] === null ? null : (string) $row['scene_id']);
            $place = $entries[$id];
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value, ?string $part, bool $src = false) use ($add, $id, $place) {
                $add($value, 'entry', $id, $place['scene'], $place['order'], "{$id}_" . ($part ?? 'file'), $src ? $id : null);
            });
        }
        // Targets: on their entry's scene; the printed image `_target`, the files of its own entity by asset id
        $shared = [];
        foreach (Db::run('SELECT id, entry_id, image_src, entity_ref, data_json FROM targets WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $entry = (string) $row['entry_id'];
            $place = $entries[$entry] ?? ['scene' => null, 'order' => self::EXPERIENCE_WIDE];
            $ref = (string) $row['id'];
            if (is_string($row['image_src']) && $row['image_src'] !== '') $add($row['image_src'], 'target', $ref, $place['scene'], $place['order'], "{$entry}_target");
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value, ?string $part, bool $src = false) use ($add, $entry, $ref, $place) {
                $add($value, 'target', $ref, $place['scene'], $place['order'], "{$entry}_" . ($part ?? 'file'), $src ? $entry : null);
            });
            // A shared entity sits where its first target is
            $shares = $row['entity_ref'] === null ? null : (string) $row['entity_ref'];
            if ($shares !== null && (!isset($shared[$shares]) || $shared[$shares]['order'] > $place['order'])) $shared[$shares] = $place;
        }
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $ref = (string) $row['ref'];
            $place = $shared[$ref] ?? ['scene' => null, 'order' => self::EXPERIENCE_WIDE];
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value, ?string $part, bool $src = false) use ($add, $ref, $place) {
                $add($value, 'entity', $ref, $place['scene'], $place['order'], "{$ref}_" . ($part ?? 'file'), $src ? $ref : null);
            });
        }
        // Scenes' own files (their passes …): on the scene, no name of their own
        $surfaces = [];
        foreach (Db::run('SELECT id, data_json FROM scenes WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $id = (string) $row['id'];
            $place = $at($id);
            $data = Editor::decode($row['data_json']);
            $surfaces[$id] = $data instanceof stdClass ? Scenes::surfaceIds($data) : [];
            self::walk($data, null, null, static function (string $value) use ($add, $id, $place) {
                $add($value, 'scene', $id, $place['scene'], $place['order'], null);
            });
        }
        // Surface reference images (#314): on their scene, named `<scene>_<surface>` – only those whose surface is there
        foreach (SurfaceReferences::byScene($experienceId) as $scene => $references) {
            $place = $at((string) $scene);
            foreach ($references as $surface => $reference) {
                if (!in_array((string) $surface, $surfaces[$scene] ?? [], true)) continue;
                $add($reference['url'], 'reference', SurfaceReferences::ref((string) $scene, (string) $surface), $place['scene'], $place['order'], "{$scene}_{$surface}");
            }
        }
        // The experience's environment (its world model, its sky): experience-wide
        $experience = Editor::decode(Db::value('SELECT experience_json FROM experiences WHERE id = :id', ['id' => $experienceId]));
        if ($experience instanceof stdClass && ($experience->environment ?? null) instanceof stdClass) {
            self::walk($experience->environment, null, null, static function (string $value, ?string $part) use ($add, $experienceId) {
                $add($value, 'environment', $experienceId, null, self::EXPERIENCE_WIDE, 'environment_' . ($part ?? 'file'));
            });
        }
        // The experience's other settings (appearance, passes with a texture or a model parameter …): experience-wide, no name of their own
        if ($experience instanceof stdClass) {
            foreach (get_object_vars($experience) as $key => $value) {
                if ($key === 'environment') continue;
                self::walk($value, (string) $key, $experience, static function (string $value) use ($add, $experienceId) {
                    $add($value, 'experience', $experienceId, null, self::EXPERIENCE_WIDE, null);
                });
            }
        }
        // Plugin sources name a file by its URL as text: experience-wide, no name of their own
        foreach (Db::run('SELECT id, source FROM plugins WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            foreach ($keys as $value => $url) {
                if (str_contains((string) $row['source'], (string) $value)) $add((string) $value, 'plugin', (string) $row['id'], null, self::EXPERIENCE_WIDE, null);
            }
        }
        // The print layout's files: read by the stage through layout.json – experience-wide, no name of their own
        foreach ($layout as $value) $add($value, 'layout', 'layout.json', null, self::EXPERIENCE_WIDE, null);
        foreach ($uses as $url => $list) {
            usort($list, static fn(array $a, array $b) => self::rank($a) <=> self::rank($b));
            $uses[$url] = $list;
        }
        return $uses;
    }

    /** A use's place in the order: its scene, then its kind (KIND_ORDER), then its ref */
    private static function rank(array $use): array
    {
        return [$use['order'], self::KIND_ORDER[$use['kind']] ?? 9, $use['ref']];
    }

    /**
     * Every string of a row's JSON with the part of the name its place gives: an asset's `src` its asset id (the nearest
     * object with an id – a model's texture map adds its size: `key_model-1024`), `imageSrc` `target`, `image` `image`,
     * `worldSrc` / `skySrc` `world` / `sky`, another field its name
     */
    private static function walk(mixed $node, ?string $key, ?stdClass $parent, callable $found, ?string $owner = null): void
    {
        if (is_string($node)) {
            if ($key === 'src') {
                $part = $owner ?? 'file';
                if ($parent !== null && is_int($parent->size ?? null)) $part .= '-' . $parent->size;
            } else {
                $part = $key === null ? null : (self::PARTS[$key] ?? $key);
            }
            $found($node, $part, $key === 'src');
        } elseif ($node instanceof stdClass) {
            $owner = is_string($node->id ?? null) && $node->id !== '' ? $node->id : $owner;
            foreach (get_object_vars($node) as $k => $value) self::walk($value, (string) $k, $node, $found, $owner);
        } elseif (is_array($node)) {
            foreach ($node as $value) self::walk($value, $key, $parent, $found, $owner);
        }
    }

    /**
     * The values a row may name a Library file by → its Library URL: an upload's URL; an imported file's URL and its
     * content path (`/assets/content/…` – what the rows hold below the assets base). And the imported files of the print
     * layout's folder (their URLs) when the experience's files hold its `layout.json` – none without it.
     * @return array{0: array<string, string>, 1: list<string>}
     */
    private static function fileKeys(string $experienceId): array
    {
        $experience = Db::one('SELECT assets_base, files_json FROM experiences WHERE id = :id', ['id' => $experienceId]);
        $base = rtrim((string) ($experience['assets_base'] ?? ''), '/');
        $imported = Editor::decode($experience['files_json'] ?? null);
        $hasLayout = $imported instanceof stdClass && property_exists($imported, self::LAYOUT_FILE);
        $keys = [];
        $layout = [];
        foreach (Assets::libraryFiles($experienceId) as $file) {
            $url = (string) $file['url'];
            $keys[$url] = $url;
            if (!$file['imported']) continue;
            $path = $base !== '' && str_starts_with($url, $base . '/') ? substr($url, strlen($base)) : $url;
            if ($path !== $url) $keys[$path] = $url;
            if ($hasLayout && str_starts_with($path, self::LAYOUT_PATH)) $layout[] = $url;
        }
        return [$keys, $layout];
    }

    // ── Names ────────────────────────────────────────────────────────────────────────────────────

    /**
     * The name an upload takes when its use is known (`POST …/assets?fit=…&entry=…` or `&scene=…&surface=…`): a target
     * image `<entry>_target`, an entry's picture `<entry>_image`, a reference image `<scene>_<surface>` – null when the
     * request names no use (the upload keeps its name). 400 `invalid-use` for a surface that is no surface of the experience.
     */
    public static function uploadStem(string $experienceId, string $fit): ?string
    {
        $entry = $_GET['entry'] ?? null;
        if (is_string($entry) && $entry !== '' && in_array($fit, ['target', 'entryImage'], true)) {
            return Editor::id($entry, 'entry') . ($fit === 'target' ? '_target' : '_image');
        }
        $scene = $_GET['scene'] ?? null;
        $surface = $_GET['surface'] ?? null;
        if ($fit === 'reference' && is_string($scene) && $scene !== '' && is_string($surface) && $surface !== '') {
            $scene = Editor::id($scene, 'scene');
            $surface = Editor::id($surface, 'surface');
            if (!SurfaceReferences::surfaceExists($experienceId, $scene, $surface)) throw new ApiError(400, 'invalid-use', "The scene \"$scene\" has no surface \"$surface\".");
            return "{$scene}_{$surface}";
        }
        return null;
    }

    /**
     * A file's own part of its name: the name without extension and without a place prefix it already carries (so a second
     * plan changes nothing), lower case, words joined by `-` – `fight_2_remesh_4096.jpg` → `fight-2-remesh-4096`
     */
    private static function own(string $name, string $prefix): string
    {
        $stem = pathinfo($name, PATHINFO_FILENAME);
        $lead = strtolower($prefix) . '_';
        while ($lead !== '_' && str_starts_with(strtolower($stem), $lead)) $stem = substr($stem, strlen($lead));
        return trim((string) preg_replace('/[^a-z0-9.]+/', '-', strtolower($stem)), '-.');
    }

    /** A stem as a file name may hold it: letters, digits, `.`, `_` and `-` */
    private static function clean(string $stem): string
    {
        $stem = trim((string) preg_replace('/[^A-Za-z0-9._-]+/', '-', $stem), '-.');
        return mb_substr($stem === '' ? 'file' : $stem, 0, self::NAME_MAX - 16);
    }

    /** `stem.ext`, else `stem-2.ext`, `stem-3.ext` … – the first no other file of the plan took (case ignored) */
    private static function unique(string $stem, string $extension, array $taken): string
    {
        $suffix = $extension === '' ? '' : ".$extension";
        for ($n = 1; ; $n++) {
            $name = $stem . ($n > 1 ? "-$n" : '') . $suffix;
            if (!isset($taken[strtolower($name)])) return $name;
        }
    }

    /** The stored file's extension (its URL's), else its name's – lower case */
    private static function extension(string $url, string $name): string
    {
        $extension = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: $url, PATHINFO_EXTENSION));
        return $extension !== '' ? $extension : strtolower(pathinfo($name, PATHINFO_EXTENSION));
    }
}
