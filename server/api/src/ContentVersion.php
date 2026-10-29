<?php
declare(strict_types=1);

/**
 * A book's rows as a content version – the shape the content build writes (shared/types/game-config.ts
 * `GameConfiguration`; latest.json and files.json as in shared/types/content-manifest.ts). The draft endpoints
 * serve it straight from the rows and a publish writes it to the content store: one assembly, so what the editor
 * previews is what readers get.
 *
 * `version` = { version: this server's app version, timestamp: now, hash, schema: the imported schema }; `plugins`
 * (the compiled plugins the import declared) follows `tutorial` when the book has any, as the build writes it. The hash
 * is the sha256 of the configuration JSON without timestamp and hash – the same rows give the same hash, and the
 * build name is its first 12 hex digits. With an assets base every content path (`/assets/content/…` under src,
 * imageSrc, image, illustration, and the keys of files.json) becomes a URL below it: a published version points at
 * the imported build's media, no file is copied.
 */
final class ContentVersion
{
    /** Keys whose `/assets/content/…` values are content paths */
    private const PATH_KEYS = ['src', 'imageSrc', 'image', 'illustration'];
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
        $spreads = [];
        foreach (Db::run('SELECT data_json FROM spreads WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $spreads[] = Editor::decode($row['data_json']);
        }
        $entries = [];
        foreach (Db::run('SELECT id, data_json FROM entries WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $entry = Editor::decode($row['data_json']);
            if (isset($targets[$row['id']])) $entry->target = $targets[$row['id']];
            $entries[] = $entry;
        }
        $entities = new stdClass();
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $entities->{$row['ref']} = Editor::decode($row['data_json']);
        }

        $schema = (string) $book['content_schema'];
        $configuration = (object) [
            'version' => (object) ['version' => Version::APP, 'schema' => $schema],
            'book' => Editor::decode($book['book_json']),
            'initialSpreadId' => $book['initial_spread_id'],
            'spreads' => $spreads,
            'entries' => $entries,
            'entities' => $entities,
            'tutorial' => Editor::decode($book['tutorial_json']) ?? [],
        ];
        $plugins = Editor::decode($book['plugins_json'] ?? '[]');
        if (is_array($plugins) && $plugins) $configuration->plugins = $plugins;
        $files = Editor::decode($book['files_json']);
        if (!$files instanceof stdClass) $files = new stdClass();

        $base = rtrim((string) $book['assets_base'], '/');
        if ($base !== '') {
            self::rewrite($configuration, $base);
            $files = self::rewriteFiles($files, $base);
        }

        $hash = hash('sha256', Editor::encode($configuration));
        $configuration->version = (object) ['version' => Version::APP, 'timestamp' => Editor::iso(), 'hash' => $hash, 'schema' => $schema];
        return ['configuration' => $configuration, 'files' => $files, 'hash' => $hash, 'build' => substr($hash, 0, 12), 'schema' => $schema];
    }

    /** GET /editor/books/{id}/draft/latest.json → the draft's ContentManifest (no-store: it changes with every edit) */
    public static function draftManifest(string $bookId): never
    {
        Editor::user();
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
