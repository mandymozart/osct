<?php
declare(strict_types=1);

/**
 * The editor's plugin sources (docs/server.md "Plugin sources", docs/plugins.md):
 * the TypeScript a book's author writes in the editor's Code tab, one row per plugin id. The editor transpiles and
 * runs it on its own stage; nothing here reaches a publish – the configuration's `plugins` list (the compiled
 * modules) has one writer, the content build, and comes in with the import. Every save records a change.
 *
 * The Library shows the same rows as its scripts (#186): a `.ts` / `.js` file uploaded there becomes a source here
 * (`upload`, its id from the file's name), a file replaces one (`replaceFile`) – no second copy. A source is **used**
 * where the draft names a type it registers (`usagesOf`: read from its text like shared/api/rules.ts `pluginTypes`), and
 * its delete is refused while it is (409 `plugin-in-use`, forced with `?force=1`).
 */
final class Plugins
{
    /** A plugin id: the folder's name in the content source (shared/types/plugins.ts PLUGIN_ID_PATTERN) */
    public const ID = '[a-z][a-z0-9-]{0,39}';
    /** A source larger than this is refused */
    public const MAX_SOURCE_BYTES = 262144;
    /** The extensions of a script file (JavaScript is TypeScript too) */
    public const EXTENSIONS = ['ts', 'js'];
    /** What a source registers, by kind → the API function (`api.registerLayer("tint", …)` – shared/api/rules.ts `PLUGIN_REGISTER_FUNCTIONS`) */
    private const REGISTERS = [
        'components' => 'registerComponent', 'layers' => 'registerLayer', 'nodeTypes' => 'registerNodeType', 'passes' => 'registerPass',
        'materials' => 'registerMaterial', 'textures' => 'registerTexture',
    ];

    /** GET /editor/books/{id}/plugins → { plugins: [{ id, size, usages, updatedAt, updatedBy }] } */
    public static function list(string $bookId): never
    {
        Editor::user();
        Books::exists($bookId);
        $plugins = [];
        $rows = Db::run('SELECT p.id, p.source, p.updated_at, u.email FROM plugins p LEFT JOIN users u ON u.id = p.updated_by WHERE p.book_id = :book ORDER BY p.id', ['book' => $bookId])->fetchAll();
        $texts = $rows ? self::draftTexts($bookId) : [];
        foreach ($rows as $row) {
            $plugins[] = [
                'id' => $row['id'], 'size' => strlen((string) $row['source']), 'usages' => count(self::uses($texts, (string) $row['source'])),
                'updatedAt' => Editor::iso((int) $row['updated_at']), 'updatedBy' => $row['email'],
            ];
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
        self::store($bookId, $pluginId, $source, $user);
        Http::json(200, ['plugin' => self::summary(self::row($bookId, $pluginId))]);
    }

    /**
     * POST /editor/books/{id}/plugins[?id=] – a script file as the raw body, `X-File-Name: <name>.ts|.js` → 201 { plugin }:
     * a new source with the id from `?id=` or the file's name (`Tint Layer.ts` → `tint-layer`). 400 `invalid-file` (not
     * .ts / .js, empty, no text), 400 `invalid-plugin` (no id to be had), 409 `plugin-exists` (`plugin`: the id – replace
     * it with PUT …/file), 413 `body-too-large` (MAX_SOURCE_BYTES).
     */
    public static function upload(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        [$name, $extension] = Assets::fileName();
        self::checkExtension($name, $extension);
        $asked = $_GET['id'] ?? null;
        $pluginId = is_string($asked) && $asked !== '' ? $asked : self::idFrom($name);
        if (!preg_match('/^' . self::ID . '$/', $pluginId)) {
            throw new ApiError(400, 'invalid-plugin', "\"$name\" gives no plugin id (1–40 lower-case letters, digits or -, starting with a letter) – send ?id=.");
        }
        if (Db::value('SELECT id FROM plugins WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $pluginId]) !== null) {
            throw new ApiError(409, 'plugin-exists', "The plugin $pluginId exists – replace its source (PUT …/plugins/$pluginId/file) or send another ?id=.", ['plugin' => $pluginId]);
        }
        self::store($bookId, $pluginId, self::fileSource($name, $extension), $user);
        Http::json(201, ['plugin' => self::summary(self::row($bookId, $pluginId))]);
    }

    /** PUT /editor/books/{id}/plugins/{pid}/file – a script file as the raw body (`X-File-Name` optional) → { plugin } */
    public static function replaceFile(string $bookId, string $pluginId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        self::row($bookId, $pluginId);
        [$name, $extension] = Assets::fileName("$pluginId.ts");
        self::checkExtension($name, $extension);
        self::store($bookId, $pluginId, self::fileSource($name, $extension), $user);
        Http::json(200, ['plugin' => self::summary(self::row($bookId, $pluginId))]);
    }

    /** GET /editor/books/{id}/plugins/{pid}/usages → { usages: [{ kind, ref }], registers: { components, layers, … } } */
    public static function usages(string $bookId, string $pluginId): never
    {
        Editor::user();
        Books::exists($bookId);
        $source = (string) self::row($bookId, $pluginId)['source'];
        Http::json(200, ['usages' => self::usagesOf($bookId, $source), 'registers' => self::registers($source)]);
    }

    /**
     * DELETE /editor/books/{id}/plugins/{pid}[?force=1] → 204 (a change recorded); 409 `plugin-in-use` with the usages
     * while the draft uses a type it registers, unless forced
     */
    public static function delete(string $bookId, string $pluginId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $row = self::row($bookId, $pluginId);
        $usages = self::usagesOf($bookId, (string) $row['source']);
        if ($usages && ($_GET['force'] ?? '') !== '1') {
            throw new ApiError(409, 'plugin-in-use', 'The draft uses what the plugin registers – remove the uses first, or force the delete.', ['usages' => $usages]);
        }
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
     * Where the draft uses what the source registers: the book (its passes), spreads, targets, shared entities and entries
     * whose JSON names one of its types – `"type":"<t>"` (a component, layer, node type, pass, material, a texture as
     * `{ type }`), or a procedural texture's type as a parameter's value
     * @return array<int, array{kind: string, ref: string}>
     */
    public static function usagesOf(string $bookId, string $source): array
    {
        return self::uses(self::draftTexts($bookId), $source);
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
     * The draft's rows as text, read once: the book (its master passes), spreads, targets, entities, entries
     * @return array<int, array{kind: string, ref: string, text: string}>
     */
    private static function draftTexts(string $bookId): array
    {
        $texts = [['kind' => 'book', 'ref' => $bookId, 'text' => (string) Db::value('SELECT book_json FROM books WHERE id = :id', ['id' => $bookId])]];
        foreach (['spread' => 'spreads', 'target' => 'targets', 'entry' => 'entries'] as $kind => $table) {
            foreach (Db::run("SELECT id, data_json FROM $table WHERE book_id = :book ORDER BY id", ['book' => $bookId])->fetchAll() as $row) {
                $texts[] = ['kind' => $kind, 'ref' => (string) $row['id'], 'text' => (string) $row['data_json']];
            }
        }
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE book_id = :book ORDER BY ref', ['book' => $bookId])->fetchAll() as $row) {
            $texts[] = ['kind' => 'entity', 'ref' => (string) $row['ref'], 'text' => (string) $row['data_json']];
        }
        return $texts;
    }

    private static function checkExtension(string $name, string $extension): void
    {
        if (in_array($extension, self::EXTENSIONS, true)) return;
        $shader = isset(Assets::KINDS[$extension]) && Assets::KINDS[$extension] === 'shader' ? ' A shader is an asset: POST …/assets.' : '';
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

    /** A new plugin or a new source in one transaction, the book touched and the change recorded */
    private static function store(string $bookId, string $pluginId, string $source, array $user): void
    {
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
