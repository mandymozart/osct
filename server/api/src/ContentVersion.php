<?php
declare(strict_types=1);

/**
 * A book's rows as a content version – the shape the content build writes (shared/types/game-config.ts
 * `GameConfiguration`; latest.json and files.json as in shared/types/content-manifest.ts). The draft endpoints
 * serve it straight from the rows and a publish writes it to the content store: one assembly, so what the editor
 * previews is what readers get.
 *
 * Content schema 3.0 (#319): `scenes` in order, `initialScene`, `groups` when the book has any, every entry with its
 * `scene` (and `surface`), every target with its `place`. `version` = { version: this server's app version, timestamp:
 * now, hash, schema: the book's schema }; `plugins` (the compiled
 * plugins the import declared) follows it when the book has any, as the build writes it, and `subtitles` (the subtitle
 * files of the book's videos, read from the files' names – `Subtitles`) and `credits` (the Library's credit lines of the
 * files the book uses, #292) when there are any. The hash is the sha256 of the
 * configuration JSON without timestamp and hash – the same rows give the same hash, and the build name is its first 12
 * hex digits. With an assets base every content path (`/assets/content/…` under src, imageSrc, image, and the keys of
 * files.json) becomes a URL below it: a published version points at the imported build's media, no file is copied.
 */
final class ContentVersion
{
    /** Keys whose `/assets/content/…` values are content paths */
    private const PATH_KEYS = ['src', 'imageSrc', 'image'];
    private const CONTENT_PREFIX = '/assets/content/';

    /**
     * The book's current draft.
     * @return array{configuration: stdClass, files: stdClass, hash: string, build: string, schema: string}
     */
    public static function assemble(string $bookId): array
    {
        $book = Db::one('SELECT * FROM books WHERE id = :id', ['id' => $bookId]);
        if (!$book) throw new ApiError(404, 'not-found', 'No such book.');
        $params = ['book' => $bookId];

        $targets = [];
        foreach (Db::run('SELECT entry_id, data_json FROM targets WHERE book_id = :book', $params)->fetchAll() as $row) {
            $targets[$row['entry_id']] = Editor::decode($row['data_json']);
        }
        // The scenes in order (#307) as the content holds them
        $context = Scenes::context($bookId);
        $groups = Scenes::groups($book);
        $scenes = Scenes::shown($context, array_map(static fn($g) => (string) $g->id, $groups));
        $surfaces = [];
        foreach ($scenes as $scene) $surfaces[(string) $scene->id] = Scenes::surfaceIds($scene);
        $entries = [];
        foreach (Db::run('SELECT id, spread_id, data_json FROM entries WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $scene = (string) $row['spread_id'];
            if (!isset($surfaces[$scene])) continue;
            $entry = self::withScene(Editor::decode($row['data_json']), $scene);
            // A surface that is not on its scene is left out (the guard would refuse it)
            if (property_exists($entry, 'surface') && !in_array($entry->surface, $surfaces[$scene], true)) unset($entry->surface);
            if (isset($targets[$row['id']])) {
                $target = $targets[$row['id']];
                $place = $target->place ?? null;
                if ($place instanceof stdClass) {
                    $on = $place->surface ?? null;
                    if ($on !== null ? !in_array($on, $surfaces[$scene], true) : count($surfaces[$scene]) > 1) unset($target->place);
                }
                $entry->target = $target;
            }
            $entries[] = $entry;
        }
        $entities = new stdClass();
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $entities->{$row['ref']} = Editor::decode($row['data_json']);
        }

        $schema = (string) $book['content_schema'];
        $configuration = [
            'version' => (object) ['version' => Version::APP, 'schema' => $schema],
            'book' => Editor::decode($book['book_json']),
            'initialScene' => $book['initial_spread_id'],
            'scenes' => $scenes,
        ];
        // The groups scenes name – only when the book has any
        if ($groups) $configuration['groups'] = array_map(static fn(stdClass $g) => (object) ['id' => $g->id, 'label' => (string) ($g->label ?? '')], $groups);
        $configuration = (object) ($configuration + [
            'entries' => $entries,
            'entities' => $entities,
        ]);
        $plugins = Editor::decode($book['plugins_json'] ?? '[]');
        if (is_array($plugins) && $plugins) $configuration->plugins = $plugins;
        $files = Editor::decode($book['files_json']);
        if (!$files instanceof stdClass) $files = new stdClass();

        $base = rtrim((string) $book['assets_base'], '/');
        // The subtitle files of the book's videos, paired by their names (`Subtitles`) – already below the assets base
        $subtitles = Subtitles::of($bookId, $files, $base);
        if ($base !== '') {
            self::rewrite($configuration, $base);
            $files = self::rewriteFiles($files, $base);
        }
        if ($subtitles) $configuration->subtitles = $subtitles;
        // The credit lines of the files the book uses (#292) – the Library keys them by the URL the configuration names
        $credits = self::credits(Assets::creditsOf($bookId), $configuration);
        if ($credits) $configuration->credits = (object) $credits;

        $hash = hash('sha256', Editor::encode($configuration));
        $configuration->version = (object) ['version' => Version::APP, 'timestamp' => Editor::iso(), 'hash' => $hash, 'schema' => $schema];
        return ['configuration' => $configuration, 'files' => $files, 'hash' => $hash, 'build' => substr($hash, 0, 12), 'schema' => $schema];
    }

    /**
     * The entry with its `scene` right after its `title` (then its `surface`), as the content build writes it; a `scene`
     * the row kept is replaced
     */
    public static function withScene(stdClass $entry, string $scene): stdClass
    {
        $result = new stdClass();
        foreach (get_object_vars($entry) as $key => $value) {
            if ($key === 'scene' || $key === 'surface' || $key === 'page') continue;
            $result->{$key} = $value;
            if ($key === 'title') {
                $result->scene = $scene;
                if (property_exists($entry, 'surface')) $result->surface = $entry->surface;
            }
        }
        if (!property_exists($result, 'scene')) {
            $result->scene = $scene;
            if (property_exists($entry, 'surface')) $result->surface = $entry->surface;
        }
        return $result;
    }

    /**
     * The credit lines (#292, file URL → line) of the files the configuration names anywhere – a file of the Library
     * the book does not use is left out; sorted by URL, so the same rows give the same hash
     * @param array<string, string> $credits
     * @return array<string, string>
     */
    public static function credits(array $credits, stdClass $configuration): array
    {
        if (!$credits) return [];
        $used = [];
        $collect = static function (mixed $node) use (&$collect, &$used): void {
            if (is_string($node)) $used[$node] = true;
            elseif ($node instanceof stdClass || is_array($node)) foreach ((array) $node as $value) $collect($value);
        };
        $collect($configuration);
        $result = array_filter($credits, static fn(string $line, string $url): bool => isset($used[$url]) && trim($line) !== '', ARRAY_FILTER_USE_BOTH);
        ksort($result, SORT_STRING);
        return $result;
    }

    /**
     * The version with plugins of the Code tab declared (#78, `Books::publish`): each replaces a declared plugin of the same
     * id, the others follow in their order. Their `src` is a content path the version's own folder holds – not rewritten
     * below the assets base. The hash and the build follow the new configuration, so other code is another version.
     * @param array{configuration: stdClass, files: stdClass, hash: string, build: string, schema: string} $version
     * @param list<stdClass> $plugins
     * @return array{configuration: stdClass, files: stdClass, hash: string, build: string, schema: string}
     */
    public static function withPlugins(array $version, array $plugins): array
    {
        $configuration = $version['configuration'];
        $byId = [];
        foreach ($plugins as $plugin) $byId[$plugin->id] = $plugin;
        $declared = [];
        foreach ((array) ($configuration->plugins ?? []) as $plugin) {
            $id = $plugin instanceof stdClass ? ($plugin->id ?? null) : null;
            if (is_string($id) && isset($byId[$id])) {
                $declared[] = $byId[$id];
                unset($byId[$id]);
            } else {
                $declared[] = $plugin;
            }
        }
        $configuration->plugins = [...$declared, ...array_values($byId)];
        $configuration->version = (object) ['version' => Version::APP, 'schema' => $version['schema']];
        $hash = hash('sha256', Editor::encode($configuration));
        $configuration->version = (object) ['version' => Version::APP, 'timestamp' => Editor::iso(), 'hash' => $hash, 'schema' => $version['schema']];
        return [...$version, 'configuration' => $configuration, 'hash' => $hash, 'build' => substr($hash, 0, 12)];
    }

    /** GET /editor/books/{id}/draft/latest.json → the draft's ContentManifest (no-store: it changes with every edit) */
    public static function draftManifest(string $bookId): never
    {
        Editor::user();
        Books::exists($bookId);
        $version = self::assemble($bookId);
        Http::json(200, self::manifest($version, Editor::iso(), $bookId));
    }

    /**
     * GET /editor/books/{id}/draft/{build}/game.config.json | files.json – always the current draft: the build in the
     * path is the one latest.json named a moment ago, an edit in between is no reason to fail the loader.
     */
    public static function draftFile(string $bookId, string $file): never
    {
        Editor::user();
        Books::exists($bookId);
        $version = self::assemble($bookId);
        Http::json(200, $file === 'files' ? $version['files'] : $version['configuration']);
    }

    /**
     * latest.json of a version of the book (content-manifest.ts `ContentManifest`)
     * @param array{hash: string, build: string, schema: string} $version
     * @return array<string, string>
     */
    public static function manifest(array $version, string $activatedAt, string $bookId): array
    {
        return ['build' => $version['build'], 'hash' => $version['hash'], 'schema' => $version['schema'], 'version' => Version::APP, 'activatedAt' => $activatedAt, 'book' => $bookId];
    }

    /** Content paths under PATH_KEYS become URLs below `$base`, everywhere in the configuration */
    private static function rewrite(mixed $node, string $base): void
    {
        if ($node instanceof stdClass) {
            foreach (get_object_vars($node) as $key => $value) {
                if (in_array($key, self::PATH_KEYS, true) && is_string($value) && str_starts_with($value, self::CONTENT_PREFIX)) {
                    $node->$key = $base . $value;
                } else {
                    self::rewrite($value, $base);
                }
            }
        } elseif (is_array($node)) {
            foreach ($node as $value) self::rewrite($value, $base);
        }
    }

    /** files.json with its keys (content paths) rewritten the same way, in the same order */
    public static function rewriteFiles(stdClass $files, string $base): stdClass
    {
        $result = new stdClass();
        foreach (get_object_vars($files) as $path => $file) {
            $result->{str_starts_with($path, self::CONTENT_PREFIX) ? $base . $path : $path} = $file;
        }
        return $result;
    }
}
