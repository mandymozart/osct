<?php
declare(strict_types=1);

/**
 * The editor's books: a game configuration imported into rows (books, spreads, entries, targets, entities), read
 * as a tree, edited entity by entity, published as a content version, with a change log and a publish log.
 * Every row keeps the imported object in its data_json column and the assembly (ContentVersion) gives the
 * configuration back from those – the typed columns index the rows for the tree and the queries, they are no
 * second copy of the truth. An entry's data_json holds the entry without its target, the target row holds the
 * target with its entity (inline, or `{ ref }` to a shared one); positions keep the imported order.
 */
final class Books
{
    /** What each environment serves (ContentStore::live), read once per request; false = its store cannot be read */
    private static ?array $live = null;

    /**
     * GET /editor/books → { books: [{ id, title, author, book, spreads, updatedAt, lastPublish, live, … }],
     * environments: [{ env, book, build, since } | { env, error }] } – only the environments that serve something
     */
    public static function list(): never
    {
        Editor::user();
        $books = [];
        foreach (Db::run('SELECT * FROM books ORDER BY title, id')->fetchAll() as $row) $books[] = self::summary($row);
        $environments = [];
        foreach (self::liveEnvironments() as $env => $live) {
            if ($live === false) $environments[] = ['env' => $env, 'error' => 'content-store-failed'];
            elseif ($live !== null) $environments[] = ['env' => $env] + $live;
        }
        Http::json(200, ['books' => $books, 'environments' => $environments]);
    }

    /**
     * GET /editor/environments → { env, environments: [{ env, store, publish, url, warning }] }: this instance's
     * environment (the only one it publishes to) and, per environment, its backend – `cdn` or `server` (the directory
     * store this API serves) –, where readers load it, and the warning wherever the directory store is the target
     */
    public static function environments(): never
    {
        Editor::user();
        Http::json(200, ['env' => Config::env(), 'environments' => ContentStore::describe()]);
    }

    /** @return array<string, array{book: ?string, build: ?string, since: ?string}|null|false> */
    private static function liveEnvironments(): array
    {
        if (self::$live === null) {
            self::$live = [];
            foreach (ContentStore::environments() as $env) {
                try {
                    self::$live[$env] = ContentStore::for($env)->live();
                } catch (ApiError) {
                    self::$live[$env] = false;
                }
            }
        }
        return self::$live;
    }

    /**
     * POST /editor/books/{id}/import { configuration, files?, assetsBase?, confirm? } | { source: "cdn", confirm? }
     * → { book, counts, draft, imported }
     * The configuration's `book.id` must be `{id}` (400 invalid-configuration naming both, `bookIdOf`).
     * Replaces the book's content rows in one transaction (the logs stay). `assetsBase` is where the configuration's
     * `/assets/content/…` paths resolve; `source: "cdn"` imports the current version of CONTENT_BASE_URL.
     * A book that exists is overwritten only in two steps: without `confirm` the answer is 409 confirm-import with the
     * `comparison` (what comes in against what the draft is based on and its edits since) and a `confirmation`
     * { id, expiresAt }; the same import again with `confirm: <id>` replaces the draft. The id is bound to the person (and
     * the AI connection), the incoming content and the draft as it was compared, and lasts Confirmation::SECONDS – any
     * change meanwhile voids it (409 confirmation-void, with a new comparison). A new book is imported at once.
     */
    public static function import(string $bookId): never
    {
        $user = Editor::user();
        $body = Editor::body();
        [$configuration, $files, $assetsBase, $source] = self::source($body);
        $parts = self::parse($configuration, Plugins::hasSources($bookId));
        self::bookIdOf($configuration, $bookId);
        $incoming = self::incoming($configuration, $parts, $files, $assetsBase, $source);
        $existing = Db::one('SELECT * FROM books WHERE id = :id', ['id' => $bookId]);
        if ($existing !== null) self::confirmImport($bookId, $existing, $incoming, $user, $body->confirm ?? null);
        $now = Db::now();
        $imported = Editor::encode(['build' => $incoming['build'], 'hash' => $incoming['hash'], 'date' => $incoming['date'], 'appVersion' => $incoming['appVersion'],
            'schema' => $incoming['schema'], 'source' => $source, 'from' => $incoming['from'], 'at' => Editor::nowMs(), 'by' => $user['email'] ?? null]);

        Db::transaction(function () use ($bookId, $parts, $files, $assetsBase, $now, $imported) {
            foreach (['targets', 'entries', 'spreads', 'entities'] as $table) {
                Db::run("DELETE FROM $table WHERE book_id = :book", ['book' => $bookId]);
            }
            $book = $parts['book'];
            $params = [
                'id' => $bookId, 'title' => $book->title, 'author' => $book->author, 'book' => Editor::encode($book),
                'initial' => $parts['initialSpreadId'], 'base' => $assetsBase,
                'files' => Editor::encode($files), 'schema' => $parts['schema'], 'hash' => $parts['hash'], 'now' => $now,
                'plugins' => Editor::encode($parts['plugins']), 'imported' => $imported, 'groups' => Editor::encode(array_values($parts['groups'])),
            ];
            if (Db::value('SELECT id FROM books WHERE id = :id', ['id' => $bookId]) !== null) {
                Db::run('UPDATE books SET title = :title, author = :author, book_json = :book, initial_spread_id = :initial,
                         assets_base = :base, files_json = :files, content_schema = :schema, imported_hash = :hash, plugins_json = :plugins, imported_json = :imported, groups_json = :groups, updated_at = :now WHERE id = :id', $params);
            } else {
                Db::run('INSERT INTO books (id, title, author, book_json, initial_spread_id, assets_base, files_json, content_schema, imported_hash, plugins_json, imported_json, groups_json, created_at, updated_at)
                         VALUES (:id, :title, :author, :book, :initial, :base, :files, :schema, :hash, :plugins, :imported, :groups, :created, :now)', $params + ['created' => $now]);
            }
            foreach ($parts['spreads'] as $s) {
                Db::run('INSERT INTO spreads (book_id, id, position, title, first_page, last_page, data_json) VALUES (:book, :id, :position, :title, :first, :last, :data)',
                    ['book' => $bookId, 'id' => $s['id'], 'position' => $s['position'], 'title' => $s['title'], 'first' => $s['first'], 'last' => $s['last'], 'data' => Editor::encode($s['data'])]);
            }
            foreach ($parts['entities'] as $e) {
                Db::run('INSERT INTO entities (book_id, ref, position, type, data_json) VALUES (:book, :ref, :position, :type, :data)',
                    ['book' => $bookId, 'ref' => $e['ref'], 'position' => $e['position'], 'type' => $e['type'], 'data' => Editor::encode($e['data'])]);
            }
            foreach ($parts['entries'] as $e) {
                Db::run('INSERT INTO entries (book_id, id, spread_id, position, category, title, page, data_json) VALUES (:book, :id, :spread, :position, :category, :title, :page, :data)',
                    ['book' => $bookId, 'id' => $e['id'], 'spread' => $e['spread'], 'position' => $e['position'], 'category' => $e['category'], 'title' => $e['title'], 'page' => $e['page'], 'data' => Editor::encode($e['data'])]);
            }
            foreach ($parts['targets'] as $t) {
                Db::run('INSERT INTO targets (book_id, id, entry_id, image_src, entity_ref, data_json) VALUES (:book, :id, :entry, :image, :ref, :data)',
                    ['book' => $bookId, 'id' => $t['id'], 'entry' => $t['entry'], 'image' => $t['image'], 'ref' => $t['ref'], 'data' => Editor::encode($t['data'])]);
            }
        });

        $draft = ContentVersion::assemble($bookId);
        Http::json(200, [
            'book' => self::summary(self::book($bookId)),
            'counts' => ['spreads' => count($parts['spreads']), 'entries' => count($parts['entries']), 'targets' => count($parts['targets']), 'entities' => count($parts['entities'])],
            'draft' => ['build' => $draft['build'], 'hash' => $draft['hash']],
            'imported' => self::basedOn(Editor::decode($imported)),
        ]);
    }

    /**
     * POST /editor/import/preview { configuration, files?, assetsBase? } | { source: "cdn" }
     * → { source, contentBase, manifest, incoming, counts, existing }
     * What the same import body would bring in, before anything is imported – read-only, the import's access. The
     * configuration is checked as the import checks it (the same 400s); `source: "cdn"` reads the current version of
     * CONTENT_BASE_URL (`contentBase`; `manifest` = its latest.json { url, build, activatedAt }) – 502
     * content-fetch-failed with the `url` that failed. `incoming` as in the import's comparison, `counts` the spreads,
     * entries, targets and entities it holds; `existing` = the comparison the import would answer (the draft of that id
     * it replaces, its edits since its import, where it is live), null when the book is new.
     */
    public static function preview(): never
    {
        Editor::user();
        [$configuration, $files, $assetsBase, $source, $manifest] = self::source(Editor::body());
        $bookId = self::bookIdOf($configuration);
        $parts = self::parse($configuration, Plugins::hasSources($bookId));
        $incoming = self::incoming($configuration, $parts, $files, $assetsBase, $source);
        $existing = Db::one('SELECT * FROM books WHERE id = :id', ['id' => $bookId]);
        $comparison = $existing !== null ? self::comparison($bookId, $existing, $incoming, self::editsSince($bookId, $existing)) : null;
        unset($incoming['digest']);
        Http::json(200, [
            'source' => $source,
            'contentBase' => $manifest !== null ? $manifest['base'] : null,
            'manifest' => $manifest !== null ? ['url' => $manifest['url'], 'build' => $manifest['build'], 'activatedAt' => $manifest['activatedAt']] : null,
            'incoming' => $incoming,
            'counts' => ['spreads' => count($parts['spreads']), 'entries' => count($parts['entries']), 'targets' => count($parts['targets']), 'entities' => count($parts['entities'])],
            'existing' => $comparison,
        ]);
    }

    /**
     * The book a configuration is of: its `book.id` (400 invalid-id unless it is an id). The import stores the rows under
     * the path's id and keeps the configuration's `book` as it is, so the two must agree – else a publish would name one
     * book in latest.json and another in game.config.json: 400 invalid-configuration naming both. The preview has no
     * path id; it answers for the configuration's own id, the one the import is then called with.
     */
    private static function bookIdOf(stdClass $configuration, ?string $pathId = null): string
    {
        $book = $configuration->book ?? null;
        $id = Editor::id($book instanceof stdClass ? ($book->id ?? null) : null, 'book.id');
        if ($pathId !== null && $id !== $pathId) {
            throw new ApiError(400, 'invalid-configuration', "The configuration is of book \"$id\", not \"$pathId\" – import it as $id, or change its book.id.");
        }
        return $id;
    }

    /**
     * What an import (or its preview) reads: the configuration, its files, the assets base and the source – from the
     * body, or for `source: "cdn"` from the current version of CONTENT_BASE_URL, with that latest.json. A body without
     * `files` but with an assets base (the editor's URL and file modes, the MCP's `url`) reads `<assetsBase>/files.json`
     * from there – optional, as for the reader: a base without one (the reader's dev server) imports with none (#244)
     * @return array{0: stdClass, 1: stdClass, 2: string, 3: string, 4: ?array{base: string, url: string, build: string, activatedAt: ?string}}
     */
    private static function source(stdClass $body): array
    {
        if (($body->source ?? null) === 'cdn') {
            [$configuration, $files, $assetsBase, $manifest] = self::fetchFromCdn();
            return [$configuration, $files, $assetsBase, 'cdn', $manifest];
        }
        $configuration = $body->configuration ?? null;
        if (!$configuration instanceof stdClass) throw new ApiError(400, 'invalid-configuration', 'configuration must be an object.');
        $files = new stdClass();
        if (isset($body->files)) {
            if (!$body->files instanceof stdClass) throw new ApiError(400, 'invalid-configuration', 'files must be an object.');
            $files = $body->files;
        }
        $assetsBase = '';
        if (isset($body->assetsBase)) {
            if (!is_string($body->assetsBase)) throw new ApiError(400, 'invalid-configuration', 'assetsBase must be a string.');
            $assetsBase = rtrim($body->assetsBase, '/');
        }
        if (!isset($body->files) && $assetsBase !== '') {
            try {
                $fetched = self::fetchJson("$assetsBase/files.json");
                if ($fetched instanceof stdClass) $files = $fetched;
            } catch (ApiError) {
                // no files.json below the base – the import carries no imported files, as before
            }
        }
        return [$configuration, $files, $assetsBase, 'configuration', null];
    }

    /**
     * What an import brings in: the book, the build (content checksum, first 12 digits), its date, the app and the
     * schema version that built it, where it comes from, and a digest of everything the import would write
     * @return array{book: string, title: string, build: ?string, hash: ?string, date: ?string, appVersion: ?string, schema: string, source: string, from: ?string, digest: string}
     */
    private static function incoming(stdClass $configuration, array $parts, stdClass $files, string $assetsBase, string $source): array
    {
        $version = $configuration->version;
        $hash = is_string($parts['hash']) && $parts['hash'] !== '' ? $parts['hash'] : null;
        return [
            'book' => $parts['book']->id,
            'title' => $parts['book']->title,
            'build' => $hash !== null ? substr($hash, 0, 12) : null,
            'hash' => $hash,
            'date' => is_string($version->timestamp ?? null) ? $version->timestamp : null,
            'appVersion' => is_string($version->version ?? null) ? $version->version : null,
            'schema' => $parts['schema'],
            'source' => $source,
            'from' => $assetsBase !== '' ? $assetsBase : null,
            'digest' => hash('sha256', Editor::encode([$configuration, $files, $assetsBase])),
        ];
    }

    /**
     * The import's second step (`Confirmation`): passes when `$confirm` is a confirmation id for exactly this
     * comparison, else 409 – `confirm-import` when none was sent, `confirmation-void` when it is expired, someone else's
     * or the draft or the incoming content changed since – both with the comparison and a new confirmation
     * @param array<string, mixed> $row
     * @param array<string, mixed> $user
     */
    private static function confirmImport(string $bookId, array $row, array $incoming, array $user, mixed $confirm): void
    {
        $edits = self::editsSince($bookId, $row);
        // What the comparison showed: the draft's import, its last change and the rows' state, and what comes in
        $state = Confirmation::digest([$incoming['digest'], $row['imported_json'] ?? null, $row['imported_hash'], $row['updated_at'], $edits['count'], $edits['last']]);
        Confirmation::require("import|$bookId", $user, $state, $confirm,
            ['confirm-import', 'Importing replaces the draft of ' . $row['title'] . ' – compare the versions, then import again with confirm: <confirmation id>.'],
            'The confirmation is expired, someone else\'s, or the draft or the incoming content changed since – compare again and confirm with the new id.',
            fn() => ['comparison' => self::comparison($bookId, $row, $incoming, $edits)]);
    }

    /**
     * The import's comparison: the book, what comes in, and the draft – the build it is based on, its edits since that
     * import (the change log), its build now and where that is live
     * @param array<string, mixed> $row
     * @param array{count: int, last: ?string, since: ?int, recent: list<array<string, mixed>>} $edits
     * @return array<string, mixed>
     */
    private static function comparison(string $bookId, array $row, array $incoming, array $edits): array
    {
        $draft = ContentVersion::assemble($bookId);
        $live = [];
        foreach (self::liveEnvironments() as $env => $serving) {
            if (is_array($serving) && $serving['book'] === $bookId) $live[] = ['env' => $env, 'build' => $serving['build'], 'current' => $serving['build'] === $draft['build']];
        }
        $basedOn = self::basedOn(Editor::decode($row['imported_json'] ?? null));
        if ($basedOn === null && is_string($row['imported_hash']) && $row['imported_hash'] !== '') {
            $basedOn = ['build' => substr($row['imported_hash'], 0, 12), 'hash' => $row['imported_hash'], 'date' => null, 'appVersion' => null, 'schema' => $row['content_schema'], 'source' => null, 'from' => null, 'importedAt' => null, 'importedBy' => null];
        }
        unset($incoming['digest']);
        return [
            'book' => ['id' => $bookId, 'title' => $row['title']],
            'incoming' => $incoming,
            'draft' => [
                'basedOn' => $basedOn,
                'build' => $draft['build'],
                'edits' => $edits['count'],
                'editsSince' => $edits['since'] !== null ? Editor::iso($edits['since']) : null,
                'recentEdits' => $edits['recent'],
                'live' => $live,
            ],
            'same' => $basedOn !== null && $incoming['hash'] !== null && $basedOn['hash'] === $incoming['hash'],
        ];
    }

    /**
     * The draft's edits since its import: the change log after `imported_json.at` (all of it for a book imported before
     * that was recorded), the newest ten in short
     * @param array<string, mixed> $row
     * @return array{count: int, last: ?string, since: ?int, recent: list<array<string, mixed>>}
     */
    private static function editsSince(string $bookId, array $row): array
    {
        $imported = Editor::decode($row['imported_json'] ?? null);
        $since = is_object($imported) && is_int($imported->at ?? null) ? $imported->at : null;
        $params = ['book' => $bookId, 'since' => $since ?? 0];
        $count = (int) Db::value('SELECT COUNT(*) FROM changes WHERE book_id = :book AND created_at > :since', $params);
        $recent = [];
        foreach (Db::run('SELECT c.id, c.kind, c.ref, c.created_at, c.token_name, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id
                          WHERE c.book_id = :book AND c.created_at > :since ORDER BY c.created_at DESC, c.id LIMIT 10', $params)->fetchAll() as $change) {
            $recent[] = ['kind' => $change['kind'], 'ref' => $change['ref'], 'user' => $change['email'], 'token' => $change['token_name'], 'at' => Editor::iso((int) $change['created_at'])];
        }
        $last = $count ? Db::value('SELECT id FROM changes WHERE book_id = :book AND created_at > :since ORDER BY created_at DESC, id LIMIT 1', $params) : null;
        return ['count' => $count, 'last' => is_string($last) ? $last : null, 'since' => $since, 'recent' => $recent];
    }

    /**
     * What an import recorded (books.imported_json) as the API shows it, null when nothing was recorded
     * @return array{build: ?string, hash: ?string, date: ?string, appVersion: ?string, schema: ?string, source: ?string, from: ?string, importedAt: ?string, importedBy: ?string}|null
     */
    private static function basedOn(mixed $imported): ?array
    {
        if (!is_object($imported)) return null;
        $string = static fn(string $key): ?string => is_string($imported->$key ?? null) ? $imported->$key : null;
        return [
            'build' => $string('build'), 'hash' => $string('hash'), 'date' => $string('date'), 'appVersion' => $string('appVersion'),
            'schema' => $string('schema'), 'source' => $string('source'), 'from' => $string('from'),
            'importedAt' => is_int($imported->at ?? null) ? Editor::iso($imported->at) : null, 'importedBy' => $string('by'),
        ];
    }

    /**
     * GET /editor/books/{id} → { book, spreads: [{ …SpreadData, entries: [{ id, category, title, page, target }] }], unassigned }
     * `target`: the entry's TargetData (id, imageSrc, entity inline or `{ ref }`) or null; `unassigned`: entries whose
     * page is in no spread.
     */
    public static function tree(string $bookId): never
    {
        Editor::user();
        $book = self::book($bookId);
        $params = ['book' => $bookId];
        $targets = [];
        foreach (Db::run('SELECT entry_id, data_json FROM targets WHERE book_id = :book', $params)->fetchAll() as $row) {
            $targets[$row['entry_id']] = Editor::decode($row['data_json']);
        }
        // The scenes in order with the page ranges older apps read – the same the draft writes (#307, `Scenes::ranges`)
        $context = Scenes::context($bookId);
        $groups = Scenes::groups($book);
        $bySpread = [];
        $unassigned = [];
        foreach (Db::run('SELECT * FROM entries WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $data = Editor::decode($row['data_json']);
            $scene = $row['spread_id'] === null || !isset($context['data'][$row['spread_id']]) ? null : (string) $row['spread_id'];
            $entry = ['id' => $row['id'], 'category' => $row['category'], 'title' => $row['title'], 'page' => Scenes::pageOf($context, $scene, $data)];
            if ($scene !== null && is_string($data->surface ?? null) && in_array($data->surface, Scenes::surfaceIds($context['data'][$scene]), true)) $entry['surface'] = $data->surface;
            $entry['target'] = $targets[$row['id']] ?? null;
            if ($scene === null) $unassigned[] = $entry;
            else $bySpread[$scene][] = $entry;
        }
        $spreads = Scenes::shown($context, array_map(static fn($g) => (string) $g->id, $groups));
        foreach ($spreads as $spread) $spread->entries = $bySpread[$spread->id] ?? [];
        // Each spread with the title it shows: its own, else its pages' (#298 – `Pages::withTitles`)
        Http::json(200, ['book' => self::summary($book), 'spreads' => Pages::withTitles($spreads), 'unassigned' => $unassigned, 'groups' => $groups]);
    }

    /** GET /editor/books/{id}/entities → { entities: { ref: EntityData } } */
    public static function entities(string $bookId): never
    {
        Editor::user();
        self::book($bookId);
        $entities = new stdClass();
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE book_id = :book ORDER BY position', ['book' => $bookId])->fetchAll() as $row) {
            $entities->{$row['ref']} = Editor::decode($row['data_json']);
        }
        Http::json(200, ['entities' => $entities]);
    }

    /** PUT /editor/books/{id}/entities/{ref} (body: EntityData) → { ref, entity }: saves a shared entity (new or changed), records a change */
    public static function putEntity(string $bookId, string $ref): never
    {
        $user = Editor::user();
        self::book($bookId);
        $entity = Editor::entity(Editor::body(), 'entity', 0, Editor::pluginNodeTypes($bookId), Editor::pluginMaterials($bookId));
        $json = Editor::encode($entity);
        Db::transaction(function () use ($bookId, $ref, $entity, $json, $user) {
            $params = ['book' => $bookId, 'ref' => $ref];
            $current = Db::one('SELECT data_json FROM entities WHERE book_id = :book AND ref = :ref' . Db::forUpdate(), $params);
            if ($current) {
                Db::run('UPDATE entities SET type = :type, data_json = :data WHERE book_id = :book AND ref = :ref', $params + ['type' => $entity->type, 'data' => $json]);
            } else {
                $position = (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM entities WHERE book_id = :book', ['book' => $bookId]);
                Db::run('INSERT INTO entities (book_id, ref, position, type, data_json) VALUES (:book, :ref, :position, :type, :data)', $params + ['position' => $position, 'type' => $entity->type, 'data' => $json]);
            }
            self::touch($bookId);
            self::change($bookId, $user, 'entity', $ref, $current['data_json'] ?? null, $json);
        });
        Http::json(200, ['ref' => $ref, 'entity' => $entity]);
    }

    /**
     * PUT /editor/books/{id}/targets/{targetId} { entity } | { ref } | { imageSrc } | { print } | { enabled } → { target }:
     * the target's entity – inline (`entity`, null removes it) or a shared one (`ref`) –, its printed image and placement,
     * and whether it is in the book (`enabled`, #249); records a change with the whole target before and after.
     */
    public static function putTarget(string $bookId, string $targetId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        // Read, change and write back in one transaction, the row locked: two saves of the same target never lose one's change
        $target = Db::transaction(static function () use ($bookId, $targetId, $body, $user) {
            $params = ['book' => $bookId, 'id' => $targetId];
            $row = Db::one('SELECT data_json, entity_ref FROM targets WHERE book_id = :book AND id = :id' . Db::forUpdate(), $params);
            if (!$row) throw new ApiError(404, 'not-found', 'No such target.');
            $target = Editor::decode($row['data_json']);
            $ref = $row['entity_ref'];
            $touched = false;
            if (property_exists($body, 'ref')) {
                $ref = Editor::id($body->ref, 'ref');
                if (Db::value('SELECT ref FROM entities WHERE book_id = :book AND ref = :ref', ['book' => $bookId, 'ref' => $ref]) === null) {
                    throw new ApiError(400, 'unknown-entity', "No entity \"$ref\" in this book.");
                }
                $target->entity = (object) ['ref' => $ref];
                $touched = true;
            } elseif (property_exists($body, 'entity')) {
                $ref = null;
                if ($body->entity === null) unset($target->entity);
                else $target->entity = Editor::entity($body->entity, 'entity', 0, Editor::pluginNodeTypes($bookId), Editor::pluginMaterials($bookId));
                $touched = true;
            }
            // The printed image and where it is printed (docs/server.md "Targets")
            if (property_exists($body, 'imageSrc')) {
                if (!is_string($body->imageSrc) || $body->imageSrc === '') throw new ApiError(400, 'invalid-target', 'imageSrc must be a non-empty string.');
                $target->imageSrc = $body->imageSrc;
                $touched = true;
            }
            if (property_exists($body, 'print')) {
                if ($body->print === null) unset($target->print);
                else $target->print = Editor::print($body->print);
                $touched = true;
            }
            // In the book or switched off (#249): only `false` is stored, on is the default
            if (property_exists($body, 'enabled')) {
                $target = self::withEnabled($target, $body->enabled, 'enabled');
                $touched = true;
            }
            if (!$touched) throw new ApiError(400, 'invalid-target', 'Send { entity } or { ref }, { imageSrc }, { print } or { enabled }.');
            $json = Editor::encode($target);
            Db::run('UPDATE targets SET entity_ref = :ref, image_src = :image, data_json = :data WHERE book_id = :book AND id = :id', $params + ['ref' => $ref, 'image' => $target->imageSrc, 'data' => $json]);
            self::touch($bookId);
            self::change($bookId, $user, 'target', $targetId, $row['data_json'], $json);
            return $target;
        });
        Http::json(200, ['target' => $target]);
    }

    /**
     * POST /editor/books/{id}/entries { id?, category, title, page, body?, caption?, target?: { id?, imageSrc, print?, entity? } }
     * → 201 { entry, spreadId }: a new entry on the spread its page belongs to, with its target (made in the editor –
     * docs/server.md "Targets") or without one – an entry read only in the list (a glossary term, a text). 400
     * `invalid-entry`, 409 `duplicate-id`.
     */
    public static function addEntry(string $bookId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        $title = $body->title ?? null;
        $page = $body->page ?? null;
        $category = $body->category ?? 'glossary';
        if (!is_string($title) || trim($title) === '') throw new ApiError(400, 'invalid-entry', 'title must be a non-empty string.');
        // Its scene and surface (#307), else the scene its page lies on (`Scenes::forPage` – older clients send a page)
        $context = Scenes::context($bookId);
        [$spreadId, $surface] = self::sceneOf($context, $body->scene ?? null, $body->surface ?? null);
        $whole = is_int($page) || (is_float($page) && floor($page) === $page);
        if ($spreadId !== null) {
            $range = $context['ranges'][$spreadId];
            // A page inside the scene's range is kept, else the surface's (or the scene's first) page
            if (!$whole || (int) $page < $range['first'] || (int) $page > $range['last']) {
                $page = Scenes::pageOf($context, $spreadId, (object) ['page' => (int) $context['row'][$spreadId]['first_page'], 'surface' => $surface]);
            }
        } else {
            if (!$whole) throw new ApiError(400, 'invalid-entry', 'page must be a whole number (or send scene).');
            if (!property_exists($body, 'scene')) {
                $found = Scenes::forPage($context, (int) $page);
                $spreadId = $found['scene'] ?? null;
                $surface = $found['surface'] ?? null;
            }
        }
        if (!is_string($category) || !in_array($category, Editor::ENTRY_CATEGORIES, true)) throw new ApiError(400, 'invalid-entry', 'category must be one of ' . implode(', ', Editor::ENTRY_CATEGORIES) . '.');
        $caption = $body->caption ?? null;
        if ($caption !== null && (!is_string($caption) || mb_strlen(trim($caption)) > BookTexts::TEXT_MAX_LENGTH)) {
            throw new ApiError(400, 'invalid-entry', 'caption must be a string of at most ' . BookTexts::TEXT_MAX_LENGTH . ' characters.');
        }
        $page = (int) $page;
        $id = Editor::id($body->id ?? self::slug($title, $page), 'id');
        if (Db::one('SELECT id FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $id])) throw new ApiError(409, 'duplicate-id', "An entry \"$id\" exists.");
        $targetIn = $body->target ?? null;
        $target = null;
        $targetId = null;
        $ref = null;
        if ($targetIn !== null) {
            if (!$targetIn instanceof stdClass || !is_string($targetIn->imageSrc ?? null) || $targetIn->imageSrc === '') throw new ApiError(400, 'invalid-entry', 'target.imageSrc is needed.');
            $targetId = Editor::id($targetIn->id ?? $id, 'target.id');
            if (Db::one('SELECT id FROM targets WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $targetId])) throw new ApiError(409, 'duplicate-id', "A target \"$targetId\" exists.");
            $target = (object) ['id' => $targetId, 'imageSrc' => $targetIn->imageSrc];
            if (isset($targetIn->print)) $target->print = Editor::print($targetIn->print);
            if (property_exists($targetIn, 'enabled')) $target = self::withEnabled($target, $targetIn->enabled, 'target.enabled', 'invalid-entry');
        }
        if ($target !== null && isset($targetIn->entity)) {
            if ($targetIn->entity instanceof stdClass && property_exists($targetIn->entity, 'ref')) {
                $ref = Editor::id($targetIn->entity->ref, 'target.entity.ref');
                if (Db::value('SELECT ref FROM entities WHERE book_id = :book AND ref = :ref', ['book' => $bookId, 'ref' => $ref]) === null) throw new ApiError(400, 'unknown-entity', "No entity \"$ref\" in this book.");
                $target->entity = (object) ['ref' => $ref];
            } else {
                $target->entity = Editor::entity($targetIn->entity, 'target.entity', 0, Editor::pluginNodeTypes($bookId), Editor::pluginMaterials($bookId));
            }
        }
        // Stored in the scene's own page numbers (`Scenes::storedPage`) – the page shown is what older apps read
        $shownPage = $page;
        $page = $spreadId === null ? $page : Scenes::storedPage($context, $spreadId, $page);
        $entry = (object) ['id' => $id, 'category' => $category, 'title' => trim($title), 'page' => $page, 'body' => is_string($body->body ?? null) ? $body->body : '', 'tags' => []];
        if ($surface !== null) $entry->surface = $surface;
        // The line under the picture (#289): optional, left out when empty
        if (is_string($caption) && trim($caption) !== '') $entry->caption = trim($caption);
        $position = (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM entries WHERE book_id = :book', ['book' => $bookId]);
        $entryJson = Editor::encode($entry);
        $targetJson = $target === null ? null : Editor::encode($target);
        Db::transaction(function () use ($bookId, $id, $spreadId, $position, $category, $entry, $page, $entryJson, $targetId, $target, $ref, $targetJson, $user) {
            Db::run('INSERT INTO entries (book_id, id, spread_id, position, category, title, page, data_json) VALUES (:book, :id, :spread, :position, :category, :title, :page, :data)',
                ['book' => $bookId, 'id' => $id, 'spread' => $spreadId, 'position' => $position, 'category' => $category, 'title' => $entry->title, 'page' => $page, 'data' => $entryJson]);
            if ($target !== null) {
                Db::run('INSERT INTO targets (book_id, id, entry_id, image_src, entity_ref, data_json) VALUES (:book, :id, :entry, :image, :ref, :data)',
                    ['book' => $bookId, 'id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => $ref, 'data' => $targetJson]);
            }
            self::touch($bookId);
            self::change($bookId, $user, 'entry', $id, null, $entryJson);
            if ($target !== null) self::change($bookId, $user, 'target', $targetId, null, $targetJson);
        });
        if ($target !== null) $entry->target = $target;
        $entry->page = $shownPage;
        Http::json(201, ['entry' => $entry, 'spreadId' => $spreadId]);
    }

    /**
     * An entry's scene and surface as a request names them (#307): `scene` a scene of the book (else 400 unknown-scene),
     * `surface` one of its surfaces (else 400 invalid-entry); no scene → [null, null] (a surface without one: 400)
     * @param array{data: array<string, stdClass>} $context
     * @return array{0: ?string, 1: ?string}
     */
    public static function sceneOf(array $context, mixed $scene, mixed $surface): array
    {
        if ($scene === null) {
            if ($surface !== null) throw new ApiError(400, 'invalid-entry', 'surface needs the entry\'s scene.');
            return [null, null];
        }
        $scene = Editor::id($scene, 'scene');
        if (!isset($context['data'][$scene])) throw new ApiError(400, 'unknown-scene', "No scene \"$scene\" in this book.");
        if ($surface === null) return [$scene, null];
        $surface = Editor::id($surface, 'surface');
        if (!in_array($surface, Scenes::surfaceIds($context['data'][$scene]), true)) {
            throw new ApiError(400, 'invalid-entry', "The scene \"$scene\" has no surface \"$surface\"" . (Scenes::surfaceIds($context['data'][$scene]) ? ' (' . implode(', ', Scenes::surfaceIds($context['data'][$scene])) . ').' : ' – it has none yet.'));
        }
        return [$scene, $surface];
    }

    /**
     * PUT /editor/books/{id}/spreads/{spreadId} – and PUT /editor/books/{id}/scenes/{sceneId} (#307) – { title?, format?,
     * passes?, surfaces?, layout?, label?, group?, apply? } → { spread, scene, cleared }: a scene's title, format (`spread` |
     * `cover` | `back`), post-processing passes (a list of `{ type, …parameters }` with a built-in type or a pass the book's
     * plugins register (`passes`) – `null` removes the list, so the book's passes apply; `[]` turns them off), and its
     * surfaces, layout, label and group (`Scenes::edit`). Its pages stay; a cover or back cover is one page – a scene of more
     * pages cannot become one. Surfaces that entries lie on go only with `apply: true` – without it 409 `surfaces-in-use`
     * names the entries, nothing written; with it those entries keep the scene without a surface (`cleared`, a change each).
     */
    public static function putSpread(string $bookId, string $spreadId): never
    {
        $user = Editor::user();
        $book = self::book($bookId);
        $body = Editor::body();
        $apply = ($body->apply ?? false) === true;
        // Read, change and write back in one transaction, the row locked: two saves of the same spread never lose one's change
        [$spread, $cleared] = Db::transaction(static function () use ($bookId, $book, $spreadId, $body, $user, $apply) {
            $row = Db::one('SELECT * FROM spreads WHERE book_id = :book AND id = :id' . Db::forUpdate(), ['book' => $bookId, 'id' => $spreadId]);
            if (!$row) throw new ApiError(404, 'not-found', 'No such scene.');
            $spread = Editor::decode($row['data_json']);
            $touched = false;
            if (property_exists($body, 'title')) {
                // "" or null: no title of its own – the spread shows its pages' (`Pages::withTitles`, #298)
                if ($body->title !== null && !is_string($body->title)) throw new ApiError(400, 'invalid-spread', 'title must be a string ("" or null: the title its pages give).');
                $spread->title = trim((string) $body->title);
                $touched = true;
            }
            if (property_exists($body, 'format')) {
                $format = $body->format ?? 'spread';
                if (!in_array($format, self::FORMATS, true)) throw new ApiError(400, 'invalid-spread', 'format must be one of ' . implode(', ', self::FORMATS) . '.');
                if ($format !== 'spread' && (int) $row['first_page'] !== (int) $row['last_page']) throw new ApiError(400, 'invalid-spread', "A $format is one page – add one with POST …/scenes { preset: \"$format\" }.");
                if ($format === 'spread') unset($spread->format);
                else $spread->format = $format;
                $touched = true;
            }
            if (property_exists($body, 'passes')) {
                if ($body->passes === null) unset($spread->passes);
                else $spread->passes = self::passes($body->passes, 'invalid-spread', self::pluginPasses($bookId));
                $touched = true;
            }
            $edit = Scenes::edit($bookId, $book, $spread, $body, Scenes::surfaceIds(Editor::decode($row['data_json'])));
            if (!$touched && !$edit['touched']) throw new ApiError(400, 'invalid-spread', 'Send { title }, { format }, { passes }, { surfaces }, { layout }, { label } and / or { group }.');
            // Entries on a surface that goes: named first, cleared with apply
            $onRemoved = [];
            if ($edit['removed']) {
                foreach (Db::run('SELECT id, title, data_json FROM entries WHERE book_id = :book AND spread_id = :spread ORDER BY position, id', ['book' => $bookId, 'spread' => $spreadId])->fetchAll() as $entry) {
                    $data = Editor::decode($entry['data_json']);
                    if (in_array($data->surface ?? null, $edit['removed'], true)) $onRemoved[] = ['row' => $entry, 'data' => $data];
                }
            }
            if ($onRemoved && !$apply) {
                throw new ApiError(409, 'surfaces-in-use', 'Entries lie on the surfaces that go (' . implode(', ', $edit['removed']) . ') – send again with apply: true to keep them on the scene without a surface.',
                    ['entries' => array_map(static fn(array $e) => ['id' => $e['row']['id'], 'title' => $e['row']['title'], 'surface' => $e['data']->surface], $onRemoved)]);
            }
            $json = Editor::encode($spread);
            Db::run('UPDATE spreads SET title = :title, data_json = :data WHERE book_id = :book AND id = :id', ['title' => $spread->title, 'data' => $json, 'book' => $bookId, 'id' => $spreadId]);
            $cleared = [];
            foreach ($onRemoved as $e) {
                unset($e['data']->surface);
                $entryJson = Editor::encode($e['data']);
                Db::run('UPDATE entries SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $entryJson, 'book' => $bookId, 'id' => $e['row']['id']]);
                self::change($bookId, $user, 'entry', (string) $e['row']['id'], $e['row']['data_json'], $entryJson);
                $cleared[] = (string) $e['row']['id'];
            }
            self::touch($bookId);
            self::change($bookId, $user, 'spread', $spreadId, $row['data_json'], $json);
            return [$spread, $cleared];
        });
        // As the tree shows it: the range older apps read, the title its pages give
        $range = Scenes::context($bookId)['ranges'][$spreadId];
        $spread->firstPage = $range['first'];
        $spread->lastPage = $range['last'];
        $spread->title = Pages::titlesOf($bookId)[$spreadId] ?? $spread->title;
        Http::json(200, ['spread' => $spread, 'scene' => $spread, 'cleared' => $cleared]);
    }

    /**
     * PUT /editor/books/{id}/environment { environment: { world, onionSky, worldSrc?, skySrc? } | null } → 200
     * { environment }: the world around the reader and the onion sky (the world model and the sky
     * image as asset references, shared/types/environment.ts). `null` removes it – the default applies. Book-level
     * only; the reader's Graphics switches still apply on top.
     */
    public static function putEnvironment(string $bookId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        if (!property_exists($body, 'environment')) throw new ApiError(400, 'invalid-environment', 'Send { environment: { world, onionSky, worldSrc?, skySrc? } } or { environment: null }.');
        $environment = null;
        if ($body->environment !== null) {
            $problems = self::environmentProblems($body->environment);
            if ($problems) throw new ApiError(400, 'invalid-environment', $problems[0]);
            $environment = ['world' => $body->environment->world, 'onionSky' => $body->environment->onionSky];
            foreach (['worldSrc', 'skySrc'] as $key) {
                if (isset($body->environment->{$key})) $environment[$key] = $body->environment->{$key};
            }
            $environment = (object) $environment;
        }
        // The book's JSON read, changed and written back in one transaction, the row locked: a parallel save of the
        // book's passes (or a relink) is never lost
        Db::transaction(static function () use ($bookId, $environment, $user) {
            $row = self::book($bookId, true);
            $book = Editor::decode($row['book_json']);
            if ($environment === null) unset($book->environment);
            else $book->environment = $environment;
            $json = Editor::encode($book);
            Db::run('UPDATE books SET book_json = :book WHERE id = :id', ['book' => $json, 'id' => $bookId]);
            self::touch($bookId);
            self::change($bookId, $user, 'environment', $bookId, $row['book_json'], $json);
        });
        Http::json(200, ['environment' => $environment]);
    }

    /**
     * PUT /editor/books/{id}/passes { passes: [{ type, …parameters }] | null } → 200 { passes }: the book's post-processing
     * (`book.passes`) – the master every spread without a list of its own shows (a spread's
     * `passes` override it, `PUT …/spreads/{sid}`). `null` removes it; the shape is checked as for a spread's – a
     * plugin's pass included.
     */
    public static function putPasses(string $bookId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        if (!property_exists($body, 'passes')) throw new ApiError(400, 'invalid-passes', 'Send { passes: [{ type, …parameters }] } or { passes: null }.');
        $passes = $body->passes === null ? null : self::passes($body->passes, 'invalid-passes', self::pluginPasses($bookId));
        // As putEnvironment: the book's JSON read, changed and written back in one transaction, the row locked
        Db::transaction(static function () use ($bookId, $passes, $user) {
            $row = self::book($bookId, true);
            $book = Editor::decode($row['book_json']);
            if ($passes === null) unset($book->passes);
            else $book->passes = $passes;
            $json = Editor::encode($book);
            Db::run('UPDATE books SET book_json = :book WHERE id = :id', ['book' => $json, 'id' => $bookId]);
            self::touch($bookId);
            self::change($bookId, $user, 'passes', $bookId, $row['book_json'], $json);
        });
        Http::json(200, ['passes' => $passes]);
    }

    /**
     * PUT /editor/books/{id}/appearance { appearance: { reveal?, found?, lost? } | null } → 200 { appearance }: how the
     * book's entities appear and disappear (`book.appearance`, shared/types/appearance.ts) – a look `{ type, …parameters }`
     * for the first find (`reveal`), every later find (`found`) and the lost page (`lost`), each a built-in look or one
     * the book's plugins register (`appearances`). A moment left out takes `found`'s look, then the default; `null` – or
     * no moment at all – removes the field, so the default look plays everywhere.
     */
    public static function putAppearance(string $bookId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        if (!property_exists($body, 'appearance')) {
            throw new ApiError(400, 'invalid-appearance', 'Send { appearance: { reveal?, found?, lost? } }, each { type, …parameters }, or { appearance: null }.');
        }
        $appearance = $body->appearance === null ? null : self::appearance($body->appearance, Editor::pluginTypesOfBook($bookId, 'appearances'));
        // As putPasses: the book's JSON read, changed and written back in one transaction, the row locked
        Db::transaction(static function () use ($bookId, $appearance, $user) {
            $row = self::book($bookId, true);
            $book = Editor::decode($row['book_json']);
            if ($appearance === null) unset($book->appearance);
            else $book->appearance = $appearance;
            $json = Editor::encode($book);
            Db::run('UPDATE books SET book_json = :book WHERE id = :id', ['book' => $json, 'id' => $bookId]);
            self::touch($bookId);
            self::change($bookId, $user, 'appearance', $bookId, $row['book_json'], $json);
        });
        Http::json(200, ['appearance' => $appearance]);
    }

    /** The problems of an `environment` (shared/types/environment.ts `environmentProblems`, strict); [] when valid */
    public static function environmentProblems(mixed $value): array
    {
        if (!$value instanceof stdClass) return ['environment must be an object { world, onionSky }.'];
        $problems = [];
        if (!in_array($value->world ?? null, self::WORLDS, true)) $problems[] = 'environment.world must be one of ' . implode(', ', self::WORLDS) . '.';
        if (!is_bool($value->onionSky ?? null)) $problems[] = 'environment.onionSky must be true or false.';
        $references = ['worldSrc' => ['a glTF model', self::WORLD_MODEL_EXTENSIONS], 'skySrc' => ['an equirectangular image', self::SKY_IMAGE_EXTENSIONS]];
        foreach ($references as $key => [$what, $extensions]) {
            if (!property_exists($value, $key)) continue;
            $reference = $value->{$key};
            if (!is_string($reference) || !(str_starts_with($reference, '/assets/content/') || preg_match('#^https?://[^/]+/#', $reference))) {
                $problems[] = "environment.$key must be a content path (/assets/content/…) or an absolute URL of $what.";
                continue;
            }
            $path = preg_split('/[?#]/', $reference)[0];
            $dot = strrpos($path, '.');
            $extension = $dot !== false && $dot > (int) strrpos($path, '/') ? strtolower(substr($path, $dot)) : '';
            if (!in_array($extension, $extensions, true)) $problems[] = "environment.$key must be $what (" . implode(', ', $extensions) . ').';
        }
        foreach (array_keys(get_object_vars($value)) as $key) {
            if (!in_array($key, ['world', 'onionSky', 'worldSrc', 'skySrc'], true)) $problems[] = "environment.$key is not a field of the environment.";
        }
        return $problems;
    }

    /**
     * POST /editor/books/{id}/spreads { format: "spread" | "cover" | "back", after?, id?, title? } → 201 { spread, moved, pages }
     * – the older form of `POST …/scenes` (#307, `Scenes::add`), for print-first and digital-first books alike:
     * - `spread`: a double page after the spread `after` (default: before the back cover, else last). Its id is `id`, else
     *   the first free `spread-<n>`. 400 `unknown-spread` for an unknown `after`, `invalid-spread` after the back cover;
     *   409 `duplicate-id`.
     * - `cover` / `back`: the front cover (first, page 0) or the back cover (last) – 409 `duplicate-id` when the book has one.
     * Nothing renumbers any more: `moved` is always zero; `pages` = the scenes whose page range older apps read changes
     * (`Scenes::ranges`).
     */
    public static function addSpread(string $bookId): never
    {
        $user = Editor::user();
        $book = self::book($bookId);
        $body = Editor::body();
        $format = $body->format ?? null;
        if (!in_array($format, self::FORMATS, true)) throw new ApiError(400, 'invalid-spread', 'format must be one of ' . implode(', ', self::FORMATS) . '.');
        $fields = new stdClass();
        if (is_string($body->title ?? null) && trim($body->title) !== '') $fields->title = trim($body->title);
        $placement = null;
        $id = null;
        if ($format !== 'spread') {
            if (property_exists($body, 'after')) throw new ApiError(400, 'invalid-spread', 'after is for a double page – the covers have their places.');
            if (Db::one('SELECT id FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $format])) throw new ApiError(409, 'duplicate-id', "The book has a $format spread.");
            $id = $format;
        } else {
            if (property_exists($body, 'after')) {
                $afterId = Editor::id($body->after, 'after');
                $anchor = Db::one('SELECT data_json FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $afterId]);
                if ($anchor === null) throw new ApiError(400, 'unknown-spread', "No spread \"$afterId\" in this book.");
                if ((Editor::decode($anchor['data_json'])->format ?? null) === 'back') throw new ApiError(400, 'invalid-spread', 'Nothing comes after the back cover.');
                $placement = ['after' => $afterId];
            }
            if (property_exists($body, 'id')) $id = Editor::id($body->id, 'id');
        }
        [$spread, , $pages] = Scenes::insert($bookId, $book, $format === 'spread' ? 'double' : $format, $id, $placement, $fields, $user, 'spread');
        Http::json(201, ['spread' => $spread, 'moved' => ['spreads' => 0, 'entries' => 0, 'targets' => 0], 'pages' => $pages]);
    }

    /**
     * DELETE /editor/books/{id}/spreads/{spreadId} – and DELETE /editor/books/{id}/scenes/{sceneId} (#307) – { confirm?,
     * deleteFiles? }: the scene with everything on it, in two steps (`Confirmation`, docs/server.md "Removing a spread or
     * an entry"), for print-first and digital-first books alike:
     * 1. without `confirm` nothing is written: 409 `confirm-delete` with the `impact` (the spread, and what `Removal` takes:
     *    entries, targets, entities, kept shared entities, Library files used only here and elsewhere; `pages` = the scenes
     *    whose page range older apps read changes) and a `confirmation`;
     * 2. with `confirm` exactly that goes, in one transaction → 200 { deleted, moved, pages }: entries, targets, the entities
     *    used only there, the scene. Nothing renumbers (`moved` and `pagesBack` are zero); the page images (#251) stay.
     *    `deleteFiles: true` also removes the Library files used only here (off by default; a file used elsewhere never
     *    goes). A confirmation that does not fit any more (anything in the book changed, another person or token, expired)
     *    → 409 `confirmation-void` with a fresh impact.
     * 409 `initial-spread` for the scene the book opens on (it never goes); 404.
     */
    public static function deleteSpread(string $bookId, string $spreadId): never
    {
        $user = Editor::user();
        $book = self::book($bookId);
        [$confirm, $deleteFiles] = self::deleteOptions();
        $row = Db::one('SELECT * FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $spreadId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such spread.');
        if ($book['initial_spread_id'] === $spreadId) throw new ApiError(409, 'initial-spread', 'The book opens on this spread.');
        $entries = Db::run('SELECT * FROM entries WHERE book_id = :book AND spread_id = :spread ORDER BY position, id', ['book' => $bookId, 'spread' => $spreadId])->fetchAll();
        $context = Scenes::context($bookId);
        $range = $context['ranges'][$spreadId];
        $removal = new Removal($bookId, $entries);
        $remaining = array_values(array_filter($context['rows'], static fn(array $r) => $r['id'] !== $spreadId));
        $pages = Scenes::pageChanges($context['ranges'], Scenes::ranges($remaining));
        $impact = ['book' => $bookId, 'kind' => 'spread',
            'spread' => ['id' => $spreadId, 'title' => Pages::titlesOf($bookId)[$spreadId] ?? $row['title'], 'firstPage' => $range['first'], 'lastPage' => $range['last'], 'format' => self::formatOf($row)],
            'pagesBack' => 0, 'pages' => $pages] + $removal->impact();
        Confirmation::require("delete-spread|$bookId|$spreadId", $user, $removal->state([$row]), $confirm,
            ['confirm-delete', 'Removing the spread takes ' . self::impactLine($impact) . ' – show this to the person, then remove again with confirm: <confirmation id>.'],
            'The confirmation is expired, someone else\'s, or the book changed since – here is what the removal takes now; confirm with the new id.',
            fn() => ['impact' => $impact]);
        $deleted = Db::transaction(function () use ($bookId, $spreadId, $row, $user, $removal, $deleteFiles) {
            $deleted = $removal->remove($user, $deleteFiles);
            Db::run('DELETE FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $spreadId]);
            self::change($bookId, $user, 'spread', $spreadId, $row['data_json'], 'null');
            Db::run('UPDATE spreads SET position = position - 1 WHERE book_id = :book AND position > :position', ['book' => $bookId, 'position' => (int) $row['position']]);
            self::touch($bookId);
            return $deleted;
        });
        Removal::deleteStoredFiles($deleted['paths']);
        unset($deleted['paths']);
        Http::json(200, ['deleted' => ['spread' => $spreadId] + $deleted, 'moved' => ['spreads' => 0, 'entries' => 0, 'targets' => 0], 'pages' => $pages]);
    }

    /**
     * The book's source of truth (`book.sourceOfTruth`): `digital` only when it says so, else `print`. Since scenes (#307)
     * both add, move and remove scenes alike; it still tells where the book's pages and print placements come from.
     * @param array<string, mixed> $book the book row
     */
    public static function sourceOfTruth(array $book): string
    {
        return (Editor::decode($book['book_json'])->sourceOfTruth ?? null) === 'digital' ? 'digital' : 'print';
    }

    /**
     * A removal's options from the body (none for the first step): `confirm` (the confirmation id) and `deleteFiles`
     * (true / false, default false)
     * @return array{0: mixed, 1: bool}
     */
    private static function deleteOptions(): array
    {
        $body = trim((string) file_get_contents('php://input')) === '' ? new stdClass() : Editor::body();
        $deleteFiles = $body->deleteFiles ?? false;
        if (!is_bool($deleteFiles)) throw new ApiError(400, 'invalid-delete', 'deleteFiles must be true or false.');
        return [$body->confirm ?? null, $deleteFiles];
    }

    /**
     * An impact in words for the 409's message: "3 entries, 3 targets, 2 entities and 1 Library file used only there"
     * @param array<string, mixed> $impact
     */
    private static function impactLine(array $impact): string
    {
        $n = static fn(int $count, string $one, string $many) => $count . ' ' . ($count === 1 ? $one : $many);
        $counts = $impact['counts'];
        $parts = [$n($counts['entries'], 'entry', 'entries'), $n($counts['targets'], 'target', 'targets'), $n($counts['entities'], 'entity', 'entities')];
        $line = implode(', ', $parts);
        if ($counts['filesOnlyHere'] > 0) $line .= ' (' . $n($counts['filesOnlyHere'], 'Library file', 'Library files') . ' used only there, deleted only with deleteFiles: true)';
        return $line;
    }

    /**
     * A spread row's format (`spread` when its data names none)
     * @param array<string, mixed> $row
     */
    private static function formatOf(array $row): string
    {
        return Editor::decode($row['data_json'])->format ?? 'spread';
    }

    /** The spread formats of the content contract (shared/types/game-config.ts `SPREAD_FORMATS`) */
    public const FORMATS = ['spread', 'cover', 'back'];

    /** Front and back matter: double pages without printed numbers (shared/types/game-config.ts `MATTERS`, #296) */
    public const MATTERS = ['front', 'back'];

    /** The built-in post-processing passes of the contract (shared/types/passes.ts `PASSES`) */
    public const PASS_TYPES = ['bloom', 'vignette', 'grade'];
    /** A plugin's pass type (shared/types/components.ts `COMPONENT_TYPE_PATTERN`, which a pass's spec is checked with) */
    public const PLUGIN_PASS_TYPE = '[a-z][a-zA-Z0-9]{0,39}';
    /** The moments an entity appears or disappears at (shared/types/appearance.ts `MOMENTS`) */
    public const MOMENTS = ['reveal', 'found', 'lost'];
    /** The built-in looks of the contract (shared/types/appearance.ts `APPEARANCES`) */
    public const APPEARANCE_TYPES = ['inflateDissolve', 'printLift', 'fade'];
    /** The environment's worlds (shared/types/environment.ts ENVIRONMENT_WORLDS) */
    public const WORLDS = ['cafe'];
    /** The files a world model and a sky may be (shared/types/environment.ts WORLD_MODEL_EXTENSIONS, SKY_IMAGE_EXTENSIONS) */
    public const WORLD_MODEL_EXTENSIONS = ['.glb', '.gltf'];
    public const SKY_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

    /**
     * The plugin pass types a save of this book accepts: the passes its declared plugins recorded (a list),
     * any camelCase name while a plugin is unknown until it runs (`true` – a Code tab source, a plugin of an older build),
     * none without plugins (`false`) – as `Editor::pluginNodeTypes`
     * @return bool|list<string>
     */
    private static function pluginPasses(string $bookId): bool|array
    {
        return Editor::pluginTypesOfBook($bookId, 'passes');
    }

    /**
     * A `passes` list as the content holds it: every pass an object with a built-in `type` – or one of the book's
     * plugins (`$pluginPasses`: a list = the recorded ones, `true` = any camelCase name, `false` = none) –, an optional
     * `enabled` true / false and scalar parameters (the engine and the guard check the parameters against the specs; the
     * API keeps the shape)
     * @param bool|list<string> $pluginPasses
     * @return list<stdClass>
     */
    private static function passes(mixed $value, string $code = 'invalid-spread', bool|array $pluginPasses = false): array
    {
        if (!is_array($value)) throw new ApiError(400, $code, 'passes must be a list of { type, …parameters }.');
        $passes = [];
        foreach ($value as $i => $pass) {
            if (!$pass instanceof stdClass || !is_string($pass->type ?? null)) throw new ApiError(400, $code, "passes[$i] needs a type.");
            $type = $pass->type;
            $plugin = is_array($pluginPasses)
                ? in_array($type, $pluginPasses, true)
                : $pluginPasses && preg_match('/^' . self::PLUGIN_PASS_TYPE . '$/', $type) === 1;
            if (!in_array($type, self::PASS_TYPES, true) && !$plugin) {
                $plugins = match (true) {
                    is_array($pluginPasses) && $pluginPasses !== [] => ' or a pass a plugin of the book registers (' . implode(', ', $pluginPasses) . ').',
                    is_array($pluginPasses) => ' – the book\'s plugins register no pass.',
                    $pluginPasses => ' or a plugin\'s pass (camelCase letters and digits).',
                    default => ' – a plugin\'s pass needs a plugin in the book.',
                };
                throw new ApiError(400, $code, "passes[$i].type must be one of " . implode(', ', self::PASS_TYPES) . $plugins);
            }
            // Off keeps the pass and its values, the chain skips it (#233)
            if (property_exists($pass, 'enabled') && !is_bool($pass->enabled)) throw new ApiError(400, $code, "passes[$i].enabled must be true or false.");
            foreach (get_object_vars($pass) as $name => $param) {
                if (!is_scalar($param)) throw new ApiError(400, $code, "passes[$i].$name must be a number, a string or true / false.");
            }
            $passes[] = $pass;
        }
        return $passes;
    }

    /**
     * A book's `appearance` as the content holds it: an object of moments (MOMENTS), each a look – an object with a
     * built-in `type` or one of the book's plugins (`$pluginLooks`: a list = the recorded ones, `true` = any camelCase
     * name, `false` = none) and scalar parameters (the engine and the guard check the parameters against the specs; the
     * API keeps the shape). Null when it names no moment: the book holds no `appearance` then.
     * @param bool|list<string> $pluginLooks
     */
    private static function appearance(mixed $value, bool|array $pluginLooks = false): ?stdClass
    {
        $code = 'invalid-appearance';
        if (!$value instanceof stdClass) throw new ApiError(400, $code, 'appearance must be an object { reveal?, found?, lost? }, each { type, …parameters }.');
        $appearance = new stdClass();
        foreach (get_object_vars($value) as $moment => $look) {
            if (!in_array($moment, self::MOMENTS, true)) throw new ApiError(400, $code, "appearance.$moment is not a moment (" . implode(', ', self::MOMENTS) . ').');
            if (!$look instanceof stdClass || !is_string($look->type ?? null)) throw new ApiError(400, $code, "appearance.$moment needs a type.");
            $type = $look->type;
            $plugin = is_array($pluginLooks)
                ? in_array($type, $pluginLooks, true)
                : $pluginLooks && preg_match('/^' . self::PLUGIN_PASS_TYPE . '$/', $type) === 1;
            if (!in_array($type, self::APPEARANCE_TYPES, true) && !$plugin) {
                $plugins = match (true) {
                    is_array($pluginLooks) && $pluginLooks !== [] => ' or a look a plugin of the book registers (' . implode(', ', $pluginLooks) . ').',
                    is_array($pluginLooks) => ' – the book\'s plugins register no look.',
                    $pluginLooks => ' or a plugin\'s look (camelCase letters and digits).',
                    default => ' – a plugin\'s look needs a plugin in the book.',
                };
                throw new ApiError(400, $code, "appearance.$moment.type must be one of " . implode(', ', self::APPEARANCE_TYPES) . $plugins);
            }
            foreach (get_object_vars($look) as $name => $param) {
                if (!is_scalar($param)) throw new ApiError(400, $code, "appearance.$moment.$name must be a number, a string or true / false.");
            }
            $appearance->{$moment} = $look;
        }
        return get_object_vars($appearance) ? $appearance : null;
    }

    /**
     * DELETE /editor/books/{id}/entries/{entryId} { confirm?, deleteFiles? } – the entry with its target, the entity used
     * only there and (with `deleteFiles: true`) the Library files used only there, in the same two steps as a spread:
     * 409 `confirm-delete` with the `impact` and a `confirmation`, then with `confirm` → 200 { deleted, moved } (nothing
     * moves); 409 `confirmation-void` with a fresh impact; 404.
     */
    public static function deleteEntry(string $bookId, string $entryId): never
    {
        $user = Editor::user();
        self::book($bookId);
        [$confirm, $deleteFiles] = self::deleteOptions();
        $entry = Db::one('SELECT * FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $entryId]);
        if (!$entry) throw new ApiError(404, 'not-found', 'No such entry.');
        $removal = new Removal($bookId, [$entry]);
        $impact = ['book' => $bookId, 'kind' => 'entry',
            'entry' => ['id' => $entryId, 'title' => $entry['title'], 'page' => (int) $entry['page'], 'category' => $entry['category'], 'spread' => $entry['spread_id']],
            'pagesBack' => 0] + $removal->impact();
        Confirmation::require("delete-entry|$bookId|$entryId", $user, $removal->state(), $confirm,
            ['confirm-delete', 'Removing the entry takes ' . self::impactLine($impact) . ' – show this to the person, then remove again with confirm: <confirmation id>.'],
            'The confirmation is expired, someone else\'s, or the book changed since – here is what the removal takes now; confirm with the new id.',
            fn() => ['impact' => $impact]);
        $deleted = Db::transaction(function () use ($bookId, $user, $removal, $deleteFiles) {
            $deleted = $removal->remove($user, $deleteFiles);
            self::touch($bookId);
            return $deleted;
        });
        Removal::deleteStoredFiles($deleted['paths']);
        unset($deleted['paths']);
        Http::json(200, ['deleted' => ['spread' => null] + $deleted, 'moved' => ['spreads' => 0, 'entries' => 0, 'targets' => 0]]);
    }

    /** An id from a title and a page: `p102-shadows` – lower case, letters, digits and dashes */
    private static function slug(string $title, int $page): string
    {
        $words = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: $title), '-'));
        return 'p' . $page . '-' . (substr($words, 0, 40) ?: 'target');
    }

    /**
     * POST /editor/books/{id}/publish { env, note?, replace? } → { env, store, build, hash, publishedAt, replaced }: the
     * assembled version into the content store – the version folder (unless that build is there already: a folder is
     * never overwritten), then versions.json, then latest.json (the switch) – and a row in the publish log.
     * `env` must be this instance's own environment (ENV): another one answers 403 other-environment with `env`, the
     * own one. `store` = where it went: `cdn` or `server` (the directory store).
     * An environment serves one book: when it serves another one (or one that cannot be told) the publish needs
     * `replace: true`, else 409 other-book with `current` { env, book, title, build, since }. `replaced` names the
     * book replaced there, null when there was none.
     *
     * `plugins` (#78) = the book's Code tab sources as the editor transpiled them, `[{ id, code, api, registered? }]`: every
     * id a saved source of the book, `code` the module (JavaScript, `export const register`), `api` the plugin API it was
     * written against, `registered` the specs a stage run recorded (optional – without them the reader learns the types when
     * the plugin loads). Each goes into the version as `assets/content/plugins/<id>/plugin-<hash of the code>.js` and is
     * declared in its configuration (a compiled plugin of the same id gives way); the types the publish checks are read from
     * the saved source. The server compiles nothing: the code is the browser's transpile, not type-checked (#266).
     */
    public static function publish(string $bookId, stdClass $body): never
    {
        $user = Editor::user();
        // Readers are reached only by a person: no environment takes a publish from an AI connection
        Auth::refuseToken('Publishing');
        self::book($bookId);
        $env = $body->env ?? null;
        $own = Config::env();
        if (!is_string($env) || !preg_match(ContentStore::ENV_NAME, $env)) {
            throw new ApiError(400, 'invalid-env', "env must be this instance's environment ($own).");
        }
        // An instance publishes to its own environment only: another one is published from its own editor
        if ($env !== $own) {
            throw new ApiError(403, 'other-environment', "This instance publishes to $own only – $env is published from its own editor.", ['env' => $own]);
        }
        $note = $body->note ?? null;
        if ($note !== null && !is_string($note)) throw new ApiError(400, 'invalid-note', 'note must be a string.');
        $replace = $body->replace ?? false;
        if (!is_bool($replace)) throw new ApiError(400, 'invalid-replace', 'replace must be true or false.');

        $store = ContentStore::for($env);
        $live = $store->live();
        $replaced = $live !== null && $live['book'] !== $bookId ? $live : null;
        if ($replaced !== null && !$replace) {
            $title = $replaced['book'] !== null ? Db::value('SELECT title FROM books WHERE id = :id', ['id' => $replaced['book']]) : null;
            $name = $title ?: ($replaced['book'] ?? 'a book that cannot be told');
            throw new ApiError(409, 'other-book', "$env serves $name – publishing this book replaces it there; send replace: true to do so.",
                ['current' => ['env' => $env, 'book' => $replaced['book'], 'title' => $title ?: null, 'build' => $replaced['build'], 'since' => $replaced['since']]]);
        }

        $injected = self::injectedPlugins($bookId, $body->plugins ?? null);
        $version = ContentVersion::assemble($bookId);
        if ($injected) $version = ContentVersion::withPlugins($version, array_map(static fn(array $plugin): stdClass => $plugin['declaration'], $injected));
        // A component type no plugin can register would make the reader refuse the whole content: a plugin of the Code tab
        // reaches readers only when the publish carries it (`plugins`). What the compiled plugins register is known when
        // they recorded it (none declared: nothing) – else they may register anything; what a carried source registers
        // is read from its text
        $compiled = array_values(array_filter((array) ($version['configuration']->plugins ?? []),
            static fn(mixed $plugin): bool => !($plugin instanceof stdClass && isset($injected[$plugin->id ?? ''])))); 
        $recorded = Editor::recorded($compiled);
        if ($recorded !== null) {
            foreach ($injected as $plugin) {
                foreach ($plugin['registers'] as $kind => $types) {
                    $into = $kind === 'layers' ? 'components' : $kind;
                    if (isset($recorded[$into])) $recorded[$into] = array_values(array_unique([...$recorded[$into], ...$types]));
                }
            }
        }
        $unknown = $recorded === null ? [] : array_values(array_diff(self::unknownComponentTypes($version['configuration']), $recorded['components']));
        if ($unknown) {
            throw new ApiError(409, 'unknown-components', 'Nodes use components no compiled plugin provides: ' . implode(', ', $unknown) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['components' => $unknown]);
        }
        // The same for a plugin's node type: without a compiled plugin the reader renders nothing for those nodes
        $unknownNodes = $recorded === null ? [] : array_values(array_diff(self::unknownNodeTypes($version['configuration']), $recorded['nodeTypes']));
        if ($unknownNodes) {
            throw new ApiError(409, 'unknown-node-types', 'Nodes have types no compiled plugin provides: ' . implode(', ', $unknownNodes) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['nodeTypes' => $unknownNodes]);
        }
        // The same for a plugin's material: without a compiled plugin the reader keeps the node's own material
        $unknownMaterials = $recorded === null ? [] : array_values(array_diff(self::materialTypes($version['configuration']), $recorded['materials']));
        if ($unknownMaterials) {
            throw new ApiError(409, 'unknown-materials', 'Nodes use materials no compiled plugin provides: ' . implode(', ', $unknownMaterials) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['materials' => $unknownMaterials]);
        }
        // And for a plugin's pass: the reader's guard refuses a pass type no declared plugin recorded
        $unknownPasses = $recorded === null ? [] : array_values(array_diff(self::pluginPassTypes($version['configuration']), $recorded['passes']));
        if ($unknownPasses) {
            throw new ApiError(409, 'unknown-passes', 'The book\'s or a spread\'s post-processing names passes no compiled plugin provides: ' . implode(', ', $unknownPasses) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['passes' => $unknownPasses]);
        }
        // And for a plugin's look: the reader's guard refuses a look no declared plugin recorded
        $unknownLooks = $recorded === null ? [] : array_values(array_diff(self::pluginAppearanceTypes($version['configuration']), $recorded['appearances']));
        if ($unknownLooks) {
            throw new ApiError(409, 'unknown-appearances', 'The book\'s appearance or an entity\'s own looks name looks no compiled plugin provides: ' . implode(', ', $unknownLooks) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['appearances' => $unknownLooks]);
        }
        $root = $version['build'];
        $uploaded = $store->exists("$root/game.config.json");
        if (!$uploaded) {
            // The plugins' modules first: a version whose configuration is there is complete
            foreach ($injected as $plugin) $store->put("$root/" . ltrim($plugin['declaration']->src, '/'), $plugin['code'], 'text/javascript');
            $store->put("$root/files.json", Editor::encode($version['files']));
            // Last in the folder: the configuration marks the version as complete
            $store->put("$root/game.config.json", Editor::encode($version['configuration']));
        }
        $now = Editor::iso();
        $current = $store->get('versions.json');
        $versions = $current === null ? [] : json_decode($current, true);
        if (!is_array($versions)) throw new ApiError(502, 'content-store-failed', "$env/versions.json is not readable – fix it before publishing.");
        $store->put('versions.json', Editor::encode(ContentStore::activate($versions, $version, $now, !$uploaded, $bookId), true));
        $store->put('latest.json', Editor::encode(ContentVersion::manifest($version, $now, $bookId), true));

        Db::run('INSERT INTO book_versions (id, book_id, env, build, hash, published_by, published_at, note) VALUES (:id, :book, :env, :build, :hash, :by, :at, :note)',
            ['id' => Db::uuid(), 'book' => $bookId, 'env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'by' => $user['id'], 'at' => Editor::nowMs(), 'note' => $note]);
        Http::json(200, ['env' => $env, 'store' => $store->isLocal() ? 'server' : 'cdn', 'build' => $version['build'], 'hash' => $version['hash'], 'publishedAt' => $now,
            'replaced' => $replaced !== null ? ['book' => $replaced['book'], 'build' => $replaced['build']] : null]);
    }

    /**
     * The publish's `plugins` (#78), checked: by id → { declaration (the configuration's `PluginData`), code, registers (the
     * types the saved source registers, `Plugins::registers`) }. Null or absent = none.
     * @return array<string, array{declaration: stdClass, code: string, registers: array<string, array<int, string>>}>
     */
    private static function injectedPlugins(string $bookId, mixed $raw): array
    {
        if ($raw === null) return [];
        if (!is_array($raw)) throw new ApiError(400, 'invalid-plugins', 'plugins must be a list of { id, code, api, registered? }.');
        $sources = [];
        foreach (Db::run('SELECT id, source FROM plugins WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) $sources[$row['id']] = (string) $row['source'];
        $injected = [];
        foreach ($raw as $i => $plugin) {
            $at = "plugins[$i]";
            if (!$plugin instanceof stdClass) throw new ApiError(400, 'invalid-plugins', "$at must be an object { id, code, api, registered? }.");
            $id = $plugin->id ?? null;
            if (!is_string($id) || !preg_match('/^' . Plugins::ID . '$/', $id)) throw new ApiError(400, 'invalid-plugins', "$at.id must be a plugin id (letters, digits, -).");
            if (isset($injected[$id])) throw new ApiError(400, 'invalid-plugins', "$at.id: \"$id\" is there twice.");
            if (!isset($sources[$id])) throw new ApiError(400, 'invalid-plugins', "$at.id: the book has no saved source \"$id\" – save it in the Code tab first.");
            $code = $plugin->code ?? null;
            if (!is_string($code) || trim($code) === '') throw new ApiError(400, 'invalid-plugins', "$at.code must be the transpiled module.");
            if (strlen($code) > 2 * Plugins::MAX_SOURCE_BYTES) throw new ApiError(413, 'plugin-too-large', "$at.code is larger than " . (2 * Plugins::MAX_SOURCE_BYTES / 1024) . ' KB.');
            $api = $plugin->api ?? null;
            if (!is_string($api) || !preg_match('/^\d+\.\d+$/', $api)) throw new ApiError(400, 'invalid-plugins', "$at.api must be the plugin API version \"MAJOR.MINOR\".");
            $declaration = (object) ['id' => $id, 'src' => '/assets/content/plugins/' . $id . '/plugin-' . substr(hash('sha256', $code), 0, 12) . '.js', 'api' => $api];
            $registers = Plugins::registers($sources[$id]);
            if (property_exists($plugin, 'registered') && $plugin->registered !== null) {
                $problem = self::registeredProblem($plugin->registered);
                if ($problem !== null) throw new ApiError(400, 'invalid-plugins', "$at.registered $problem");
                // Specs of an older run name other types than the saved source: the reader would refuse a node of a newer
                // type, so the plugin is declared without them (its types are known when it loads)
                if (self::sameTypes($plugin->registered, $registers)) $declaration->registered = $plugin->registered;
            }
            $injected[$id] = ['declaration' => $declaration, 'code' => $code, 'registers' => $registers];
        }
        return $injected;
    }

    /**
     * Do the specs name the types the source registers (`Plugins::registers` – its layers are components in the content)?
     * @param array<string, array<int, string>> $registers
     */
    private static function sameTypes(stdClass $registered, array $registers): bool
    {
        $expected = [
            'components' => [...($registers['components'] ?? []), ...($registers['layers'] ?? [])],
            'nodeTypes' => $registers['nodeTypes'] ?? [], 'passes' => $registers['passes'] ?? [],
            'materials' => $registers['materials'] ?? [], 'textures' => $registers['textures'] ?? [],
            'appearances' => $registers['appearances'] ?? [],
        ];
        foreach ($expected as $kind => $types) {
            $named = ($registered->{$kind} ?? null) instanceof stdClass ? array_map('strval', array_keys(get_object_vars($registered->{$kind}))) : [];
            sort($named);
            $types = array_values(array_unique($types));
            sort($types);
            if ($named !== $types) return false;
        }
        return true;
    }

    /** Why a plugin's `registered` is not { components?, nodeTypes?, passes?, materials?, textures?, appearances? } of type → spec, or null */
    private static function registeredProblem(mixed $registered): ?string
    {
        if (!$registered instanceof stdClass) return 'must be an object { components?, nodeTypes?, passes?, materials?, textures?, appearances? }.';
        foreach (['components', 'nodeTypes', 'passes', 'materials', 'textures', 'appearances'] as $kind) {
            if (property_exists($registered, $kind) && !$registered->{$kind} instanceof stdClass) return ".$kind must be an object of type → spec.";
        }
        return null;
    }

    /**
     * The component types of every node of the configuration that are not built in (Editor::COMPONENT_TYPES), sorted
     * @return list<string>
     */
    public static function unknownComponentTypes(stdClass $configuration): array
    {
        return self::typesOfNodes($configuration, static function (stdClass $node): array {
            $types = [];
            foreach ((array) ($node->components ?? []) as $component) {
                $type = $component instanceof stdClass ? ($component->type ?? null) : null;
                if (is_string($type) && !in_array($type, Editor::COMPONENT_TYPES, true)) $types[] = $type;
            }
            return $types;
        });
    }

    /**
     * The pass types of the book's and the spreads' `passes` that are not built in (PASS_TYPES) – a plugin's, sorted
     * @return list<string>
     */
    public static function pluginPassTypes(stdClass $configuration): array
    {
        $types = [];
        $lists = [$configuration->book->passes ?? []];
        foreach ((array) ($configuration->spreads ?? []) as $spread) $lists[] = $spread instanceof stdClass ? ($spread->passes ?? []) : [];
        foreach ($lists as $list) {
            foreach ((array) $list as $pass) {
                $type = $pass instanceof stdClass ? ($pass->type ?? null) : null;
                if (is_string($type) && !in_array($type, self::PASS_TYPES, true)) $types[$type] = true;
            }
        }
        $list = array_map('strval', array_keys($types));
        sort($list);
        return $list;
    }

    /**
     * The looks of the book's `appearance` and of the entities' own moments (the components reveal, found and lost) that are
     * not built in (APPEARANCE_TYPES) – a plugin's, sorted
     * @return list<string>
     */
    public static function pluginAppearanceTypes(stdClass $configuration): array
    {
        $types = [];
        $appearance = $configuration->book->appearance ?? null;
        foreach ($appearance instanceof stdClass ? get_object_vars($appearance) : [] as $look) {
            $type = $look instanceof stdClass ? ($look->type ?? null) : null;
            if (is_string($type) && !in_array($type, self::APPEARANCE_TYPES, true)) $types[$type] = true;
        }
        $ownLooks = self::typesOfNodes($configuration, static function (stdClass $node): array {
            $looks = [];
            foreach ((array) ($node->components ?? []) as $component) {
                if (!$component instanceof stdClass || !in_array($component->type ?? null, self::MOMENTS, true)) continue;
                $look = $component->look ?? null;
                if (is_string($look) && $look !== '' && !in_array($look, self::APPEARANCE_TYPES, true)) $looks[] = $look;
            }
            return $looks;
        });
        foreach ($ownLooks as $look) $types[$look] = true;
        $list = array_map('strval', array_keys($types));
        sort($list);
        return $list;
    }

    /**
     * The material types of every node of the configuration (every material is a plugin's), sorted
     * @return list<string>
     */
    public static function materialTypes(stdClass $configuration): array
    {
        return self::typesOfNodes($configuration, static fn(stdClass $node): array =>
            ($node->material ?? null) instanceof stdClass && is_string($node->material->type ?? null) ? [$node->material->type] : []);
    }

    /**
     * The node types of the configuration that are not built in (Editor::ENTITY_TYPES) – a plugin's, sorted
     * @return list<string>
     */
    public static function unknownNodeTypes(stdClass $configuration): array
    {
        return self::typesOfNodes($configuration, static fn(stdClass $node): array =>
            is_string($node->type ?? null) && !in_array($node->type, Editor::ENTITY_TYPES, true) ? [$node->type] : []);
    }

    /**
     * What `$of` names for every node of the configuration (shared entities, the targets' own trees), distinct and sorted
     * @param callable(stdClass): list<string> $of
     * @return list<string>
     */
    private static function typesOfNodes(stdClass $configuration, callable $of): array
    {
        $types = [];
        $walk = static function (mixed $node) use (&$walk, &$types, $of): void {
            if (!$node instanceof stdClass) return;
            foreach ($of($node) as $type) $types[$type] = true;
            foreach ((array) ($node->children ?? []) as $child) $walk($child);
        };
        foreach (get_object_vars($configuration->entities ?? new stdClass()) as $entity) $walk($entity);
        foreach ((array) ($configuration->entries ?? []) as $entry) {
            $entity = $entry->target->entity ?? null;
            if ($entity instanceof stdClass && !isset($entity->ref)) $walk($entity);
        }
        $list = array_map('strval', array_keys($types));
        sort($list);
        return $list;
    }

    /** GET /editor/books/{id}/versions → { versions: [{ id, env, build, hash, publishedBy, publishedAt, note }] } newest first */
    public static function versions(string $bookId): never
    {
        Editor::user();
        self::book($bookId);
        $versions = [];
        $rows = Db::run('SELECT v.*, u.email FROM book_versions v LEFT JOIN users u ON u.id = v.published_by WHERE v.book_id = :book ORDER BY v.published_at DESC, v.id', ['book' => $bookId])->fetchAll();
        foreach ($rows as $row) {
            $versions[] = ['id' => $row['id'], 'env' => $row['env'], 'build' => $row['build'], 'hash' => $row['hash'], 'publishedBy' => $row['email'],
                'publishedAt' => Editor::iso((int) $row['published_at']), 'note' => $row['note']];
        }
        Http::json(200, ['versions' => $versions]);
    }

    /**
     * GET /editor/books/{id}/changes?limit= (default 50, at most 500) → { changes: [{ id, kind, ref, before, after, user, token,
     * createdAt }] } newest first; `token` = the AI connection's name for a save made through one, else null
     */
    public static function changes(string $bookId): never
    {
        Editor::user();
        self::book($bookId);
        $limit = min(500, max(1, (int) ($_GET['limit'] ?? 50)));
        $changes = [];
        $rows = Db::run("SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.book_id = :book ORDER BY c.created_at DESC, c.id LIMIT $limit", ['book' => $bookId])->fetchAll();
        foreach ($rows as $row) {
            $changes[] = ['id' => $row['id'], 'kind' => $row['kind'], 'ref' => $row['ref'], 'before' => Editor::decode($row['before_json']), 'after' => Editor::decode($row['after_json']),
                'user' => $row['email'], 'token' => $row['token_name'] ?? null, 'createdAt' => Editor::iso((int) $row['created_at'])];
        }
        Http::json(200, ['changes' => $changes]);
    }

    /**
     * The book row, else 404. `$lock` (inside a transaction that writes the row back) locks it – `Db::forUpdate()`.
     * @return array<string, mixed>
     */
    private static function book(string $bookId, bool $lock = false): array
    {
        $row = Db::one('SELECT * FROM books WHERE id = :id' . ($lock ? Db::forUpdate() : ''), ['id' => $bookId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such book – import a configuration first.');
        return $row;
    }

    /** 404 unless the book exists (Assets) */
    public static function exists(string $bookId): void
    {
        self::book($bookId);
    }

    /**
     * The book row, else 404 – locked with `$lock` inside a transaction that writes it back (BookTexts)
     * @return array<string, mixed>
     */
    public static function bookRow(string $bookId, bool $lock = false): array
    {
        return self::book($bookId, $lock);
    }

    public static function touchBook(string $bookId): void
    {
        self::touch($bookId);
    }

    public static function recordChange(string $bookId, array $user, string $kind, string $ref, ?string $before, string $after): void
    {
        self::change($bookId, $user, $kind, $ref, $before, $after);
    }

    /**
     * A book for the list and the tree; `live` = the environments serving it [{ env, build, since }], empty = draft only
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function summary(array $row): array
    {
        $last = Db::one('SELECT env, build, published_at FROM book_versions WHERE book_id = :book ORDER BY published_at DESC, id LIMIT 1', ['book' => $row['id']]);
        $live = [];
        foreach (self::liveEnvironments() as $env => $serving) {
            if (is_array($serving) && $serving['book'] === $row['id']) $live[] = ['env' => $env, 'build' => $serving['build'], 'since' => $serving['since']];
        }
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'author' => $row['author'],
            'book' => Editor::decode($row['book_json']),
            'initialSpreadId' => $row['initial_spread_id'],
            'schema' => $row['content_schema'],
            'assetsBase' => $row['assets_base'],
            'libraryBase' => Assets::folderUrl((string) $row['id']),
            'importedHash' => $row['imported_hash'],
            'spreads' => (int) Db::value('SELECT COUNT(*) FROM spreads WHERE book_id = :book', ['book' => $row['id']]),
            'createdAt' => Editor::isoOf($row['created_at']),
            'updatedAt' => Editor::isoOf($row['updated_at']),
            'lastPublish' => $last ? ['env' => $last['env'], 'build' => $last['build'], 'at' => Editor::iso((int) $last['published_at'])] : null,
            'live' => $live,
        ];
    }

    /**
     * Checks what the rows need of a configuration and splits it into rows-to-be; every other field stays inside the
     * objects (data_json). An entry belongs to the first spread whose pages include its page, else to none. The book's
     * `sourceOfTruth` is the configuration's, else `print` (an imported book is print first, #238). A
     * configuration's `tutorial` is ignored: the reader owns its onboarding (#236), a draft writes the compat steps.
     * `$pluginSources`: the book has Code tab sources (any node type named like a plugin's may pass – Editor::entity).
     * @return array{book: stdClass, schema: string, hash: ?string, initialSpreadId: string, plugins: array, spreads: array, entities: array, entries: array, targets: array}
     */
    private static function parse(stdClass $c, bool $pluginSources = false): array
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-configuration', $message);
        $version = $c->version ?? null;
        if (!$version instanceof stdClass || !is_string($version->schema ?? null) || !preg_match('/^\d+\.\d+$/', $version->schema)) $fail('version.schema must be "MAJOR.MINOR".');
        $book = $c->book ?? null;
        if (!$book instanceof stdClass || !is_string($book->id ?? null) || !is_string($book->title ?? null) || !is_string($book->author ?? null)) $fail('book needs id, title and author.');
        if (isset($book->environment)) {
            $problems = self::environmentProblems($book->environment);
            if ($problems) $fail($problems[0]);
        }
        // An imported book is print first unless its content says otherwise (#238)
        if (!isset($book->sourceOfTruth)) $book->sourceOfTruth = 'print';
        elseif (!in_array($book->sourceOfTruth, Editor::SOURCES_OF_TRUTH, true)) $fail('book.sourceOfTruth must be one of ' . implode(', ', Editor::SOURCES_OF_TRUTH) . '.');
        if (!is_string($c->initialSpreadId ?? null)) $fail('initialSpreadId must be a string.');
        if (!is_array($c->spreads ?? null) || !is_array($c->entries ?? null)) $fail('spreads and entries must be arrays.');
        $entitiesIn = $c->entities ?? new stdClass();
        if (!$entitiesIn instanceof stdClass) $fail('entities must be an object.');
        // The book's compiled plugins: kept as declared – the content build is their one writer
        $plugins = $c->plugins ?? [];
        if (!is_array($plugins)) $fail('plugins must be an array.');
        foreach ($plugins as $i => $plugin) {
            if (!$plugin instanceof stdClass || !is_string($plugin->id ?? null) || !preg_match('/^' . Plugins::ID . '$/', $plugin->id)
                || !is_string($plugin->src ?? null) || !is_string($plugin->api ?? null)) {
                $fail("plugins[$i] needs id, src and api.");
            }
            // What it registered (optional): the specs by kind – the app's guard checks them in depth
            if (property_exists($plugin, 'registered')) {
                $problem = self::registeredProblem($plugin->registered);
                if ($problem !== null) $fail("plugins[$i].registered" . (str_starts_with($problem, '.') ? $problem : " $problem"));
            }
        }
        // A plugin's node type: the ones the declared plugins recorded, any camelCase name while a
        // plugin is unknown until it runs (a Code tab source, a declared plugin of an older build), none without plugins
        $pluginTypes = Editor::nodeTypesOf($plugins, $pluginSources);
        $pluginMaterials = Editor::typesOf($plugins, $pluginSources, 'materials');

        // The groups scenes name (schema 2.35, #307): kept in books.groups_json, written back at the root by the draft
        $groups = $c->groups ?? [];
        if (!is_array($groups)) $fail('groups must be an array.');
        $groupIds = [];
        foreach ($groups as $i => $group) {
            if (!$group instanceof stdClass || !is_string($group->label ?? null)) $fail("groups[$i] needs id and label.");
            $groupId = Editor::id($group->id ?? null, "groups[$i].id");
            if (in_array($groupId, $groupIds, true)) $fail("Duplicate group id \"$groupId\".");
            $groupIds[] = $groupId;
        }

        $spreads = [];
        foreach ($c->spreads as $i => $s) {
            if (!$s instanceof stdClass || !is_string($s->title ?? null) || !is_numeric($s->firstPage ?? null) || !is_numeric($s->lastPage ?? null)) $fail("spreads[$i] needs id, title, firstPage and lastPage.");
            $id = Editor::id($s->id ?? null, "spreads[$i].id");
            if (property_exists($s, 'matter') && !in_array($s->matter, self::MATTERS, true)) $fail("spreads[$i].matter must be one of " . implode(', ', self::MATTERS) . '.');
            if (isset($spreads[$id])) $fail("Duplicate spread id \"$id\".");
            if (property_exists($s, 'group') && !in_array($s->group, $groupIds, true)) $fail("spreads[$i].group names no group of the configuration.");
            if (property_exists($s, 'surfaces')) {
                try {
                    Scenes::checkSurfaces($s->surfaces);
                } catch (ApiError $error) {
                    $fail("spreads[$i]." . $error->getMessage());
                }
            }
            $spreads[$id] = ['id' => $id, 'position' => $i, 'title' => $s->title, 'first' => (int) $s->firstPage, 'last' => (int) $s->lastPage, 'data' => $s];
        }
        $entities = [];
        $position = 0;
        foreach (get_object_vars($entitiesIn) as $ref => $e) {
            $ref = Editor::id((string) $ref, 'entities key');
            Editor::entity($e, "entities.$ref", 0, $pluginTypes, $pluginMaterials);
            $entities[$ref] = ['ref' => $ref, 'position' => $position++, 'type' => $e->type, 'data' => $e];
        }
        $entries = [];
        $targets = [];
        foreach ($c->entries as $i => $e) {
            if (!$e instanceof stdClass || !is_string($e->title ?? null) || !is_string($e->category ?? null) || !is_numeric($e->page ?? null)) $fail("entries[$i] needs id, category, title and page.");
            $id = Editor::id($e->id ?? null, "entries[$i].id");
            if (isset($entries[$id])) $fail("Duplicate entry id \"$id\".");
            $page = (int) $e->page;
            $spreadId = null;
            // Schema 2.35 (#307): the entry's scene decides its spread, else its access page
            if (is_string($e->scene ?? null) && isset($spreads[$e->scene])) {
                $spreadId = $e->scene;
            } else foreach ($spreads as $s) {
                if ($s['first'] <= $page && $page <= $s['last']) {
                    $spreadId = $s['id'];
                    break;
                }
            }
            $data = clone $e;
            // `spread_id` holds the scene; the draft writes it back (`ContentVersion::assemble`)
            unset($data->target, $data->scene);
            $entries[$id] = ['id' => $id, 'spread' => $spreadId, 'position' => $i, 'category' => $e->category, 'title' => $e->title, 'page' => $page, 'data' => $data];
            $target = $e->target ?? null;
            if ($target === null) continue;
            if (!$target instanceof stdClass || !is_string($target->imageSrc ?? null)) $fail("entries[$i].target needs id and imageSrc.");
            if (property_exists($target, 'enabled') && !is_bool($target->enabled)) $fail("entries[$i].target.enabled must be true or false.");
            $targetId = Editor::id($target->id ?? null, "entries[$i].target.id");
            if (isset($targets[$targetId])) $fail("Duplicate target id \"$targetId\".");
            $targets[$targetId] = ['id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => self::entityRef($target->entity ?? null, $entities, "entries[$i].target.entity", $pluginTypes, $pluginMaterials), 'data' => $target];
        }
        return [
            'book' => $book, 'schema' => $version->schema, 'hash' => is_string($version->hash ?? null) ? $version->hash : null,
            'initialSpreadId' => $c->initialSpreadId, 'plugins' => $plugins, 'groups' => $groups,
            'spreads' => array_values($spreads), 'entities' => array_values($entities), 'entries' => array_values($entries), 'targets' => array_values($targets),
        ];
    }

    /**
     * The target switched on or off (#249): `false` is stored as `enabled: false`, `true` removes the field (on is the
     * default); anything else is a 400 with `$code`
     */
    private static function withEnabled(stdClass $target, mixed $enabled, string $path, string $code = 'invalid-target'): stdClass
    {
        if (!is_bool($enabled)) throw new ApiError(400, $code, "$path must be true or false.");
        if ($enabled) unset($target->enabled);
        else $target->enabled = false;
        return $target;
    }

    /**
     * A target's entity: `{ ref }` naming a shared entity → the ref; an inline entity (checked) or none → null
     * @param bool|list<string> $pluginTypes
     * @param bool|list<string> $pluginMaterials
     */
    private static function entityRef(mixed $entity, array $entities, string $path, bool|array $pluginTypes = false, bool|array $pluginMaterials = false): ?string
    {
        if ($entity === null) return null;
        if ($entity instanceof stdClass && property_exists($entity, 'ref')) {
            $ref = Editor::id($entity->ref, "$path.ref");
            if (!isset($entities[$ref])) throw new ApiError(400, 'unknown-entity', "$path.ref: no entity \"$ref\".");
            return $ref;
        }
        Editor::entity($entity, $path, 0, $pluginTypes, $pluginMaterials);
        return null;
    }

    /**
     * The current version of CONTENT_BASE_URL (latest.json → <build>/game.config.json + files.json), with what
     * latest.json said
     * @return array{0: stdClass, 1: stdClass, 2: string, 3: array{base: string, url: string, build: string, activatedAt: ?string}}
     */
    private static function fetchFromCdn(): array
    {
        $base = rtrim(Config::get('CONTENT_BASE_URL'), '/');
        if ($base === '') throw new ApiError(400, 'no-content-base', 'CONTENT_BASE_URL is not set on this server.');
        $latest = "$base/latest.json";
        $manifest = self::fetchJson("$latest?t=" . time(), $latest);
        $build = $manifest instanceof stdClass ? ($manifest->build ?? null) : null;
        if (!is_string($build) || !preg_match(ContentStore::BUILD, $build)) throw new ApiError(502, 'content-fetch-failed', "$latest names no content version.", ['url' => $latest]);
        $configuration = self::fetchJson("$base/$build/game.config.json");
        if (!$configuration instanceof stdClass) throw new ApiError(502, 'content-fetch-failed', "$base/$build/game.config.json is not an object.", ['url' => "$base/$build/game.config.json"]);
        try {
            $files = self::fetchJson("$base/$build/files.json");
        } catch (ApiError) {
            $files = null; // optional, as for the reader
        }
        $activatedAt = is_string($manifest->activatedAt ?? null) ? $manifest->activatedAt : null;
        return [$configuration, $files instanceof stdClass ? $files : new stdClass(), "$base/$build", ['base' => $base, 'url' => $latest, 'build' => $build, 'activatedAt' => $activatedAt]];
    }

    /** `$shown` = the URL errors name (without a cache-busting query) */
    private static function fetchJson(string $url, ?string $shown = null): mixed
    {
        $shown ??= $url;
        $context = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]]);
        $body = @file_get_contents($url, false, $context);
        $status = isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s(\d{3})#', $http_response_header[0], $match) ? (int) $match[1] : 0;
        if ($body === false || $status !== 200) throw new ApiError(502, 'content-fetch-failed', $status ? "$shown answered $status." : "$shown could not be reached.", ['url' => $shown]);
        try {
            return json_decode($body, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiError(502, 'content-fetch-failed', "$shown is not JSON.", ['url' => $shown]);
        }
    }

    private static function touch(string $bookId): void
    {
        Db::run('UPDATE books SET updated_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $bookId]);
    }

    /**
     * One row of the change log; a save through an AI connection records the token's name (`token_name`), so the log
     * tells which AI made it
     * @param array<string, mixed> $user
     */
    private static function change(string $bookId, array $user, string $kind, string $ref, ?string $before, string $after): void
    {
        Db::run('INSERT INTO changes (id, book_id, user_id, token_name, kind, ref, before_json, after_json, created_at) VALUES (:id, :book, :user, :token, :kind, :ref, :before, :after, :at)',
            ['id' => Db::uuid(), 'book' => $bookId, 'user' => $user['id'], 'token' => Auth::token()['name'] ?? null, 'kind' => $kind, 'ref' => $ref,
             'before' => $before, 'after' => $after, 'at' => Editor::nowMs()]);
    }
}
