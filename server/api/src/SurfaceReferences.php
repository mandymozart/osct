<?php
declare(strict_types=1);

/**
 * A surface's reference image (#314, agents/SCENES.md "Surfaces: create, edit, place", docs/server.md "Surface reference
 * images"): one image of the book's Library per surface of a scene – what the editor's stage shows on that surface (a
 * scanned page, a photo of the wall). **Editor-only**: no content – the draft, its publish and the reader never carry
 * it. Kept in `surface_references` by book, scene and surface, with how it fills the surface (`fit`).
 *
 * - The scenes overview (`GET …/scenes`) shows it as `surfaces[].reference` { url, name, fit } (null: none).
 * - `PUT …/scenes/{id}/surfaces/{surfaceId}/reference { url | null, fit?, name? }` sets, replaces or removes it.
 * - Every set, replace and remove is a change of the book's log (kind `reference`, ref `<scene>/<surface>`, before /
 *   after { url, name, fit } or null) – revertable both ways (#312, `Reverts`).
 * - A surface removed from its scene (`PUT …/scenes/{id} { surfaces }`) and a deleted scene take their references
 *   with them (a change each). A reference whose surface is gone otherwise (a re-import, a reverted surfaces list) is
 *   left alone and shown nowhere – the surface coming back brings it back.
 * - A use of its Library file (`AssetNames::usesOf`, kind `reference`): counted, relinked when the file is replaced,
 *   removed with a forced delete of the file; it names the file `<scene>_<surface>` (#298).
 * - The page images (#251) became references with the migration to the content schema 3.0 (`Migration3`, #319).
 */
final class SurfaceReferences
{
    /** How the image fills its surface: cut to cover it, fit inside it, stretched to it */
    public const FITS = ['cover', 'contain', 'stretch'];
    public const FIT_DEFAULT = 'cover';
    /** The longest name */
    public const NAME_MAX = 255;
    /** The change log's kind */
    public const KIND = 'reference';

    // ── Reading ──────────────────────────────────────────────────────────────────────────────────

    /**
     * The book's references by scene and surface: [scene][surface] → { url, name, fit }
     * @return array<string, array<string, array{url: string, name: string, fit: string}>>
     */
    public static function byScene(string $bookId): array
    {
        $refs = [];
        foreach (Db::run('SELECT scene_id, surface_id, url, name, fit FROM surface_references WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $refs[(string) $row['scene_id']][(string) $row['surface_id']] = self::shape($row);
        }
        return $refs;
    }

    /** @return array{url: string, name: string, fit: string}|null one surface's reference */
    public static function one(string $bookId, string $sceneId, string $surfaceId, bool $lock = false): ?array
    {
        $row = Db::one('SELECT url, name, fit FROM surface_references WHERE book_id = :book AND scene_id = :scene AND surface_id = :surface' . ($lock ? Db::forUpdate() : ''),
            ['book' => $bookId, 'scene' => $sceneId, 'surface' => $surfaceId]);
        return $row ? self::shape($row) : null;
    }

    /**
     * @param array<string, mixed> $row
     * @return array{url: string, name: string, fit: string}
     */
    private static function shape(array $row): array
    {
        $fit = (string) $row['fit'];
        return ['url' => (string) $row['url'], 'name' => (string) $row['name'], 'fit' => in_array($fit, self::FITS, true) ? $fit : self::FIT_DEFAULT];
    }

    /** The change log's ref of a surface: `<scene>/<surface>` */
    public static function ref(string $sceneId, string $surfaceId): string
    {
        return "$sceneId/$surfaceId";
    }

    /** @return array{0: string, 1: string} a ref's scene and surface */
    public static function split(string $ref): array
    {
        $parts = explode('/', $ref, 2);
        return [$parts[0], $parts[1] ?? ''];
    }

    /** Whether the scene still has the surface */
    public static function surfaceExists(string $bookId, string $sceneId, string $surfaceId): bool
    {
        $row = Db::one('SELECT data_json FROM spreads WHERE book_id = :book AND id = :id', ['book' => $bookId, 'id' => $sceneId]);
        if (!$row) return false;
        $data = Editor::decode($row['data_json']);
        return $data instanceof stdClass && in_array($surfaceId, Scenes::surfaceIds($data), true);
    }

    // ── PUT …/scenes/{id}/surfaces/{surfaceId}/reference ─────────────────────────────────────────

    /**
     * PUT /editor/books/{id}/scenes/{sceneId}/surfaces/{surfaceId}/reference { url?: string | null, fit?, name? }
     * → { scene, surface, reference: { url, name, fit } | null, changed }: `url` sets or replaces the surface's reference
     * image (an image of the book's Library – its URL, or an imported file's content path `/assets/content/…`), null
     * removes it; `fit` (cover | contain | stretch – default cover, a replace keeps the one it had) and `name` (default
     * the Library's name) without `url` change the present reference. A change is recorded (kind `reference`). 400
     * `invalid-reference`; 404 no such scene or surface, or nothing to change the fit or name of.
     */
    public static function put(string $bookId, string $sceneId, string $surfaceId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        $hasUrl = property_exists($body, 'url');
        $fit = null;
        if (property_exists($body, 'fit') && $body->fit !== null) {
            if (!in_array($body->fit, self::FITS, true)) throw new ApiError(400, 'invalid-reference', 'fit must be one of ' . implode(', ', self::FITS) . '.');
            $fit = (string) $body->fit;
        }
        $name = property_exists($body, 'name') && $body->name !== null ? self::name($body->name) : null;
        if (!$hasUrl && $fit === null && $name === null) throw new ApiError(400, 'invalid-reference', 'Send { url } (null removes it), { fit } or { name }.');
        $url = null;
        $libraryName = null;
        if ($hasUrl && $body->url !== null) [$url, $libraryName] = self::image($bookId, $body->url);
        [$reference, $changed] = Db::transaction(static function () use ($bookId, $sceneId, $surfaceId, $hasUrl, $url, $fit, $name, $libraryName, $user) {
            $row = Db::one('SELECT data_json FROM spreads WHERE book_id = :book AND id = :id' . Db::forUpdate(), ['book' => $bookId, 'id' => $sceneId]);
            if (!$row) throw new ApiError(404, 'not-found', 'No such scene.');
            $data = Editor::decode($row['data_json']);
            if (!$data instanceof stdClass || !in_array($surfaceId, Scenes::surfaceIds($data), true)) throw new ApiError(404, 'not-found', "The scene has no surface \"$surfaceId\".");
            $before = self::one($bookId, $sceneId, $surfaceId, true);
            if ($hasUrl && $url === null) $after = null;
            elseif ($hasUrl) $after = ['url' => $url, 'name' => $name ?? self::fit((string) $libraryName), 'fit' => $fit ?? ($before['fit'] ?? self::FIT_DEFAULT)];
            else {
                if ($before === null) throw new ApiError(404, 'not-found', 'The surface has no reference image – set one with { url }.');
                $after = ['url' => $before['url'], 'name' => $name ?? $before['name'], 'fit' => $fit ?? $before['fit']];
            }
            if ($before === $after) return [$after, false];
            self::write($bookId, $sceneId, $surfaceId, $after, $user['id']);
            Books::recordChange($bookId, $user, self::KIND, self::ref($sceneId, $surfaceId), Editor::encode($before), Editor::encode($after));
            return [$after, true];
        });
        Http::json(200, ['scene' => $sceneId, 'surface' => $surfaceId, 'reference' => $reference, 'changed' => $changed]);
    }

    /**
     * A reference's URL and the Library's name for it: an image of the book's Library by its URL, or an imported one by
     * its content path (`/assets/content/…` – what the rows hold below the assets base), else 400
     * @return array{0: string, 1: string}
     */
    public static function image(string $bookId, mixed $url): array
    {
        if (!is_string($url) || trim($url) === '') throw new ApiError(400, 'invalid-reference', 'url must be the URL of an image of the book\'s Library (or null to remove it).');
        $images = Assets::imageNames($bookId);
        if (array_key_exists($url, $images)) return [$url, $images[$url]];
        if (str_starts_with($url, '/assets/content/')) {
            $base = rtrim((string) Db::value('SELECT assets_base FROM books WHERE id = :id', ['id' => $bookId]), '/');
            if ($base !== '' && array_key_exists($base . $url, $images)) return [$url, $images[$base . $url]];
        }
        throw new ApiError(400, 'invalid-reference', 'url is no image of the book\'s Library.');
    }

    private static function name(mixed $value): string
    {
        if (!is_string($value)) throw new ApiError(400, 'invalid-reference', 'name must be text.');
        $name = trim((string) preg_replace('/\s+/u', ' ', $value));
        if ($name === '' || mb_strlen($name) > self::NAME_MAX) throw new ApiError(400, 'invalid-reference', 'name must be 1–' . self::NAME_MAX . ' characters.');
        return $name;
    }

    /** A Library name cut to NAME_MAX */
    private static function fit(string $name): string
    {
        $name = trim($name);
        return mb_strlen($name) > self::NAME_MAX ? mb_substr($name, 0, self::NAME_MAX) : ($name === '' ? 'reference' : $name);
    }

    /**
     * Writes a surface's reference (null removes it) – inside the caller's transaction, no change recorded
     * @param array{url: string, name: string, fit: string}|null $reference
     */
    public static function write(string $bookId, string $sceneId, string $surfaceId, ?array $reference, ?string $by): void
    {
        $key = ['book' => $bookId, 'scene' => $sceneId, 'surface' => $surfaceId];
        Db::run('DELETE FROM surface_references WHERE book_id = :book AND scene_id = :scene AND surface_id = :surface', $key);
        if ($reference === null) return;
        Db::run('INSERT INTO surface_references (book_id, scene_id, surface_id, url, name, fit, updated_by, updated_at) VALUES (:book, :scene, :surface, :url, :name, :fit, :by, :at)',
            $key + ['url' => $reference['url'], 'name' => $reference['name'], 'fit' => $reference['fit'], 'by' => $by, 'at' => Editor::nowMs()]);
    }

    // ── Hooks of other routes ────────────────────────────────────────────────────────────────────

    /**
     * The surfaces that left a scene take their references (a change each) – inside the caller's transaction; returns how many
     * @param list<string> $surfaceIds
     * @param array<string, mixed> $user
     */
    public static function drop(string $bookId, string $sceneId, array $surfaceIds, array $user): int
    {
        if (!$surfaceIds) return 0;
        $count = 0;
        foreach (Db::run('SELECT surface_id, url, name, fit FROM surface_references WHERE book_id = :book AND scene_id = :scene', ['book' => $bookId, 'scene' => $sceneId])->fetchAll() as $row) {
            $surface = (string) $row['surface_id'];
            if (!in_array($surface, $surfaceIds, true)) continue;
            self::write($bookId, $sceneId, $surface, null, null);
            Books::recordChange($bookId, $user, self::KIND, self::ref($sceneId, $surface), Editor::encode(self::shape($row)), 'null');
            $count++;
        }
        return $count;
    }

    /**
     * A deleted scene takes all its references (a change each) – inside the caller's transaction
     * @param array<string, mixed> $user
     */
    public static function dropScene(string $bookId, string $sceneId, array $user): int
    {
        $surfaces = array_map(static fn(array $row) => (string) $row['surface_id'],
            Db::run('SELECT surface_id FROM surface_references WHERE book_id = :book AND scene_id = :scene', ['book' => $bookId, 'scene' => $sceneId])->fetchAll());
        return self::drop($bookId, $sceneId, $surfaces, $user);
    }

    /**
     * A Library file's URL changed (a replace): its references follow, a change each – inside the caller's transaction
     * @param array<string, mixed> $user
     */
    public static function relink(string $bookId, string $from, string $to, array $user): int
    {
        $count = 0;
        foreach (Db::run('SELECT scene_id, surface_id, url, name, fit FROM surface_references WHERE book_id = :book AND url = :url', ['book' => $bookId, 'url' => $from])->fetchAll() as $row) {
            $before = self::shape($row);
            $after = ['url' => $to] + $before;
            self::write($bookId, (string) $row['scene_id'], (string) $row['surface_id'], $after, $user['id']);
            Books::recordChange($bookId, $user, self::KIND, self::ref((string) $row['scene_id'], (string) $row['surface_id']), Editor::encode($before), Editor::encode($after));
            $count++;
        }
        return $count;
    }

    /**
     * A forced delete of a Library file takes the references that showed it (a change each) – inside the caller's transaction
     * @param array<string, mixed> $user
     */
    public static function dropUrl(string $bookId, string $url, array $user): int
    {
        $count = 0;
        foreach (Db::run('SELECT scene_id, surface_id, url, name, fit FROM surface_references WHERE book_id = :book AND url = :url', ['book' => $bookId, 'url' => $url])->fetchAll() as $row) {
            self::write($bookId, (string) $row['scene_id'], (string) $row['surface_id'], null, null);
            Books::recordChange($bookId, $user, self::KIND, self::ref((string) $row['scene_id'], (string) $row['surface_id']), Editor::encode(self::shape($row)), 'null');
            $count++;
        }
        return $count;
    }
}
