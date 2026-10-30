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
 * - an image's width and height and a video's width, height and duration are read from the file on upload and replace
 *   (`VideoInfo` for the video containers) – null when the file does not tell;
 * - renditions (1x / 2x / 3x, 480p / 720p / 1080p) and transcoding stay with the content build – open (PLAN 2b);
 * - a **shader** (`.glsl`, `.frag`, `.vert`, `.wgsl`, #186) is an asset of the kind `shader`: text a plugin loads by its
 *   URL (`api.loadText`). Its uses are the plugin sources that name the URL; a replace relinks them as it relinks rows.
 *   A source file is checked as text (`checkText`: a text content type, UTF-8, no binary bytes) and at most
 *   `TEXT_MAX_BYTES`. Scripts (`.ts`, `.js`) are no assets: they are plugin sources (`Plugins::upload`).
 */
final class Assets
{
    /** Kinds of the content contract (`ASSET_TYPES`) and `shader` by file extension; `kind` = the node's `assetType` (shared/api/rules.ts `ASSET_KIND_EXTENSIONS`) */
    public const KINDS = [
        'glb' => 'glb', 'gltf' => 'gltf',
        'mp4' => 'video', 'webm' => 'video', 'mov' => 'video',
        'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image',
        'mp3' => 'audio', 'm4a' => 'audio', 'ogg' => 'audio', 'wav' => 'audio',
        'glsl' => 'shader', 'frag' => 'shader', 'vert' => 'shader', 'wgsl' => 'shader',
    ];
    public const MIMES = [
        'glb' => 'model/gltf-binary', 'gltf' => 'model/gltf+json',
        'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime',
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav',
        'glsl' => 'text/x-glsl; charset=utf-8', 'frag' => 'text/x-glsl; charset=utf-8', 'vert' => 'text/x-glsl; charset=utf-8', 'wgsl' => 'text/wgsl; charset=utf-8',
    ];
    /** The kinds whose files are source code: checked as text, at most TEXT_MAX_BYTES */
    public const TEXT_KINDS = ['shader'];
    /** A source file (a shader, a script) larger than this is refused – a plugin source's limit */
    public const TEXT_MAX_BYTES = Plugins::MAX_SOURCE_BYTES;
    /** The content types a text file may be sent as besides text/* (a browser sends octet-stream for a type it does not know) */
    private const TEXT_TYPES = ['', 'application/octet-stream', 'application/javascript', 'application/x-javascript', 'application/ecmascript',
        'application/typescript', 'application/x-typescript', 'application/x-glsl'];
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
        $assets = array_map(fn(array $row) => self::summary($row, count(self::usagesOf($bookId, $row))), $rows);
        Http::json(200, ['assets' => array_merge($assets, self::imported($bookId, is_string($kind) && $kind !== '' ? $kind : null))]);
    }

    /**
     * The files of the book's import (its `files.json`, keys below the assets base like the content): images, videos,
     * models and sounds the stage uses although nobody uploaded them. Read-only – their ids are no uuids, so replace, usages and
     * delete answer 404; replacing one is the content build's business (`imported: true`, id `import-<hash of the url>`, version 1, no dimensions).
     * @return array<int, array<string, mixed>>
     */
    private static function imported(string $bookId, ?string $kind): array
    {
        $book = Db::one('SELECT files_json, assets_base, updated_at, created_at FROM books WHERE id = :id', ['id' => $bookId]);
        $files = Editor::decode($book['files_json'] ?? null);
        if (!$files instanceof stdClass) return [];
        $base = rtrim((string) $book['assets_base'], '/');
        $at = Editor::iso((int) $book['updated_at']);
        $rows = null;
        $result = [];
        // the list shows the URL below the assets base, the rows name the content path (`/assets/content/…`) – count with that (#121)
        $paths = array_keys(get_object_vars($files));
        $urls = $base !== '' ? array_keys(get_object_vars(ContentVersion::rewriteFiles($files, $base))) : $paths;
        foreach ($paths as $i => $path) {
            $path = (string) $path;
            $url = (string) $urls[$i];
            $file = $files->{$path};
            $extension = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: $url, PATHINFO_EXTENSION));
            if (!isset(self::KINDS[$extension]) || ($kind !== null && self::KINDS[$extension] !== $kind)) continue;
            // the book's rows read once: a build has hundreds of files, and three queries per file are too slow
            $rows ??= self::usageRows($bookId);
            $result[] = [
                'id' => 'import-' . substr(sha1($url), 0, 16), 'name' => rawurldecode(basename(parse_url($url, PHP_URL_PATH) ?: $url)),
                'kind' => self::KINDS[$extension], 'mime' => self::MIMES[$extension], 'size' => (int) (is_object($file) ? ($file->size ?? 0) : 0),
                'width' => null, 'height' => null, 'durationMs' => null, 'version' => 1, 'url' => $url, 'usages' => self::countUsages($rows, $path),
                'createdAt' => $at, 'updatedAt' => $at, 'imported' => true,
            ];
        }
        return $result;
    }

    /**
     * The texts `usagesOf` searches, one per row: the book (its environment's world and sky), targets (data and image),
     * entities, entries
     * @return array<int, string>
     */
    private static function usageRows(string $bookId): array
    {
        $rows = [['text' => self::environmentText($bookId), 'exact' => null]];
        foreach (Db::run('SELECT image_src, data_json FROM targets WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $rows[] = ['text' => (string) $row['data_json'], 'exact' => (string) $row['image_src']];
        }
        foreach (['entities', 'entries'] as $table) {
            foreach (Db::run("SELECT data_json FROM $table WHERE book_id = :book", ['book' => $bookId])->fetchAll() as $row) {
                $rows[] = ['text' => (string) $row['data_json'], 'exact' => null];
            }
        }
        foreach (Db::run('SELECT source FROM plugins WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $rows[] = ['text' => (string) $row['source'], 'exact' => null];
        }
        return $rows;
    }

    /** = count(usagesOf(...)) over rows read once: a row uses the url when its JSON contains it (or a target's image is it) */
    private static function countUsages(array $rows, string $url): int
    {
        $count = 0;
        foreach ($rows as $row) {
            if ($row['exact'] === $url || str_contains($row['text'], $url)) $count++;
        }
        return $count;
    }

    /**
     * POST /editor/books/{id}/assets – the file as the raw body, `X-File-Name: <name.ext>` → 201 { asset }, or 200 with
     * the asset that already holds these bytes. 400 `invalid-file` (no name, unsupported type, empty, a shader that is no
     * text), 413 `body-too-large` (ASSET_MAX_BYTES, a shader TEXT_MAX_BYTES).
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
        // The URL before the file: a refusal there (no APP_URL) leaves nothing behind
        $url = self::url($store, $path);
        [$width, $height, $duration] = self::dimensions($data, $extension);
        $now = Editor::nowMs();
        $row = [
            'id' => $id, 'book_id' => $bookId, 'name' => $name, 'kind' => self::KINDS[$extension], 'mime' => self::MIMES[$extension],
            'size' => strlen($data), 'sha256' => $sha, 'width' => $width, 'height' => $height, 'duration_ms' => $duration, 'version' => 1,
            'path' => $path, 'url' => $url, 'status' => 'active', 'created_by' => $user['id'], 'created_at' => $now, 'updated_at' => $now,
        ];
        // The file first, then its rows in one transaction; rows that cannot be written take the file with them (no orphan)
        $store->put($path, $data, self::MIMES[$extension]);
        try {
            Db::transaction(function () use ($row, $user, $now) {
                Db::run('INSERT INTO assets (id, book_id, name, kind, mime, size, sha256, width, height, duration_ms, version, path, url, status, created_by, created_at, updated_at)
                         VALUES (:id, :book_id, :name, :kind, :mime, :size, :sha256, :width, :height, :duration_ms, :version, :path, :url, :status, :created_by, :created_at, :updated_at)', $row);
                Db::run('INSERT INTO asset_versions (id, asset_id, version, path, url, size, sha256, mime, created_by, created_at) VALUES (:id, :asset, 1, :path, :url, :size, :sha, :mime, :by, :at)',
                    ['id' => Db::uuid(), 'asset' => $row['id'], 'path' => $row['path'], 'url' => $row['url'], 'size' => $row['size'], 'sha' => $row['sha256'], 'mime' => $row['mime'], 'by' => $user['id'], 'at' => $now]);
            });
        } catch (Throwable $error) {
            self::deleteFile($store, $path);
            throw $error;
        }
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
        $store = ContentStore::for(self::STORE_ENV);
        [$width, $height, $duration] = self::dimensions($data, $extension);
        $now = Editor::nowMs();
        // The asset's row locked from reading its version to the new version's rows: a parallel replace waits and takes the
        // next number instead of writing the same path. The file goes first; rows that cannot be written take it with them
        // – inside the transaction, while no other replace can have written that path.
        [$url, $relinked] = Db::transaction(function () use ($bookId, $assetId, $name, $extension, $data, $width, $height, $duration, $now, $user, $store) {
            $current = self::row($bookId, $assetId, true);
            $version = (int) $current['version'] + 1;
            $path = self::path($bookId, $assetId, $version, $extension);
            $url = self::url($store, $path);
            $store->put($path, $data, self::MIMES[$extension]);
            try {
                Db::run('UPDATE assets SET name = :name, mime = :mime, size = :size, sha256 = :sha, width = :width, height = :height, duration_ms = :duration, version = :version, path = :path, url = :url, updated_at = :now WHERE id = :id',
                    ['name' => $name, 'mime' => self::MIMES[$extension], 'size' => strlen($data), 'sha' => hash('sha256', $data), 'width' => $width, 'height' => $height, 'duration' => $duration,
                     'version' => $version, 'path' => $path, 'url' => $url, 'now' => $now, 'id' => $assetId]);
                Db::run('INSERT INTO asset_versions (id, asset_id, version, path, url, size, sha256, mime, created_by, created_at) VALUES (:id, :asset, :version, :path, :url, :size, :sha, :mime, :by, :at)',
                    ['id' => Db::uuid(), 'asset' => $assetId, 'version' => $version, 'path' => $path, 'url' => $url, 'size' => strlen($data), 'sha' => hash('sha256', $data), 'mime' => self::MIMES[$extension], 'by' => $user['id'], 'at' => $now]);
                return [$url, self::relink($bookId, $current['url'], $url, $user)];
            } catch (Throwable $error) {
                self::deleteFile($store, $path);
                throw $error;
            }
        });
        Http::json(200, ['asset' => self::summary(self::row($bookId, $assetId), count(self::usagesOf($bookId, ['url' => $url, 'id' => $assetId]))), 'relinked' => $relinked]);
    }

    /** GET /editor/books/{id}/assets/{assetId}/usages → { usages: [{ kind, ref }], asset } (the asset as the list has it) */
    public static function usages(string $bookId, string $assetId): never
    {
        Editor::user();
        $asset = self::row($bookId, $assetId);
        $usages = self::usagesOf($bookId, $asset);
        Http::json(200, ['usages' => $usages, 'asset' => self::summary($asset, count($usages))]);
    }

    /**
     * DELETE /editor/books/{id}/assets/{assetId}[?force=1] → 204; 409 `asset-in-use` with the usages unless forced. The rows
     * go in one transaction with a change in the book's log (kind `asset`, `before` = the asset with its versions – as a
     * removal records the files it takes), so a forced delete that leaves rows naming a missing file is in the history;
     * the stored files of every version go after the commit (a store cannot roll back).
     */
    public static function delete(string $bookId, string $assetId): never
    {
        $user = Editor::user();
        $asset = self::row($bookId, $assetId);
        $usages = self::usagesOf($bookId, $asset);
        if ($usages && ($_GET['force'] ?? '') !== '1') {
            throw new ApiError(409, 'asset-in-use', 'The asset is used – remove the uses first, or force the delete.', ['usages' => $usages]);
        }
        $paths = Db::transaction(static function () use ($bookId, $assetId, $user): array {
            $asset = self::row($bookId, $assetId, true);
            $versions = Db::run('SELECT version, path, url FROM asset_versions WHERE asset_id = :id ORDER BY version', ['id' => $assetId])->fetchAll();
            Db::run('DELETE FROM asset_versions WHERE asset_id = :id', ['id' => $assetId]);
            Db::run('DELETE FROM assets WHERE id = :id', ['id' => $assetId]);
            Books::recordChange($bookId, $user, 'asset', $assetId, Editor::encode(self::before($asset, $versions)), 'null');
            return array_column($versions, 'path');
        });
        Removal::deleteStoredFiles($paths);
        Http::json(204, null);
    }

    /**
     * An asset as a change's `before` records it when its row goes (here and in `Removal`): the row's fields and its versions
     * @param array<string, mixed> $asset
     * @param list<array<string, mixed>> $versions rows of asset_versions (version, path, url)
     * @return array<string, mixed>
     */
    public static function before(array $asset, array $versions): array
    {
        return ['id' => $asset['id'], 'name' => $asset['name'], 'kind' => $asset['kind'], 'mime' => $asset['mime'], 'size' => (int) $asset['size'],
            'sha256' => $asset['sha256'], 'url' => $asset['url'], 'version' => (int) $asset['version'],
            'versions' => array_map(static fn(array $v) => ['version' => (int) $v['version'], 'path' => $v['path'], 'url' => $v['url']], $versions)];
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────

    /** @return array{0: string, 1: string, 2: string} name, extension, bytes */
    private static function file(?string $fallbackName = null): array
    {
        [$name, $extension] = self::fileName($fallbackName);
        if (!isset(self::KINDS[$extension])) {
            $script = in_array($extension, Plugins::EXTENSIONS, true) ? ' A script is a plugin source: POST …/plugins.' : '';
            throw new ApiError(400, 'invalid-file', "\"$name\": unsupported type – one of " . implode(', ', array_keys(self::KINDS)) . ".$script");
        }
        $text = in_array(self::KINDS[$extension], self::TEXT_KINDS, true);
        $data = self::body($text ? self::TEXT_MAX_BYTES : Config::int('ASSET_MAX_BYTES'), $text ? self::TEXT_MAX_BYTES . ' bytes' : 'ASSET_MAX_BYTES');
        if ($text) self::checkText($name, $extension, $data);
        return [$name, $extension, $data];
    }

    /**
     * The upload's file name (`X-File-Name`, URL-encoded, the base name only) and its extension in lower case
     * @return array{0: string, 1: string}
     */
    public static function fileName(?string $fallbackName = null): array
    {
        $name = trim((string) ($_SERVER['HTTP_X_FILE_NAME'] ?? ''));
        if ($name === '') $name = (string) $fallbackName;
        $name = basename(str_replace('\\', '/', rawurldecode($name)));
        if ($name === '' || $name === '.' || $name === '..') throw new ApiError(400, 'invalid-file', 'Send the file name in X-File-Name.');
        return [$name, strtolower(pathinfo($name, PATHINFO_EXTENSION))];
    }

    /** The upload's raw body: 400 when empty, 413 above `$max` bytes (`$limit` names it in the message) */
    public static function body(int $max, string $limit): string
    {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) throw new ApiError(413, 'body-too-large', "The file is larger than $limit.");
        $data = (string) file_get_contents('php://input');
        if ($data === '') throw new ApiError(400, 'invalid-file', 'The file is empty.');
        if (strlen($data) > $max) throw new ApiError(413, 'body-too-large', "The file is larger than $limit.");
        return $data;
    }

    /**
     * A source file (a shader, a script) is text: sent as text/* (or a type that says nothing, or JavaScript / TypeScript),
     * UTF-8 without NUL bytes – else 400 `invalid-file`. A picture or a video renamed to `.glsl` stops here.
     */
    public static function checkText(string $name, string $extension, string $data): void
    {
        $type = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''))[0]));
        // Windows registers .ts as an MPEG transport stream (video/mp2t, video/vnd.dlna.mpeg-tts), so a browser sends that
        // type for a TypeScript file – the bytes decide below
        $stream = $extension === 'ts' && str_starts_with($type, 'video/') && (str_contains($type, 'mp2t') || str_contains($type, 'mpeg-tts'));
        $textual = str_starts_with($type, 'text/') || in_array($type, self::TEXT_TYPES, true) || $stream;
        if (!$textual) throw new ApiError(400, 'invalid-file', "\"$name\" was sent as $type – a source file is text.");
        if (str_contains($data, "\0") || !preg_match('//u', $data)) throw new ApiError(400, 'invalid-file', "\"$name\" is no text file (UTF-8 without binary bytes).");
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

    /** @return array{0: ?int, 1: ?int, 2: ?int} width, height (images, videos), duration in ms (videos) */
    private static function dimensions(string $data, string $extension): array
    {
        if (self::KINDS[$extension] === 'video') {
            $video = VideoInfo::read($data, $extension);
            return [$video['width'], $video['height'], $video['durationMs']];
        }
        if (self::KINDS[$extension] !== 'image') return [null, null, null];
        $info = @getimagesizefromstring($data);
        return $info ? [(int) $info[0], (int) $info[1], null] : [null, null, null];
    }

    /**
     * The asset's row, else 404. `$lock` (inside a transaction that changes it) locks it – `Db::forUpdate()`.
     * @return array<string, mixed>
     */
    private static function row(string $bookId, string $assetId, bool $lock = false): array
    {
        $row = Db::one('SELECT * FROM assets WHERE book_id = :book AND id = :id AND status = :status' . ($lock ? Db::forUpdate() : ''),
            ['book' => $bookId, 'id' => $assetId, 'status' => 'active']);
        if (!$row) throw new ApiError(404, 'not-found', 'No such asset.');
        return $row;
    }

    /** Takes back a file whose rows could not be written; a file that cannot be deleted is logged, the first error stands */
    private static function deleteFile(ContentStore $store, string $path): void
    {
        try {
            $store->delete($path);
        } catch (Throwable $error) {
            error_log("Assets: the stored file $path stays without its rows – {$error->getMessage()}");
        }
    }

    /**
     * Where the asset's current URL appears in the book: the book's environment (its world model or sky), targets
     * (`imageSrc`, the inline entity), shared entities, entries, plugin sources (a shader they load – #186).
     * @param array<string, mixed> $asset
     * @return array<int, array{kind: string, ref: string}>
     */
    public static function usagesOf(string $bookId, array $asset): array
    {
        $needle = Db::contains($asset['url']);
        $usages = [];
        if (str_contains(self::environmentText($bookId), Editor::encode($asset['url']))) $usages[] = ['kind' => 'environment', 'ref' => $bookId];
        foreach (Db::run("SELECT id FROM targets WHERE book_id = :book AND (data_json LIKE :needle ESCAPE '!' OR image_src = :url) ORDER BY id", ['book' => $bookId, 'needle' => $needle, 'url' => $asset['url']])->fetchAll() as $row) {
            $usages[] = ['kind' => 'target', 'ref' => $row['id']];
        }
        foreach (Db::run("SELECT ref FROM entities WHERE book_id = :book AND data_json LIKE :needle ESCAPE '!' ORDER BY ref", ['book' => $bookId, 'needle' => $needle])->fetchAll() as $row) {
            $usages[] = ['kind' => 'entity', 'ref' => $row['ref']];
        }
        foreach (Db::run("SELECT id FROM entries WHERE book_id = :book AND data_json LIKE :needle ESCAPE '!' ORDER BY id", ['book' => $bookId, 'needle' => $needle])->fetchAll() as $row) {
            $usages[] = ['kind' => 'entry', 'ref' => $row['id']];
        }
        // A plugin source names a file by its URL as a string (a shader it loads, a picture it shows)
        foreach (Db::run("SELECT id FROM plugins WHERE book_id = :book AND source LIKE :needle ESCAPE '!' ORDER BY id", ['book' => $bookId, 'needle' => $needle])->fetchAll() as $row) {
            $usages[] = ['kind' => 'plugin', 'ref' => $row['id']];
        }
        return $usages;
    }

    /** Every row naming `$from` now names `$to` (a change per row); returns how many rows changed */
    private static function relink(string $bookId, string $from, string $to, array $user): int
    {
        $count = 0;
        $swap = static fn(string $json): string => str_replace(Editor::encode($from), Editor::encode($to), $json);
        // The book's environment (its world model or sky): only that field of the book's JSON, nothing else of the book
        $book = Db::one('SELECT book_json FROM books WHERE id = :id' . Db::forUpdate(), ['id' => $bookId]);
        $decoded = Editor::decode($book['book_json'] ?? null);
        if ($decoded instanceof stdClass && ($decoded->environment ?? null) instanceof stdClass) {
            $changed = false;
            foreach (['worldSrc', 'skySrc'] as $key) {
                if (($decoded->environment->{$key} ?? null) !== $from) continue;
                $decoded->environment->{$key} = $to;
                $changed = true;
            }
            if ($changed) {
                $json = Editor::encode($decoded);
                Db::run('UPDATE books SET book_json = :book WHERE id = :id', ['book' => $json, 'id' => $bookId]);
                Books::recordChange($bookId, $user, 'environment', $bookId, $book['book_json'], $json);
                $count++;
            }
        }
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
        // Plugin sources name the URL as plain text (no JSON escaping): a shader's new version reaches the code that loads it
        $now = Editor::nowMs();
        foreach (Db::run('SELECT id, source FROM plugins WHERE book_id = :book', ['book' => $bookId])->fetchAll() as $row) {
            $source = str_replace($from, $to, (string) $row['source']);
            if ($source === $row['source']) continue;
            Db::run('UPDATE plugins SET source = :source, updated_by = :by, updated_at = :now WHERE book_id = :book AND id = :id',
                ['source' => $source, 'by' => $user['id'], 'now' => $now, 'book' => $bookId, 'id' => $row['id']]);
            Books::recordChange($bookId, $user, 'plugin', $row['id'], Editor::encode($row['source']), Editor::encode($source));
            $count++;
        }
        if ($count) Books::touchBook($bookId);
        return $count;
    }

    /** The book's environment as JSON ("" without one): the text a world model's or a sky's URL is searched in */
    private static function environmentText(string $bookId): string
    {
        $book = Editor::decode(Db::value('SELECT book_json FROM books WHERE id = :id', ['id' => $bookId]));
        return $book instanceof stdClass && isset($book->environment) ? Editor::encode($book->environment) : '';
    }

    /** @param array<string, mixed> $row */
    private static function summary(array $row, int $usages): array
    {
        return [
            'id' => $row['id'], 'name' => $row['name'], 'kind' => $row['kind'], 'mime' => $row['mime'], 'size' => (int) $row['size'],
            'width' => $row['width'] === null ? null : (int) $row['width'], 'height' => $row['height'] === null ? null : (int) $row['height'],
            'durationMs' => ($row['duration_ms'] ?? null) === null ? null : (int) $row['duration_ms'],
            'version' => (int) $row['version'], 'url' => $row['url'], 'usages' => $usages, 'imported' => false,
            'createdAt' => Editor::iso((int) $row['created_at']), 'updatedAt' => Editor::iso((int) $row['updated_at']),
        ];
    }
}
