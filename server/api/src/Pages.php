<?php
declare(strict_types=1);

/**
 * The book's pages and their page images (#251, docs/server.md "Pages and page images").
 *
 * - **Pages**: every page of the book in book order, derived from its spreads – the covers (one page each), the front
 *   and back matter (internal pages, #296), the numbered pages, and the unnumbered half of a single page's sheet
 *   (`facing`: the half next to page 1, the one next to the last printed page). A page is addressed by its internal
 *   `page` number and `facing`.
 * - **Page images**: one image of the book's Library per page, an editor-only override of the print layout's sheet for
 *   that page (the stage and the spread cards show it instead of the layout's half). No content: the reader never shows
 *   them, the draft and its publish do not carry them, a re-import keeps them, and they are not in the change log (as
 *   the picture credits, #277).
 * - **Matter** (`POST …/matter`): adds the front and back matter spreads a book is missing compared to its print format,
 *   the single last printed page when no spread holds it, and moves the back cover after the back matter – allowed for a
 *   print-first book too (a deliberate exception to #238: the spreads are the printed book's, only missing).
 */
final class Pages
{
    /** The most items one PUT …/page-images takes */
    public const BATCH_MAX = 500;
    /** The longest page image name */
    public const NAME_MAX = 255;
    /** The most front or back matter sheets `addMatter` makes */
    public const MATTER_MAX = 8;
    /** The front and back matter sheets of the print format when the request names none (the book's: two each) */
    public const MATTER_DEFAULT = 2;

    // ── Pages ────────────────────────────────────────────────────────────────────────────────────

    /**
     * Every page of the book in book order: { page, facing, spread, side, kind, label }. `side` = left / right on a double
     * sheet, front / back for a cover; `kind` = cover, back, front-matter, back-matter, page, facing; `label` = what
     * the editor shows and the bulk upload names (`Cover`, `F1` …, `12`, `next to 1`, `B1` …, `Back cover`).
     * @return list<array{page: int, facing: bool, spread: string, side: string, kind: string, label: string}>
     */
    public static function pagesOf(string $bookId): array
    {
        $pages = [];
        $front = 0;
        $back = 0;
        foreach (Db::run('SELECT id, first_page, last_page, data_json FROM spreads WHERE book_id = :book ORDER BY position', ['book' => $bookId])->fetchAll() as $row) {
            $data = Editor::decode($row['data_json']);
            $format = is_object($data) ? ($data->format ?? 'spread') : 'spread';
            $matter = $format === 'spread' && is_object($data) && in_array($data->matter ?? null, Books::MATTERS, true) ? $data->matter : null;
            $first = (int) $row['first_page'];
            $last = (int) $row['last_page'];
            $id = (string) $row['id'];
            $page = static fn(int $page, bool $facing, string $side, string $kind, string $label) =>
                ['page' => $page, 'facing' => $facing, 'spread' => $id, 'side' => $side, 'kind' => $kind, 'label' => $label];
            if ($format === 'cover') {
                $pages[] = $page($first, false, 'front', 'cover', 'Cover');
            } elseif ($format === 'back') {
                $pages[] = $page($first, false, 'back', 'back', 'Back cover');
            } elseif ($matter !== null) {
                foreach (array_unique([$first, $last]) as $i => $p) {
                    $label = $matter === 'front' ? 'F' . (++$front) : 'B' . (++$back);
                    $pages[] = $page($p, false, $i === 0 ? 'left' : 'right', "$matter-matter", $label);
                }
            } elseif ($last > $first) {
                $pages[] = $page($first, false, 'left', 'page', (string) $first);
                $pages[] = $page($last, false, 'right', 'page', (string) $last);
            } elseif ($first % 2 === 0) {
                // An even single page is a left-hand page: its sheet's right half is unnumbered
                $pages[] = $page($first, false, 'left', 'page', (string) $first);
                $pages[] = $page($first, true, 'right', 'facing', "next to $first");
            } else {
                $pages[] = $page($first, true, 'left', 'facing', "next to $first");
                $pages[] = $page($first, false, 'right', 'page', (string) $first);
            }
        }
        return $pages;
    }

    /** The key of a page: `12`, `-3`, `1f` (the facing half next to page 1) */
    public static function key(int $page, bool $facing): string
    {
        return $page . ($facing ? 'f' : '');
    }

    // ── Page images ──────────────────────────────────────────────────────────────────────────────

    /** GET /editor/books/{id}/pages → { pages, pageImages } */
    public static function list(string $bookId): never
    {
        Editor::user();
        Books::exists($bookId);
        Http::json(200, ['pages' => self::pagesOf($bookId), 'pageImages' => self::imagesOf($bookId)]);
    }

    /**
     * The book's page images in page order
     * @return list<array{page: int, facing: bool, url: string, name: string, updatedBy: ?string, updatedAt: string}>
     */
    public static function imagesOf(string $bookId): array
    {
        $rows = Db::run('SELECT p.*, u.email FROM page_images p LEFT JOIN users u ON u.id = p.updated_by WHERE p.book_id = :book ORDER BY p.page, p.facing', ['book' => $bookId])->fetchAll();
        return array_map(static fn(array $row) => self::image($row), $rows);
    }

    /** @param array<string, mixed> $row */
    private static function image(array $row): array
    {
        return ['page' => (int) $row['page'], 'facing' => (bool) (int) $row['facing'], 'url' => (string) $row['url'], 'name' => (string) $row['name'],
            'updatedBy' => isset($row['email']) ? (string) $row['email'] : null, 'updatedAt' => Editor::iso((int) $row['updated_at'])];
    }

    /**
     * PUT /editor/books/{id}/page-images { items: [...] } → { pageImages, saved }: sets, replaces, moves, renames and
     * removes page images in one batch, all or nothing. An item names its page (`page`, `facing` – default false) and one
     * action:
     * - `{ page, url, name? }` sets or replaces the page's image (a Library image of the book; `name` defaults to the
     *   file's name in the Library);
     * - `{ page, url: null }` removes it – the page shows the layout again;
     * - `{ page, name }` renames it;
     * - `{ page, from: { page, facing? }, name? }` moves the image of `from` here (`from` is empty after it unless another
     *   item sets it). Moves are taken from the images as they were, so two items can swap two pages.
     * 400 `invalid-page-image` (no page of the book, two items for one page, no such image to move or rename, not a
     * Library image, a name empty or too long) – nothing saved.
     */
    public static function putImages(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $items = Editor::body()->items ?? null;
        if (!is_array($items) || $items === [] || count($items) > self::BATCH_MAX) {
            throw new ApiError(400, 'invalid-page-image', 'items must be a list of 1–' . self::BATCH_MAX . ' page image changes.');
        }
        $valid = [];
        foreach (self::pagesOf($bookId) as $page) $valid[self::key($page['page'], $page['facing'])] = true;
        $current = [];
        foreach (Db::run('SELECT page, facing, url, name FROM page_images WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $current[self::key((int) $row['page'], (bool) (int) $row['facing'])] = ['page' => (int) $row['page'], 'facing' => (bool) (int) $row['facing'], 'url' => (string) $row['url'], 'name' => (string) $row['name']];
        }
        $images = null;
        $final = $current;
        $seen = [];
        $moves = [];
        $edits = [];
        foreach ($items as $i => $item) {
            if (!$item instanceof stdClass) throw new ApiError(400, 'invalid-page-image', "items[$i] must be an object.");
            [$page, $facing] = self::address($item, "items[$i]");
            $key = self::key($page, $facing);
            if (!isset($valid[$key])) throw new ApiError(400, 'invalid-page-image', "items[$i]: " . self::describe($page, $facing) . ' is no page of the book.');
            if (isset($seen[$key])) throw new ApiError(400, 'invalid-page-image', "items[$i]: two changes for " . self::describe($page, $facing) . '.');
            $seen[$key] = true;
            $name = property_exists($item, 'name') ? self::name($item->name, "items[$i].name") : null;
            if (property_exists($item, 'from')) {
                if (!$item->from instanceof stdClass) throw new ApiError(400, 'invalid-page-image', "items[$i].from must be { page, facing? }.");
                [$fromPage, $fromFacing] = self::address($item->from, "items[$i].from");
                $from = self::key($fromPage, $fromFacing);
                if (!isset($current[$from])) throw new ApiError(400, 'invalid-page-image', "items[$i]: " . self::describe($fromPage, $fromFacing) . ' has no page image to move.');
                $moves[] = ['from' => $from, 'to' => $key, 'page' => $page, 'facing' => $facing, 'name' => $name];
            } elseif (property_exists($item, 'url')) {
                if ($item->url === null) {
                    $edits[] = ['key' => $key, 'remove' => true];
                    continue;
                }
                if (!is_string($item->url) || $item->url === '') throw new ApiError(400, 'invalid-page-image', "items[$i].url must be the URL of a Library image or null.");
                $images ??= Assets::imageNames($bookId);
                if (!array_key_exists($item->url, $images)) throw new ApiError(400, 'invalid-page-image', "items[$i].url is no image of the book's Library.");
                $edits[] = ['key' => $key, 'image' => ['page' => $page, 'facing' => $facing, 'url' => $item->url, 'name' => $name ?? self::fit($images[$item->url])]];
            } elseif ($name !== null) {
                $edits[] = ['key' => $key, 'rename' => $name, 'index' => $i];
            } else {
                throw new ApiError(400, 'invalid-page-image', "items[$i]: send url (set or null to remove), from (move) or name (rename).");
            }
        }
        // Moves from the images as they were: every source is emptied first, then every target filled
        foreach ($moves as $move) unset($final[$move['from']]);
        foreach ($moves as $move) {
            $source = $current[$move['from']];
            $final[$move['to']] = ['page' => $move['page'], 'facing' => $move['facing'], 'url' => $source['url'], 'name' => $move['name'] ?? $source['name']];
        }
        foreach ($edits as $edit) {
            if (isset($edit['remove'])) unset($final[$edit['key']]);
            elseif (isset($edit['image'])) $final[$edit['key']] = $edit['image'];
            else {
                if (!isset($final[$edit['key']])) throw new ApiError(400, 'invalid-page-image', "items[{$edit['index']}]: the page has no image to rename.");
                $final[$edit['key']]['name'] = $edit['rename'];
            }
        }
        $changed = [];
        foreach (array_unique(array_merge(array_keys($current), array_keys($final))) as $key) {
            if (($current[$key] ?? null) !== ($final[$key] ?? null)) $changed[] = (string) $key;
        }
        $now = Editor::nowMs();
        Db::transaction(static function () use ($bookId, $changed, $current, $final, $user, $now) {
            foreach ($changed as $key) {
                $old = $current[$key] ?? $final[$key];
                Db::run('DELETE FROM page_images WHERE book_id = :book AND page = :page AND facing = :facing', ['book' => $bookId, 'page' => $old['page'], 'facing' => $old['facing'] ? 1 : 0]);
                if (isset($final[$key])) self::insert($bookId, $final[$key], $user['id'], $now);
            }
        });
        Http::json(200, ['pageImages' => self::imagesOf($bookId), 'saved' => count($changed)]);
    }

    /** @param array{page: int, facing: bool, url: string, name: string} $image */
    private static function insert(string $bookId, array $image, ?string $by, int $at): void
    {
        Db::run('INSERT INTO page_images (book_id, page, facing, url, name, updated_by, updated_at) VALUES (:book, :page, :facing, :url, :name, :by, :at)',
            ['book' => $bookId, 'page' => $image['page'], 'facing' => $image['facing'] ? 1 : 0, 'url' => $image['url'], 'name' => $image['name'], 'by' => $by, 'at' => $at]);
    }

    /** @return array{0: int, 1: bool} an item's page and facing, else 400 */
    private static function address(stdClass $item, string $path): array
    {
        $page = $item->page ?? null;
        if (!is_int($page) && !(is_float($page) && floor($page) === $page)) throw new ApiError(400, 'invalid-page-image', "$path.page must be a whole number.");
        $facing = $item->facing ?? false;
        if (!is_bool($facing)) throw new ApiError(400, 'invalid-page-image', "$path.facing must be true or false.");
        return [(int) $page, $facing];
    }

    private static function name(mixed $value, string $path): string
    {
        if (!is_string($value)) throw new ApiError(400, 'invalid-page-image', "$path must be text.");
        $name = trim((string) preg_replace('/\s+/u', ' ', $value));
        if ($name === '' || mb_strlen($name) > self::NAME_MAX) throw new ApiError(400, 'invalid-page-image', "$path must be 1–" . self::NAME_MAX . ' characters.');
        return $name;
    }

    /** A Library name cut to NAME_MAX */
    private static function fit(string $name): string
    {
        $name = trim($name);
        return mb_strlen($name) > self::NAME_MAX ? mb_substr($name, 0, self::NAME_MAX) : ($name === '' ? 'page' : $name);
    }

    private static function describe(int $page, bool $facing): string
    {
        return $facing ? "the half next to page $page" : "page $page";
    }

    // ── Hooks of other routes ────────────────────────────────────────────────────────────────────

    /** Every page image after `$after` moves by `$by` (a double page added or removed in a digital-first book) – inside the caller's transaction */
    public static function shift(string $bookId, int $after, int $by): void
    {
        $rows = Db::run('SELECT * FROM page_images WHERE book_id = :book AND page > :page', ['book' => $bookId, 'page' => $after])->fetchAll();
        if (!$rows) return;
        Db::run('DELETE FROM page_images WHERE book_id = :book AND page > :page', ['book' => $bookId, 'page' => $after]);
        foreach ($rows as $row) {
            self::insert($bookId, ['page' => (int) $row['page'] + $by, 'facing' => (bool) (int) $row['facing'], 'url' => (string) $row['url'], 'name' => (string) $row['name']],
                $row['updated_by'] === null ? null : (string) $row['updated_by'], (int) $row['updated_at']);
        }
    }

    /** The page images of pages `$first`…`$last` go (their spread was removed) – inside the caller's transaction */
    public static function drop(string $bookId, int $first, int $last): void
    {
        Db::run('DELETE FROM page_images WHERE book_id = :book AND page >= :first AND page <= :last', ['book' => $bookId, 'first' => $first, 'last' => $last]);
    }

    /** A Library file's URL changed (a replace): its page images follow – inside the caller's transaction; returns how many */
    public static function relink(string $bookId, string $from, string $to): int
    {
        return Db::run('UPDATE page_images SET url = :to WHERE book_id = :book AND url = :from', ['to' => $to, 'book' => $bookId, 'from' => $from])->rowCount();
    }

    /** @return list<array{kind: string, ref: string}> the page images showing a file (`page 12`, `page 1f`) */
    public static function usagesOf(string $bookId, string $url): array
    {
        return array_map(static fn(array $row) => ['kind' => 'page', 'ref' => self::key((int) $row['page'], (bool) (int) $row['facing'])],
            Db::run('SELECT page, facing FROM page_images WHERE book_id = :book AND url = :url ORDER BY page, facing', ['book' => $bookId, 'url' => $url])->fetchAll());
    }

    // ── Matter ───────────────────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/books/{id}/matter { front?, back?, lastPage?, apply? } → { plan, applied }: makes the book's spreads
     * whole against its print format (#296). `front` / `back` = the front and back matter sheets of the print format
     * (0–MATTER_MAX, default MATTER_DEFAULT), `lastPage` = the last printed page (default: the last page of a numbered
     * spread – at most one more, which then gets its own single-page spread). The plan:
     * - `create`: the spreads that are missing – the last printed page's (`s256`), the front matter `front-1` … counting
     *   down to −1, the back matter `back-1` … after the last printed page – each only when no spread holds its pages;
     * - `moveBackCover`: the back cover's page → the page after the back matter (`lastPage + 2·back + 1`); its entries move
     *   with it, except those on a page that is now a printed page – they go to that page's spread;
     * - `entries`: the entries that change spread or page.
     * Without `apply: true` nothing is written (the plan only). With it the plan is applied in one transaction, every
     * spread's order follows its pages, and every changed row is in the change log. A print-first book takes it too (#238's
     * exception for matter). 400 `invalid-matter`; 409 `matter-conflict` when a spread that is no matter holds a page the
     * plan needs.
     */
    public static function addMatter(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        $count = static function (string $key) use ($body): int {
            $value = $body->{$key} ?? self::MATTER_DEFAULT;
            if (!is_int($value) || $value < 0 || $value > self::MATTER_MAX) throw new ApiError(400, 'invalid-matter', "$key must be a whole number 0–" . self::MATTER_MAX . '.');
            return $value;
        };
        $front = $count('front');
        $back = $count('back');
        $lastPage = $body->lastPage ?? null;
        if ($lastPage !== null && !is_int($lastPage)) throw new ApiError(400, 'invalid-matter', 'lastPage must be a whole number.');
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($bookId, $front, $back, $lastPage, $apply, $user): array {
            $plan = self::matterPlan($bookId, $front, $back, $lastPage);
            if ($apply) self::applyMatter($bookId, $plan, $user);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        unset($plan['rows']);
        Http::json(200, ['plan' => $plan, 'applied' => $apply && ($plan['create'] || $plan['moveBackCover'] || $plan['entries'])]);
    }

    /**
     * What `addMatter` would do
     * @return array<string, mixed>
     */
    private static function matterPlan(string $bookId, int $front, int $back, ?int $lastPage): array
    {
        $rows = Db::run('SELECT * FROM spreads WHERE book_id = :book ORDER BY position' . Db::forUpdate(), ['book' => $bookId])->fetchAll();
        $spreads = [];
        foreach ($rows as $row) {
            $data = Editor::decode($row['data_json']);
            $format = $data->format ?? 'spread';
            $spreads[] = ['id' => (string) $row['id'], 'first' => (int) $row['first_page'], 'last' => (int) $row['last_page'], 'format' => $format,
                'matter' => $format === 'spread' && in_array($data->matter ?? null, Books::MATTERS, true) ? $data->matter : null, 'row' => $row];
        }
        $numbered = array_filter($spreads, static fn(array $s) => $s['format'] === 'spread' && $s['matter'] === null);
        $lastNumbered = $numbered ? max(array_column($numbered, 'last')) : 0;
        $lastPage ??= $lastNumbered;
        if ($lastPage < $lastNumbered || $lastPage > $lastNumbered + 1) {
            throw new ApiError(400, 'invalid-matter', "lastPage must be the last page of a numbered spread ($lastNumbered) or the one after it.");
        }
        $ids = array_column($spreads, 'id');
        $holder = static function (int $page) use ($spreads): ?array {
            foreach ($spreads as $s) if ($s['format'] !== 'back' && $page >= $s['first'] && $page <= $s['last'] && !($s['format'] === 'cover' && $page !== $s['first'])) return $s;
            return null;
        };
        $create = [];
        $want = static function (string $id, string $title, int $first, int $last, ?string $matter) use (&$create, $holder, $ids): void {
            foreach ([$first, $last] as $page) {
                $held = $holder($page);
                if ($held === null) continue;
                if ($matter !== null && $held['matter'] === $matter && $held['first'] === $first && $held['last'] === $last) return;
                throw new ApiError(409, 'matter-conflict', "Page $page is held by the spread \"{$held['id']}\" – it cannot become " . ($matter ? "$matter matter" : "the spread \"$id\"") . '.');
            }
            if (in_array($id, $ids, true)) throw new ApiError(409, 'matter-conflict', "A spread \"$id\" exists with other pages.");
            $spread = ['id' => $id, 'title' => $title, 'firstPage' => $first, 'lastPage' => $last];
            if ($matter !== null) $spread['matter'] = $matter;
            $create[] = $spread;
        };
        if ($lastPage > $lastNumbered) $want(sprintf('s%03d', $lastPage), (string) $lastPage, $lastPage, $lastPage, null);
        for ($i = 0; $i < $front; $i++) {
            $first = -2 * ($front - $i);
            $want('front-' . ($i + 1), 'Front matter ' . ($i + 1), $first, $first + 1, 'front');
        }
        for ($i = 0; $i < $back; $i++) {
            $first = $lastPage + 1 + 2 * $i;
            $want('back-' . ($i + 1), 'Back matter ' . ($i + 1), $first, $first + 1, 'back');
        }
        // Back matter that is there already and lies after the planned back matter would collide with the back cover
        $backCover = array_values(array_filter($spreads, static fn(array $s) => $s['format'] === 'back'))[0] ?? null;
        $coverPage = $lastPage + 2 * $back + 1;
        foreach ($spreads as $s) {
            if ($s['format'] !== 'back' && $s['last'] >= $coverPage) throw new ApiError(409, 'matter-conflict', "The spread \"{$s['id']}\" lies on page {$s['last']}, where the back cover goes.");
        }
        $move = null;
        $entries = [];
        if ($backCover !== null && $backCover['first'] !== $coverPage) {
            $move = ['spread' => $backCover['id'], 'from' => $backCover['first'], 'to' => $coverPage];
            foreach (Db::run('SELECT id, page FROM entries WHERE book_id = :book AND spread_id = :spread ORDER BY position, id', ['book' => $bookId, 'spread' => $backCover['id']])->fetchAll() as $entry) {
                $page = (int) $entry['page'];
                $printed = $page <= $lastPage ? (string) (($holder($page)['id'] ?? null) ?? sprintf('s%03d', $page)) : null;
                $entries[] = $printed !== null
                    ? ['id' => (string) $entry['id'], 'spread' => $printed, 'page' => $page]
                    : ['id' => (string) $entry['id'], 'spread' => $backCover['id'], 'page' => $coverPage];
            }
        }
        // Entries on the new single page that belong to no spread find theirs
        foreach ($create as $spread) {
            foreach (Db::run('SELECT id, page FROM entries WHERE book_id = :book AND spread_id IS NULL AND page >= :first AND page <= :last ORDER BY position, id',
                ['book' => $bookId, 'first' => $spread['firstPage'], 'last' => $spread['lastPage']])->fetchAll() as $entry) {
                $entries[] = ['id' => (string) $entry['id'], 'spread' => $spread['id'], 'page' => (int) $entry['page']];
            }
        }
        return ['front' => $front, 'back' => $back, 'lastPage' => $lastPage, 'create' => $create, 'moveBackCover' => $move, 'entries' => $entries, 'rows' => $spreads];
    }

    /**
     * Writes a matter plan (inside the transaction that made it)
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $user
     */
    private static function applyMatter(string $bookId, array $plan, array $user): void
    {
        if (!$plan['create'] && !$plan['moveBackCover'] && !$plan['entries']) return;
        foreach ($plan['create'] as $spread) {
            $json = Editor::encode((object) $spread);
            Db::run('INSERT INTO spreads (book_id, id, position, title, first_page, last_page, data_json) VALUES (:book, :id, 0, :title, :first, :last, :data)',
                ['book' => $bookId, 'id' => $spread['id'], 'title' => $spread['title'], 'first' => $spread['firstPage'], 'last' => $spread['lastPage'], 'data' => $json]);
            Books::recordChange($bookId, $user, 'spread', $spread['id'], null, $json);
        }
        $move = $plan['moveBackCover'];
        if ($move !== null) {
            $row = Db::one('SELECT data_json FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $move['spread']]);
            $data = Editor::decode($row['data_json']);
            $data->firstPage = $move['to'];
            $data->lastPage = $move['to'];
            $json = Editor::encode($data);
            Db::run('UPDATE spreads SET first_page = :first, last_page = :last, data_json = :data WHERE book_id = :book AND id = :id',
                ['first' => $move['to'], 'last' => $move['to'], 'data' => $json, 'book' => $bookId, 'id' => $move['spread']]);
            Books::recordChange($bookId, $user, 'spread', $move['spread'], $row['data_json'], $json);
            // The back cover's own page image goes with it
            $image = Db::one('SELECT * FROM page_images WHERE book_id = :book AND page = :page AND facing = 0', ['book' => $bookId, 'page' => $move['from']]);
            if ($image && !Db::one('SELECT page FROM page_images WHERE book_id = :book AND page = :page AND facing = 0', ['book' => $bookId, 'page' => $move['to']])) {
                Db::run('UPDATE page_images SET page = :to WHERE book_id = :book AND page = :from AND facing = 0', ['to' => $move['to'], 'book' => $bookId, 'from' => $move['from']]);
            }
        }
        foreach ($plan['entries'] as $change) {
            $row = Db::one('SELECT page, data_json FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $change['id']]);
            $data = Editor::decode($row['data_json']);
            $from = (int) $row['page'];
            $data->page = $change['page'];
            $json = Editor::encode($data);
            Db::run('UPDATE entries SET spread_id = :spread, page = :page, data_json = :data WHERE book_id = :book AND id = :id',
                ['spread' => $change['spread'], 'page' => $change['page'], 'data' => $json, 'book' => $bookId, 'id' => $change['id']]);
            Books::recordChange($bookId, $user, 'entry', $change['id'], $row['data_json'], $json);
            if ($from === $change['page']) continue;
            // A target printed on the cover's page moves with its entry
            $target = Db::one('SELECT id, data_json FROM targets WHERE book_id = :book AND entry_id = :entry', ['book' => $bookId, 'entry' => $change['id']]);
            $targetData = $target ? Editor::decode($target['data_json']) : null;
            if ($targetData && isset($targetData->print) && is_object($targetData->print) && (int) ($targetData->print->page ?? PHP_INT_MIN) === $from) {
                $targetData->print->page = $change['page'];
                $targetJson = Editor::encode($targetData);
                Db::run('UPDATE targets SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $targetJson, 'book' => $bookId, 'id' => $target['id']]);
                Books::recordChange($bookId, $user, 'target', $target['id'], $target['data_json'], $targetJson);
            }
        }
        self::reorder($bookId);
        Books::touchBook($bookId);
    }

    /** Every spread's position follows its pages: the cover first, the back cover last, the rest by first page */
    private static function reorder(string $bookId): void
    {
        $rows = Db::run('SELECT id, position, first_page, data_json FROM spreads WHERE book_id = :book', ['book' => $bookId])->fetchAll();
        $rank = static function (array $row): array {
            $format = Editor::decode($row['data_json'])->format ?? 'spread';
            return [$format === 'cover' ? 0 : ($format === 'back' ? 2 : 1), (int) $row['first_page'], (int) $row['position']];
        };
        usort($rows, static fn(array $a, array $b) => $rank($a) <=> $rank($b));
        foreach ($rows as $position => $row) {
            if ((int) $row['position'] === $position) continue;
            Db::run('UPDATE spreads SET position = :position WHERE book_id = :book AND id = :id', ['position' => $position, 'book' => $bookId, 'id' => $row['id']]);
        }
    }
}
