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
    /** GET /editor/books → { books: [{ id, title, author, book, spreads, updatedAt, lastPublish, … }] } */
    public static function list(): never
    {
        Editor::user();
        $books = [];
        foreach (Db::run('SELECT * FROM books ORDER BY title, id')->fetchAll() as $row) $books[] = self::summary($row);
        Http::json(200, ['books' => $books]);
    }

    /**
     * POST /editor/books/{id}/import { configuration, files?, assetsBase? } | { source: "cdn" } → { book, counts, draft }
     * Replaces the book's content rows in one transaction (the logs stay). `assetsBase` is where the configuration's
     * `/assets/content/…` paths resolve; `source: "cdn"` imports the current version of CONTENT_BASE_URL.
     */
    public static function import(string $bookId): never
    {
        Editor::user();
        $body = Editor::body();
        $assetsBase = '';
        $files = new stdClass();
        if (($body->source ?? null) === 'cdn') {
            [$configuration, $files, $assetsBase] = self::fetchFromCdn();
        } else {
            $configuration = $body->configuration ?? null;
            if (!$configuration instanceof stdClass) throw new ApiError(400, 'invalid-configuration', 'configuration must be an object.');
            if (isset($body->files)) {
                if (!$body->files instanceof stdClass) throw new ApiError(400, 'invalid-configuration', 'files must be an object.');
                $files = $body->files;
            }
            if (isset($body->assetsBase)) {
                if (!is_string($body->assetsBase)) throw new ApiError(400, 'invalid-configuration', 'assetsBase must be a string.');
                $assetsBase = rtrim($body->assetsBase, '/');
            }
        }
        $parts = self::parse($configuration);
        $now = Db::now();

        Db::transaction(function () use ($bookId, $parts, $files, $assetsBase, $now) {
            foreach (['targets', 'entries', 'spreads', 'entities'] as $table) {
                Db::run("DELETE FROM $table WHERE book_id = :book", ['book' => $bookId]);
            }
            $book = $parts['book'];
            $params = [
                'id' => $bookId, 'title' => $book->title, 'author' => $book->author, 'book' => Editor::encode($book),
                'tutorial' => Editor::encode($parts['tutorial']), 'initial' => $parts['initialSpreadId'], 'base' => $assetsBase,
                'files' => Editor::encode($files), 'schema' => $parts['schema'], 'hash' => $parts['hash'], 'now' => $now,
            ];
            if (Db::value('SELECT id FROM books WHERE id = :id', ['id' => $bookId]) !== null) {
                Db::run('UPDATE books SET title = :title, author = :author, book_json = :book, tutorial_json = :tutorial, initial_spread_id = :initial,
                         assets_base = :base, files_json = :files, content_schema = :schema, imported_hash = :hash, updated_at = :now WHERE id = :id', $params);
            } else {
                Db::run('INSERT INTO books (id, title, author, book_json, tutorial_json, initial_spread_id, assets_base, files_json, content_schema, imported_hash, created_at, updated_at)
                         VALUES (:id, :title, :author, :book, :tutorial, :initial, :base, :files, :schema, :hash, :created, :now)', $params + ['created' => $now]);
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
        ]);
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
        $bySpread = [];
        $unassigned = [];
        foreach (Db::run('SELECT * FROM entries WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $entry = ['id' => $row['id'], 'category' => $row['category'], 'title' => $row['title'], 'page' => (int) $row['page'], 'target' => $targets[$row['id']] ?? null];
            if ($row['spread_id'] === null) $unassigned[] = $entry;
            else $bySpread[$row['spread_id']][] = $entry;
        }
        $spreads = [];
        foreach (Db::run('SELECT id, data_json FROM spreads WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $spread = Editor::decode($row['data_json']);
            $spread->entries = $bySpread[$row['id']] ?? [];
            $spreads[] = $spread;
        }
        Http::json(200, ['book' => self::summary($book), 'spreads' => $spreads, 'unassigned' => $unassigned]);
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
        $entity = Editor::entity(Editor::body());
        $json = Editor::encode($entity);
        Db::transaction(function () use ($bookId, $ref, $entity, $json, $user) {
            $params = ['book' => $bookId, 'ref' => $ref];
            $current = Db::one('SELECT data_json FROM entities WHERE book_id = :book AND ref = :ref', $params);
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
     * PUT /editor/books/{id}/targets/{targetId} { entity } | { ref } → { target }: the target's entity – inline
     * (`entity`, null removes it) or a shared one (`ref`); records a change with the whole target before and after.
     */
    public static function putTarget(string $bookId, string $targetId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        $params = ['book' => $bookId, 'id' => $targetId];
        $row = Db::one('SELECT data_json FROM targets WHERE book_id = :book AND id = :id', $params);
        if (!$row) throw new ApiError(404, 'not-found', 'No such target.');
        $target = Editor::decode($row['data_json']);
        $ref = null;
        if (property_exists($body, 'ref')) {
            $ref = Editor::id($body->ref, 'ref');
            if (Db::value('SELECT ref FROM entities WHERE book_id = :book AND ref = :ref', ['book' => $bookId, 'ref' => $ref]) === null) {
                throw new ApiError(400, 'unknown-entity', "No entity \"$ref\" in this book.");
            }
            $target->entity = (object) ['ref' => $ref];
        } elseif (property_exists($body, 'entity')) {
            if ($body->entity === null) unset($target->entity);
            else $target->entity = Editor::entity($body->entity);
        } else {
            throw new ApiError(400, 'invalid-entity', 'Send { entity } or { ref }.');
        }
        $json = Editor::encode($target);
        Db::transaction(function () use ($bookId, $targetId, $params, $ref, $json, $row, $user) {
            Db::run('UPDATE targets SET entity_ref = :ref, data_json = :data WHERE book_id = :book AND id = :id', $params + ['ref' => $ref, 'data' => $json]);
            self::touch($bookId);
            self::change($bookId, $user, 'target', $targetId, $row['data_json'], $json);
        });
        Http::json(200, ['target' => $target]);
    }

    /**
     * POST /editor/books/{id}/publish { env, note? } → { env, build, hash, publishedAt }: the assembled version into
     * the content store – the version folder (unless that build is there already: a folder is never overwritten),
     * then versions.json, then latest.json (the switch) – and a row in the publish log.
     */
    public static function publish(string $bookId, array $body): never
    {
        $user = Editor::user();
        self::book($bookId);
        $env = $body['env'] ?? null;
        if (!is_string($env) || !in_array($env, ContentStore::ENVIRONMENTS, true)) {
            throw new ApiError(400, 'invalid-env', 'env must be ' . implode(', ', ContentStore::ENVIRONMENTS) . '.');
        }
        $note = $body['note'] ?? null;
        if ($note !== null && !is_string($note)) throw new ApiError(400, 'invalid-note', 'note must be a string.');

        $version = ContentVersion::assemble($bookId);
        $store = ContentStore::for($env);
        $root = $version['build'];
        $uploaded = $store->exists("$root/game.config.json");
        if (!$uploaded) {
            $store->put("$root/files.json", Editor::encode($version['files']));
            // Last in the folder: the configuration marks the version as complete
            $store->put("$root/game.config.json", Editor::encode($version['configuration']));
        }
        $now = Editor::iso();
        $current = $store->get('versions.json');
        $versions = $current === null ? [] : json_decode($current, true);
        if (!is_array($versions)) throw new ApiError(502, 'content-store-failed', "$env/versions.json is not readable – fix it before publishing.");
        $store->put('versions.json', Editor::encode(ContentStore::activate($versions, $version, $now, !$uploaded), true));
        $store->put('latest.json', Editor::encode(ContentVersion::manifest($version, $now), true));

        Db::run('INSERT INTO book_versions (id, book_id, env, build, hash, published_by, published_at, note) VALUES (:id, :book, :env, :build, :hash, :by, :at, :note)',
            ['id' => Db::uuid(), 'book' => $bookId, 'env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'by' => $user['id'], 'at' => Editor::nowMs(), 'note' => $note]);
        Http::json(200, ['env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'publishedAt' => $now]);
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

    /** GET /editor/books/{id}/changes?limit= (default 50, at most 500) → { changes: [{ id, kind, ref, before, after, user, createdAt }] } newest first */
    public static function changes(string $bookId): never
    {
        Editor::user();
        self::book($bookId);
        $limit = min(500, max(1, (int) ($_GET['limit'] ?? 50)));
        $changes = [];
        $rows = Db::run("SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.book_id = :book ORDER BY c.created_at DESC, c.id LIMIT $limit", ['book' => $bookId])->fetchAll();
        foreach ($rows as $row) {
            $changes[] = ['id' => $row['id'], 'kind' => $row['kind'], 'ref' => $row['ref'], 'before' => Editor::decode($row['before_json']), 'after' => Editor::decode($row['after_json']),
                'user' => $row['email'], 'createdAt' => Editor::iso((int) $row['created_at'])];
        }
        Http::json(200, ['changes' => $changes]);
    }

    /**
     * The book row, else 404
     * @return array<string, mixed>
     */
    private static function book(string $bookId): array
    {
        $row = Db::one('SELECT * FROM books WHERE id = :id', ['id' => $bookId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such book – import a configuration first.');
        return $row;
    }

    /**
     * A book for the list and the tree
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function summary(array $row): array
    {
        $last = Db::one('SELECT env, build, published_at FROM book_versions WHERE book_id = :book ORDER BY published_at DESC, id LIMIT 1', ['book' => $row['id']]);
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'author' => $row['author'],
            'book' => Editor::decode($row['book_json']),
            'initialSpreadId' => $row['initial_spread_id'],
            'schema' => $row['content_schema'],
            'assetsBase' => $row['assets_base'],
            'importedHash' => $row['imported_hash'],
            'spreads' => (int) Db::value('SELECT COUNT(*) FROM spreads WHERE book_id = :book', ['book' => $row['id']]),
            'createdAt' => Editor::isoOf($row['created_at']),
            'updatedAt' => Editor::isoOf($row['updated_at']),
            'lastPublish' => $last ? ['env' => $last['env'], 'build' => $last['build'], 'at' => Editor::iso((int) $last['published_at'])] : null,
        ];
    }

    /**
     * Checks what the rows need of a configuration and splits it into rows-to-be; every other field stays inside the
     * objects (data_json). An entry belongs to the first spread whose pages include its page, else to none.
     * @return array{book: stdClass, schema: string, hash: ?string, initialSpreadId: string, tutorial: array, spreads: array, entities: array, entries: array, targets: array}
     */
    private static function parse(stdClass $c): array
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-configuration', $message);
        $version = $c->version ?? null;
        if (!$version instanceof stdClass || !is_string($version->schema ?? null) || !preg_match('/^\d+\.\d+$/', $version->schema)) $fail('version.schema must be "MAJOR.MINOR".');
        $book = $c->book ?? null;
        if (!$book instanceof stdClass || !is_string($book->id ?? null) || !is_string($book->title ?? null) || !is_string($book->author ?? null)) $fail('book needs id, title and author.');
        if (!is_string($c->initialSpreadId ?? null)) $fail('initialSpreadId must be a string.');
        if (!is_array($c->spreads ?? null) || !is_array($c->entries ?? null)) $fail('spreads and entries must be arrays.');
        $entitiesIn = $c->entities ?? new stdClass();
        if (!$entitiesIn instanceof stdClass) $fail('entities must be an object.');
        $tutorial = $c->tutorial ?? [];
        if (!is_array($tutorial)) $fail('tutorial must be an array.');

        $spreads = [];
        foreach ($c->spreads as $i => $s) {
            if (!$s instanceof stdClass || !is_string($s->title ?? null) || !is_numeric($s->firstPage ?? null) || !is_numeric($s->lastPage ?? null)) $fail("spreads[$i] needs id, title, firstPage and lastPage.");
            $id = Editor::id($s->id ?? null, "spreads[$i].id");
            if (isset($spreads[$id])) $fail("Duplicate spread id \"$id\".");
            $spreads[$id] = ['id' => $id, 'position' => $i, 'title' => $s->title, 'first' => (int) $s->firstPage, 'last' => (int) $s->lastPage, 'data' => $s];
        }
        $entities = [];
        $position = 0;
        foreach (get_object_vars($entitiesIn) as $ref => $e) {
            $ref = Editor::id((string) $ref, 'entities key');
            Editor::entity($e, "entities.$ref");
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
            foreach ($spreads as $s) {
                if ($s['first'] <= $page && $page <= $s['last']) {
                    $spreadId = $s['id'];
                    break;
                }
            }
            $data = clone $e;
            unset($data->target);
            $entries[$id] = ['id' => $id, 'spread' => $spreadId, 'position' => $i, 'category' => $e->category, 'title' => $e->title, 'page' => $page, 'data' => $data];
            $target = $e->target ?? null;
            if ($target === null) continue;
            if (!$target instanceof stdClass || !is_string($target->imageSrc ?? null)) $fail("entries[$i].target needs id and imageSrc.");
            $targetId = Editor::id($target->id ?? null, "entries[$i].target.id");
            if (isset($targets[$targetId])) $fail("Duplicate target id \"$targetId\".");
            $targets[$targetId] = ['id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => self::entityRef($target->entity ?? null, $entities, "entries[$i].target.entity"), 'data' => $target];
        }
        return [
            'book' => $book, 'schema' => $version->schema, 'hash' => is_string($version->hash ?? null) ? $version->hash : null,
            'initialSpreadId' => $c->initialSpreadId, 'tutorial' => $tutorial,
            'spreads' => array_values($spreads), 'entities' => array_values($entities), 'entries' => array_values($entries), 'targets' => array_values($targets),
        ];
    }

    /** A target's entity: `{ ref }` naming a shared entity → the ref; an inline entity (checked) or none → null */
    private static function entityRef(mixed $entity, array $entities, string $path): ?string
    {
        if ($entity === null) return null;
        if ($entity instanceof stdClass && property_exists($entity, 'ref')) {
            $ref = Editor::id($entity->ref, "$path.ref");
            if (!isset($entities[$ref])) throw new ApiError(400, 'unknown-entity', "$path.ref: no entity \"$ref\".");
            return $ref;
        }
        Editor::entity($entity, $path);
        return null;
    }

    /**
     * The current version of CONTENT_BASE_URL (latest.json → <build>/game.config.json + files.json)
     * @return array{0: stdClass, 1: stdClass, 2: string}
     */
    private static function fetchFromCdn(): array
    {
        $base = rtrim(Config::get('CONTENT_BASE_URL'), '/');
        if ($base === '') throw new ApiError(400, 'no-content-base', 'CONTENT_BASE_URL is not set on this server.');
        $manifest = self::fetchJson("$base/latest.json?t=" . time());
        $build = $manifest->build ?? null;
        if (!is_string($build) || !preg_match(ContentStore::BUILD, $build)) throw new ApiError(502, 'content-fetch-failed', "$base/latest.json names no content version.");
        $configuration = self::fetchJson("$base/$build/game.config.json");
        if (!$configuration instanceof stdClass) throw new ApiError(502, 'content-fetch-failed', "$base/$build/game.config.json is not an object.");
        try {
            $files = self::fetchJson("$base/$build/files.json");
        } catch (ApiError) {
            $files = null; // optional, as for the reader
        }
        return [$configuration, $files instanceof stdClass ? $files : new stdClass(), "$base/$build"];
    }

    private static function fetchJson(string $url): mixed
    {
        $context = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]]);
        $body = @file_get_contents($url, false, $context);
        $status = isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s(\d{3})#', $http_response_header[0], $match) ? (int) $match[1] : 0;
        if ($body === false || $status !== 200) throw new ApiError(502, 'content-fetch-failed', "$url answered " . ($status ?: 'nothing') . '.');
        try {
            return json_decode($body, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiError(502, 'content-fetch-failed', "$url is not JSON.");
        }
    }

    private static function touch(string $bookId): void
    {
        Db::run('UPDATE books SET updated_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $bookId]);
    }

    /** @param array<string, mixed> $user */
    private static function change(string $bookId, array $user, string $kind, string $ref, ?string $before, string $after): void
    {
        Db::run('INSERT INTO changes (id, book_id, user_id, kind, ref, before_json, after_json, created_at) VALUES (:id, :book, :user, :kind, :ref, :before, :after, :at)',
            ['id' => Db::uuid(), 'book' => $bookId, 'user' => $user['id'], 'kind' => $kind, 'ref' => $ref, 'before' => $before, 'after' => $after, 'at' => Editor::nowMs()]);
    }
}
