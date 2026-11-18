<?php
declare(strict_types=1);

/**
 * Scenes (#307 phase 2, agents/SCENES.md, docs/server.md "Scenes"): a book is an ordered list of scenes – a scene is a
 * `spreads` row, its order is `spreads.position` and nothing else, its surfaces, layout, label and group live in its
 * data_json, the book's groups in `books.groups_json`, an entry's scene is `entries.spread_id` (its own truth – never
 * recomputed from a page) and its surface in the entry's data_json. Adding, moving or removing a scene renumbers
 * nothing.
 *
 * **Pages for older apps (RULES #10).** Apps before schema 2.35 place an entry by its `page` and a spread by its
 * `firstPage`…`lastPage`. A scene keeps the range it was stored with (the printed pages of an import; a new scene a
 * range after every other) as long as the ranges stay in order and apart; where they do not – a scene moved or added
 * in the middle – that scene gets a **derived** range from the order (right after the scene before it, as wide as its
 * own), and so do the later ones until a stored range fits again (`ranges`). The draft (`ContentVersion::assemble`),
 * the editor's tree and the entries list show these ranges and write every entry's `page` inside its scene's
 * (`pageOf`): by its surface's place in the scene, else at the same offset as before. Older apps then show those
 * numbers as page numbers – the price of reordering; the reader of 2.35 shows labels. A page sent by an older client
 * (`POST …/entries { page }`, `PUT …/entries/{id} { page }`) finds its scene among these ranges, else by a surface's
 * label (`forPage`).
 *
 * The routes: `GET …/scenes`, `POST …/scenes` (add with a layout preset, anywhere), `POST …/scenes/move` (one or several,
 * to a place or into / out of a group – a plan first, `apply: true` writes), `PUT …/scenes/{id}` (= `PUT …/spreads/{id}`:
 * surfaces, layout, label, group, title, format, passes), `DELETE …/scenes/{id}` (= the spread's removal, two steps),
 * `POST …/groups` (a group from picked scenes – plan, then apply), `PUT …/groups/{gid}` (rename),
 * `DELETE …/groups/{gid}` (ungroup: the scenes stay in place and order), `POST …/scenes/migrate` (a book's spreads
 * become scenes with surfaces, labels and groups – plan, then apply; idempotent).
 */
final class Scenes
{
    /** The layout presets a new scene starts from (`POST …/scenes { preset }`) */
    public const PRESETS = ['single', 'double', 'cover', 'back', 'foldout', 'wall'];
    /** A page's size when a request names none (the book's print format, as the editor's stage assumes) */
    public const PAGE_MM = ['width' => 230, 'height' => 320];
    /** A wall's size when a request names none */
    public const WALL_MM = ['width' => 2000, 'height' => 2000];
    /** How a scene's surfaces relate (shared/types/game-config.ts `SCENE_LAYOUTS`) */
    public const LAYOUTS = ['fixed', 'free'];
    /** A surface's side: a known one (`SURFACE_SIDES`) or a later MINOR's – a lower-case word (`SURFACE_SIDE_PATTERN`) */
    public const SIDE_PATTERN = '/^[a-z][a-z0-9-]*$/';
    /** The most surfaces one scene has */
    public const SURFACES_MAX = 32;
    /** The groups the migration makes from the front and back matter */
    public const MATTER_GROUPS = ['front' => ['id' => 'front-matter', 'label' => 'Front matter'], 'back' => ['id' => 'back-matter', 'label' => 'Back matter']];

    // ── Reading: the order, the ranges older apps read, an entry's page ─────────────────────────────────

    /**
     * The book's scene rows in order (`spreads.position`); `$lock` inside a transaction that writes them back
     * @return list<array<string, mixed>>
     */
    public static function rows(string $bookId, bool $lock = false): array
    {
        return Db::run('SELECT * FROM spreads WHERE book_id = :book ORDER BY position, id' . ($lock ? Db::forUpdate() : ''), ['book' => $bookId])->fetchAll();
    }

    /**
     * The page range every scene shows older apps, by id: its stored one while the ranges stay in order and apart, else
     * one derived from the order (see the class comment). The front cover (`format: cover`) only has to stay apart – it
     * comes first with page 0 although the front matter before page 1 has negative pages. `derived` = not the stored one.
     * @param list<array<string, mixed>> $rows in order
     * @return array<string, array{first: int, last: int, derived: bool}>
     */
    public static function ranges(array $rows): array
    {
        $items = [];
        foreach ($rows as $row) {
            $data = Editor::decode($row['data_json']);
            $first = (int) $row['first_page'];
            $items[] = ['id' => (string) $row['id'], 'first' => $first, 'last' => max($first, (int) $row['last_page']),
                'free' => is_object($data) && ($data->format ?? null) === 'cover'];
        }
        $ranges = [];
        $placed = [];
        $cursor = null;
        $count = count($items);
        foreach ($items as $i => $item) {
            [$first, $last] = [$item['first'], $item['last']];
            $width = $last - $first;
            $ok = true;
            foreach ($placed as [$from, $to]) {
                if ($first <= $to && $last >= $from) {
                    $ok = false;
                    break;
                }
            }
            if ($ok && !$item['free']) {
                if ($cursor !== null && $first <= $cursor) $ok = false;
                for ($j = $i + 1; $ok && $j < $count; $j++) {
                    if ($items[$j]['free']) continue;
                    // The next scene's stored range must still come after this one – else this one is the one out of place
                    if ($last >= $items[$j]['first']) $ok = false;
                    break;
                }
            }
            if (!$ok) {
                $base = $cursor;
                foreach ($placed as [, $to]) $base = $base === null ? $to : max($base, $to);
                $first = $base === null ? 1 : $base + 1;
                $last = $first + $width;
            }
            $placed[] = [$first, $last];
            if (!$item['free']) $cursor = $last;
            $ranges[$item['id']] = ['first' => $first, 'last' => $last, 'derived' => $first !== $item['first']];
        }
        return $ranges;
    }

    /**
     * What every read of a book's scenes needs: the rows in order, their ranges, each scene's data and row by id
     * @return array{rows: list<array<string, mixed>>, ranges: array<string, array{first: int, last: int, derived: bool}>, data: array<string, stdClass>, row: array<string, array<string, mixed>>}
     */
    public static function context(string $bookId, bool $lock = false): array
    {
        $rows = self::rows($bookId, $lock);
        $data = [];
        $byId = [];
        foreach ($rows as $row) {
            $decoded = Editor::decode($row['data_json']);
            $data[(string) $row['id']] = $decoded instanceof stdClass ? $decoded : new stdClass();
            $byId[(string) $row['id']] = $row;
        }
        return ['rows' => $rows, 'ranges' => self::ranges($rows), 'data' => $data, 'row' => $byId];
    }

    /**
     * Every scene as the content and the editor show it, in order: its data with `firstPage` / `lastPage` the range older
     * apps read (`ranges`), a `group` the book does not have left out (`$groupIds`; null = keep it)
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, array{first: int, last: int, derived: bool}>, data: array<string, stdClass>, row: array<string, array<string, mixed>>} $context
     * @param list<string>|null $groupIds
     * @return list<stdClass>
     */
    public static function shown(array $context, ?array $groupIds = null): array
    {
        $spreads = [];
        foreach ($context['rows'] as $row) {
            $id = (string) $row['id'];
            $spread = clone $context['data'][$id];
            $range = $context['ranges'][$id];
            $spread->firstPage = $range['first'];
            $spread->lastPage = $range['last'];
            if ($groupIds !== null && property_exists($spread, 'group') && !in_array($spread->group, $groupIds, true)) unset($spread->group);
            $spreads[] = $spread;
        }
        return $spreads;
    }

    /**
     * The page an entry is written with (older apps place it by it): inside its scene's range – its stored page while the
     * scene keeps its stored range and the page is in it; else its surface's place in the scene; else the same offset
     * from the scene's first page as before. An entry on no scene keeps its page.
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, array{first: int, last: int, derived: bool}>, data: array<string, stdClass>, row: array<string, array<string, mixed>>} $context
     */
    public static function pageOf(array $context, ?string $sceneId, stdClass $entry): int
    {
        $stored = is_numeric($entry->page ?? null) ? (int) $entry->page : 0;
        if ($sceneId === null || !isset($context['ranges'][$sceneId])) return $stored;
        $range = $context['ranges'][$sceneId];
        $width = $range['last'] - $range['first'];
        if (!$range['derived'] && $stored >= $range['first'] && $stored <= $range['last']) return $stored;
        $surface = is_string($entry->surface ?? null) ? self::surfacePage($context, $sceneId, $entry->surface) : null;
        if ($surface !== null) return $surface;
        $offset = $stored - (int) $context['row'][$sceneId]['first_page'];
        return $range['first'] + max(0, min($offset, $width));
    }

    /**
     * The page (as shown, `ranges`) a surface of a scene lies on: the scene's first page plus the surface's place, at most
     * its last page; null when the scene has no such surface
     * @param array{ranges: array<string, array{first: int, last: int, derived: bool}>, data: array<string, stdClass>} $context
     */
    public static function surfacePage(array $context, string $sceneId, string $surface): ?int
    {
        $range = $context['ranges'][$sceneId];
        foreach (self::surfaces($context['data'][$sceneId]) as $i => $s) {
            if (($s->id ?? null) === $surface) return $range['first'] + min($i, $range['last'] - $range['first']);
        }
        return null;
    }

    /**
     * A page as shown (`ranges`) in the scene's own stored page numbers – what an entry's row keeps, so its place in the
     * scene survives when the scene's shown range changes (`pageOf`)
     * @param array{ranges: array<string, array{first: int, last: int, derived: bool}>, row: array<string, array<string, mixed>>} $context
     */
    public static function storedPage(array $context, string $sceneId, int $page): int
    {
        return (int) $context['row'][$sceneId]['first_page'] + ($page - $context['ranges'][$sceneId]['first']);
    }

    /**
     * The scene a page sent by an older client means, and the surface on it: the first scene (in order) whose range
     * (`ranges` – what the editor's tree shows) holds the page, else the first whose surface is labelled with the page
     * number; null when none does. The surface: the one labelled with the page, else the one at the page's place when
     * the scene has one surface per page, else none.
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, array{first: int, last: int, derived: bool}>, data: array<string, stdClass>, row: array<string, array<string, mixed>>} $context
     * @return array{scene: string, surface: ?string}|null
     */
    public static function forPage(array $context, int $page): ?array
    {
        $label = (string) $page;
        foreach ($context['rows'] as $row) {
            $id = (string) $row['id'];
            $range = $context['ranges'][$id];
            if ($page < $range['first'] || $page > $range['last']) continue;
            $surfaces = array_values(self::surfaces($context['data'][$id]));
            $surface = null;
            foreach ($surfaces as $s) {
                if (trim((string) ($s->label ?? '')) === $label) $surface = (string) $s->id;
            }
            if ($surface === null && count($surfaces) === $range['last'] - $range['first'] + 1) $surface = (string) ($surfaces[$page - $range['first']]->id ?? '') ?: null;
            return ['scene' => $id, 'surface' => $surface];
        }
        foreach ($context['rows'] as $row) {
            foreach (self::surfaces($context['data'][(string) $row['id']]) as $s) {
                if (trim((string) ($s->label ?? '')) === $label) return ['scene' => (string) $row['id'], 'surface' => (string) $s->id];
            }
        }
        return null;
    }

    /** @return list<stdClass> a scene's surfaces (none: []) */
    public static function surfaces(stdClass $scene): array
    {
        return is_array($scene->surfaces ?? null) ? array_values(array_filter($scene->surfaces, static fn($s) => $s instanceof stdClass)) : [];
    }

    /** @return list<string> the ids of a scene's surfaces */
    public static function surfaceIds(stdClass $scene): array
    {
        return array_values(array_map(static fn(stdClass $s) => (string) ($s->id ?? ''), self::surfaces($scene)));
    }

    /**
     * The book's groups (`books.groups_json`, the content's root `groups`)
     * @param array<string, mixed> $book the book row
     * @return list<stdClass>
     */
    public static function groups(array $book): array
    {
        $groups = Editor::decode($book['groups_json'] ?? '[]');
        return is_array($groups) ? array_values(array_filter($groups, static fn($g) => $g instanceof stdClass && is_string($g->id ?? null))) : [];
    }

    // ── GET …/scenes ─────────────────────────────────────────────────────────────────────────────

    /**
     * GET /editor/books/{id}/scenes → { scenes: [{ id, position, title, label, format, matter, layout, group, surfaces,
     * firstPage, lastPage, stored: { firstPage, lastPage }, derived, entries, targets }], groups: [{ id, label, scenes }] }:
     * the book's scenes in order – `firstPage` / `lastPage` the range older apps read (`derived`: not the stored one),
     * `entries` / `targets` how many lie on it; every surface with its `reference` image { url, name, fit } or null
     * (#314, `SurfaceReferences` – editor-only, never in the content)
     */
    public static function list(string $bookId): never
    {
        Editor::user();
        $book = Books::bookRow($bookId);
        Http::json(200, self::overview($bookId, $book));
    }

    /**
     * @param array<string, mixed> $book
     * @return array{scenes: list<array<string, mixed>>, groups: list<array<string, mixed>>}
     */
    public static function overview(string $bookId, array $book): array
    {
        $context = self::context($bookId);
        $groups = self::groups($book);
        $counts = [];
        foreach (Db::run('SELECT e.spread_id, COUNT(*) AS entries, COUNT(t.id) AS targets FROM entries e LEFT JOIN targets t ON t.book_id = e.book_id AND t.entry_id = e.id
                          WHERE e.book_id = :book AND e.spread_id IS NOT NULL GROUP BY e.spread_id', ['book' => $bookId])->fetchAll() as $row) {
            $counts[(string) $row['spread_id']] = ['entries' => (int) $row['entries'], 'targets' => (int) $row['targets']];
        }
        $shown = Pages::withTitles(self::shown($context, array_map(static fn($g) => (string) $g->id, $groups)));
        $references = SurfaceReferences::byScene($bookId);
        $scenes = [];
        foreach ($shown as $position => $spread) {
            $id = (string) $spread->id;
            $row = $context['row'][$id];
            $scenes[] = [
                'id' => $id, 'position' => $position, 'title' => (string) ($spread->title ?? ''), 'label' => $spread->label ?? null,
                'format' => $spread->format ?? 'spread', 'matter' => $spread->matter ?? null, 'layout' => $spread->layout ?? null, 'group' => $spread->group ?? null,
                'surfaces' => array_map(static fn(stdClass $s) => (object) (get_object_vars($s) + ['reference' => $references[$id][(string) ($s->id ?? '')] ?? null]), self::surfaces($spread)),
                'firstPage' => $spread->firstPage, 'lastPage' => $spread->lastPage,
                'stored' => ['firstPage' => (int) $row['first_page'], 'lastPage' => (int) $row['last_page']], 'derived' => $context['ranges'][$id]['derived'],
                'entries' => $counts[$id]['entries'] ?? 0, 'targets' => $counts[$id]['targets'] ?? 0,
            ];
        }
        $byGroup = [];
        foreach ($scenes as $scene) if ($scene['group'] !== null) $byGroup[$scene['group']][] = $scene['id'];
        return ['scenes' => $scenes, 'groups' => array_map(static fn(stdClass $g) => ['id' => $g->id, 'label' => (string) ($g->label ?? ''), 'scenes' => $byGroup[$g->id] ?? []], $groups)];
    }

    // ── POST …/scenes ────────────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/books/{id}/scenes { preset?, after? | before? | position?, id?, title?, label?, group?, surfaces?, layout? }
     * → 201 { scene, position, pages }: a new scene anywhere in the order, for print-first and digital-first books alike.
     * `preset` (default `double`): `single` (one page), `double` (left and right), `cover` (the front cover: its front),
     * `back` (the back cover), `foldout` (three pages side by side), `wall` (one wall) – its surfaces, unless `surfaces`
     * names them. The place: after the scene `after`, before `before`, or at `position` (0 = first); none = the front
     * cover first, everything else before the back cover (else last). Nothing else moves or renumbers: the scene is
     * stored with pages after every other scene's; `pages` = the scenes whose page range older apps read changes with it
     * (`ranges`). Its id is `id`, else the first free `scene-<n>`. 400 `invalid-scene`, `unknown-scene`, `unknown-group`;
     * 409 `duplicate-id`.
     */
    public static function add(string $bookId): never
    {
        $user = Editor::user();
        $book = Books::bookRow($bookId);
        $body = Editor::body();
        $preset = $body->preset ?? 'double';
        if (!in_array($preset, self::PRESETS, true)) throw new ApiError(400, 'invalid-scene', 'preset must be one of ' . implode(', ', self::PRESETS) . '.');
        $id = property_exists($body, 'id') ? Editor::id($body->id, 'id') : null;
        $placement = self::placement($body);
        $fields = new stdClass();
        foreach (['title', 'label', 'group', 'surfaces', 'layout'] as $key) if (property_exists($body, $key)) $fields->{$key} = $body->{$key};
        [$scene, $position, $pages] = self::insert($bookId, $book, $preset, $id, $placement, $fields, $user, 'scene');
        Http::json(201, ['scene' => $scene, 'position' => $position, 'pages' => $pages]);
    }

    /**
     * Where a request places scenes: `after` / `before` (a scene id) or `position` (an index) – at most one, null = none
     * @return array{after?: string, before?: string, position?: int}|null
     */
    public static function placement(stdClass $body): ?array
    {
        $given = array_values(array_filter(['after', 'before', 'position'], static fn(string $key) => property_exists($body, $key) && $body->{$key} !== null));
        if (count($given) > 1) throw new ApiError(400, 'invalid-scene', 'Send one of after, before or position.');
        if (!$given) return null;
        $key = $given[0];
        if ($key === 'position') {
            if (!is_int($body->position) || $body->position < 0) throw new ApiError(400, 'invalid-scene', 'position must be a whole number from 0.');
            return ['position' => $body->position];
        }
        return [$key => Editor::id($body->{$key}, $key)];
    }

    /**
     * Adds a scene (both routes: `POST …/scenes` and the older `POST …/spreads`) in one transaction and records it
     * @param array<string, mixed> $book
     * @param array{after?: string, before?: string, position?: int}|null $placement
     * @param array<string, mixed> $user
     * @return array{0: stdClass, 1: int, 2: list<array<string, mixed>>} the scene as shown, its position, the page changes
     */
    public static function insert(string $bookId, array $book, string $preset, ?string $id, ?array $placement, stdClass $fields, array $user, string $idPrefix): array
    {
        return Db::transaction(static function () use ($bookId, $book, $preset, $id, $placement, $fields, $user, $idPrefix) {
            $before = self::context($bookId, true);
            $ids = array_map(static fn(array $row) => (string) $row['id'], $before['rows']);
            if ($id === null) {
                if (in_array($preset, ['cover', 'back'], true) && $idPrefix === 'spread' && !in_array($preset, $ids, true)) $id = $preset;
                else {
                    for ($n = 1; in_array("$idPrefix-$n", $ids, true); $n++);
                    $id = "$idPrefix-$n";
                }
            } elseif (in_array($id, $ids, true)) {
                throw new ApiError(409, 'duplicate-id', "A scene \"$id\" exists.");
            }
            $position = self::insertAt($before, $preset, $placement);
            // Pages after every other scene's (none renumbers – `ranges` derives what older apps read); the front cover
            // page 0 while no scene holds it
            $width = $preset === 'double' ? 2 : ($preset === 'foldout' ? 3 : 1);
            $max = null;
            $zeroTaken = false;
            foreach ($before['rows'] as $row) {
                $max = $max === null ? (int) $row['last_page'] : max($max, (int) $row['last_page']);
                if ((int) $row['first_page'] <= 0 && (int) $row['last_page'] >= 0) $zeroTaken = true;
            }
            $first = $preset === 'cover' && !$zeroTaken ? 0 : max(1, ($max ?? 0) + 1);
            $title = is_string($fields->title ?? null) ? trim($fields->title) : '';
            $scene = (object) ['id' => $id, 'title' => $title !== '' ? $title : ($preset === 'cover' ? 'Cover' : ($preset === 'back' ? 'Back cover' : '')),
                'firstPage' => $first, 'lastPage' => $first + $width - 1];
            if (in_array($preset, ['cover', 'back'], true)) $scene->format = $preset;
            $scene->surfaces = self::presetSurfaces($preset);
            unset($fields->title);
            self::edit($bookId, $book, $scene, $fields, []);
            $json = Editor::encode($scene);
            // Positions are written 0…n-1 (an older book's may have gaps – a cover at −1)
            array_splice($ids, $position, 0, [$id]);
            Db::run('INSERT INTO spreads (book_id, id, position, title, first_page, last_page, data_json) VALUES (:book, :id, :position, :title, :first, :last, :data)',
                ['book' => $bookId, 'id' => $id, 'position' => $position, 'title' => $scene->title, 'first' => $scene->firstPage, 'last' => $scene->lastPage, 'data' => $json]);
            self::writePositions($bookId, self::rows($bookId, true), $ids);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'spread', $id, null, $json);
            $after = self::context($bookId);
            $shown = Pages::withTitles(self::shown($after));
            return [$shown[array_search($id, array_map(static fn($s) => $s->id, $shown), true)], $position, self::pageChanges($before['ranges'], $after['ranges'])];
        });
    }

    /**
     * The index a new scene goes to
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, mixed>, data: array<string, stdClass>, row: array<string, mixed>} $context
     * @param array{after?: string, before?: string, position?: int}|null $placement
     */
    private static function insertAt(array $context, string $preset, ?array $placement): int
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        if ($placement !== null) {
            if (isset($placement['position'])) return min($placement['position'], count($ids));
            $anchor = $placement['after'] ?? $placement['before'];
            $index = array_search($anchor, $ids, true);
            if ($index === false) throw new ApiError(400, 'unknown-scene', "No scene \"$anchor\" in this book.");
            return isset($placement['after']) ? $index + 1 : $index;
        }
        if ($preset === 'cover') return 0;
        if ($preset === 'back') return count($ids);
        // Before the back cover (the last scene with format back), else last
        for ($i = count($ids) - 1; $i >= 0; $i--) {
            if (($context['data'][$ids[$i]]->format ?? null) === 'back') return $i;
        }
        return count($ids);
    }

    /**
     * A preset's surfaces – the pages' default size, a wall's own
     * @return list<stdClass>
     */
    public static function presetSurfaces(string $preset): array
    {
        $page = static fn(string $id, string $side) => (object) ['id' => $id, 'side' => $side, 'widthMm' => self::PAGE_MM['width'], 'heightMm' => self::PAGE_MM['height']];
        return match ($preset) {
            'single' => [$page('page', 'right')],
            'double' => [$page('left', 'left'), $page('right', 'right')],
            'cover' => [$page('front', 'front')],
            'back' => [$page('back', 'back')],
            'foldout' => [$page('left', 'left'), $page('middle', 'middle'), $page('right', 'right')],
            'wall' => [(object) ['id' => 'wall', 'side' => 'wall', 'widthMm' => self::WALL_MM['width'], 'heightMm' => self::WALL_MM['height']]],
        };
    }

    // ── A scene's own fields (PUT …/scenes/{id}, PUT …/spreads/{id}) ─────────────────────────────

    /** The fields of a scene `edit` changes, next to the spread's title, format and passes (`Books::putSpread`) */
    public const SCENE_FIELDS = ['surfaces', 'layout', 'label', 'group'];

    /**
     * Applies a request's scene fields to the scene (in place): `surfaces` (the whole list – add, remove, resize, label;
     * [] or null removes them), `layout` (fixed | free, null removes it), `label` (free text, "" or null removes it),
     * `group` (a group of the book, null takes it out – the scene stays where it is). Returns whether anything was sent
     * and the surfaces that went. 400 `invalid-scene`, `unknown-group`.
     * @param array<string, mixed> $book
     * @param list<string> $before the surface ids before the change
     * @return array{touched: bool, removed: list<string>}
     */
    public static function edit(string $bookId, array $book, stdClass $scene, stdClass $body, array $before): array
    {
        $touched = false;
        if (property_exists($body, 'surfaces')) {
            $surfaces = $body->surfaces === null ? [] : self::checkSurfaces($body->surfaces);
            if ($surfaces) $scene->surfaces = $surfaces;
            else unset($scene->surfaces);
            $touched = true;
        }
        if (property_exists($body, 'layout')) {
            if ($body->layout === null) unset($scene->layout);
            elseif (!in_array($body->layout, self::LAYOUTS, true)) throw new ApiError(400, 'invalid-scene', 'layout must be one of ' . implode(', ', self::LAYOUTS) . ' (or null).');
            else $scene->layout = $body->layout;
            $touched = true;
        }
        if (property_exists($body, 'label')) {
            if ($body->label !== null && !is_string($body->label)) throw new ApiError(400, 'invalid-scene', 'label must be text ("" or null removes it).');
            $label = trim((string) $body->label);
            if (mb_strlen($label) > BookTexts::TEXT_MAX_LENGTH) throw new ApiError(400, 'invalid-scene', 'label is longer than ' . BookTexts::TEXT_MAX_LENGTH . ' characters.');
            if ($label === '') unset($scene->label);
            else $scene->label = $label;
            $touched = true;
        }
        if (property_exists($body, 'group')) {
            if ($body->group === null) unset($scene->group);
            else {
                $group = Editor::id($body->group, 'group');
                if (!in_array($group, array_map(static fn($g) => $g->id, self::groups($book)), true)) throw new ApiError(400, 'unknown-group', "No group \"$group\" in this book – make it with POST …/groups.");
                $scene->group = $group;
            }
            $touched = true;
        }
        return ['touched' => $touched, 'removed' => array_values(array_diff($before, self::surfaceIds($scene)))];
    }

    /**
     * A surfaces list as the content holds it (`SurfaceData`): each { id, side, widthMm?, heightMm?, label?, place? } – the
     * size defaults to a page's (a wall's for side `wall`), a label is trimmed and left out when empty, `place` (schema
     * 2.36, #314: `SurfacePlace` – x, y, z in mm, rx?, ry?, rz? in degrees, in the scene's coordinate system) kept as sent
     * (null leaves it out)
     * @return list<stdClass>
     */
    public static function checkSurfaces(mixed $value): array
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-scene', $message);
        if (!is_array($value)) $fail('surfaces must be a list of { id, side, widthMm?, heightMm?, label?, place? }.');
        if (count($value) > self::SURFACES_MAX) $fail('A scene has at most ' . self::SURFACES_MAX . ' surfaces.');
        $surfaces = [];
        $ids = [];
        foreach ($value as $i => $s) {
            $path = "surfaces[$i]";
            if (!$s instanceof stdClass) $fail("$path must be an object { id, side, widthMm?, heightMm?, label?, place? }.");
            $id = Editor::id($s->id ?? null, "$path.id");
            if (in_array($id, $ids, true)) $fail("$path.id: \"$id\" is there twice.");
            $ids[] = $id;
            $side = $s->side ?? null;
            if (!is_string($side) || !preg_match(self::SIDE_PATTERN, $side)) $fail("$path.side must be a side (left, middle, right, front, back, wall …).");
            $default = $side === 'wall' ? self::WALL_MM : self::PAGE_MM;
            $surface = (object) ['id' => $id, 'side' => $side];
            foreach (['widthMm' => 'width', 'heightMm' => 'height'] as $key => $dimension) {
                $size = $s->{$key} ?? $default[$dimension];
                if (!(is_int($size) || is_float($size)) || !is_finite((float) $size) || $size <= 0) $fail("$path.$key must be a size in mm (> 0).");
                $surface->{$key} = $size;
            }
            if (property_exists($s, 'label') && $s->label !== null) {
                if (!is_string($s->label)) $fail("$path.label must be text.");
                $label = trim($s->label);
                if (mb_strlen($label) > BookTexts::TEXT_MAX_LENGTH) $fail("$path.label is longer than " . BookTexts::TEXT_MAX_LENGTH . ' characters.');
                if ($label !== '') $surface->label = $label;
            }
            if (property_exists($s, 'place') && $s->place !== null) $surface->place = self::checkPlace($s->place, "$path.place");
            foreach (array_keys(get_object_vars($s)) as $key) {
                if (!in_array($key, ['id', 'side', 'widthMm', 'heightMm', 'label', 'place'], true)) $fail("$path.$key is not a field of a surface.");
            }
            $surfaces[] = $surface;
        }
        return $surfaces;
    }

    /** The largest coordinate of a place (mm) and turn (degrees) */
    public const PLACE_MAX_MM = 1000000;
    public const PLACE_MAX_DEG = 3600;

    /**
     * A surface's place in the scene (`SurfacePlace`, schema 2.36): x, y, z required (mm), rx, ry, rz optional (degrees) –
     * finite numbers, no other field. 400 `invalid-scene`.
     */
    public static function checkPlace(mixed $value, string $path = 'place'): stdClass
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-scene', $message);
        if (!$value instanceof stdClass) $fail("$path must be an object { x, y, z, rx?, ry?, rz? } (mm, degrees).");
        $place = new stdClass();
        foreach (['x', 'y', 'z', 'rx', 'ry', 'rz'] as $key) {
            $required = in_array($key, ['x', 'y', 'z'], true);
            if (!property_exists($value, $key) || ($value->{$key} === null && !$required)) {
                if ($required) $fail("$path.$key is required (mm).");
                continue;
            }
            $n = $value->{$key};
            $max = $required ? self::PLACE_MAX_MM : self::PLACE_MAX_DEG;
            if (!(is_int($n) || is_float($n)) || !is_finite((float) $n) || abs($n) > $max) $fail("$path.$key must be a number" . ($required ? ' in mm' : ' in degrees') . " (at most $max either way).");
            $place->{$key} = $n;
        }
        foreach (array_keys(get_object_vars($value)) as $key) {
            if (!in_array($key, ['x', 'y', 'z', 'rx', 'ry', 'rz'], true)) $fail("$path.$key is not a field of a place.");
        }
        return $place;
    }

    // ── POST …/scenes/move ───────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/books/{id}/scenes/move { scenes: [ids], after? | before? | position?, group?, apply? } → { plan, applied }:
     * moves one or several scenes as a block (in their present order) – after or before a scene, to `position` (an index
     * among the scenes that stay), or `group`: into that group (after its last scene, unless a place is given) or `null`
     * out of their group (they stay in place unless they sit inside it – then right after it). The plan: `order` (every id
     * in the new order), `moved` (the picked scenes whose place changes), `groups` (scene, from, to), `pages` (the scenes
     * whose page range older apps read changes – `ranges`). Without `apply: true` nothing is written; with it the order, the
     * groups and a change per row are written in one transaction. Nothing renumbers. 400 `invalid-move`, `unknown-scene`,
     * `unknown-group`.
     */
    public static function move(string $bookId): never
    {
        $user = Editor::user();
        $book = Books::bookRow($bookId);
        $body = Editor::body();
        $picked = self::picked($body->scenes ?? null, 'invalid-move');
        $placement = self::placement($body);
        $hasGroup = property_exists($body, 'group');
        $group = $hasGroup && $body->group !== null ? Editor::id($body->group, 'group') : null;
        if ($group !== null && !in_array($group, array_map(static fn($g) => $g->id, self::groups($book)), true)) throw new ApiError(400, 'unknown-group', "No group \"$group\" in this book.");
        if ($placement === null && !$hasGroup) throw new ApiError(400, 'invalid-move', 'Send where to: after, before, position or group.');
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($bookId, $picked, $placement, $hasGroup, $group, $apply, $user): array {
            $context = self::context($bookId, $apply);
            $order = self::orderAfterMove($context, $picked, $placement, $hasGroup, $group);
            $groups = [];
            if ($hasGroup) {
                foreach ($picked as $id) {
                    $from = $context['data'][$id]->group ?? null;
                    if ($from !== $group) $groups[] = ['scene' => $id, 'from' => $from, 'to' => $group];
                }
            }
            $plan = self::plan($context, $order, $picked, $groups);
            if ($apply) self::applyPlan($bookId, $context, $plan, $user);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply && ($plan['moved'] || $plan['groups'])]);
    }

    /**
     * The scene ids a request picks: 1 or more distinct ids
     * @return list<string>
     */
    private static function picked(mixed $value, string $code): array
    {
        if (!is_array($value) || $value === []) throw new ApiError(400, $code, 'scenes must be a list of scene ids.');
        $ids = [];
        foreach ($value as $i => $id) {
            $id = Editor::id($id, "scenes[$i]");
            if (in_array($id, $ids, true)) throw new ApiError(400, $code, "scenes[$i]: \"$id\" is there twice.");
            $ids[] = $id;
        }
        return $ids;
    }

    /**
     * The order after moving the picked scenes as a block
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, mixed>, data: array<string, stdClass>, row: array<string, mixed>} $context
     * @param list<string> $picked
     * @param array{after?: string, before?: string, position?: int}|null $placement
     * @return list<string>
     */
    private static function orderAfterMove(array $context, array $picked, ?array $placement, bool $hasGroup, ?string $group): array
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        foreach ($picked as $id) if (!in_array($id, $ids, true)) throw new ApiError(400, 'unknown-scene', "No scene \"$id\" in this book.");
        $block = array_values(array_filter($ids, static fn(string $id) => in_array($id, $picked, true)));
        $rest = array_values(array_filter($ids, static fn(string $id) => !in_array($id, $picked, true)));
        // Where the block starts now, among the scenes that stay
        $here = array_search($block[0], $ids, true);
        $original = count(array_filter(array_slice($ids, 0, (int) $here), static fn(string $id) => !in_array($id, $picked, true)));
        $groupOf = static fn(string $id): ?string => $context['data'][$id]->group ?? null;
        if ($placement !== null) {
            if (isset($placement['position'])) $at = min($placement['position'], count($rest));
            else {
                $anchor = $placement['after'] ?? $placement['before'];
                if (in_array($anchor, $picked, true)) throw new ApiError(400, 'invalid-move', "\"$anchor\" is one of the scenes moved.");
                $index = array_search($anchor, $rest, true);
                if ($index === false) throw new ApiError(400, 'unknown-scene', "No scene \"$anchor\" in this book.");
                $at = isset($placement['after']) ? $index + 1 : $index;
            }
        } elseif ($group !== null) {
            // Into the group: after its last scene; a group without other scenes – where the block is
            $members = array_keys(array_filter($rest, static fn(string $id) => $groupOf($id) === $group));
            $at = $members ? max($members) + 1 : $original;
        } else {
            // Out of the group: in place – unless scenes of the former group lie on both sides, then right after them
            $former = $groupOf($block[0]);
            $members = $former === null ? [] : array_keys(array_filter($rest, static fn(string $id) => $groupOf($id) === $former));
            $at = $members && min($members) < $original && max($members) >= $original ? max($members) + 1 : $original;
        }
        array_splice($rest, $at, 0, $block);
        return $rest;
    }

    /**
     * A plan of a new order (and group changes): what moves and which page ranges older apps read change
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, array{first: int, last: int, derived: bool}>, data: array<string, stdClass>, row: array<string, array<string, mixed>>} $context
     * @param list<string> $order
     * @param list<string> $picked
     * @param list<array{scene: string, from: ?string, to: ?string}> $groups
     * @return array{order: list<string>, moved: list<string>, groups: list<array<string, mixed>>, pages: list<array<string, mixed>>}
     */
    private static function plan(array $context, array $order, array $picked, array $groups): array
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        $moved = array_values(array_filter($picked, static fn(string $id) => array_search($id, $ids, true) !== array_search($id, $order, true)));
        $rows = array_map(static fn(string $id) => $context['row'][$id], $order);
        return ['order' => $order, 'moved' => $moved, 'groups' => $groups, 'pages' => self::pageChanges($context['ranges'], self::ranges($rows))];
    }

    /**
     * Writes a plan inside the transaction that made it: the positions, the scenes' groups, a change per row
     * @param array{rows: list<array<string, mixed>>, ranges: array<string, mixed>, data: array<string, stdClass>, row: array<string, array<string, mixed>>} $context
     * @param array{order: list<string>, moved: list<string>, groups: list<array{scene: string, from: ?string, to: ?string}>, pages: list<array<string, mixed>>} $plan
     * @param array<string, mixed> $user
     */
    private static function applyPlan(string $bookId, array $context, array $plan, array $user): void
    {
        $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
        if ($ids !== $plan['order']) {
            self::writePositions($bookId, $context['rows'], $plan['order']);
            Books::recordChange($bookId, $user, 'order', $bookId, Editor::encode($ids), Editor::encode($plan['order']));
        }
        foreach ($plan['groups'] as $change) {
            $row = $context['row'][$change['scene']];
            $scene = Editor::decode($row['data_json']);
            if ($change['to'] === null) unset($scene->group);
            else $scene->group = $change['to'];
            $json = Editor::encode($scene);
            Db::run('UPDATE spreads SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $change['scene']]);
            Books::recordChange($bookId, $user, 'spread', $change['scene'], $row['data_json'], $json);
        }
        if ($ids !== $plan['order'] || $plan['groups']) Books::touchBook($bookId);
    }

    /**
     * Every scene's position as `$order` says (0…n-1; null = the rows' order) – only the rows whose position changes
     * @param list<array<string, mixed>> $rows
     * @param list<string>|null $order
     */
    public static function writePositions(string $bookId, array $rows, ?array $order): void
    {
        $order ??= array_map(static fn(array $row) => (string) $row['id'], $rows);
        $current = [];
        foreach ($rows as $row) $current[(string) $row['id']] = (int) $row['position'];
        foreach ($order as $position => $id) {
            if (($current[$id] ?? null) === $position) continue;
            Db::run('UPDATE spreads SET position = :position WHERE book_id = :book AND id = :id', ['position' => $position, 'book' => $bookId, 'id' => $id]);
        }
    }

    /**
     * The scenes whose page range (what older apps read) differs between two `ranges`: { scene, from, to } – from / to
     * [first, last], null for a scene that is not in one of them
     * @param array<string, array{first: int, last: int, derived: bool}> $before
     * @param array<string, array{first: int, last: int, derived: bool}> $after
     * @return list<array{scene: string, from: ?list<int>, to: ?list<int>}>
     */
    public static function pageChanges(array $before, array $after): array
    {
        $changes = [];
        foreach ($after as $id => $range) {
            $from = isset($before[$id]) ? [$before[$id]['first'], $before[$id]['last']] : null;
            $to = [$range['first'], $range['last']];
            if ($from !== null && $from !== $to) $changes[] = ['scene' => (string) $id, 'from' => $from, 'to' => $to];
        }
        return $changes;
    }

    // ── Groups ───────────────────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/books/{id}/groups { label, scenes: [ids], id?, apply? } → { plan, applied }: a group of the picked
     * scenes – they come together where the first of them is (in their present order; a scene of another group leaves
     * it). The plan: `group` { id, label }, `order`, `moved`, `groups`, `pages` (as a move's). Without `apply: true` nothing
     * is written. The id: `id`, else made from the label (`front-matter`), else the first free `group-<n>`. 400
     * `invalid-group`, `unknown-scene`; 409 `duplicate-id`.
     */
    public static function addGroup(string $bookId): never
    {
        $user = Editor::user();
        $book = Books::bookRow($bookId);
        $body = Editor::body();
        $label = self::groupLabel($body->label ?? null);
        $picked = self::picked($body->scenes ?? null, 'invalid-group');
        $existing = array_map(static fn($g) => $g->id, self::groups($book));
        if (property_exists($body, 'id')) {
            $id = Editor::id($body->id, 'id');
            if (in_array($id, $existing, true)) throw new ApiError(409, 'duplicate-id', "A group \"$id\" exists.");
        } else {
            $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $label) ?: $label)), '-');
            $id = $slug !== '' && strlen($slug) <= 64 && !in_array($slug, $existing, true) ? $slug : null;
            if ($id === null) {
                for ($n = 1; in_array("group-$n", $existing, true); $n++);
                $id = "group-$n";
            }
        }
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($bookId, $label, $picked, $id, $apply, $user): array {
            $context = self::context($bookId, $apply);
            $ids = array_map(static fn(array $row) => (string) $row['id'], $context['rows']);
            foreach ($picked as $scene) if (!in_array($scene, $ids, true)) throw new ApiError(400, 'unknown-scene', "No scene \"$scene\" in this book.");
            // Together where the first of them is
            $first = min(array_map(static fn(string $scene) => (int) array_search($scene, $ids, true), $picked));
            $order = self::orderAfterMove($context, $picked, ['position' => count(array_filter(array_slice($ids, 0, $first), static fn(string $s) => !in_array($s, $picked, true)))], false, null);
            $groups = array_map(static fn(string $scene) => ['scene' => $scene, 'from' => $context['data'][$scene]->group ?? null, 'to' => $id], array_values(array_filter($order, static fn($s) => in_array($s, $picked, true))));
            $plan = ['group' => ['id' => $id, 'label' => $label]] + self::plan($context, $order, $picked, $groups);
            if ($apply) {
                $row = Books::bookRow($bookId, true);
                $before = self::groups($row);
                $after = [...$before, (object) ['id' => $id, 'label' => $label]];
                self::writeGroups($bookId, $row, $after, $user);
                self::applyPlan($bookId, $context, $plan, $user);
            }
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply]);
    }

    /** PUT /editor/books/{id}/groups/{gid} { label } → { group }: renames a group (a change recorded). 400 `invalid-group`, 404 */
    public static function putGroup(string $bookId, string $groupId): never
    {
        $user = Editor::user();
        Books::bookRow($bookId);
        $label = self::groupLabel(Editor::body()->label ?? null);
        $group = Db::transaction(static function () use ($bookId, $groupId, $label, $user) {
            $row = Books::bookRow($bookId, true);
            $groups = self::groups($row);
            $found = null;
            foreach ($groups as $group) if ($group->id === $groupId) $found = $group;
            if ($found === null) throw new ApiError(404, 'not-found', 'No such group.');
            $found->label = $label;
            self::writeGroups($bookId, $row, $groups, $user);
            return $found;
        });
        Http::json(200, ['group' => $group]);
    }

    /**
     * DELETE /editor/books/{id}/groups/{gid} → { ungrouped, scenes }: ungroups – the group goes, its scenes stay in place
     * and in order, without a group. One step: nothing but the label goes. 404
     */
    public static function deleteGroup(string $bookId, string $groupId): never
    {
        $user = Editor::user();
        Books::bookRow($bookId);
        $scenes = Db::transaction(static function () use ($bookId, $groupId, $user) {
            $row = Books::bookRow($bookId, true);
            $groups = self::groups($row);
            $kept = array_values(array_filter($groups, static fn($g) => $g->id !== $groupId));
            if (count($kept) === count($groups)) throw new ApiError(404, 'not-found', 'No such group.');
            $scenes = [];
            foreach (self::rows($bookId, true) as $scene) {
                $data = Editor::decode($scene['data_json']);
                if (($data->group ?? null) !== $groupId) continue;
                unset($data->group);
                $json = Editor::encode($data);
                Db::run('UPDATE spreads SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $scene['id']]);
                Books::recordChange($bookId, $user, 'spread', (string) $scene['id'], $scene['data_json'], $json);
                $scenes[] = (string) $scene['id'];
            }
            self::writeGroups($bookId, $row, $kept, $user);
            return $scenes;
        });
        Http::json(200, ['ungrouped' => $groupId, 'scenes' => $scenes]);
    }

    private static function groupLabel(mixed $value): string
    {
        if (!is_string($value) || trim($value) === '') throw new ApiError(400, 'invalid-group', 'label must be a non-empty text.');
        $label = trim($value);
        if (mb_strlen($label) > BookTexts::TEXT_MAX_LENGTH) throw new ApiError(400, 'invalid-group', 'label is longer than ' . BookTexts::TEXT_MAX_LENGTH . ' characters.');
        return $label;
    }

    /**
     * The book's groups written back, with a change (`groups`) – inside the caller's transaction, the book row locked
     * @param array<string, mixed> $book
     * @param list<stdClass> $groups
     * @param array<string, mixed> $user
     */
    public static function writeGroups(string $bookId, array $book, array $groups, array $user): void
    {
        $json = Editor::encode(array_values($groups));
        Db::run('UPDATE books SET groups_json = :groups WHERE id = :id', ['groups' => $json, 'id' => $bookId]);
        Books::touchBook($bookId);
        Books::recordChange($bookId, $user, 'groups', $bookId, (string) ($book['groups_json'] ?? '[]'), $json);
    }

    // ── POST …/scenes/migrate ────────────────────────────────────────────────────────────────────

    /**
     * POST /editor/books/{id}/scenes/migrate { apply? } → { plan, applied }: a book's spreads become scenes (agents/SCENES.md
     * "Migration"). Every scene without surfaces gets them from its pages – a double page left and right, a single page
     * its side and the unnumbered half next to it, a cover its front or back –, labelled with the printed page numbers
     * (the covers, the front and back matter and the unnumbered halves: no label), sized as a page; the front and back
     * matter go into the groups `Front matter` / `Back matter`; every entry on a scene without a surface gets the surface
     * its page lies on. Order, pages, entries' scenes and the page images (#251 – phase 3 makes them surface references)
     * stay as they are. The plan: `scenes` (what each scene gets), `groups`, `entries` { placed, unplaced: the entries it
     * cannot place – on no scene, or a page that is no surface of their scene }, `counts`, `pageImages` (how many stay
     * keyed by page). Without `apply: true` nothing is written; with it everything in one transaction, a change per row.
     * Idempotent: a migrated book plans nothing.
     */
    public static function migrate(string $bookId): never
    {
        $user = Editor::user();
        Books::bookRow($bookId);
        // No body: the plan
        $body = trim((string) file_get_contents('php://input')) === '' ? new stdClass() : Editor::body();
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($bookId, $apply, $user): array {
            $book = Books::bookRow($bookId, $apply);
            $plan = self::migrationPlan($bookId, $book, $apply);
            if ($apply) self::applyMigration($bookId, $book, $plan, $user);
            unset($plan['write']);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply && !$plan['upToDate']]);
    }

    /**
     * What `migrate` would do; `write` = the rows to write (left out of the answer)
     * @param array<string, mixed> $book
     * @return array<string, mixed>
     */
    private static function migrationPlan(string $bookId, array $book, bool $lock): array
    {
        $context = self::context($bookId, $lock);
        $groups = self::groups($book);
        $groupIds = array_map(static fn($g) => (string) $g->id, $groups);
        $newGroups = [];
        $scenes = [];
        $writeScenes = [];
        /** page → surface id, per scene (the pages it was imported with) */
        $pageSurface = [];
        $surfaceCount = 0;
        foreach ($context['rows'] as $row) {
            $id = (string) $row['id'];
            $data = $context['data'][$id];
            $first = (int) $row['first_page'];
            $last = max($first, (int) $row['last_page']);
            $format = $data->format ?? 'spread';
            $matter = $format === 'spread' && in_array($data->matter ?? null, Books::MATTERS, true) ? $data->matter : null;
            $change = [];
            $existing = self::surfaces($data);
            if ($existing) {
                $map = [];
                foreach ($existing as $i => $s) {
                    $label = trim((string) ($s->label ?? ''));
                    if ($label !== '' && preg_match('/^-?\d+$/', $label)) $map[(int) $label] = (string) $s->id;
                }
                if (!$map && count($existing) === $last - $first + 1) foreach ($existing as $i => $s) $map[$first + $i] = (string) $s->id;
                $pageSurface[$id] = $map;
            } else {
                [$surfaces, $map] = self::surfacesFromPages($format, $matter, $first, $last);
                $pageSurface[$id] = $map;
                $change['surfaces'] = $surfaces;
                $surfaceCount += count($surfaces);
            }
            if ($matter !== null && !isset($data->group)) {
                $group = self::MATTER_GROUPS[$matter];
                if (!in_array($group['id'], $groupIds, true)) {
                    $groupIds[] = $group['id'];
                    $newGroups[] = (object) $group;
                }
                $change['group'] = $group['id'];
            }
            if ($change) {
                $scenes[] = ['scene' => $id] + $change;
                $writeScenes[$id] = $change;
            }
        }
        $placed = [];
        $unplaced = [];
        foreach (Db::run('SELECT id, spread_id, title, page, data_json FROM entries WHERE book_id = :book ORDER BY position, id', ['book' => $bookId])->fetchAll() as $row) {
            $entry = Editor::decode($row['data_json']);
            $scene = $row['spread_id'] === null ? null : (string) $row['spread_id'];
            $page = (int) $row['page'];
            $describe = ['id' => (string) $row['id'], 'title' => (string) $row['title'], 'page' => $page, 'scene' => $scene];
            if ($scene === null || !isset($context['data'][$scene])) {
                $unplaced[] = $describe + ['reason' => 'on no scene – its page lies in no spread'];
                continue;
            }
            $surfaceIds = isset($writeScenes[$scene]['surfaces']) ? array_map(static fn($s) => $s->id, $writeScenes[$scene]['surfaces']) : self::surfaceIds($context['data'][$scene]);
            if (is_string($entry->surface ?? null) && in_array($entry->surface, $surfaceIds, true)) continue;
            $surface = $pageSurface[$scene][$page] ?? null;
            if ($surface === null) {
                $unplaced[] = $describe + ['reason' => "page $page is no surface of its scene – it keeps its scene, without a surface"];
                continue;
            }
            $placed[] = ['entry' => (string) $row['id'], 'scene' => $scene, 'surface' => $surface];
        }
        $groupScenes = [];
        foreach ($context['rows'] as $row) {
            $group = $writeScenes[(string) $row['id']]['group'] ?? ($context['data'][(string) $row['id']]->group ?? null);
            if ($group !== null) $groupScenes[$group][] = (string) $row['id'];
        }
        $pageImages = (int) Db::value('SELECT COUNT(*) FROM page_images WHERE book_id = :book', ['book' => $bookId]);
        return [
            'upToDate' => !$scenes && !$newGroups && !$placed,
            'counts' => ['scenes' => count($context['rows']), 'scenesWithSurfaces' => count(array_filter($scenes, static fn($s) => isset($s['surfaces']))), 'surfaces' => $surfaceCount,
                'groups' => count($newGroups), 'entriesPlaced' => count($placed), 'entriesUnplaced' => count($unplaced)],
            'scenes' => $scenes,
            'groups' => array_map(static fn(stdClass $g) => ['id' => $g->id, 'label' => $g->label, 'scenes' => $groupScenes[$g->id] ?? [], 'new' => true], $newGroups),
            'entries' => ['placed' => $placed, 'unplaced' => $unplaced],
            'pageImages' => ['count' => $pageImages, 'note' => 'Page images stay keyed by page – POST …/scenes/references/migrate turns them into surface reference images (#314).'],
            'write' => ['scenes' => $writeScenes, 'groups' => $newGroups],
        ];
    }

    /**
     * A spread's surfaces from its pages, and which page lies on which surface
     * @return array{0: list<stdClass>, 1: array<int, string>}
     */
    public static function surfacesFromPages(string $format, ?string $matter, int $first, int $last): array
    {
        $surface = static function (string $id, string $side, ?int $label) {
            $s = (object) ['id' => $id, 'side' => $side, 'widthMm' => self::PAGE_MM['width'], 'heightMm' => self::PAGE_MM['height']];
            if ($label !== null) $s->label = (string) $label;
            return $s;
        };
        $numbered = $matter === null;
        if ($format === 'cover') return [[$surface('front', 'front', null)], [$first => 'front']];
        if ($format === 'back') return [[$surface('back', 'back', null)], [$first => 'back']];
        $count = $last - $first + 1;
        if ($count === 1) {
            // A single page and the unnumbered half of its sheet: an even page is a left-hand page (`Pages::pagesOf`)
            if ($first % 2 === 0) return [[$surface('left', 'left', $numbered ? $first : null), $surface('right', 'right', null)], [$first => 'left']];
            return [[$surface('left', 'left', null), $surface('right', 'right', $numbered ? $first : null)], [$first => 'right']];
        }
        $surfaces = [];
        $map = [];
        for ($page = $first; $page <= $last; $page++) {
            $i = $page - $first;
            [$id, $side] = match (true) {
                $i === 0 => ['left', 'left'],
                $page === $last => ['right', 'right'],
                $count === 3 => ['middle', 'middle'],
                default => ["middle-$i", 'middle'],
            };
            $surfaces[] = $surface($id, $side, $numbered ? $page : null);
            $map[$page] = $id;
        }
        return [$surfaces, $map];
    }

    /**
     * Writes a migration plan inside the transaction that made it
     * @param array<string, mixed> $book
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $user
     */
    private static function applyMigration(string $bookId, array $book, array $plan, array $user): void
    {
        if ($plan['upToDate']) return;
        if ($plan['write']['groups']) self::writeGroups($bookId, $book, [...self::groups($book), ...$plan['write']['groups']], $user);
        foreach ($plan['write']['scenes'] as $id => $change) {
            $row = Db::one('SELECT data_json FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $id]);
            $data = Editor::decode($row['data_json']);
            if (isset($change['surfaces'])) $data->surfaces = $change['surfaces'];
            if (isset($change['group'])) $data->group = $change['group'];
            $json = Editor::encode($data);
            Db::run('UPDATE spreads SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $id]);
            Books::recordChange($bookId, $user, 'spread', (string) $id, $row['data_json'], $json);
        }
        foreach ($plan['entries']['placed'] as $placed) {
            $row = Db::one('SELECT data_json FROM entries WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $placed['entry']]);
            $entry = Editor::decode($row['data_json']);
            $entry->surface = $placed['surface'];
            $json = Editor::encode($entry);
            Db::run('UPDATE entries SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $placed['entry']]);
            Books::recordChange($bookId, $user, 'entry', $placed['entry'], $row['data_json'], $json);
        }
        Books::touchBook($bookId);
    }
}
