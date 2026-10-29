<?php

declare(strict_types=1);

/**
 * The editor's assets (docs/server.md "Assets"): the files a book's nodes and targets use beyond the content build's
 * own – uploaded by an editor, kept in the content store under `assets/<book>/<asset>/v<n>.<ext>` (the local folder
 * served at GET /content/assets/…, or the CDN's zone), registered in `assets` with one row per upload in
 * `asset_versions`. After Scutoons' asset layer (scutoons/agents/ASSETS.md), sized for OSCT:
 *
 * - a node's `src` and a target's `imageSrc` hold the asset's **absolute URL** (the publish leaves absolute URLs as
 *   they are; the engine loads them like the CDN's), so content, draft and every publish point at the same file;
 * - **replace** uploads a new version at a new path (`v2.ext` – a CDN never has to be purged) and relinks every use
 *   in the book's rows to it, recording the changes;
 * - **delete** is refused while the asset is used (409 `asset-in-use`, the usages listed) unless `?force=1`;
 * - the same bytes uploaded twice are one asset (sha256);
 * - renditions (1x / 2x / 3x, 480p / 720p / 1080p) and transcoding stay with the content build – open (PLAN 2b).
 */
final class Assets
{
    /** Kinds of the content contract (`ASSET_TYPES`) by file extension; `kind` = the node's `assetType` */
    public const KINDS = [
        'glb' => 'glb', 'gltf' => 'gltf',
        'mp4' => 'video', 'webm' => 'video', 'mov' => 'video',
        'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image',
        'mp3' => 'audio', 'm4a' => 'audio', 'ogg' => 'audio', 'wav' => 'audio',
    ];
    public const MIMES = [
        'glb' => 'model/gltf-binary', 'gltf' => 'model/gltf+json',
        'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime',
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav',
    ];
    /** The store's pseudo environment the assets live in */
    public const STORE_ENV = 'assets';

    /** GET /editor/books/{id}/assets[?kind=] → { assets: [...] } with the number of uses each */
    public static function list(string $bookId): never
    {
        Editor::user();
        Books::exists($bookId);
        $kind = $_GET['kind'] ?? null;
        $rows = Db::run('SELECT * FROM assets WHERE book_id = :book AND status = :status' . (is_string($kind) && $kind !== '' ? ' AND kind = :kind' : '') . ' ORDER BY updated_at DESC',
            ['book' => $bookId, 'status' => 'active'] + (is_string($kind) && $kind !== '' ? ['kind' => $kind] : []))->fetchAll();
        Http::json(200, ['assets' => array_map(fn(array $row) => self::summary($row, count(self::usagesOf($bookId, $row))), $rows)]);
    }

    /**
     * POST /editor/books/{id}/assets – the file as the raw body, `X-File-Name: <name.ext>` → 201 { asset }, or 200 with
     * the asset that already holds these bytes. 400 `invalid-file` (no name, unsupported type, empty), 413 `body-too-large`
     * (ASSET_MAX_BYTES).
     */
    public static function upload(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        [$name, $extension, $data] = self::file();
        $sha = hash('sha256', $data);
        $same = Db::one('SELECT * FROM assets WHERE book_id = :book AND sha256 = :sha AND status = :status', ['book' => $bookId, 'sha' => $sha, 'status' => 'active']);
        if ($same) Http::json(200, ['asset' => self::summary($same, count(self::usagesOf($bookId, $same)))]);
        $id = Db::uuid();
        $path = self::path($bookId, $id, 1, $extension);
        $store = ContentStore::for(self::STORE_ENV);
        $store->put($path, $data, self::MIMES[$extension]);
        [$width, $height] = self::dimensions($data, $extension);
        $now = Editor::nowMs();
        $row = [
            'id' => $id, 'book_id' => $bookId, 'name' => $name, 'kind' => self::KINDS[$extension], 'mime' => self::MIMES[$extension],
            'size' => strlen($data), 'sha256' => $sha, 'width' => $width, 'height' => $height, 'version' => 1,
            'path' => $path, 'url' => self::url($store, $path), 'status' => 'active', 'created_by' => $user['id'], 'created_at' => $now, 'updated_at' => $now,
        ];
        Db::transaction(function () use ($row, $user, $now) {
            Db::run('INSERT INTO assets (id, book_id, name, kind, mime, size, sha256, width, height, version, path, url, status, created_by, created_at, updated_at)
                     VALUES (:id, :book_id, :name, :kind, :mime, :size, :sha256, :width, :height, :version, :path, :url, :status, :created_by, :created_at, :updated_at)', $row);
            Db::run('INSERT INTO asset_versions (id, asset_id, version, path, url, size, sha256, mime, created_by, created_at) VALUES (:id, :asset, 1, :path, :url, :size, :sha, :mime, :by, :at)',
                ['id' => Db::uuid(), 'asset' => $row['id'], 'path' => $row['path'], 'url' => $row['url'], 'size' => $row['size'], 'sha' => $row['sha256'], 'mime' => $row['mime'], 'by' => $user['id'], 'at' => $now]);
        });
        Http::json(201, ['asset' => self::summary($row, 0)]);
    }

    /**
     * PUT /editor/books/{id}/assets/{assetId}/file – the new file as the raw body (`X-File-Name` optional, the kind
     * must stay) → { asset, relinked }: a new version at a new path; every use in the book's rows now names it.
     */
    public static function replace(string $bookId, string $assetId): never
    {
        $user = Editor::user();
        $asset = self::row($bookId, $assetId);
        [$name, $extension, $data] = self::file($asset['name']);
        if (self::KINDS[$extension] !== $asset['kind']) {
            throw new ApiError(400, 'invalid-file', "A {$asset['kind']} asset can only be replaced by a {$asset['kind']} file.");
        }
        $version = (int) $asset['version'] + 1;
        $path = self::path($bookId, $assetId, $version, $extension);
        $store = ContentStore::for(self::STORE_ENV);
        $store->put($path, $data, self::MIMES[$extension]);
        $url = self::url($store, $path);
        [$width, $height] = self::dimensions($data, $extension);
        $now = Editor::nowMs();
        $relinked = 0;
        Db::transaction(function () use ($bookId, $asset, $assetId, $name, $extension, $data, $version, $path, $url, $width, $height, $now, $user, &$relinked) {
            Db::run('UPDATE assets SET name = :name, mime = :mime, size = :size, sha256 = :sha, width = :width, height = :height, version = :version, path = :path, url = :url, updated_at = :now WHERE id = :id',
                ['name' => $name, 'mime' => self::MIMES[$extension], 'size' => strlen($data), 'sha' => hash('sha256', $data), 'width' => $width, 'height' => $height,
                 'version' => $version, 'path' => $path, 'url' => $url, 'now' => $now, 'id' => $assetId]);
            Db::run('INSERT INTO asset_versions (id, asset_id, version, path, url, size, sha256, mime, created_by, created_at) VALUES (:id, :asset, :version, :path, :url, :size, :sha, :mime, :by, :at)',
                ['id' => Db::uuid(), 'asset' => $assetId, 'version' => $version, 'path' => $path, 'url' => $url, 'size' => strlen($data), 'sha' => hash('sha256', $data), 'mime' => self::MIMES[$extension], 'by' => $user['id'], 'at' => $now]);
            $relinked = self::relink($bookId, $asset['url'], $url, $user);
        });
        Http::json(200, ['asset' => self::summary(self::row($bookId, $assetId), count(self::usagesOf($bookId, ['url' => $url, 'id' => $assetId]))), 'relinked' => $relinked]);
    }

    /** GET /editor/books/{id}/assets/{assetId}/usages → { usages: [{ kind, ref }] } */
    public static function usages(string $bookId, string $assetId): never
    {
        Editor::user();
        Http::json(200, ['usages' => self::usagesOf($bookId, self::row($bookId, $assetId))]);
    }

    /** DELETE /editor/books/{id}/assets/{assetId}[?force=1] → 204; 409 `asset-in-use` with the usages unless forced */
    public static function delete(string $bookId, string $assetId): never
    {
        Editor::user();
        $asset = self::row($bookId, $assetId);
        $usages = self::usagesOf($bookId, $asset);
        if ($usages && ($_GET['force'] ?? '') !== '1') {
            throw new ApiError(409, 'asset-in-use', 'The asset is used – remove the uses first, or force the delete.', ['usages' => $usages]);
        }
        $store = ContentStore::for(self::STORE_ENV);
        foreach (Db::run('SELECT path FROM asset_versions WHERE asset_id = :id', ['id' => $assetId])->fetchAll() as $version) {
            $store->delete($version['path']);
        }
        Db::run('DELETE FROM assets WHERE id = :id', ['id' => $assetId]);
        http_response_code(204);
        exit;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────

    /** @return array{0: string, 1: string, 2: string} name, extension, bytes */
    private static function file(?string $fallbackName = null): array
    {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > Config::int('ASSET_MAX_BYTES')) {
            throw new ApiError(413, 'body-too-large', 'The file is larger than ASSET_MAX_BYTES.');
        }
        $name = trim((string) ($_SERVER['HTTP_X_FILE_NAME'] ?? ''));
        if ($name === '') $name = (string) $fallbackName;
        $name = basename(str_replace('\\', '/', rawurldecode($name)));
        if ($name === '' || $name === '.' || $name === '..') throw new ApiError(400, 'invalid-file', 'Send the file name in X-File-Name.');
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset(self::KINDS[$extension])) {
            throw new ApiError(400, 'invalid-file', "\"$name\": unsupported type – one of " . implode(', ', array_keys(self::KINDS)) . '.');
        }
        $data = (string) file_get_contents('php://input');
        if ($data === '') throw new ApiError(400, 'invalid-file', 'The file is empty.');
        if (strlen($data) > Config::int('ASSET_MAX_BYTES')) throw new ApiError(413, 'body-too-large', 'The file is larger than ASSET_MAX_BYTES.');
        return [$name, $extension, $data];
    }

    private static function path(string $bookId, string $assetId, int $version, string $extension): string
    {
        return "$bookId/$assetId/v$version.$extension";
    }

    /** The public URL of a stored file: the CDN's base for the zone, the API's own content route for the local folder */
    private static function url(ContentStore $store, string $path): string
    {
        $configured = rtrim(Config::get('ASSET_BASE_URL'), '/');
        if ($configured !== '') return "$configured/$path";
        if (!$store->isLocal()) return rtrim(Config::get('CONTENT_BASE_URL'), '/') . '/' . self::STORE_ENV . "/$path";
        return Http::apiUrl() . '/content/' . self::STORE_ENV . "/$path";
    }

    /** @return array{0: ?int, 1: ?int} */
    private static function dimensions(string $data, string $extension): array
    {
        if (self::KINDS[$extension] !== 'image') return [null, null];
        $info = @getimagesizefromstring($data);
        return $info ? [(int) $info[0], (int) $info[1]] : [null, null];
    }

    /** @return array<string, mixed> */
    private static function row(string $bookId, string $assetId): array
    {
        $row = Db::one('SELECT * FROM assets WHERE book_id = :book AND id = :id AND status = :status', ['book' => $bookId, 'id' => $assetId, 'status' => 'active']);
        if (!$row) throw new ApiError(404, 'not-found', 'No such asset.');
        return $row;
    }

    /**
     * Where the asset's current URL appears in the book: targets (`imageSrc`, the inline entity), shared entities, entries.
     * @param array<string, mixed> $asset
     * @return array<int, array{kind: string, ref: string}>
     */
    public static function usagesOf(string $bookId, array $asset): array
    {
        $needle = '%' . str_replace(['%', '_'], ['\%', '\_'], $asset['url']) . '%';
        $usages = [];
        foreach (Db::run("SELECT id FROM targets WHERE book_id = :book AND (data_json LIKE :needle ESCAPE '\\' OR image_src = :url) ORDER BY id", ['book' => $bookId, 'needle' => $needle, 'url' => $asset['url']])->fetchAll() as $row) {
            $usages[] = ['kind' => 'target', 'ref' => $row['id']];
        }
        foreach (Db::run("SELECT ref FROM entities WHERE book_id = :book AND data_json LIKE :needle ESCAPE '\\' ORDER BY ref", ['book' => $bookId, 'needle' => $needle])->fetchAll() as $row) {
            $usages[] = ['kind' => 'entity', 'ref' => $row['ref']];
        }
        foreach (Db::run("SELECT id FROM entries WHERE book_id = :book AND data_json LIKE :needle ESCAPE '\\' ORDER BY id", ['book' => $bookId, 'needle' => $needle])->fetchAll() as $row) {
            $usages[] = ['kind' => 'entry', 'ref' => $row['id']];
        }
        return $usages;
    }

    /** Every row naming `$from` now names `$to` (a change per row); returns how many rows changed */
    private static function relink(string $bookId, string $from, string $to, array $user): int
    {
        $count = 0;
        $swap = static fn(string $json): string => str_replace(Editor::encode($from), Editor::encode($to), $json);
        foreach (Db::run('SELECT id, image_src, data_json FROM targets WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $json = $swap($row['data_json']);
            $image = $row['image_src'] === $from ? $to : $row['image_src'];
            if ($json === $row['data_json'] && $image === $row['image_src']) continue;
            Db::run('UPDATE targets SET image_src = :image, data_json = :data WHERE book_id = :book AND id = :id', ['image' => $image, 'data' => $json, 'book' => $bookId, 'id' => $row['id']]);
            Books::recordChange($bookId, $user, 'target', $row['id'], $row['data_json'], $json);
            $count++;
        }
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $json = $swap($row['data_json']);
            if ($json === $row['data_json']) continue;
            Db::run('UPDATE entities SET data_json = :data WHERE book_id = :book AND ref = :ref', ['data' => $json, 'book' => $bookId, 'ref' => $row['ref']]);
            Books::recordChange($bookId, $user, 'entity', $row['ref'], $row['data_json'], $json);
            $count++;
        }
        foreach (Db::run('SELECT id, data_json FROM entries WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $json = $swap($row['data_json']);
            if ($json === $row['data_json']) continue;
            Db::run('UPDATE entries SET data_json = :data WHERE book_id = :book AND id = :id', ['data' => $json, 'book' => $bookId, 'id' => $row['id']]);
            Books::recordChange($bookId, $user, 'entry', $row['id'], $row['data_json'], $json);
            $count++;
        }
        if ($count) Books::touchBook($bookId);
        return $count;
    }

    /** @param array<string, mixed> $row */
    private static function summary(array $row, int $usages): array
    {
        return [
            'id' => $row['id'], 'name' => $row['name'], 'kind' => $row['kind'], 'mime' => $row['mime'], 'size' => (int) $row['size'],
            'width' => $row['width'] === null ? null : (int) $row['width'], 'height' => $row['height'] === null ? null : (int) $row['height'],
            'version' => (int) $row['version'], 'url' => $row['url'], 'usages' => $usages,
            'createdAt' => Editor::iso((int) $row['created_at']), 'updatedAt' => Editor::iso((int) $row['updated_at']),
        ];
    }
}
