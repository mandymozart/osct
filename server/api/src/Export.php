<?php
declare(strict_types=1);

/**
 * GET /editor/experiences/{id}/export[?build=] (#322, docs/server.md "Export"): everything an export of the experience needs
 * in one read – the input of `osct content export`, which writes the content source folder from it. No file is copied or
 * downloaded here: the answer names the files, the CLI fetches them.
 *
 * - `configuration`: the draft (`ContentVersion::assemble` – the one assembly the draft endpoints and Publish use), or with
 *   `build` a published version as the content store holds it (`<env>/<experience>/<build>/game.config.json` of the environment the
 *   publish log names for that build).
 * - `files`: every file the configuration names, in the order it names them, plus the print layout's files – its URL, its
 *   content path (`/assets/content/…`, null for a Library upload), size and checksums where they are known: an upload's
 *   from its asset row (`sha256` in full), an imported file's from the import's files.json (`size` and `v`, the first 12
 *   hex digits of its sha256 – the full one is not recorded), a Code tab plugin a publish put into the version (`version`,
 *   its URL in the environment, nothing else known). A value that looks like a file and is none of these is `unknown`.
 * - `layout`: the print layout (`layout/layout.json` and its sheets – the reader's card back reads its `cover-front`
 *   sheet) when the import's files hold it, else null. Its files are in `files` too.
 * - `plugins`: the Code tab's sources (`Plugins::sources`) – always the current ones, the database keeps no source per version.
 * - `credits`: every credit line of the Library (`Assets::creditsOf`, by file URL) – the configuration's `credits` carries only
 *   those of the files it uses.
 *
 * Rights: those of the draft – an editor (`Editor::user`).
 */
final class Export
{
    /** A value that names a file: a URL or a content path ending in a file extension the content uses */
    private const FILE = '#^(?:https?://|/assets/content/)\S+\.(?:glb|gltf|mp4|webm|mov|m4v|jpe?g|png|webp|gif|svg|mp3|m4a|ogg|wav|glsl|frag|vert|wgsl|vtt|json|js|hdr|exr|ktx2)(?:[?\#]\S*)?$#i';
    private const CONTENT_PREFIX = '/assets/content/';

    public static function read(string $experienceId): never
    {
        Editor::user();
        Experiences::exists($experienceId);
        $build = $_GET['build'] ?? null;
        Http::json(200, self::data($experienceId, is_string($build) && $build !== '' ? $build : null, $build !== null && !is_string($build)));
    }

    /** The export file's format (#348): its `format` and `formatVersion` – an import body ({ configuration, files, assetsBase, sources }) with what it is of */
    public const FILE_FORMAT = 'osct-export';
    public const FILE_FORMAT_VERSION = 1;

    /**
     * GET /editor/experiences/{id}/export/file[?build=] (#348) → the experience as one JSON file to download
     * (`Content-Disposition: attachment; filename="<id>-<build>.osct.json"`): `{ format: "osct-export", formatVersion: 1,
     * experience, title, build, exportedAt, source, configuration, files, assetsBase?, sources }` – the draft (or a published
     * build, `data`) with its files.json and the Code tab's sources. It is an import body as it is: the editor's Import
     * (file) and `POST …/import` take it back (`configuration`, `files`, `assetsBase`, `sources`). The media are not in it –
     * the configuration names them by URL (the CDN's, the Library's), so the file is small and the import points at the same
     * files. Rights: those of the draft.
     */
    public static function file(string $experienceId): never
    {
        Editor::user();
        Experiences::exists($experienceId);
        $asked = $_GET['build'] ?? null;
        $assetsBase = null;
        if ($asked === null || $asked === '') {
            $version = ContentVersion::assemble($experienceId);
            [$build, $configuration, $files, $source] = [$version['build'], $version['configuration'], $version['files'], ['kind' => 'draft']];
        } else {
            $data = self::data($experienceId, is_string($asked) ? $asked : null, !is_string($asked));
            $build = (string) $data['build'];
            $configuration = $data['configuration'];
            $source = $data['source'];
            $env = (string) $source['env'];
            $files = self::json(ContentStore::for($env, $experienceId)->get("$build/files.json"));
            if (!$files instanceof stdClass) $files = new stdClass();
            // A published version names its plugins' modules by content paths in its own folder
            $assetsBase = self::versionBase($env, $experienceId, $build);
        }
        $experience = $configuration->experience ?? null;
        $answer = [
            'format' => self::FILE_FORMAT,
            'formatVersion' => self::FILE_FORMAT_VERSION,
            'experience' => $experienceId,
            'title' => $experience instanceof stdClass && is_string($experience->title ?? null) ? $experience->title : $experienceId,
            'build' => $build,
            'appVersion' => Version::APP,
            'exportedAt' => Editor::iso(),
            'source' => $source,
            'configuration' => $configuration,
            'files' => $files,
        ];
        if ($assetsBase !== null) $answer['assetsBase'] = $assetsBase;
        $answer['sources'] = array_map(static fn(array $plugin): array => ['id' => $plugin['id'], 'source' => $plugin['source']], Plugins::sources($experienceId));
        header('Content-Disposition: attachment; filename="' . $experienceId . '-' . $build . '.osct.json"');
        Http::json(200, $answer);
    }

    /**
     * The answer of the endpoint: the draft (`$build` null) or a published build as the content store holds it
     * @return array<string, mixed>
     */
    public static function data(string $experienceId, ?string $build, bool $invalid = false): array
    {
        if ($build === null && !$invalid) {
            $version = ContentVersion::assemble($experienceId);
            return self::answer($experienceId, ['kind' => 'draft'], $version['build'], $version['hash'], $version['schema'], $version['configuration'], $version['files'], null);
        }
        if ($build === null || !preg_match(ContentStore::BUILD, $build)) throw new ApiError(400, 'invalid-build', 'build must be a published build (12 hex digits).');
        $row = Db::one('SELECT v.env, v.hash, v.published_at, u.email FROM experience_versions v LEFT JOIN users u ON u.id = v.published_by WHERE v.experience_id = :experience AND v.build = :build ORDER BY v.published_at DESC LIMIT 1',
            ['experience' => $experienceId, 'build' => $build]);
        if (!$row) throw new ApiError(404, 'unknown-build', "The publish log has no version $build of this experience.");
        $env = (string) $row['env'];
        $store = ContentStore::for($env, $experienceId);
        $configuration = self::json($store->get("$build/game.config.json"));
        if (!$configuration instanceof stdClass) throw new ApiError(404, 'build-missing', "Version $build is in the publish log, but $env's content store has no readable game.config.json of it.", ['env' => $env]);
        $files = self::json($store->get("$build/files.json"));
        if (!$files instanceof stdClass) $files = new stdClass();
        $source = ['kind' => 'published', 'env' => $env, 'publishedAt' => Editor::iso((int) $row['published_at']), 'publishedBy' => $row['email']];
        $version = $configuration->version ?? null;
        $hash = $version instanceof stdClass && is_string($version->hash ?? null) ? $version->hash : (string) $row['hash'];
        $schema = $version instanceof stdClass && is_string($version->schema ?? null) ? $version->schema : '';
        return self::answer($experienceId, $source, $build, $hash, $schema, $configuration, $files, self::versionBase($env, $experienceId, $build));
    }

    /**
     * The answer for a version a publish is writing (the export archive, `ExportArchive`): its configuration and files as
     * they go into the store, not read back. `publishedBy` stays out – the archive lies where readers can reach it.
     * @param array{configuration: stdClass, files: stdClass, build: string, hash: string, schema: string} $version
     * @return array<string, mixed>
     */
    public static function ofPublish(string $experienceId, array $version, string $env, string $publishedAt): array
    {
        $source = ['kind' => 'published', 'env' => $env, 'publishedAt' => $publishedAt, 'publishedBy' => null];
        return self::answer($experienceId, $source, $version['build'], $version['hash'], $version['schema'], $version['configuration'], $version['files'], self::versionBase($env, $experienceId, $version['build']));
    }

    /** Where a published build's own files lie for readers (`<environment URL>/<experience>/<build>`), null when unknown */
    public static function versionBase(string $env, string $experienceId, string $build): ?string
    {
        // A Code tab plugin the publish carried lies in the version's own folder (its `src` a content path, #78)
        foreach (ContentStore::describe() as $described) {
            if ($described['env'] === $env && $described['url'] !== null) return rtrim($described['url'], '/') . "/$experienceId/$build";
        }
        return null;
    }

    /**
     * @param array<string, mixed> $source
     * @return array<string, mixed>
     */
    private static function answer(string $experienceId, array $source, string $build, string $hash, string $schema, stdClass $configuration, stdClass $files, ?string $versionBase): array
    {
        [$list, $layout] = self::files($experienceId, $configuration, $files, $versionBase);
        return [
            'experience' => $experienceId,
            'source' => $source,
            'build' => $build,
            'hash' => $hash,
            'schema' => $schema,
            'appVersion' => Version::APP,
            'exportedAt' => Editor::iso(),
            'configuration' => $configuration,
            'files' => $list,
            'unknown' => count(array_filter($list, static fn(array $file): bool => $file['origin'] === 'unknown')),
            'layout' => $layout,
            'plugins' => Plugins::sources($experienceId),
            'credits' => (object) Assets::creditsOf($experienceId),
        ];
    }

    /**
     * The files the configuration names (and the layout's), each once, with what is known of them
     * @return array{0: list<array{url: string, path: ?string, origin: string, size: ?int, sha256: ?string, v: ?string}>, 1: ?array{file: string, files: list<string>}}
     */
    private static function files(string $experienceId, stdClass $configuration, stdClass $files, ?string $versionBase): array
    {
        // The Library's uploads, every version (a published build may name an older one), by URL
        $uploads = [];
        $params = ['experience' => $experienceId];
        foreach (Db::run('SELECT v.url, v.size, v.sha256 FROM asset_versions v JOIN assets a ON a.id = v.asset_id WHERE a.experience_id = :experience', $params)->fetchAll() as $row) {
            $uploads[(string) $row['url']] = ['size' => (int) $row['size'], 'sha256' => (string) $row['sha256']];
        }
        foreach (Db::run('SELECT url, size, sha256 FROM assets WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $uploads[(string) $row['url']] = ['size' => (int) $row['size'], 'sha256' => (string) $row['sha256']];
        }
        // The import's files.json, keyed as the configuration names them (below the assets base, or content paths)
        $imported = [];
        foreach (get_object_vars($files) as $key => $info) {
            $imported[(string) $key] = $info instanceof stdClass ? $info : new stdClass();
        }

        $list = [];
        $add = static function (string $value) use (&$list, $uploads, $imported, $versionBase): void {
            if (isset($list[$value])) return;
            $path = self::contentPath($value);
            if (isset($uploads[$value])) {
                $sha = strtolower($uploads[$value]['sha256']);
                $list[$value] = ['url' => $value, 'path' => null, 'origin' => 'upload', 'size' => $uploads[$value]['size'],
                    'sha256' => preg_match('/^[0-9a-f]{64}$/', $sha) ? $sha : null, 'v' => preg_match('/^[0-9a-f]{12}/', $sha) ? substr($sha, 0, 12) : null];
            } elseif (isset($imported[$value])) {
                $info = $imported[$value];
                $list[$value] = ['url' => $value, 'path' => $path, 'origin' => 'import', 'size' => is_numeric($info->size ?? null) ? (int) $info->size : null,
                    'sha256' => null, 'v' => is_string($info->v ?? null) ? $info->v : null];
            } elseif (preg_match(self::FILE, $value)) {
                $inVersion = $versionBase !== null && str_starts_with($value, self::CONTENT_PREFIX);
                $list[$value] = ['url' => $inVersion ? $versionBase . $value : $value, 'path' => $path, 'origin' => $inVersion ? 'version' : 'unknown', 'size' => null, 'sha256' => null, 'v' => null];
            }
        };
        $walk = static function (mixed $node, ?string $key) use (&$walk, $add): void {
            if (is_string($node)) {
                $add($node);
            } elseif ($node instanceof stdClass) {
                // `credits` is keyed by the file URLs the rest names; its values are lines of text
                foreach (get_object_vars($node) as $k => $value) if (!($key === null && $k === 'credits')) $walk($value, (string) $k);
            } elseif (is_array($node)) {
                foreach ($node as $value) $walk($value, $key);
            }
        };
        $walk($configuration, null);

        // The print layout: layout.json and its sheets, when the import's files hold it (AssetNames::LAYOUT_FILE)
        $layout = null;
        $layoutFiles = array_values(array_filter(array_keys($imported), static fn(string $key): bool => str_starts_with((string) self::contentPath($key), AssetNames::LAYOUT_PATH)));
        $layoutFile = array_values(array_filter($layoutFiles, static fn(string $key): bool => self::contentPath($key) === AssetNames::LAYOUT_FILE));
        if ($layoutFile) {
            foreach ($layoutFiles as $key) $add($key);
            $layout = ['file' => $layoutFile[0], 'files' => $layoutFiles];
        }
        return [array_values($list), $layout];
    }

    /** The content path (`/assets/content/…`) of a URL below an assets base or of a content path, else null */
    private static function contentPath(string $value): ?string
    {
        $at = strpos($value, self::CONTENT_PREFIX);
        if ($at === false) return null;
        $path = substr($value, $at);
        $cut = strcspn($path, '?#');
        return substr($path, 0, $cut);
    }

    private static function json(?string $raw): mixed
    {
        if ($raw === null) return null;
        try {
            return json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }
    }
}
