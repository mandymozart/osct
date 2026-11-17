<?php
declare(strict_types=1);

/**
 * Library files named by where they are used (#298 phase 3, docs/server.md "Files named by use"). A file's **name** is
 * what the Library lists; its URL never changes with it, so no use breaks.
 *
 * - an entry's target image `p118-1_target.webp`, its colour picture `p118-1_image.webp`, another file of the entry or
 *   of its own entity `p118-1_<asset id or field>.ext` – an **upload** keeps its own name after the place:
 *   `fight_2_remesh_4096.jpg` → `p010-3_fight-2-remesh-4096.jpg` (Tilman, 2026-11-17: "keep their own part");
 * - a page image (#251) `page-118.webp`, `page-cover.webp`, `page-back-cover.webp`, `page-1-facing.webp`,
 *   `page-front-1-left.webp` / `page-back-2-right.webp` (front and back matter by sheet and side);
 * - a shared entity's file `<entity ref>_<asset id>.ext` (an upload: `<entity ref>_<its own name>.ext`); the book's environment `environment_world.glb`,
 *   `environment_sky.webp`;
 * - a file used in several places takes its first use in page order (the rest are "+N more"); a file only a plugin's
 *   source names, and an unused file, keep their names. Two files that would take the same name are told apart by
 *   `-2`, `-3` in page order.
 *
 * The Library groups files by the spread of their first use (`place`); uses without a page (the environment, plugins,
 * a shared entity no target shows) are book-wide. An uploaded file's name is its `assets` row's; an imported file
 * (#244: no row, read-only) is listed under a name kept in `asset_names` by URL (as `asset_credits`), else its own.
 * Names are no content: no change in the book's log, no publish needed.
 */
final class AssetNames
{
    /** The longest file name */
    public const NAME_MAX = 255;
    /** The order of a use without a page: after every page */
    private const BOOK_WIDE = PHP_INT_MAX;
    /** A field's part of a name: `imageSrc` is the target image, `image` the entry's colour picture */
    private const PARTS = ['imageSrc' => 'target', 'image' => 'image', 'worldSrc' => 'world', 'skySrc' => 'sky'];
    /** The kinds of use that give a file its name (#298 phase 3) – a spread's, a book setting's or the layout's use counts, but names nothing */
    private const NAMING = ['target', 'entry', 'entity', 'page', 'environment', 'plugin'];
    /** A use's kind in the order of a file's uses (`rank`) */
    private const KIND_ORDER = ['target' => 0, 'entry' => 1, 'entity' => 2, 'spread' => 3, 'page' => 4, 'environment' => 5, 'book' => 6, 'plugin' => 7, 'layout' => 8];
    /** The print layout's folder in the content (editor/src/lib/stage/stage-layout.ts `LAYOUT_PATH`) and the file that lists its sheets */
    public const LAYOUT_PATH = '/assets/content/layout/';
    public const LAYOUT_FILE = self::LAYOUT_PATH . 'layout.json';

    /**
     * POST /editor/books/{id}/assets/names { apply? } → { plan: { renames, files, used, unused }, applied }: the names
     * every file of the Library takes by its use, in two steps like the matter (`Pages::addMatter`). Without `apply: true`
     * nothing is written – `renames` lists each file whose name changes: { id, url, imported, from, to, use: { kind, ref,
     * spread, page }, more } (`more` = its further uses). With it the plan is made again and written in one transaction.
     */
    public static function plan(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $apply = (Editor::body()->apply ?? false) === true;
        $run = static function () use ($bookId, $apply, $user): array {
            $plan = self::compute($bookId);
            if ($apply) self::apply($bookId, $plan['renames'], $user);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply && $plan['renames'] !== []]);
    }

    /**
     * What `plan` proposes
     * @return array{renames: list<array<string, mixed>>, files: int, used: int, unused: int}
     */
    public static function compute(string $bookId): array
    {
        $files = Assets::libraryFiles($bookId);
        $uses = self::usesOf($bookId);
        $used = array_values(array_filter($files, static fn(array $f) => isset($uses[$f['url']])));
        // Only the uses that name (NAMING): a file only a spread, a book setting or the layout uses keeps its name
        $naming = [];
        foreach ($used as $file) {
            $list = array_values(array_filter($uses[$file['url']], static fn(array $use) => in_array($use['kind'], self::NAMING, true)));
            if ($list) $naming[$file['url']] = $list;
        }
        $named = array_values(array_filter($used, static fn(array $f) => isset($naming[$f['url']])));
        // The first use in page order names first: a name two files would take goes to the earlier one
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
                'use' => ['kind' => $first['kind'], 'ref' => $first['ref'], 'spread' => $first['spread'], 'page' => $first['page']], 'more' => count($uses[$file['url']]) - 1];
        }
        return ['renames' => $renames, 'files' => count($files), 'used' => count($used), 'unused' => count($files) - count($used)];
    }

    /**
     * Writes a plan's renames (inside the caller's transaction): an upload's row, an imported file's name by URL
     * @param list<array<string, mixed>> $renames
     * @param array<string, mixed> $user
     */
    private static function apply(string $bookId, array $renames, array $user): void
    {
        $now = Editor::nowMs();
        foreach ($renames as $rename) {
            if ($rename['imported']) self::setImportedName($bookId, (string) $rename['url'], (string) $rename['to'], $user['id'], $now);
            else Db::run('UPDATE assets SET name = :name, updated_at = :now WHERE book_id = :book AND id = :id', ['name' => $rename['to'], 'now' => $now, 'book' => $bookId, 'id' => $rename['id']]);
        }
    }

    private static function setImportedName(string $bookId, string $url, string $name, ?string $by, int $at): void
    {
        Db::run('DELETE FROM asset_names WHERE book_id = :book AND url = :url', ['book' => $bookId, 'url' => $url]);
        Db::run('INSERT INTO asset_names (book_id, url, name, updated_by, updated_at) VALUES (:book, :url, :name, :by, :at)',
            ['book' => $bookId, 'url' => $url, 'name' => $name, 'by' => $by, 'at' => $at]);
    }

    /** @return array<string, string> the imported files' names by URL (`asset_names`) */
    public static function importedNames(string $bookId): array
    {
        $names = [];
        foreach (Db::run('SELECT url, name FROM asset_names WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $names[(string) $row['url']] = (string) $row['name'];
        }
        return $names;
    }

    /**
     * Where a file is placed in the Library: the spread of its first use (null: book-wide), its page, the order (page
     * order, book-wide last) and how many uses follow – null for an unused file
     * @param list<array<string, mixed>> $uses a file's uses (`usesOf`)
     * @return ?array{spread: ?string, page: ?int, order: int, more: int}
     */
    public static function place(array $uses): ?array
    {
        if (!$uses) return null;
        $first = $uses[0];
        return ['spread' => $first['spread'], 'page' => $first['page'], 'order' => $first['order'] === self::BOOK_WIDE ? -1 : $first['order'], 'more' => count($uses) - 1];
    }

    // ── Uses ─────────────────────────────────────────────────────────────────────────────────────

    /**
     * **The** list of every use of every Library file (#298: the one source of truth – the Library's count and place,
     * the delete check `Assets::usagesOf`, `Removal` and the names plan all read it; docs/server.md "What counts as a
     * use"), in page order, by the file's Library URL: { kind, ref, spread, page, order, stem, prefix }. The kinds:
     * - `target` (its printed image `imageSrc`, its own inline entity), `entry`, `entity` (a shared one) – the rows' JSON;
     * - `spread` – a spread's own data (its environment, passes, appearance …), on the spread's first page;
     * - `page` – a page image (#251) over its page;
     * - `environment` – the book's environment (its world model, its sky); `book` – any other setting of the book
     *   (appearance, passes with a texture or a model …); both book-wide;
     * - `plugin` – a plugin source naming the file's URL as text (a shader it loads), book-wide;
     * - `layout` – a file of the print layout's folder (`layout/sheets/*.jpg`, `*@sharp.jpg`): the editor's stage and cards
     *   read them through `layout/layout.json`, never through a row – used whenever the book's files hold that layout.json.
     * A row's JSON uses a file when one of its strings is the file's URL (or, for an imported file, its content path
     * `/assets/content/…`); a plugin source when its text contains it. Every table is read once – a book has ~2,000 files.
     * `stem` is the name the use gives (without extension), null when it gives none (a plugin source, a spread, a book
     * setting, the layout).
     * @return array<string, list<array<string, mixed>>>
     */
    public static function usesOf(string $bookId): array
    {
        [$keys, $layout] = self::fileKeys($bookId);
        if (!$keys) return [];
        $pages = [];
        $spreads = [];
        foreach (Pages::pagesOf($bookId) as $i => $page) {
            $pages[Pages::key($page['page'], $page['facing'])] ??= ['order' => $i, 'page' => $page];
            $spreads[$page['spread']] ??= ['page' => $page['page'], 'order' => $i];
        }
        $uses = [];
        $add = static function (string $value, string $kind, string $ref, ?string $spread, ?int $page, int $order, ?string $stem, ?string $prefix = null) use (&$uses, $keys): void {
            $url = $keys[$value] ?? null;
            if ($url === null) return;
            foreach ($uses[$url] ?? [] as $use) if ($use['kind'] === $kind && $use['ref'] === $ref) return;
            $uses[$url][] = ['kind' => $kind, 'ref' => $ref, 'spread' => $spread, 'page' => $page, 'order' => $order, 'stem' => $stem === null ? null : self::clean($stem), 'prefix' => $prefix];
        };
        $orderOf = static fn(?int $page, ?string $spread): int => $spread !== null && $page !== null && isset($pages[(string) $page]) ? $pages[(string) $page]['order'] : self::BOOK_WIDE;

        // Entries: their page; the colour picture `_image`, other files by field
        $entries = [];
        foreach (Db::run('SELECT id, spread_id, page, data_json FROM entries WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $id = (string) $row['id'];
            $spread = $row['spread_id'] === null ? null : (string) $row['spread_id'];
            $entries[$id] = ['spread' => $spread, 'page' => (int) $row['page'], 'order' => $orderOf((int) $row['page'], $spread)];
            $at = $entries[$id];
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value, ?string $part, bool $src = false) use ($add, $id, $at) {
                $add($value, 'entry', $id, $at['spread'], $at['page'], $at['order'], "{$id}_" . ($part ?? 'file'), $src ? $id : null);
            });
        }
        // Targets: on their entry's page; the printed image `_target`, the files of its own entity by asset id
        $shared = [];
        foreach (Db::run('SELECT id, entry_id, image_src, entity_ref, data_json FROM targets WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $entry = (string) $row['entry_id'];
            $at = $entries[$entry] ?? ['spread' => null, 'page' => null, 'order' => self::BOOK_WIDE];
            $ref = (string) $row['id'];
            if (is_string($row['image_src']) && $row['image_src'] !== '') $add($row['image_src'], 'target', $ref, $at['spread'], $at['page'], $at['order'], "{$entry}_target");
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value, ?string $part, bool $src = false) use ($add, $entry, $ref, $at) {
                $add($value, 'target', $ref, $at['spread'], $at['page'], $at['order'], "{$entry}_" . ($part ?? 'file'), $src ? $entry : null);
            });
            // A shared entity sits where its first target is
            $shares = $row['entity_ref'] === null ? null : (string) $row['entity_ref'];
            if ($shares !== null && (!isset($shared[$shares]) || $shared[$shares]['order'] > $at['order'])) $shared[$shares] = $at;
        }
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $ref = (string) $row['ref'];
            $at = $shared[$ref] ?? ['spread' => null, 'page' => null, 'order' => self::BOOK_WIDE];
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value, ?string $part, bool $src = false) use ($add, $ref, $at) {
                $add($value, 'entity', $ref, $at['spread'], $at['page'], $at['order'], "{$ref}_" . ($part ?? 'file'), $src ? $ref : null);
            });
        }
        // Spreads' own files (their environment, passes, appearance …): on the spread's first page, no name of their own
        foreach (Db::run('SELECT id, data_json FROM spreads WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $id = (string) $row['id'];
            $at = $spreads[$id] ?? null;
            self::walk(Editor::decode($row['data_json']), null, null, static function (string $value) use ($add, $id, $at) {
                $add($value, 'spread', $id, $at === null ? null : $id, $at['page'] ?? null, $at['order'] ?? self::BOOK_WIDE, null);
            });
        }
        // Page images: their page's label
        foreach (Db::run('SELECT page, facing, url FROM page_images WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $key = Pages::key((int) $row['page'], (bool) (int) $row['facing']);
            $page = $pages[$key] ?? null;
            $add((string) $row['url'], 'page', $key, $page['page']['spread'] ?? null, (int) $row['page'], $page['order'] ?? self::BOOK_WIDE,
                $page !== null ? self::pageStem($page['page']) : 'page-' . $key);
        }
        // The book's environment (its world model, its sky): book-wide
        $book = Editor::decode(Db::value('SELECT book_json FROM books WHERE id = :id', ['id' => $bookId]));
        if ($book instanceof stdClass && ($book->environment ?? null) instanceof stdClass) {
            self::walk($book->environment, null, null, static function (string $value, ?string $part) use ($add, $bookId) {
                $add($value, 'environment', $bookId, null, null, self::BOOK_WIDE, 'environment_' . ($part ?? 'file'));
            });
        }
        // The book's other settings (appearance, passes with a texture or a model parameter …): book-wide, no name of their own
        if ($book instanceof stdClass) {
            foreach (get_object_vars($book) as $key => $value) {
                if ($key === 'environment') continue;
                self::walk($value, (string) $key, $book, static function (string $value) use ($add, $bookId) {
                    $add($value, 'book', $bookId, null, null, self::BOOK_WIDE, null);
                });
            }
        }
        // Plugin sources name a file by its URL as text: book-wide, no name of their own
        foreach (Db::run('SELECT id, source FROM plugins WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            foreach ($keys as $value => $url) {
                if (str_contains((string) $row['source'], (string) $value)) $add((string) $value, 'plugin', (string) $row['id'], null, null, self::BOOK_WIDE, null);
            }
        }
        // The print layout's files: read by the stage through layout.json – book-wide, no name of their own
        foreach ($layout as $value) $add($value, 'layout', 'layout.json', null, null, self::BOOK_WIDE, null);
        foreach ($uses as $url => $list) {
            usort($list, static fn(array $a, array $b) => self::rank($a) <=> self::rank($b));
            $uses[$url] = $list;
        }
        return $uses;
    }

    /** A use's place in the order: its page, then its kind (KIND_ORDER), then its ref */
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
     * layout's folder (their URLs) when the book's files hold its `layout.json` – none without it.
     * @return array{0: array<string, string>, 1: list<string>}
     */
    private static function fileKeys(string $bookId): array
    {
        $book = Db::one('SELECT assets_base, files_json FROM books WHERE id = :id', ['id' => $bookId]);
        $base = rtrim((string) ($book['assets_base'] ?? ''), '/');
        $imported = Editor::decode($book['files_json'] ?? null);
        $hasLayout = $imported instanceof stdClass && property_exists($imported, self::LAYOUT_FILE);
        $keys = [];
        $layout = [];
        foreach (Assets::libraryFiles($bookId) as $file) {
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
     * The name a page gives its image (a page of `Pages::pagesOf`): `page-118`, `page-1-facing`, `page-cover`,
     * `page-back-cover`, `page-front-1-left` (front matter sheet 1, its left page), `page-back-2-right`
     * @param array{page: int, facing: bool, side: string, kind: string, label: string} $page
     */
    public static function pageStem(array $page): string
    {
        return match ($page['kind']) {
            'cover' => 'page-cover',
            'back' => 'page-back-cover',
            'front-matter', 'back-matter' => sprintf('page-%s-%d-%s', substr($page['kind'], 0, -7), (int) ceil(((int) substr($page['label'], 1)) / 2), $page['side']),
            'facing' => "page-{$page['page']}-facing",
            default => "page-{$page['page']}",
        };
    }

    /**
     * The name an upload takes when its use is known (`POST …/assets?fit=…&entry=…` or `&page=…[&facing=1]`): a target
     * image `<entry>_target`, an entry's picture `<entry>_image`, a page image its page's (`pageStem`) – null when the
     * request names no use (the upload keeps its name). 400 `invalid-use` for a page that is no page of the book.
     */
    public static function uploadStem(string $bookId, string $fit): ?string
    {
        $entry = $_GET['entry'] ?? null;
        if (is_string($entry) && $entry !== '' && in_array($fit, ['target', 'entryImage'], true)) {
            return Editor::id($entry, 'entry') . ($fit === 'target' ? '_target' : '_image');
        }
        $page = $_GET['page'] ?? null;
        if ($fit === 'page' && is_string($page) && $page !== '') {
            if (!preg_match('/^-?\d+$/', $page)) throw new ApiError(400, 'invalid-use', 'page must be a whole number.');
            $facing = ($_GET['facing'] ?? '') === '1';
            foreach (Pages::pagesOf($bookId) as $p) {
                if ($p['page'] === (int) $page && $p['facing'] === $facing) return self::pageStem($p);
            }
            throw new ApiError(400, 'invalid-use', ($facing ? "The half next to page $page" : "Page $page") . ' is no page of the book.');
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
