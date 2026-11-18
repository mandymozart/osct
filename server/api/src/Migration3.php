<?php
declare(strict_types=1);

/**
 * The migration of a stored book from content schema 2.x to 3.0 (#319, agents/SCENES.md "Schema 3.0" – its migration
 * paragraph; the rules of scripts/src/convert-content-3.ts, which converted the fixtures): `POST /editor/books/{id}/migrate-3
 * { apply? }` – without `apply: true` the plan, nothing written; with it the plan made again and written in one
 * transaction, every row a change of the log. Idempotent: a 3.0 book plans nothing. Until a book is migrated its editing
 * routes answer 409 `migrate-first` (`Books::book`).
 *
 * Per scene (a `spreads` row of 2.x – its pages in `first_page` / `last_page`, its data the 2.x `SpreadData`):
 * - **Surfaces**: one per printed double page. A scene with 2.x surfaces (#307, #314) merges each run left [middle …]
 *   right into one joint surface (their widths added, `<left>-<right>` – or `surface` when it is the scene's only one);
 *   every other surface (a cover's front, a wall) stays one. A scene without surfaces gets one `surface`: twice the page's
 *   width for a double page, one page for a cover, the back cover or a single page. Surfaces lie in a row (`rowPlaces`);
 *   a free scene's surfaces keep their places (a joint one in the middle of its halves).
 * - **Label**: its own label, else what the reader showed – the title of a cover, the back cover or the front and back
 *   matter, else its pages (`186–187`, `1`). The front and back matter join the groups `Front matter` / `Back matter`
 *   unless they are in a group.
 * - **Entries** keep their scene, lose their page; a surface becomes its joint surface (none when the scene has one).
 *   An entry on no scene goes to the scene the book opens on (listed under `unmapped`).
 * - **Targets**: `print` becomes `place` on the joint surface – a target on the right page moves right by the left
 *   page's width (`x`); `print.page` and the side go. A target whose page lies on no surface keeps no place (`unmapped`).
 * - **Reference images**: the page images (#251) and the 2.x surfaces' references (#314) of a joint surface's halves
 *   are put together side by side into ONE image (GD; a new Library file `<scene>_<surface>.webp`, WebP as every upload,
 *   #298) and set as its reference; one image that covers a surface is its reference as it is. A 2.x reference wins over
 *   a page image of the same half. The `page_images` table is not read anywhere else any more (its rows stay).
 */
final class Migration3
{
    /** The change log's kind of the migration's own row (the schema before and after) */
    public const KIND = 'migration';
    /** The groups the front and back matter join */
    public const MATTER_GROUPS = ['front' => ['id' => 'front-matter', 'label' => 'Front matter'], 'back' => ['id' => 'back-matter', 'label' => 'Back matter']];

    /** Whether a content schema `MAJOR.MINOR` is the editor's (`Editor::CONTENT_SCHEMA_MAJOR`) */
    public static function isCurrent(string $schema): bool
    {
        return (int) explode('.', $schema)[0] === Editor::CONTENT_SCHEMA_MAJOR;
    }

    /** POST /editor/books/{id}/migrate-3 { apply? } → { plan, applied } (docs/server.md "The migration to schema 3.0") */
    public static function run(string $bookId): never
    {
        $user = Editor::user();
        Books::bookRow($bookId, false, true);
        $body = trim((string) file_get_contents('php://input')) === '' ? new stdClass() : Editor::body();
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($bookId, $apply, $user): array {
            $book = Books::bookRow($bookId, $apply, true);
            $plan = self::plan($bookId, $book, $apply);
            if ($apply && !$plan['upToDate']) self::apply($bookId, $book, $plan, $user);
            unset($plan['write']);
            return $plan;
        };
        $plan = $apply ? Db::transaction($run) : $run();
        Http::json(200, ['plan' => $plan, 'applied' => $apply && !$plan['upToDate']]);
    }

    /** What puts images together here: GD with WebP, else none */
    public static function imageTool(): ?string
    {
        return Images::available() ? 'gd' : null;
    }

    // ── The plan ─────────────────────────────────────────────────────────────────────────────────

    /**
     * @param array<string, mixed> $book
     * @return array<string, mixed>
     */
    public static function plan(string $bookId, array $book, bool $lock = false): array
    {
        $from = (string) $book['content_schema'];
        $empty = ['scenes' => 0, 'surfacesBefore' => 0, 'surfacesAfter' => 0, 'entries' => 0, 'targetsMoved' => 0, 'referencesAsIs' => 0, 'referencesCombined' => 0, 'unmapped' => 0];
        if (self::isCurrent($from)) {
            return ['upToDate' => true, 'schema' => ['from' => $from, 'to' => Editor::CONTENT_SCHEMA], 'counts' => $empty, 'scenes' => [], 'groups' => [], 'unmapped' => [], 'imageTool' => self::imageTool(), 'write' => null];
        }
        $page = Scenes::PAGE_MM;
        $rows = Scenes::rows($bookId, $lock);
        $groups = Scenes::groups($book);
        $groupIds = array_map(static fn($g) => (string) $g->id, $groups);
        $newGroups = [];
        $unmapped = [];
        $counts = $empty;
        $counts['scenes'] = count($rows);

        // Every page of the 2.x book: (page, facing) → its scene and side (the 2.x `Pages::pagesOf`)
        $pages = self::pagesOf($rows);
        $references = [];
        foreach (Db::run('SELECT scene_id, surface_id, url, name, fit FROM surface_references WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $references[(string) $row['scene_id']][(string) $row['surface_id']] = $row;
        }
        $pageImages = Db::run('SELECT page, facing, url, name FROM page_images WHERE book_id = :book ORDER BY page, facing', ['book' => $bookId])->fetchAll();

        $scenes = [];
        $write = ['scenes' => [], 'entries' => [], 'targets' => [], 'references' => [], 'groups' => []];
        /** Per scene: old surface id / side → [new surface id, offset mm, width mm] */
        $mapOf = [];
        $matterCount = ['front' => 0, 'back' => 0];
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $data = Editor::decode($row['data_json']);
            if (!$data instanceof stdClass) $data = new stdClass();
            $first = (int) $row['first_page'];
            $last = max($first, (int) $row['last_page']);
            $format = is_string($data->format ?? null) ? $data->format : 'spread';
            $matter = $format === 'spread' && in_array($data->matter ?? null, ['front', 'back'], true) ? $data->matter : null;
            if ($matter !== null) $matterCount[$matter]++;
            $old = Scenes::surfaces($data);
            $before = [];
            $after = [];
            /** @var array<string, array{0: string, 1: float, 2: float}> $bySurface old id → new */
            $bySurface = [];
            /** @var array<string, array{0: string, 1: float, 2: float}|null> $bySide side → new (a page's side) */
            $bySide = [];
            if ($old) {
                foreach ($old as $s) {
                    $before[] = ['id' => (string) $s->id, 'side' => is_string($s->side ?? null) ? $s->side : null, 'label' => isset($s->label) ? (string) $s->label : null,
                        'widthMm' => (float) ($s->widthMm ?? $page['width']), 'heightMm' => (float) ($s->heightMm ?? $page['height'])];
                }
                // Runs left [middle …] right become one joint surface
                $groupsOfSurfaces = [];
                $run = [];
                foreach ($old as $s) {
                    $side = $s->side ?? null;
                    if ($side === 'left') {
                        if ($run) foreach ($run as $r) $groupsOfSurfaces[] = [$r];
                        $run = [$s];
                    } elseif ($side === 'middle' && $run) {
                        $run[] = $s;
                    } elseif ($side === 'right' && $run) {
                        $run[] = $s;
                        $groupsOfSurfaces[] = $run;
                        $run = [];
                    } else {
                        if ($run) foreach ($run as $r) $groupsOfSurfaces[] = [$r];
                        $run = [];
                        $groupsOfSurfaces[] = [$s];
                    }
                }
                if ($run) foreach ($run as $r) $groupsOfSurfaces[] = [$r];
                $free = ($data->layout ?? null) === 'free';
                foreach ($groupsOfSurfaces as $members) {
                    $newId = count($groupsOfSurfaces) === 1 ? 'surface' : implode('-', array_map(static fn($m) => (string) $m->id, count($members) > 1 ? [$members[0], $members[count($members) - 1]] : $members));
                    $width = 0.0;
                    $height = 0.0;
                    $labels = [];
                    foreach ($members as $m) {
                        $w = (float) ($m->widthMm ?? $page['width']);
                        $bySurface[(string) $m->id] = [$newId, $width, $w];
                        if (is_string($m->side ?? null) && !isset($bySide[$m->side])) $bySide[$m->side] = [$newId, $width, $w];
                        elseif (is_string($m->side ?? null)) $bySide[$m->side] = null; // two surfaces on one side: a page cannot tell
                        $width += $w;
                        $height = max($height, (float) ($m->heightMm ?? $page['height']));
                        if (trim((string) ($m->label ?? '')) !== '') $labels[] = trim((string) $m->label);
                    }
                    $surface = (object) ['id' => $newId];
                    if ($labels) $surface->label = count($labels) > 1 ? $labels[0] . '–' . $labels[count($labels) - 1] : $labels[0];
                    $surface->widthMm = self::number($width);
                    $surface->heightMm = self::number($height);
                    $places = array_values(array_filter(array_map(static fn($m) => ($m->place ?? null) instanceof stdClass ? $m->place : null, $members)));
                    if ($free && count($places) === count($members)) {
                        $mean = static fn(string $k) => self::number(array_sum(array_map(static fn($p) => (float) ($p->{$k} ?? 0), $places)) / count($places));
                        $surface->place = (object) ['x' => $mean('x'), 'y' => $mean('y'), 'z' => $mean('z'),
                            'rx' => self::number((float) ($places[0]->rx ?? 0)), 'ry' => self::number((float) ($places[0]->ry ?? 0)), 'rz' => self::number((float) ($places[0]->rz ?? 0))];
                    }
                    $after[] = ['surface' => $surface, 'from' => array_map(static fn($m) => (string) $m->id, $members)];
                }
            } else {
                $wide = $format === 'cover' || $format === 'back' || $first === $last ? 1 : 2;
                $sides = [];
                foreach ($pages as $p) if ($p['spread'] === $id) $sides[] = $p;
                foreach ($sides as $p) {
                    $before[] = ['id' => $p['label'], 'side' => null, 'label' => $p['label'], 'widthMm' => (float) $page['width'], 'heightMm' => (float) $page['height']];
                }
                $after[] = ['surface' => (object) ['id' => 'surface', 'widthMm' => $page['width'] * $wide, 'heightMm' => $page['height']], 'from' => array_map(static fn($p) => $p['label'], $sides)];
                foreach ($sides as $p) {
                    if ($wide === 2) $bySide[$p['side']] = ['surface', $p['side'] === 'right' ? (float) $page['width'] : 0.0, (float) $page['width']];
                    // One page wide: the printed page; the unnumbered half next to a single page has no surface
                    elseif ($p['kind'] !== 'facing') $bySide[$p['side']] = ['surface', 0.0, (float) $page['width']];
                }
            }
            // Places: a row (a free scene's placed surfaces keep theirs)
            $row3 = Scenes::rowPlaces(array_map(static fn($a) => (float) $a['surface']->widthMm, $after));
            foreach ($after as $i => $a) if (!isset($a['surface']->place)) $a['surface']->place = $row3[$i];
            $counts['surfacesBefore'] += count($before);
            $counts['surfacesAfter'] += count($after);
            $newIds = array_map(static fn($a) => (string) $a['surface']->id, $after);
            $mapOf[$id] = ['surface' => $bySurface, 'side' => $bySide, 'ids' => $newIds];

            // The label and the group
            $label = trim((string) ($data->label ?? ''));
            if ($label === '') {
                $unnumbered = $format !== 'spread' || $matter !== null;
                $title = trim((string) ($data->title ?? ''));
                if ($unnumbered) {
                    $label = $title !== '' && !preg_match('/^(?:pages?\s*)?-?\d+(?:\s*[-–—]\s*-?\d+)?$/iu', $title) ? $title
                        : ($format === 'cover' ? 'Cover' : ($format === 'back' ? 'Back cover' : ucfirst((string) $matter) . ' matter ' . $matterCount[(string) $matter]));
                } else {
                    $label = $first === $last ? (string) $first : "{$first}–{$last}";
                }
            }
            $group = is_string($data->group ?? null) && in_array($data->group, $groupIds, true) ? $data->group : null;
            $joins = null;
            if ($group === null && $matter !== null) {
                $g = self::MATTER_GROUPS[$matter];
                if (!in_array($g['id'], $groupIds, true)) {
                    $groupIds[] = $g['id'];
                    $newGroups[$g['id']] = ['id' => $g['id'], 'label' => $g['label'], 'scenes' => []];
                }
                $group = $joins = $g['id'];
            }
            if (isset($newGroups[$group])) $newGroups[$group]['scenes'][] = $id;
            $scene = (object) ['id' => $id, 'label' => $label];
            if ($group !== null) $scene->group = $group;
            $scene->surfaces = array_map(static fn($a) => $a['surface'], $after);
            foreach (get_object_vars($data) as $key => $value) {
                if (in_array($key, ['id', 'label', 'group', 'surfaces', 'title', 'firstPage', 'lastPage', 'format', 'matter', 'layout'], true)) continue;
                $scene->{$key} = $value;
            }
            $write['scenes'][$id] = ['before' => $row['data_json'], 'scene' => $scene];
            $summary = ['scene' => $id, 'label' => $label,
                'before' => ['title' => (string) ($data->title ?? ''), 'firstPage' => $first, 'lastPage' => $last, 'format' => $format, 'matter' => $matter, 'surfaces' => $before],
                'after' => array_map(static fn($a) => (object) (get_object_vars($a['surface']) + ['from' => $a['from']]), $after)];
            if ($joins !== null) $summary['group'] = $joins;
            $summary += ['entries' => 0, 'targets' => [], 'references' => []];
            $scenes[$id] = $summary;
        }

        // Entries and their targets
        $initial = (string) $book['initial_spread_id'];
        $targets = [];
        foreach (Db::run('SELECT * FROM targets WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $t) $targets[(string) $t['entry_id']] = $t;
        foreach (Db::run('SELECT * FROM entries WHERE book_id = :book ORDER BY position, id', ['book' => $bookId])->fetchAll() as $e) {
            $entryId = (string) $e['id'];
            $data = Editor::decode($e['data_json']);
            $sceneId = $e['spread_id'] === null ? null : (string) $e['spread_id'];
            if ($sceneId === null || !isset($scenes[$sceneId])) {
                $unmapped[] = ['kind' => 'entry', 'ref' => $entryId, 'scene' => $sceneId, 'reason' => "on no scene (page {$e['page']}) – it goes to the scene the book opens on, \"$initial\"; move it"];
                $sceneId = $initial;
            }
            $map = $mapOf[$sceneId] ?? ['surface' => [], 'side' => [], 'ids' => []];
            $scenes[$sceneId]['entries']++;
            $counts['entries']++;
            $entry = clone $data;
            unset($entry->page, $entry->scene);
            $oldSurface = is_string($data->surface ?? null) ? $data->surface : null;
            unset($entry->surface);
            if ($oldSurface !== null && count($map['ids']) > 1 && isset($map['surface'][$oldSurface])) $entry->surface = $map['surface'][$oldSurface][0];
            $write['entries'][$entryId] = ['before' => $e['data_json'], 'entry' => self::entryOrder($entry), 'scene' => $sceneId];
            $t = $targets[$entryId] ?? null;
            if ($t === null) continue;
            $target = Editor::decode($t['data_json']);
            $print = $target->print ?? null;
            unset($target->print);
            if ($print instanceof stdClass) {
                $to = null;
                if (is_string($print->surfaceId ?? null) && isset($map['surface'][$print->surfaceId])) $to = $map['surface'][$print->surfaceId];
                elseif (is_string($print->surface ?? null) && array_key_exists($print->surface, $map['side'])) $to = $map['side'][$print->surface];
                if ($to === null) {
                    $unmapped[] = ['kind' => 'target', 'ref' => (string) $t['id'], 'scene' => $sceneId, 'reason' => 'printed on ' . ($print->surfaceId ?? $print->surface ?? '?') . ' – no surface of the scene holds it; it keeps no place'];
                } else {
                    $place = new stdClass();
                    if (count($map['ids']) > 1) $place->surface = $to[0];
                    $place->x = self::number((float) ($print->x ?? 0) + $to[1]);
                    $place->y = self::number((float) ($print->y ?? 0));
                    $place->width = self::number((float) ($print->width ?? 0));
                    if (isset($print->height)) $place->height = self::number((float) $print->height);
                    $target = self::withPlace($target, $place);
                    if ($to[1] != 0) {
                        $scenes[$sceneId]['targets'][] = ['target' => (string) $t['id'], 'entry' => $entryId, 'from' => ['surface' => (string) ($print->surfaceId ?? $print->surface ?? ''), 'x' => $print->x ?? 0],
                            'to' => ['surface' => $to[0], 'x' => $place->x]];
                        $counts['targetsMoved']++;
                    }
                }
            }
            $write['targets'][(string) $t['id']] = ['before' => $t['data_json'], 'target' => $target];
        }

        // Reference images: per new surface the pieces of its halves
        $pieces = [];
        foreach ($references as $sceneId => $bySurface) {
            foreach ($bySurface as $surfaceId => $ref) {
                $to = $mapOf[$sceneId]['surface'][$surfaceId] ?? null;
                if ($to === null) {
                    if (isset($mapOf[$sceneId])) $unmapped[] = ['kind' => 'reference', 'ref' => "$sceneId/$surfaceId", 'scene' => $sceneId, 'reason' => 'its surface is no surface of the scene any more – left out'];
                    continue;
                }
                $pieces[$sceneId][$to[0]][(string) $to[1]] = ['source' => 'reference', 'label' => $surfaceId, 'url' => (string) $ref['url'], 'name' => (string) $ref['name'], 'offsetMm' => self::number($to[1]), 'widthMm' => self::number($to[2]), 'fit' => (string) $ref['fit']];
            }
        }
        foreach ($pageImages as $image) {
            $key = (int) $image['page'] . ((int) $image['facing'] ? 'f' : '');
            $p = $pages[$key] ?? null;
            $ref = $key;
            if ($p === null) {
                $unmapped[] = ['kind' => 'page-image', 'ref' => $ref, 'scene' => null, 'reason' => 'no page of the book any more – left out'];
                continue;
            }
            $ref = $p['label'];
            $to = $mapOf[$p['spread']]['side'][$p['side']] ?? null;
            if ($to === null) {
                $unmapped[] = ['kind' => 'page-image', 'ref' => $ref, 'scene' => $p['spread'], 'reason' => "no surface of the scene holds the page's side ({$p['side']}) – left out"];
                continue;
            }
            if (isset($pieces[$p['spread']][$to[0]][(string) $to[1]])) {
                $unmapped[] = ['kind' => 'page-image', 'ref' => $ref, 'scene' => $p['spread'], 'reason' => 'its half has a reference image of its own – that one is kept'];
                continue;
            }
            $pieces[$p['spread']][$to[0]][(string) $to[1]] = ['source' => 'page-image', 'label' => $ref, 'url' => (string) $image['url'], 'name' => (string) $image['name'], 'offsetMm' => self::number($to[1]), 'widthMm' => self::number($to[2]), 'fit' => SurfaceReferences::FIT_DEFAULT];
        }
        foreach ($pieces as $sceneId => $bySurface) {
            foreach ($bySurface as $surfaceId => $list) {
                ksort($list, SORT_NUMERIC);
                $list = array_values($list);
                $width = 0.0;
                foreach ($write['scenes'][$sceneId]['scene']->surfaces as $s) if ($s->id === $surfaceId) $width = (float) $s->widthMm;
                $asIs = count($list) === 1 && (float) $list[0]['offsetMm'] == 0.0 && abs((float) $list[0]['widthMm'] - $width) < 0.5;
                $scenes[$sceneId]['references'][] = ['surface' => $surfaceId, 'result' => $asIs ? 'as-is' : 'combined',
                    'pieces' => array_map(static fn(array $piece) => array_diff_key($piece, ['fit' => true]), $list)];
                $write['references'][] = ['scene' => $sceneId, 'surface' => $surfaceId, 'asIs' => $asIs, 'pieces' => $list, 'widthMm' => $width,
                    'heightMm' => (float) (array_values(array_filter($write['scenes'][$sceneId]['scene']->surfaces, static fn($s) => $s->id === $surfaceId))[0]->heightMm ?? Scenes::PAGE_MM['height'])];
                $counts[$asIs ? 'referencesAsIs' : 'referencesCombined']++;
            }
        }
        $counts['unmapped'] = count($unmapped);
        $write['groups'] = array_map(static fn(array $g) => (object) ['id' => $g['id'], 'label' => $g['label']], array_values($newGroups));
        return [
            'upToDate' => false,
            'schema' => ['from' => $from, 'to' => Editor::CONTENT_SCHEMA],
            'counts' => $counts,
            'scenes' => array_values($scenes),
            'groups' => array_values($newGroups),
            'unmapped' => $unmapped,
            'imageTool' => self::imageTool(),
            'write' => $write,
        ];
    }

    /**
     * Every page of a 2.x book in its order: (page, facing) key → { page, facing, spread, side, kind, label } – the covers,
     * the front and back matter (`F1`, `B1` …), the numbered pages and the unnumbered half next to a single page
     * @param list<array<string, mixed>> $rows
     * @return array<string, array{page: int, facing: bool, spread: string, side: string, kind: string, label: string}>
     */
    public static function pagesOf(array $rows): array
    {
        $pages = [];
        $front = 0;
        $back = 0;
        foreach ($rows as $row) {
            $data = Editor::decode($row['data_json']);
            $format = is_object($data) ? ($data->format ?? 'spread') : 'spread';
            $matter = $format === 'spread' && is_object($data) && in_array($data->matter ?? null, ['front', 'back'], true) ? $data->matter : null;
            $first = (int) $row['first_page'];
            $last = (int) $row['last_page'];
            $id = (string) $row['id'];
            $add = static function (int $page, bool $facing, string $side, string $kind, string $label) use (&$pages, $id): void {
                $pages[$page . ($facing ? 'f' : '')] ??= ['page' => $page, 'facing' => $facing, 'spread' => $id, 'side' => $side, 'kind' => $kind, 'label' => $label];
            };
            if ($format === 'cover') $add($first, false, 'front', 'cover', 'Cover');
            elseif ($format === 'back') $add($first, false, 'back', 'back', 'Back cover');
            elseif ($matter !== null) {
                foreach (array_unique([$first, $last]) as $i => $p) $add($p, false, $i === 0 ? 'left' : 'right', "$matter-matter", $matter === 'front' ? 'F' . (++$front) : 'B' . (++$back));
            } elseif ($last > $first) {
                $add($first, false, 'left', 'page', (string) $first);
                $add($last, false, 'right', 'page', (string) $last);
            } elseif ($first % 2 === 0) {
                $add($first, false, 'left', 'page', (string) $first);
                $add($first, true, 'right', 'facing', "next to $first");
            } else {
                $add($first, true, 'left', 'facing', "next to $first");
                $add($first, false, 'right', 'page', (string) $first);
            }
        }
        return $pages;
    }

    /** An entry's fields in the content's order: id, category, title, surface, then the rest */
    private static function entryOrder(stdClass $entry): stdClass
    {
        $result = new stdClass();
        foreach (['id', 'category', 'title', 'surface'] as $key) if (property_exists($entry, $key)) $result->{$key} = $entry->{$key};
        foreach (get_object_vars($entry) as $key => $value) if (!property_exists($result, $key)) $result->{$key} = $value;
        return $result;
    }

    /** The target with its `place` where its `print` was (after imageSrc) */
    private static function withPlace(stdClass $target, stdClass $place): stdClass
    {
        $result = new stdClass();
        foreach (get_object_vars($target) as $key => $value) {
            $result->{$key} = $value;
            if ($key === 'imageSrc') $result->place = $place;
        }
        if (!property_exists($result, 'place')) $result->place = $place;
        return $result;
    }

    /** A whole number as an int (JSON `230`, not `230.0`) */
    private static function number(float $value): int|float
    {
        $value = round($value, 3);
        return $value == (int) $value ? (int) $value : $value;
    }

    // ── Writing ──────────────────────────────────────────────────────────────────────────────────

    /**
     * Writes a plan inside the transaction that made it: the combined reference images first (new Library files – a store
     * cannot roll back, so a failed write leaves them unused in the Library), then every row with a change
     * @param array<string, mixed> $book
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $user
     */
    private static function apply(string $bookId, array $book, array &$plan, array $user): void
    {
        $write = $plan['write'];
        $combined = array_filter($write['references'], static fn(array $r) => !$r['asIs']);
        if ($combined && self::imageTool() === null) {
            throw new ApiError(409, 'no-image-tool', 'Reference images have to be put together, and this server has no GD with WebP – nothing was migrated.', ['plan' => array_diff_key($plan, ['write' => true])]);
        }
        $urls = [];
        foreach ($write['references'] as $r) {
            $key = "{$r['scene']}/{$r['surface']}";
            $urls[$key] = $r['asIs'] ? $r['pieces'][0]['url'] : self::combine($bookId, $r, $user);
        }
        foreach ($plan['scenes'] as $i => $scene) {
            foreach ($scene['references'] as $j => $reference) $plan['scenes'][$i]['references'][$j]['url'] = $urls["{$scene['scene']}/{$reference['surface']}"];
        }

        if ($write['groups']) Scenes::writeGroups($bookId, $book, [...Scenes::groups($book), ...$write['groups']], $user);
        foreach ($write['scenes'] as $id => $s) {
            $json = Editor::encode($s['scene']);
            Db::run('UPDATE spreads SET title = :title, first_page = 0, last_page = 0, data_json = :data WHERE book_id = :book AND id = :id',
                ['title' => $s['scene']->label, 'data' => $json, 'book' => $bookId, 'id' => $id]);
            Books::recordChange($bookId, $user, Scenes::KIND, (string) $id, $s['before'], $json);
            // The 2.x surfaces' references go; the new ones follow
            foreach (Db::run('SELECT surface_id, url, name, fit FROM surface_references WHERE book_id = :book AND scene_id = :scene', ['book' => $bookId, 'scene' => $id])->fetchAll() as $old) {
                SurfaceReferences::write($bookId, (string) $id, (string) $old['surface_id'], null, null);
                Books::recordChange($bookId, $user, SurfaceReferences::KIND, SurfaceReferences::ref((string) $id, (string) $old['surface_id']),
                    Editor::encode(['url' => $old['url'], 'name' => $old['name'], 'fit' => $old['fit']]), 'null');
            }
        }
        foreach ($write['references'] as $r) {
            $first = $r['pieces'][0];
            $reference = ['url' => $urls["{$r['scene']}/{$r['surface']}"], 'name' => $r['asIs'] ? $first['name'] : "{$r['scene']}_{$r['surface']}.webp", 'fit' => $r['asIs'] ? $first['fit'] : SurfaceReferences::FIT_DEFAULT];
            SurfaceReferences::write($bookId, $r['scene'], $r['surface'], $reference, $user['id']);
            Books::recordChange($bookId, $user, SurfaceReferences::KIND, SurfaceReferences::ref($r['scene'], $r['surface']), 'null', Editor::encode($reference));
        }
        foreach ($write['entries'] as $id => $e) {
            $json = Editor::encode($e['entry']);
            Db::run('UPDATE entries SET spread_id = :scene, page = 0, data_json = :data WHERE book_id = :book AND id = :id', ['scene' => $e['scene'], 'data' => $json, 'book' => $bookId, 'id' => $id]);
            Books::recordChange($bookId, $user, 'entry', (string) $id, $e['before'], $json);
        }
        foreach ($write['targets'] as $id => $t) {
            $json = Editor::encode($t['target']);
            if ($json === $t['before']) continue;
            Db::run('UPDATE targets SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $id]);
            Books::recordChange($bookId, $user, 'target', (string) $id, $t['before'], $json);
        }
        Db::run('UPDATE books SET content_schema = :schema WHERE id = :id', ['schema' => Editor::CONTENT_SCHEMA, 'id' => $bookId]);
        Books::touchBook($bookId);
        Books::recordChange($bookId, $user, self::KIND, $bookId, Editor::encode(['schema' => $book['content_schema']]), Editor::encode(['schema' => Editor::CONTENT_SCHEMA]));
    }

    /**
     * The pieces of a surface's reference put together side by side: a canvas of the surface's proportions (as high as the
     * highest piece, at most the image rule's longest side for a reference), each piece drawn over its part, the rest
     * white – stored as a new Library file `<scene>_<surface>.webp`; returns its URL
     * @param array<string, mixed> $r
     * @param array<string, mixed> $user
     */
    private static function combine(string $bookId, array $r, array $user): string
    {
        $images = [];
        $height = 1;
        foreach ($r['pieces'] as $piece) {
            $bytes = self::bytesOf($bookId, (string) $piece['url']);
            $image = $bytes === null ? false : @imagecreatefromstring($bytes);
            if ($image === false) throw new ApiError(502, 'reference-unreadable', "The image {$piece['url']} ({$piece['label']}) could not be read – nothing was migrated.", ['url' => $piece['url']]);
            $images[] = [$piece, $image];
            $height = max($height, imagesy($image));
        }
        $width = (int) max(1, round($height * $r['widthMm'] / max(1.0, $r['heightMm'])));
        $max = Assets::IMAGE_MAX_SIDE['reference'];
        $scale = min(1.0, $max / max($width, $height));
        $width = (int) max(1, round($width * $scale));
        $height = (int) max(1, round($height * $scale));
        $canvas = imagecreatetruecolor($width, $height);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        foreach ($images as [$piece, $image]) {
            $x = (int) round($piece['offsetMm'] / $r['widthMm'] * $width);
            $w = (int) max(1, round($piece['widthMm'] / $r['widthMm'] * $width));
            imagecopyresampled($canvas, $image, $x, 0, 0, 0, $w, $height, imagesx($image), imagesy($image));
        }
        ob_start();
        imagewebp($canvas, null, Assets::IMAGE_WEBP_QUALITY);
        $data = (string) ob_get_clean();
        return Assets::storeMade($bookId, "{$r['scene']}_{$r['surface']}.webp", 'webp', $data, $user);
    }

    /** The bytes of an image the book names: a Library file from its store, an imported one below the assets base, else by URL */
    private static function bytesOf(string $bookId, string $url): ?string
    {
        $row = Db::one('SELECT path FROM asset_versions WHERE url = :url', ['url' => $url]);
        if ($row) return ContentStore::for(Assets::STORE_ENV)->get((string) $row['path']);
        if (str_starts_with($url, '/assets/content/')) {
            $base = rtrim((string) Db::value('SELECT assets_base FROM books WHERE id = :id', ['id' => $bookId]), '/');
            if ($base === '') return null;
            $url = $base . $url;
        }
        if (!preg_match('#^https?://#', $url)) return null;
        $bytes = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 30]]));
        return $bytes === false ? null : $bytes;
    }
}
