<?php
declare(strict_types=1);

/**
 * The editor's plugin sources (docs/server.md "Plugin sources", docs/plugins.md):
 * the code an experience's author writes in the editor's Code tab, one row per plugin id. A plugin is a folder of files
 * (#352): `index.ts` – the entry, in `source` – and the TypeScript and shader files next to it (`files_json`, the entry
 * left out); the API answers them together as `files`, the entry first. What a plugin registers and which Library URLs it
 * names is read from all its files at once (`texts`). The editor bundles and runs them on its own stage; nothing here
 * reaches a publish – the configuration's `plugins` list (the compiled modules) comes with the import or the editor's
 * Publish. Every save records a change (before and after: the files).
 *
 * A plugin pushed with `osct plugin push` is **linked**: `origin_json` names the folder it came from (a label – any save
 * may still change the files; `origin: null` unlinks).
 *
 * The Library shows the same rows as its scripts (#186): a `.ts` / `.js` file uploaded there becomes a plugin of one file
 * (`upload`, its id from the file's name), a file replaces a plugin's `index.ts` (`replaceFile`). A plugin is **used**
 * where the draft names a type it registers (`usagesOf`: read from its text like shared/api/rules.ts `pluginTypes`), and
 * its delete is refused while it is (409 `plugin-in-use`, forced with `?force=1`).
 */
final class Plugins
{
    /** A plugin id: the folder's name in the content source (shared/types/plugins.ts PLUGIN_ID_PATTERN) */
    public const ID = '[a-z][a-z0-9-]{0,39}';
    /** One file larger than this is refused (shared/types/plugins.ts PLUGIN_FILE_MAX_BYTES) */
    public const MAX_SOURCE_BYTES = 262144;
    /** A plugin's files together at most (PLUGIN_MAX_BYTES) */
    public const MAX_PLUGIN_BYTES = 1048576;
    /** Files a plugin has at most (PLUGIN_MAX_FILES) */
    public const MAX_FILES = 32;
    /** The entry of every plugin (PLUGIN_ENTRY) */
    public const ENTRY = 'index.ts';
    /** A file's name (PLUGIN_FILE_PATTERN): no folders, TypeScript or a shader */
    public const FILE_NAME = '/^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}\.(ts|frag|vert|glsl|wgsl)$/';
    /** The extensions of a script file (JavaScript is TypeScript too) */
    public const EXTENSIONS = ['ts', 'js'];
    /** What a source registers, by kind → the API function (`api.registerLayer("tint", …)` – shared/api/rules.ts `PLUGIN_REGISTER_FUNCTIONS`) */
    private const REGISTERS = [
        'components' => 'registerComponent', 'layers' => 'registerLayer', 'nodeTypes' => 'registerNodeType', 'passes' => 'registerPass',
        'materials' => 'registerMaterial', 'textures' => 'registerTexture', 'appearances' => 'registerAppearance',
        'cardLooks' => 'registerCardLook',
    ];

    /** GET /editor/experiences/{id}/plugins → { plugins: [{ id, size, fileCount, origin, usages, updatedAt, updatedBy }] } */
    public static function list(string $experienceId): never
    {
        Editor::user();
        Experiences::exists($experienceId);
        $plugins = [];
        $rows = Db::run('SELECT p.id, p.source, p.files_json, p.origin_json, p.updated_at, u.email FROM plugins p LEFT JOIN users u ON u.id = p.updated_by WHERE p.experience_id = :experience ORDER BY p.id', ['experience' => $experienceId])->fetchAll();
        $texts = $rows ? self::draftTexts($experienceId) : [];
        foreach ($rows as $row) {
            $files = self::filesOf($row);
            $plugins[] = [
                'id' => $row['id'], 'size' => self::bytes($files), 'fileCount' => count($files), 'origin' => self::originOf($row),
                'usages' => count(self::uses($texts, self::joined($files))),
                'updatedAt' => Editor::iso((int) $row['updated_at']), 'updatedBy' => $row['email'],
            ];
        }
        Http::json(200, ['plugins' => $plugins]);
    }

    /** GET /editor/experiences/{id}/plugins/{pid} → { plugin: { id, files, size, updatedAt, updatedBy, origin } } */
    public static function get(string $experienceId, string $pluginId): never
    {
        Editor::user();
        Experiences::exists($experienceId);
        Http::json(200, ['plugin' => self::summary(self::row($experienceId, $pluginId))]);
    }

    /**
     * PUT /editor/experiences/{id}/plugins/{pid} { files } | { source }, origin? → { plugin }: a new plugin or new files, a
     * change recorded. `files` = every file of the plugin [{ name, text }] (one left out is gone), `source` = a plugin of
     * one file (`index.ts`). `origin` { folder } links it (`osct plugin push`), null unlinks, without it the link stays.
     * 400 invalid-plugin (the id, the files – `checkFiles`), 413 body-too-large (a file, or the files together)
     */
    public static function put(string $experienceId, string $pluginId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        if (!preg_match('/^' . self::ID . '$/', $pluginId)) throw new ApiError(400, 'invalid-plugin', 'A plugin id is 1–40 lower-case letters, digits or -.');
        $body = Editor::body();
        $files = self::filesFromBody($body, 'the plugin');
        $origin = false;
        if (property_exists($body, 'origin')) {
            $raw = $body->origin;
            if ($raw === null) {
                $origin = null;
            } elseif ($raw instanceof stdClass && is_string($raw->folder ?? null) && trim($raw->folder) !== '' && strlen($raw->folder) <= 120) {
                $origin = ['folder' => basename(str_replace('\\', '/', trim($raw->folder)))];
            } else {
                throw new ApiError(400, 'invalid-plugin', 'origin must be { folder } (a folder\'s name) or null.');
            }
        }
        self::store($experienceId, $pluginId, $files, $user, $origin);
        Http::json(200, ['plugin' => self::summary(self::row($experienceId, $pluginId))]);
    }

    /**
     * POST /editor/experiences/{id}/plugins[?id=] – a script file as the raw body, `X-File-Name: <name>.ts|.js` → 201 { plugin }:
     * a new plugin of one file (its `index.ts`) with the id from `?id=` or the file's name (`Tint Layer.ts` → `tint-layer`).
     * 400 `invalid-file` (not .ts / .js, empty, no text), 400 `invalid-plugin` (no id to be had), 409 `plugin-exists`
     * (`plugin`: the id – replace it with PUT …/file), 413 `body-too-large` (MAX_SOURCE_BYTES).
     */
    public static function upload(string $experienceId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        [$name, $extension] = Assets::fileName();
        self::checkExtension($name, $extension);
        $asked = $_GET['id'] ?? null;
        $pluginId = is_string($asked) && $asked !== '' ? $asked : self::idFrom($name);
        if (!preg_match('/^' . self::ID . '$/', $pluginId)) {
            throw new ApiError(400, 'invalid-plugin', "\"$name\" gives no plugin id (1–40 lower-case letters, digits or -, starting with a letter) – send ?id=.");
        }
        if (Db::value('SELECT id FROM plugins WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $pluginId]) !== null) {
            throw new ApiError(409, 'plugin-exists', "The plugin $pluginId exists – replace its source (PUT …/plugins/$pluginId/file) or send another ?id=.", ['plugin' => $pluginId]);
        }
        self::store($experienceId, $pluginId, [['name' => self::ENTRY, 'text' => self::fileSource($name, $extension)]], $user);
        Http::json(201, ['plugin' => self::summary(self::row($experienceId, $pluginId))]);
    }

    /**
     * PUT /editor/experiences/{id}/plugins/{pid}/file – a script file as the raw body (`X-File-Name` optional) → { plugin }:
     * it becomes the plugin's `index.ts`; its other files stay
     */
    public static function replaceFile(string $experienceId, string $pluginId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $row = self::row($experienceId, $pluginId);
        [$name, $extension] = Assets::fileName("$pluginId.ts");
        self::checkExtension($name, $extension);
        $others = array_values(array_filter(self::filesOf($row), static fn(array $file): bool => $file['name'] !== self::ENTRY));
        $files = [['name' => self::ENTRY, 'text' => self::fileSource($name, $extension)], ...$others];
        self::checkFiles($files, 'the plugin');
        self::store($experienceId, $pluginId, $files, $user);
        Http::json(200, ['plugin' => self::summary(self::row($experienceId, $pluginId))]);
    }

    /** GET /editor/experiences/{id}/plugins/{pid}/usages → { usages: [{ kind, ref }], registers: { components, layers, … } } */
    public static function usages(string $experienceId, string $pluginId): never
    {
        Editor::user();
        Experiences::exists($experienceId);
        $text = self::joined(self::filesOf(self::row($experienceId, $pluginId)));
        Http::json(200, ['usages' => self::usagesOf($experienceId, $text), 'registers' => self::registers($text)]);
    }

    /**
     * DELETE /editor/experiences/{id}/plugins/{pid}[?force=1] → 204 (a change recorded); 409 `plugin-in-use` with the usages
     * while the draft uses a type it registers, unless forced
     */
    public static function delete(string $experienceId, string $pluginId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $files = self::filesOf(self::row($experienceId, $pluginId));
        $usages = self::usagesOf($experienceId, self::joined($files));
        if ($usages && ($_GET['force'] ?? '') !== '1') {
            throw new ApiError(409, 'plugin-in-use', 'The draft uses what the plugin registers – remove the uses first, or force the delete.', ['usages' => $usages]);
        }
        Db::transaction(function () use ($experienceId, $pluginId, $files, $user) {
            Db::run('DELETE FROM plugins WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $pluginId]);
            Experiences::touchExperience($experienceId);
            Experiences::recordChange($experienceId, $user, 'plugin', $pluginId, Editor::encode($files), 'null');
        });
        Http::json(204, null);
    }

    /** The experience has at least one source in the Code tab */
    public static function hasSources(string $experienceId): bool
    {
        return Db::value('SELECT id FROM plugins WHERE experience_id = :experience LIMIT 1', ['experience' => $experienceId]) !== null;
    }

    /**
     * The types a source registers, read from its text – the first argument of each `api.register…("type", …)` call
     * @return array<string, array<int, string>>
     */
    public static function registers(string $source): array
    {
        $found = [];
        foreach (self::REGISTERS as $kind => $function) {
            preg_match_all('/' . $function . '\s*\(\s*["\'`]([a-zA-Z0-9]+)["\'`]/', $source, $match);
            $found[$kind] = array_values(array_unique($match[1]));
        }
        return $found;
    }

    /**
     * Where the draft uses what the source registers: the experience (its passes, its appearance), scenes, targets, shared
     * entities and entries whose JSON names one of its types – `"type":"<t>"` (a component, layer, node type, pass,
     * material, look, a texture as `{ type }`), or a procedural texture's type as a parameter's value
     * @return array<int, array{kind: string, ref: string}>
     */
    public static function usagesOf(string $experienceId, string $source): array
    {
        return self::uses(self::draftTexts($experienceId), $source);
    }

    /**
     * Every plugin's text by id – its files one after the other, the entry first: what registers and Library URLs are read
     * from (the publish's check, the Library's uses)
     * @return array<string, string>
     */
    public static function texts(string $experienceId): array
    {
        $texts = [];
        foreach (Db::run('SELECT id, source, files_json FROM plugins WHERE experience_id = :experience ORDER BY id', ['experience' => $experienceId])->fetchAll() as $row) {
            $texts[(string) $row['id']] = self::joined(self::filesOf($row));
        }
        return $texts;
    }

    /**
     * A Library URL replaced in every plugin's files (the Library's Replace…: a shader's new version reaches the code that
     * loads it), a change each – inside the caller's transaction. Returns how many plugins changed.
     */
    public static function replaceText(string $experienceId, string $from, string $to, array $user): int
    {
        $count = 0;
        foreach (Db::run('SELECT * FROM plugins WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $files = self::filesOf($row);
            $next = array_map(static fn(array $file): array => ['name' => $file['name'], 'text' => str_replace($from, $to, $file['text'])], $files);
            if ($next === $files) continue;
            self::write($experienceId, (string) $row['id'], $row, $next, $user, false);
            $count++;
        }
        return $count;
    }

    /**
     * A plugin as an import's `sources` brings it (#348; #352: `{ id, files }`, Experiences::import): its id and its files
     * as the Code tab takes them (400 invalid-plugin / 413 body-too-large, `$path` names it)
     * @return array{0: string, 1: list<array{name: string, text: string}>}
     */
    public static function checkSource(mixed $item, string $path): array
    {
        if (!$item instanceof stdClass) throw new ApiError(400, 'invalid-plugin', "$path must be { id, files }.");
        $id = $item->id ?? null;
        if (!is_string($id) || !preg_match('/^' . self::ID . '$/', $id)) throw new ApiError(400, 'invalid-plugin', "$path.id: a plugin id is 1–40 lower-case letters, digits or -.");
        return [$id, self::filesFromBody($item, $path)];
    }

    /** Saves a plugin's files as `PUT …/plugins/{pid}` does (a change recorded) – inside the caller's transaction (an import, #348) */
    public static function save(string $experienceId, string $pluginId, array $files, array $user): void
    {
        self::store($experienceId, $pluginId, $files, $user);
    }

    /** The saved plugins by id, each its files as one comparable string (the import's comparison, #348) @return array<string, string> */
    public static function sourceTexts(string $experienceId): array
    {
        $texts = [];
        foreach (Db::run('SELECT id, source, files_json FROM plugins WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) {
            $texts[(string) $row['id']] = self::filesKey(self::filesOf($row));
        }
        return $texts;
    }

    /** A plugin's files as one comparable string (`sourceTexts`) */
    public static function filesKey(array $files): string
    {
        return Editor::encode(self::sorted($files));
    }

    /**
     * Every plugin of the experience with its files (`PluginSource`), by id – what an export writes to `plugins/<id>/` (#322, #352)
     * @return list<array<string, mixed>>
     */
    public static function sources(string $experienceId): array
    {
        $rows = Db::run('SELECT p.*, u.email FROM plugins p LEFT JOIN users u ON u.id = p.updated_by WHERE p.experience_id = :experience ORDER BY p.id', ['experience' => $experienceId])->fetchAll();
        return array_map(static fn(array $row): array => self::summary($row), $rows);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────

    /**
     * @param array<int, array{kind: string, ref: string, text: string}> $texts
     * @return array<int, array{kind: string, ref: string}>
     */
    private static function uses(array $texts, string $source): array
    {
        $needles = [];
        foreach (self::registers($source) as $kind => $types) {
            foreach ($types as $type) $needles[] = ($kind === 'textures' ? ':' : '"type":') . Editor::encode($type);
        }
        if (!$needles) return [];
        $usages = [];
        foreach ($texts as $row) {
            foreach ($needles as $needle) {
                if (!str_contains($row['text'], $needle)) continue;
                $usages[] = ['kind' => $row['kind'], 'ref' => $row['ref']];
                break;
            }
        }
        return $usages;
    }

    /**
     * The draft's rows as text, read once: the experience (its master passes, its appearance), scenes, targets, entities, entries
     * @return array<int, array{kind: string, ref: string, text: string}>
     */
    private static function draftTexts(string $experienceId): array
    {
        $texts = [['kind' => 'experience', 'ref' => $experienceId, 'text' => (string) Db::value('SELECT experience_json FROM experiences WHERE id = :id', ['id' => $experienceId])]];
        foreach (['scene' => 'scenes', 'target' => 'targets', 'entry' => 'entries'] as $kind => $table) {
            foreach (Db::run("SELECT id, data_json FROM $table WHERE experience_id = :experience ORDER BY id", ['experience' => $experienceId])->fetchAll() as $row) {
                $texts[] = ['kind' => $kind, 'ref' => (string) $row['id'], 'text' => (string) $row['data_json']];
            }
        }
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE experience_id = :experience ORDER BY ref', ['experience' => $experienceId])->fetchAll() as $row) {
            $texts[] = ['kind' => 'entity', 'ref' => (string) $row['ref'], 'text' => (string) $row['data_json']];
        }
        return $texts;
    }

    private static function checkExtension(string $name, string $extension): void
    {
        if (in_array($extension, self::EXTENSIONS, true)) return;
        $shader = isset(Assets::KINDS[$extension]) && Assets::KINDS[$extension] === 'shader' ? ' A shader is an asset (POST …/assets) or a file of a plugin (PUT …/plugins/{pid} with files).' : '';
        throw new ApiError(400, 'invalid-file', "\"$name\": a script is a .ts or .js file.$shader");
    }

    /** The uploaded script as a source: text, at most MAX_SOURCE_BYTES, without a byte order mark */
    private static function fileSource(string $name, string $extension): string
    {
        $source = Assets::body(self::MAX_SOURCE_BYTES, self::MAX_SOURCE_BYTES . ' bytes');
        Assets::checkText($name, $extension, $source);
        return str_starts_with($source, "\xEF\xBB\xBF") ? substr($source, 3) : $source;
    }

    /** A plugin id from a file name: its stem in lower case, every other character run a `-` (`Tint Layer.ts` → `tint-layer`) */
    private static function idFrom(string $name): string
    {
        $stem = strtolower((string) pathinfo($name, PATHINFO_FILENAME));
        return trim(substr(trim((string) preg_replace('/[^a-z0-9]+/', '-', $stem), '-'), 0, 40), '-');
    }

    /**
     * The files of a body – `files` [{ name, text }] or `source` (one file, `index.ts`) – checked (`checkFiles`), the entry first
     * @return list<array{name: string, text: string}>
     */
    private static function filesFromBody(stdClass $body, string $path): array
    {
        if (property_exists($body, 'files')) {
            if (!is_array($body->files)) throw new ApiError(400, 'invalid-plugin', "$path: files must be a list of { name, text }.");
            $files = [];
            foreach ($body->files as $i => $file) {
                if (!$file instanceof stdClass || !is_string($file->name ?? null) || !is_string($file->text ?? null)) throw new ApiError(400, 'invalid-plugin', "$path: files[$i] must be { name, text }.");
                $files[] = ['name' => $file->name, 'text' => $file->text];
            }
        } else {
            $source = $body->source ?? null;
            if (!is_string($source)) throw new ApiError(400, 'invalid-plugin', "$path: send files [{ name, text }] or source (a string).");
            if (strlen($source) > self::MAX_SOURCE_BYTES) throw new ApiError(413, 'body-too-large', "$path: the source is larger than " . self::MAX_SOURCE_BYTES . ' bytes.');
            $files = [['name' => self::ENTRY, 'text' => $source]];
        }
        self::checkFiles($files, $path);
        return self::sorted($files);
    }

    /** A plugin's files as the Code tab takes them (shared/types/plugins.ts pluginFilesProblems) */
    private static function checkFiles(array $files, string $path): void
    {
        if (!in_array(self::ENTRY, array_column($files, 'name'), true)) throw new ApiError(400, 'invalid-plugin', "$path: a plugin needs " . self::ENTRY . '.');
        if (count($files) > self::MAX_FILES) throw new ApiError(400, 'invalid-plugin', "$path: a plugin has at most " . self::MAX_FILES . ' files.');
        $seen = [];
        foreach ($files as $file) {
            if (!preg_match(self::FILE_NAME, $file['name'])) {
                throw new ApiError(400, 'invalid-plugin', "$path: \"{$file['name']}\" – a file name is letters, digits, . _ - and .ts, .frag, .vert, .glsl or .wgsl.");
            }
            $lower = strtolower($file['name']);
            if (isset($seen[$lower])) throw new ApiError(400, 'invalid-plugin', "$path: \"{$file['name']}\" is there twice.");
            $seen[$lower] = true;
            if (strlen($file['text']) > self::MAX_SOURCE_BYTES) throw new ApiError(413, 'body-too-large', "$path: {$file['name']} is larger than " . self::MAX_SOURCE_BYTES . ' bytes.');
        }
        if (self::bytes($files) > self::MAX_PLUGIN_BYTES) throw new ApiError(413, 'body-too-large', "$path: the files together are larger than " . self::MAX_PLUGIN_BYTES . ' bytes.');
    }

    /** The entry first, then by name */
    private static function sorted(array $files): array
    {
        usort($files, static fn(array $a, array $b): int => $a['name'] === self::ENTRY ? -1 : ($b['name'] === self::ENTRY ? 1 : strcmp($a['name'], $b['name'])));
        return array_values($files);
    }

    /** @return list<array{name: string, text: string}> a row's files, the entry first */
    private static function filesOf(array $row): array
    {
        $files = [['name' => self::ENTRY, 'text' => (string) $row['source']]];
        $others = json_decode((string) ($row['files_json'] ?? ''), true);
        foreach (is_array($others) ? $others : [] as $file) {
            if (is_array($file) && is_string($file['name'] ?? null) && is_string($file['text'] ?? null)) $files[] = ['name' => $file['name'], 'text' => $file['text']];
        }
        return self::sorted($files);
    }

    /** The files one after the other, the entry first */
    private static function joined(array $files): string
    {
        return implode("\n", array_column(self::sorted($files), 'text'));
    }

    private static function bytes(array $files): int
    {
        return array_sum(array_map(static fn(array $file): int => strlen($file['text']), $files));
    }

    /** @return array{folder: string, by: string|null, at: string}|null */
    private static function originOf(array $row): ?array
    {
        $origin = json_decode((string) ($row['origin_json'] ?? ''), true);
        if (!is_array($origin) || !is_string($origin['folder'] ?? null)) return null;
        return ['folder' => $origin['folder'], 'by' => is_string($origin['by'] ?? null) ? $origin['by'] : null, 'at' => Editor::iso((int) ($origin['at'] ?? 0))];
    }

    /**
     * New files of a plugin (new or not) in one transaction, the experience touched and the change recorded. `$origin`:
     * false keeps the link, null unlinks, { folder } links it (who and when: this save)
     */
    private static function store(string $experienceId, string $pluginId, array $files, array $user, array|null|false $origin = false): void
    {
        Db::transaction(function () use ($experienceId, $pluginId, $files, $user, $origin) {
            $current = Db::one('SELECT * FROM plugins WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $pluginId]);
            self::write($experienceId, $pluginId, $current ?: null, self::sorted($files), $user, $origin);
            Experiences::touchExperience($experienceId);
        });
    }

    /** Writes the row and records the change (inside a transaction) */
    private static function write(string $experienceId, string $pluginId, ?array $current, array $files, array $user, array|null|false $origin): void
    {
        $now = Editor::nowMs();
        $entry = '';
        $others = [];
        foreach ($files as $file) {
            if ($file['name'] === self::ENTRY) $entry = $file['text'];
            else $others[] = $file;
        }
        $originJson = $origin === false
            ? ($current['origin_json'] ?? null)
            : ($origin === null ? null : Editor::encode($origin + ['by' => $user['email'] ?? null, 'at' => $now]));
        $params = [
            'experience' => $experienceId, 'id' => $pluginId, 'source' => $entry, 'files' => $others ? Editor::encode($others) : null,
            'origin' => $originJson, 'by' => $user['id'], 'now' => $now,
        ];
        if ($current) {
            Db::run('UPDATE plugins SET source = :source, files_json = :files, origin_json = :origin, updated_by = :by, updated_at = :now WHERE experience_id = :experience AND id = :id', $params);
        } else {
            Db::run('INSERT INTO plugins (experience_id, id, source, files_json, origin_json, created_by, updated_by, created_at, updated_at) VALUES (:experience, :id, :source, :files, :origin, :by, :by2, :now, :now2)',
                $params + ['by2' => $user['id'], 'now2' => $now]);
        }
        Experiences::recordChange($experienceId, $user, 'plugin', $pluginId, $current ? Editor::encode(self::filesOf($current)) : null, Editor::encode($files));
    }

    /**
     * A plugin as the change log stores it (#352, Reverts): its files `[{ name, text }]` – the single source a change before
     * 6.11.0 holds is its `index.ts` –, null for none; false for anything else (not revertable)
     * @return list<array{name: string, text: string}>|null|false
     */
    public static function filesOfValue(mixed $value): array|null|false
    {
        if ($value === null) return null;
        if (is_string($value)) return [['name' => self::ENTRY, 'text' => $value]];
        if (!is_array($value) || $value === []) return false;
        $files = [];
        foreach ($value as $file) {
            $file = $file instanceof stdClass ? (array) $file : $file;
            if (!is_array($file) || !is_string($file['name'] ?? null) || !is_string($file['text'] ?? null)) return false;
            $files[] = ['name' => $file['name'], 'text' => $file['text']];
        }
        return in_array(self::ENTRY, array_column($files, 'name'), true) ? self::sorted($files) : false;
    }

    /** A plugin's files now, null when the experience has no such plugin (Reverts) @return list<array{name: string, text: string}>|null */
    public static function current(string $experienceId, string $pluginId): ?array
    {
        $row = Db::one('SELECT * FROM plugins WHERE experience_id = :experience AND id = :id' . Db::forUpdate(), ['experience' => $experienceId, 'id' => $pluginId]);
        return $row ? self::filesOf($row) : null;
    }

    /**
     * A plugin's files written back (Reverts, inside its transaction – the revert records the change): new files, or the
     * plugin gone (null). Its link stays as it is.
     * @param list<array{name: string, text: string}>|null $files
     */
    public static function restore(string $experienceId, string $pluginId, ?array $files, array $user): void
    {
        $params = ['experience' => $experienceId, 'id' => $pluginId];
        if ($files === null) {
            Db::run('DELETE FROM plugins WHERE experience_id = :experience AND id = :id', $params);
            return;
        }
        $entry = '';
        $others = [];
        foreach (self::sorted(array_map(static fn($f) => (array) $f, $files)) as $file) {
            if ($file['name'] === self::ENTRY) $entry = (string) $file['text'];
            else $others[] = ['name' => (string) $file['name'], 'text' => (string) $file['text']];
        }
        $now = Editor::nowMs();
        $values = $params + ['source' => $entry, 'files' => $others ? Editor::encode($others) : null, 'by' => $user['id'], 'now' => $now];
        if (Db::value('SELECT id FROM plugins WHERE experience_id = :experience AND id = :id', $params) !== null) {
            Db::run('UPDATE plugins SET source = :source, files_json = :files, updated_by = :by, updated_at = :now WHERE experience_id = :experience AND id = :id', $values);
        } else {
            Db::run('INSERT INTO plugins (experience_id, id, source, files_json, created_by, updated_by, created_at, updated_at) VALUES (:experience, :id, :source, :files, :by, :by2, :now, :now2)',
                $values + ['by2' => $user['id'], 'now2' => $now]);
        }
    }

    /** @return array<string, mixed> */
    private static function row(string $experienceId, string $pluginId): array
    {
        $row = Db::one('SELECT p.*, u.email FROM plugins p LEFT JOIN users u ON u.id = p.updated_by WHERE p.experience_id = :experience AND p.id = :id', ['experience' => $experienceId, 'id' => $pluginId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such plugin.');
        return $row;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function summary(array $row): array
    {
        $files = self::filesOf($row);
        return [
            'id' => $row['id'], 'files' => $files, 'size' => self::bytes($files),
            'updatedAt' => Editor::iso((int) $row['updated_at']), 'updatedBy' => $row['email'] ?? null, 'origin' => self::originOf($row),
        ];
    }
}
