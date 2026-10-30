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

    /** @return array<string, array{book: ?string, build: ?string, since: ?string}|null|false> */
    private static function liveEnvironments(): array
    {
        if (self::$live === null) {
            self::$live = [];
            foreach (ContentStore::ENVIRONMENTS as $env) {
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
        $parts = self::parse($configuration, Plugins::hasSources($bookId));
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
                'plugins' => Editor::encode($parts['plugins']),
            ];
            if (Db::value('SELECT id FROM books WHERE id = :id', ['id' => $bookId]) !== null) {
                Db::run('UPDATE books SET title = :title, author = :author, book_json = :book, tutorial_json = :tutorial, initial_spread_id = :initial,
                         assets_base = :base, files_json = :files, content_schema = :schema, imported_hash = :hash, plugins_json = :plugins, updated_at = :now WHERE id = :id', $params);
            } else {
                Db::run('INSERT INTO books (id, title, author, book_json, tutorial_json, initial_spread_id, assets_base, files_json, content_schema, imported_hash, plugins_json, created_at, updated_at)
                         VALUES (:id, :title, :author, :book, :tutorial, :initial, :base, :files, :schema, :hash, :plugins, :created, :now)', $params + ['created' => $now]);
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
        $entity = Editor::entity(Editor::body(), 'entity', 0, Editor::hasPlugins($bookId));
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
        $row = Db::one('SELECT data_json, entity_ref FROM targets WHERE book_id = :book AND id = :id', $params);
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
            else $target->entity = Editor::entity($body->entity, 'entity', 0, Editor::hasPlugins($bookId));
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
        if (!$touched) throw new ApiError(400, 'invalid-target', 'Send { entity } or { ref }, { imageSrc } or { print }.');
        $json = Editor::encode($target);
        Db::transaction(function () use ($bookId, $targetId, $params, $ref, $json, $row, $user, $target) {
            Db::run('UPDATE targets SET entity_ref = :ref, image_src = :image, data_json = :data WHERE book_id = :book AND id = :id', $params + ['ref' => $ref, 'image' => $target->imageSrc, 'data' => $json]);
            self::touch($bookId);
            self::change($bookId, $user, 'target', $targetId, $row['data_json'], $json);
        });
        Http::json(200, ['target' => $target]);
    }

    /**
     * POST /editor/books/{id}/entries { id?, category, title, page, body?, target: { id?, imageSrc, print?, entity? } }
     * → 201 { entry, target }: a new entry on the spread its page belongs to, with its target (made in the editor –
     * docs/server.md "Targets"). 400 `invalid-entry`, 409 `duplicate-id`.
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
        if (!is_int($page) && !(is_float($page) && floor($page) === $page)) throw new ApiError(400, 'invalid-entry', 'page must be a whole number.');
        if (!is_string($category) || !in_array($category, Editor::ENTRY_CATEGORIES, true)) throw new ApiError(400, 'invalid-entry', 'category must be one of ' . implode(', ', Editor::ENTRY_CATEGORIES) . '.');
        $page = (int) $page;
        $id = Editor::id($body->id ?? self::slug($title, $page), 'id');
        if (Db::one('SELECT id FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $id])) throw new ApiError(409, 'duplicate-id', "An entry \"$id\" exists.");
        $targetIn = $body->target ?? null;
        if (!$targetIn instanceof stdClass || !is_string($targetIn->imageSrc ?? null) || $targetIn->imageSrc === '') throw new ApiError(400, 'invalid-entry', 'target.imageSrc is needed.');
        $targetId = Editor::id($targetIn->id ?? $id, 'target.id');
        if (Db::one('SELECT id FROM targets WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $targetId])) throw new ApiError(409, 'duplicate-id', "A target \"$targetId\" exists.");
        $target = (object) ['id' => $targetId, 'imageSrc' => $targetIn->imageSrc];
        if (isset($targetIn->print)) $target->print = Editor::print($targetIn->print);
        $ref = null;
        if (isset($targetIn->entity)) {
            if ($targetIn->entity instanceof stdClass && property_exists($targetIn->entity, 'ref')) {
                $ref = Editor::id($targetIn->entity->ref, 'target.entity.ref');
                if (Db::value('SELECT ref FROM entities WHERE book_id = :book AND ref = :ref', ['book' => $bookId, 'ref' => $ref]) === null) throw new ApiError(400, 'unknown-entity', "No entity \"$ref\" in this book.");
                $target->entity = (object) ['ref' => $ref];
            } else {
                $target->entity = Editor::entity($targetIn->entity, 'target.entity', 0, Editor::hasPlugins($bookId));
            }
        }
        // Each named parameter once: MySQL with native prepares (no emulation) refuses a name used twice (HY093) – SQLite
        // allows it, so the local API never showed the 500 that staging gave on every new target
        $spreadId = Db::value('SELECT id FROM spreads WHERE book_id = :book AND first_page <= :first AND last_page >= :last ORDER BY position LIMIT 1', ['book' => $bookId, 'first' => $page, 'last' => $page]);
        $entry = (object) ['id' => $id, 'category' => $category, 'title' => trim($title), 'page' => $page, 'body' => is_string($body->body ?? null) ? $body->body : '', 'tags' => []];
        $position = (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM entries WHERE book_id = :book', ['book' => $bookId]);
        $entryJson = Editor::encode($entry);
        $targetJson = Editor::encode($target);
        Db::transaction(function () use ($bookId, $id, $spreadId, $position, $category, $entry, $page, $entryJson, $targetId, $target, $ref, $targetJson, $user) {
            Db::run('INSERT INTO entries (book_id, id, spread_id, position, category, title, page, data_json) VALUES (:book, :id, :spread, :position, :category, :title, :page, :data)',
                ['book' => $bookId, 'id' => $id, 'spread' => $spreadId, 'position' => $position, 'category' => $category, 'title' => $entry->title, 'page' => $page, 'data' => $entryJson]);
            Db::run('INSERT INTO targets (book_id, id, entry_id, image_src, entity_ref, data_json) VALUES (:book, :id, :entry, :image, :ref, :data)',
                ['book' => $bookId, 'id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => $ref, 'data' => $targetJson]);
            self::touch($bookId);
            self::change($bookId, $user, 'entry', $id, null, $entryJson);
            self::change($bookId, $user, 'target', $targetId, null, $targetJson);
        });
        $entry->target = $target;
        Http::json(201, ['entry' => $entry, 'spreadId' => $spreadId]);
    }

    /**
     * PUT /editor/books/{id}/spreads/{spreadId} { title?, format?, passes? } → { spread }: a spread's title, format
     * (`spread` | `cover` | `back`, content schema 2.3) and post-processing passes (schema 2.5: a list of
     * `{ type, …parameters }` with a built-in type – `null` removes the list, so the book's passes apply; `[]` turns
     * them off). The pages stay – a cover is page 0, the back the page after the last; `format: cover` on a spread
     * with other pages is refused.
     */
    public static function putSpread(string $bookId, string $spreadId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        $row = Db::one('SELECT * FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $spreadId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such spread.');
        $spread = Editor::decode($row['data_json']);
        $touched = false;
        if (property_exists($body, 'title')) {
            if (!is_string($body->title) || trim($body->title) === '') throw new ApiError(400, 'invalid-spread', 'title must be a non-empty string.');
            $spread->title = trim($body->title);
            $touched = true;
        }
        if (property_exists($body, 'format')) {
            $format = $body->format ?? 'spread';
            if (!in_array($format, self::FORMATS, true)) throw new ApiError(400, 'invalid-spread', 'format must be one of ' . implode(', ', self::FORMATS) . '.');
            if ($format === 'cover' && ((int) $row['first_page'] !== 0 || (int) $row['last_page'] !== 0)) throw new ApiError(400, 'invalid-spread', 'A cover is page 0 – add it with POST …/spreads { format: "cover" }.');
            if ($format === 'spread') unset($spread->format);
            else $spread->format = $format;
            $touched = true;
        }
        if (property_exists($body, 'passes')) {
            if ($body->passes === null) unset($spread->passes);
            else $spread->passes = self::passes($body->passes);
            $touched = true;
        }
        if (!$touched) throw new ApiError(400, 'invalid-spread', 'Send { title }, { format } and / or { passes }.');
        $json = Editor::encode($spread);
        Db::transaction(function () use ($bookId, $spreadId, $spread, $json, $row, $user) {
            Db::run('UPDATE spreads SET title = :title, data_json = :data WHERE book_id = :book AND id = :id', ['title' => $spread->title, 'data' => $json, 'book' => $bookId, 'id' => $spreadId]);
            self::touch($bookId);
            self::change($bookId, $user, 'spread', $spreadId, $row['data_json'], $json);
        });
        Http::json(200, ['spread' => $spread]);
    }

    /**
     * PUT /editor/books/{id}/environment { environment: { world, onionSky, worldSrc?, skySrc? } | null } → 200
     * { environment }: the world around the reader and the onion sky (content schema 2.8; the world model and the sky
     * image as asset references 2.10, shared/types/environment.ts). `null` removes it – the default applies. Book-level
     * only; the reader's Graphics switches still apply on top.
     */
    public static function putEnvironment(string $bookId): never
    {
        $user = Editor::user();
        $row = self::book($bookId);
        $body = Editor::body();
        if (!property_exists($body, 'environment')) throw new ApiError(400, 'invalid-environment', 'Send { environment: { world, onionSky, worldSrc?, skySrc? } } or { environment: null }.');
        $book = Editor::decode($row['book_json']);
        if ($body->environment === null) {
            unset($book->environment);
        } else {
            $problems = self::environmentProblems($body->environment);
            if ($problems) throw new ApiError(400, 'invalid-environment', $problems[0]);
            $environment = ['world' => $body->environment->world, 'onionSky' => $body->environment->onionSky];
            foreach (['worldSrc', 'skySrc'] as $key) {
                if (isset($body->environment->{$key})) $environment[$key] = $body->environment->{$key};
            }
            $book->environment = (object) $environment;
        }
        $json = Editor::encode($book);
        Db::transaction(function () use ($bookId, $json, $row, $user) {
            Db::run('UPDATE books SET book_json = :book WHERE id = :id', ['book' => $json, 'id' => $bookId]);
            self::touch($bookId);
            self::change($bookId, $user, 'environment', $bookId, $row['book_json'], $json);
        });
        Http::json(200, ['environment' => $book->environment ?? null]);
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
     * POST /editor/books/{id}/spreads { format: "spread" | "cover" | "back", after?, id?, title? } → 201 { spread, moved }:
     * - `spread`: a double page after the spread `after` (default: after the last one before the back cover). Its pages
     *   are the two after that spread's last page; every later page is numbered on by two – the later spreads, the
     *   entries on those pages and their targets' `print.page` move with them (`moved` counts the rows). Its id is
     *   `id`, else the first free `spread-<n>`. 400 `unknown-spread` for an unknown `after`, `invalid-spread` after
     *   the back cover; 409 `duplicate-id`.
     * - `cover` / `back`: the front cover (page 0, first in order) or the back cover (the page after the last, last in
     *   order) – nothing moves. 409 `duplicate-id` when the book has one.
     */
    public static function addSpread(string $bookId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $body = Editor::body();
        $format = $body->format ?? null;
        if (!in_array($format, self::FORMATS, true)) throw new ApiError(400, 'invalid-spread', 'format must be one of ' . implode(', ', self::FORMATS) . '.');
        $title = is_string($body->title ?? null) && trim($body->title) !== '' ? trim($body->title) : null;
        if ($format !== 'spread') {
            if (property_exists($body, 'after')) throw new ApiError(400, 'invalid-spread', 'after is for a double page – the covers have their places.');
            self::addCover($bookId, $format, $title, $user);
        }
        $spreads = Db::run('SELECT id, position, first_page, last_page, data_json FROM spreads WHERE book_id = :book ORDER BY position', ['book' => $bookId])->fetchAll();
        if (property_exists($body, 'after')) {
            $afterId = Editor::id($body->after, 'after');
            $anchor = array_values(array_filter($spreads, fn(array $s) => $s['id'] === $afterId))[0] ?? null;
            if ($anchor === null) throw new ApiError(400, 'unknown-spread', "No spread \"$afterId\" in this book.");
            if (self::formatOf($anchor) === 'back') throw new ApiError(400, 'invalid-spread', 'Nothing comes after the back cover.');
        } else {
            $before = array_values(array_filter($spreads, fn(array $s) => self::formatOf($s) !== 'back'));
            $anchor = $before ? end($before) : null;
        }
        $ids = array_column($spreads, 'id');
        if (property_exists($body, 'id')) {
            $id = Editor::id($body->id, 'id');
            if (in_array($id, $ids, true)) throw new ApiError(409, 'duplicate-id', "A spread \"$id\" exists.");
        } else {
            for ($n = 1; in_array("spread-$n", $ids, true); $n++);
            $id = "spread-$n";
        }
        // A book without spreads (or with only a back cover) starts on page 1, before everything
        $last = $anchor !== null ? (int) $anchor['last_page'] : 0;
        $position = $anchor !== null ? (int) $anchor['position'] + 1 : ($spreads ? (int) $spreads[0]['position'] : 0);
        $spread = (object) ['id' => $id, 'title' => $title ?? 'New spread', 'firstPage' => $last + 1, 'lastPage' => $last + 2];
        $json = Editor::encode($spread);
        $moved = Db::transaction(function () use ($bookId, $id, $position, $spread, $last, $json, $user) {
            Db::run('UPDATE spreads SET position = position + 1 WHERE book_id = :book AND position >= :position', ['book' => $bookId, 'position' => $position]);
            $moved = self::renumber($bookId, $last, 2, $user);
            Db::run('INSERT INTO spreads (book_id, id, position, title, first_page, last_page, data_json) VALUES (:book, :id, :position, :title, :first, :last, :data)',
                ['book' => $bookId, 'id' => $id, 'position' => $position, 'title' => $spread->title, 'first' => $spread->firstPage, 'last' => $spread->lastPage, 'data' => $json]);
            self::touch($bookId);
            self::change($bookId, $user, 'spread', $id, null, $json);
            return $moved;
        });
        Http::json(201, ['spread' => $spread, 'moved' => $moved]);
    }

    /**
     * The front cover (page 0, first) or the back cover (the page after the last, last) – POST …/spreads { format }
     * @param array<string, mixed> $user
     */
    private static function addCover(string $bookId, string $format, ?string $title, array $user): never
    {
        $id = $format;
        if (Db::one('SELECT id FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $id])) throw new ApiError(409, 'duplicate-id', "The book has a $format spread.");
        $title ??= $format === 'cover' ? 'Cover' : 'Back cover';
        $last = (int) Db::value('SELECT COALESCE(MAX(last_page), 0) FROM spreads WHERE book_id = :book', ['book' => $bookId]);
        $page = $format === 'cover' ? 0 : $last + 1;
        $position = $format === 'cover'
            ? (int) Db::value('SELECT COALESCE(MIN(position), 0) - 1 FROM spreads WHERE book_id = :book', ['book' => $bookId])
            : (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM spreads WHERE book_id = :book', ['book' => $bookId]);
        $spread = (object) ['id' => $id, 'title' => $title, 'firstPage' => $page, 'lastPage' => $page, 'format' => $format];
        $json = Editor::encode($spread);
        Db::transaction(function () use ($bookId, $id, $position, $title, $page, $json, $user) {
            Db::run('INSERT INTO spreads (book_id, id, position, title, first_page, last_page, data_json) VALUES (:book, :id, :position, :title, :first, :last, :data)',
                ['book' => $bookId, 'id' => $id, 'position' => $position, 'title' => $title, 'first' => $page, 'last' => $page, 'data' => $json]);
            self::touch($bookId);
            self::change($bookId, $user, 'spread', $id, null, $json);
        });
        Http::json(201, ['spread' => $spread, 'moved' => ['spreads' => 0, 'entries' => 0, 'targets' => 0]]);
    }

    /**
     * DELETE /editor/books/{id}/spreads/{spreadId} → 204: a spread without entries goes. A double page takes its pages
     * with it: every later page is numbered back (the later spreads, the entries on those pages, their targets'
     * `print.page`) – the reverse of adding it; the covers have no page number, nothing moves. 409 `spread-not-empty`
     * (with `entries`, their ids) while entries are on it – they carry targets and AR, so they are deleted one by one,
     * never with the spread; 409 `initial-spread` for the spread the book opens on.
     */
    public static function deleteSpread(string $bookId, string $spreadId): never
    {
        $user = Editor::user();
        $book = self::book($bookId);
        $row = Db::one('SELECT * FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $spreadId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such spread.');
        if ($book['initial_spread_id'] === $spreadId) throw new ApiError(409, 'initial-spread', 'The book opens on this spread.');
        $entries = array_column(Db::run('SELECT id FROM entries WHERE book_id = :book AND spread_id = :spread ORDER BY position', ['book' => $bookId, 'spread' => $spreadId])->fetchAll(), 'id');
        if ($entries) {
            $count = count($entries) === 1 ? 'an entry' : count($entries) . ' entries';
            throw new ApiError(409, 'spread-not-empty', "The spread has $count – delete them first.", ['entries' => $entries]);
        }
        $pages = in_array(self::formatOf($row), ['cover', 'back'], true) ? 0 : (int) $row['last_page'] - (int) $row['first_page'] + 1;
        Db::transaction(function () use ($bookId, $spreadId, $row, $pages, $user) {
            Db::run('DELETE FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $spreadId]);
            Db::run('UPDATE spreads SET position = position - 1 WHERE book_id = :book AND position > :position', ['book' => $bookId, 'position' => (int) $row['position']]);
            if ($pages > 0) self::renumber($bookId, (int) $row['last_page'], -$pages, $user);
            self::touch($bookId);
            self::change($bookId, $user, 'spread', $spreadId, $row['data_json'], 'null');
        });
        http_response_code(204);
        exit;
    }

    /**
     * A spread row's format (`spread` when its data names none)
     * @param array<string, mixed> $row
     */
    private static function formatOf(array $row): string
    {
        return Editor::decode($row['data_json'])->format ?? 'spread';
    }

    /**
     * Every page after `$after` moves by `$by`: the spreads starting there (pages and data), the entries on those pages
     * (page and data – they keep their spread, which moves with them) and the targets printed there (`print.page`).
     * Each moved row is a change. Runs inside the caller's transaction.
     * @param array<string, mixed> $user
     * @return array{spreads: int, entries: int, targets: int}
     */
    private static function renumber(string $bookId, int $after, int $by, array $user): array
    {
        $moved = ['spreads' => 0, 'entries' => 0, 'targets' => 0];
        $params = ['book' => $bookId, 'page' => $after];
        foreach (Db::run('SELECT id, data_json FROM spreads WHERE book_id = :book AND first_page > :page', $params)->fetchAll() as $row) {
            $spread = Editor::decode($row['data_json']);
            $spread->firstPage = (int) $spread->firstPage + $by;
            $spread->lastPage = (int) $spread->lastPage + $by;
            $json = Editor::encode($spread);
            Db::run('UPDATE spreads SET first_page = :first, last_page = :last, data_json = :data WHERE book_id = :book AND id = :id',
                ['first' => $spread->firstPage, 'last' => $spread->lastPage, 'data' => $json, 'book' => $bookId, 'id' => $row['id']]);
            self::change($bookId, $user, 'spread', $row['id'], $row['data_json'], $json);
            $moved['spreads']++;
        }
        foreach (Db::run('SELECT id, data_json FROM entries WHERE book_id = :book AND page > :page', $params)->fetchAll() as $row) {
            $entry = Editor::decode($row['data_json']);
            $entry->page = (int) $entry->page + $by;
            $json = Editor::encode($entry);
            Db::run('UPDATE entries SET page = :page, data_json = :data WHERE book_id = :book AND id = :id', ['page' => $entry->page, 'data' => $json, 'book' => $bookId, 'id' => $row['id']]);
            self::change($bookId, $user, 'entry', $row['id'], $row['data_json'], $json);
            $moved['entries']++;
        }
        foreach (Db::run('SELECT id, data_json FROM targets WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $target = Editor::decode($row['data_json']);
            if (!is_numeric($target->print->page ?? null) || (int) $target->print->page <= $after) continue;
            $target->print->page = (int) $target->print->page + $by;
            $json = Editor::encode($target);
            Db::run('UPDATE targets SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $row['id']]);
            self::change($bookId, $user, 'target', $row['id'], $row['data_json'], $json);
            $moved['targets']++;
        }
        return $moved;
    }

    /** The spread formats of the content contract (shared/types/game-config.ts `SPREAD_FORMATS`) */
    public const FORMATS = ['spread', 'cover', 'back'];

    /** The built-in post-processing passes of the contract (shared/types/passes.ts `PASSES`) */
    public const PASS_TYPES = ['bloom', 'vignette', 'grade'];
    /** The environment's worlds (shared/types/environment.ts ENVIRONMENT_WORLDS) */
    public const WORLDS = ['cafe'];
    /** The files a world model and a sky may be (shared/types/environment.ts WORLD_MODEL_EXTENSIONS, SKY_IMAGE_EXTENSIONS) */
    public const WORLD_MODEL_EXTENSIONS = ['.glb', '.gltf'];
    public const SKY_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

    /**
     * A `passes` list as the content holds it: every pass an object with a built-in `type` and scalar parameters (the
     * engine and the guard check the parameters against the specs; the API keeps the shape)
     * @return list<stdClass>
     */
    private static function passes(mixed $value): array
    {
        if (!is_array($value)) throw new ApiError(400, 'invalid-spread', 'passes must be a list of { type, …parameters }.');
        $passes = [];
        foreach ($value as $i => $pass) {
            if (!$pass instanceof stdClass || !is_string($pass->type ?? null)) throw new ApiError(400, 'invalid-spread', "passes[$i] needs a type.");
            if (!in_array($pass->type, self::PASS_TYPES, true)) throw new ApiError(400, 'invalid-spread', "passes[$i].type must be one of " . implode(', ', self::PASS_TYPES) . '.');
            foreach (get_object_vars($pass) as $name => $param) {
                if (!is_scalar($param)) throw new ApiError(400, 'invalid-spread', "passes[$i].$name must be a number, a string or true / false.");
            }
            $passes[] = $pass;
        }
        return $passes;
    }

    /** DELETE /editor/books/{id}/entries/{entryId} → 204: the entry and its target go (changes recorded) */
    public static function deleteEntry(string $bookId, string $entryId): never
    {
        $user = Editor::user();
        self::book($bookId);
        $entry = Db::one('SELECT data_json FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $entryId]);
        if (!$entry) throw new ApiError(404, 'not-found', 'No such entry.');
        $targets = Db::run('SELECT id, data_json FROM targets WHERE book_id = :book AND entry_id = :entry', ['book' => $bookId, 'entry' => $entryId])->fetchAll();
        Db::transaction(function () use ($bookId, $entryId, $entry, $targets, $user) {
            foreach ($targets as $target) {
                Db::run('DELETE FROM targets WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $target['id']]);
                self::change($bookId, $user, 'target', $target['id'], $target['data_json'], 'null');
            }
            Db::run('DELETE FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $entryId]);
            self::touch($bookId);
            self::change($bookId, $user, 'entry', $entryId, $entry['data_json'], 'null');
        });
        http_response_code(204);
        exit;
    }

    /** An id from a title and a page: `p102-shadows` – lower case, letters, digits and dashes */
    private static function slug(string $title, int $page): string
    {
        $words = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: $title), '-'));
        return 'p' . $page . '-' . (substr($words, 0, 40) ?: 'target');
    }

    /**
     * POST /editor/books/{id}/publish { env, note?, replace? } → { env, build, hash, publishedAt, replaced }: the
     * assembled version into the content store – the version folder (unless that build is there already: a folder is
     * never overwritten), then versions.json, then latest.json (the switch) – and a row in the publish log.
     * An environment serves one book: when it serves another one (or one that cannot be told) the publish needs
     * `replace: true`, else 409 other-book with `current` { env, book, title, build, since }. `replaced` names the
     * book replaced there, null when there was none.
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
        $replace = $body['replace'] ?? false;
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

        $version = ContentVersion::assemble($bookId);
        // A component type no plugin can register would make the reader refuse the whole content: a plugin written
        // in the editor reaches readers through the content source, not through a publish
        $unknown = self::unknownComponentTypes($version['configuration']);
        if ($unknown && empty($version['configuration']->plugins)) {
            throw new ApiError(409, 'unknown-components', 'Nodes use components no compiled plugin provides: ' . implode(', ', $unknown) . '. The publish does not compile the Code tab\'s plugins yet (#78); the content source\'s plugins are compiled by the content build.', ['components' => $unknown]);
        }
        // The same for a plugin's node type: without a compiled plugin the reader renders nothing for those nodes
        $unknownNodes = self::unknownNodeTypes($version['configuration']);
        if ($unknownNodes && empty($version['configuration']->plugins)) {
            throw new ApiError(409, 'unknown-node-types', 'Nodes have types no compiled plugin provides: ' . implode(', ', $unknownNodes) . '. The publish does not compile the Code tab\'s plugins yet (#78); the content source\'s plugins are compiled by the content build.', ['nodeTypes' => $unknownNodes]);
        }
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
        $store->put('versions.json', Editor::encode(ContentStore::activate($versions, $version, $now, !$uploaded, $bookId), true));
        $store->put('latest.json', Editor::encode(ContentVersion::manifest($version, $now, $bookId), true));

        Db::run('INSERT INTO book_versions (id, book_id, env, build, hash, published_by, published_at, note) VALUES (:id, :book, :env, :build, :hash, :by, :at, :note)',
            ['id' => Db::uuid(), 'book' => $bookId, 'env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'by' => $user['id'], 'at' => Editor::nowMs(), 'note' => $note]);
        Http::json(200, ['env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'publishedAt' => $now,
            'replaced' => $replaced !== null ? ['book' => $replaced['book'], 'build' => $replaced['build']] : null]);
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
     * The node types of the configuration that are not built in (Editor::ENTITY_TYPES) – a plugin's (schema 2.13), sorted
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

    /** 404 unless the book exists (Assets) */
    public static function exists(string $bookId): void
    {
        self::book($bookId);
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
     * objects (data_json). An entry belongs to the first spread whose pages include its page, else to none.
     * `$pluginSources`: the book has Code tab sources (a node type of a plugin may pass – Editor::entity).
     * @return array{book: stdClass, schema: string, hash: ?string, initialSpreadId: string, tutorial: array, plugins: array, spreads: array, entities: array, entries: array, targets: array}
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
        if (!is_string($c->initialSpreadId ?? null)) $fail('initialSpreadId must be a string.');
        if (!is_array($c->spreads ?? null) || !is_array($c->entries ?? null)) $fail('spreads and entries must be arrays.');
        $entitiesIn = $c->entities ?? new stdClass();
        if (!$entitiesIn instanceof stdClass) $fail('entities must be an object.');
        $tutorial = $c->tutorial ?? [];
        if (!is_array($tutorial)) $fail('tutorial must be an array.');
        // The book's compiled plugins (content schema 2.4): kept as declared – the content build is their one writer
        $plugins = $c->plugins ?? [];
        if (!is_array($plugins)) $fail('plugins must be an array.');
        foreach ($plugins as $i => $plugin) {
            if (!$plugin instanceof stdClass || !is_string($plugin->id ?? null) || !preg_match('/^' . Plugins::ID . '$/', $plugin->id)
                || !is_string($plugin->src ?? null) || !is_string($plugin->api ?? null)) {
                $fail("plugins[$i] needs id, src and api.");
            }
        }
        // A plugin's node type (schema 2.13) passes when the configuration declares plugins or the book has sources
        $pluginTypes = $plugins !== [] || $pluginSources;

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
            Editor::entity($e, "entities.$ref", 0, $pluginTypes);
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
            $targets[$targetId] = ['id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => self::entityRef($target->entity ?? null, $entities, "entries[$i].target.entity", $pluginTypes), 'data' => $target];
        }
        return [
            'book' => $book, 'schema' => $version->schema, 'hash' => is_string($version->hash ?? null) ? $version->hash : null,
            'initialSpreadId' => $c->initialSpreadId, 'tutorial' => $tutorial, 'plugins' => $plugins,
            'spreads' => array_values($spreads), 'entities' => array_values($entities), 'entries' => array_values($entries), 'targets' => array_values($targets),
        ];
    }

    /** A target's entity: `{ ref }` naming a shared entity → the ref; an inline entity (checked) or none → null */
    private static function entityRef(mixed $entity, array $entities, string $path, bool $pluginTypes = false): ?string
    {
        if ($entity === null) return null;
        if ($entity instanceof stdClass && property_exists($entity, 'ref')) {
            $ref = Editor::id($entity->ref, "$path.ref");
            if (!isset($entities[$ref])) throw new ApiError(400, 'unknown-entity', "$path.ref: no entity \"$ref\".");
            return $ref;
        }
        Editor::entity($entity, $path, 0, $pluginTypes);
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
