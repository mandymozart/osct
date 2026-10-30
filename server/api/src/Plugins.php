<?php
declare(strict_types=1);

/**
 * The editor's plugin sources (docs/server.md "Plugin sources", agents/research/2026-10-29-code-in-the-editor.md):
 * the TypeScript a book's author writes in the editor's Code tab, one row per plugin id. The editor transpiles and
 * runs it on its own stage; nothing here reaches a publish – the configuration's `plugins` list (the compiled
 * modules) has one writer, the content build, and comes in with the import. Every save records a change.
 */
final class Plugins
{
    /** A plugin id: the folder's name in the content source (shared/types/plugins.ts PLUGIN_ID_PATTERN) */
    public const ID = '[a-z][a-z0-9-]{0,39}';
    /** A source larger than this is refused */
    public const MAX_SOURCE_BYTES = 262144;

    /** GET /editor/books/{id}/plugins → { plugins: [{ id, size, updatedAt, updatedBy }] } */
    public static function list(string $bookId): never
    {
        Editor::user();
        Books::exists($bookId);
        $plugins = [];
        $rows = Db::run('SELECT p.id, LENGTH(p.source) AS size, p.updated_at, u.email FROM plugins p LEFT JOIN users u ON u.id = p.updated_by WHERE p.book_id = :book ORDER BY p.id', ['book' => $bookId])->fetchAll();
        foreach ($rows as $row) {
            $plugins[] = ['id' => $row['id'], 'size' => (int) $row['size'], 'updatedAt' => Editor::iso((int) $row['updated_at']), 'updatedBy' => $row['email']];
        }
        Http::json(200, ['plugins' => $plugins]);
    }

    /** GET /editor/books/{id}/plugins/{pid} → { plugin: { id, source, size, updatedAt, updatedBy } } */
    public static function get(string $bookId, string $pluginId): never
    {
        Editor::user();
        Books::exists($bookId);
        Http::json(200, ['plugin' => self::summary(self::row($bookId, $pluginId))]);
    }

    /** PUT /editor/books/{id}/plugins/{pid} { source } → { plugin }: a new plugin or a new source, a change recorded */
    public static function put(string $bookId, string $pluginId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        if (!preg_match('/^' . self::ID . '$/', $pluginId)) throw new ApiError(400, 'invalid-plugin', 'A plugin id is 1–40 lower-case letters, digits or -.');
        $body = Editor::body();
        $source = $body->source ?? null;
        if (!is_string($source)) throw new ApiError(400, 'invalid-plugin', 'source must be a string.');
        if (strlen($source) > self::MAX_SOURCE_BYTES) throw new ApiError(413, 'body-too-large', 'The source is larger than ' . self::MAX_SOURCE_BYTES . ' bytes.');
        $now = Editor::nowMs();
        Db::transaction(function () use ($bookId, $pluginId, $source, $user, $now) {
            $params = ['book' => $bookId, 'id' => $pluginId];
            $current = Db::one('SELECT source FROM plugins WHERE book_id = :book AND id = :id', $params);
            if ($current) {
                Db::run('UPDATE plugins SET source = :source, updated_by = :by, updated_at = :now WHERE book_id = :book AND id = :id', $params + ['source' => $source, 'by' => $user['id'], 'now' => $now]);
            } else {
                Db::run('INSERT INTO plugins (book_id, id, source, created_by, updated_by, created_at, updated_at) VALUES (:book, :id, :source, :by, :by2, :now, :now2)',
                    $params + ['source' => $source, 'by' => $user['id'], 'by2' => $user['id'], 'now' => $now, 'now2' => $now]);
            }
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'plugin', $pluginId, $current ? Editor::encode($current['source']) : null, Editor::encode($source));
        });
        Http::json(200, ['plugin' => self::summary(self::row($bookId, $pluginId))]);
    }

    /** DELETE /editor/books/{id}/plugins/{pid} → 204 (a change recorded) */
    public static function delete(string $bookId, string $pluginId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $row = self::row($bookId, $pluginId);
        Db::transaction(function () use ($bookId, $pluginId, $row, $user) {
            Db::run('DELETE FROM plugins WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $pluginId]);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'plugin', $pluginId, Editor::encode($row['source']), 'null');
        });
        Http::json(204, null);
    }

    /** The book has at least one source in the Code tab */
    public static function hasSources(string $bookId): bool
    {
        return Db::value('SELECT id FROM plugins WHERE book_id = :book LIMIT 1', ['book' => $bookId]) !== null;
    }

    /** @return array<string, mixed> */
    private static function row(string $bookId, string $pluginId): array
    {
        $row = Db::one('SELECT p.*, u.email FROM plugins p LEFT JOIN users u ON u.id = p.updated_by WHERE p.book_id = :book AND p.id = :id', ['book' => $bookId, 'id' => $pluginId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such plugin.');
        return $row;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function summary(array $row): array
    {
        return ['id' => $row['id'], 'source' => $row['source'], 'size' => strlen((string) $row['source']), 'updatedAt' => Editor::iso((int) $row['updated_at']), 'updatedBy' => $row['email'] ?? null];
    }
}
