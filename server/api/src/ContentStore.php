<?php
declare(strict_types=1);

/**
 * Where published content versions go – the CDN layout of docs/content-cdn.md (shared/types/content-manifest.ts):
 * `<env>/<build>/game.config.json` and `files.json` (never overwritten), `<env>/versions.json` (every version and
 * when it was current) and `<env>/latest.json` (the current one, written last). Two stores behind one interface:
 * the directory CONTENT_STORE_DIR, served by `GET /content/{env}/{path}` (development, a host without the CDN),
 * and bunny.net's Storage API – the zone the osct CLI syncs to, with the same paths and headers, so the reader
 * cannot tell who published. A connected CDN has priority: with CONTENT_STORE `bunny` every environment goes there
 * except `local`, which always stays in the directory (a developer's machine).
 * An environment serves one book, the last one published there: latest.json names it (`book`).
 * An instance publishes to its own environment only (ENV, `Config::env()`); `local` exists only where ENV is local.
 */
final class ContentStore
{
    /** The environments every instance knows (what is live there shows in the editor) – plus its own, `environments()` */
    public const ENVIRONMENTS = ['staging', 'production'];

    /** An environment's name, as the osct CLI accepts it */
    public const ENV_NAME = '/^[a-z][a-z0-9-]{0,31}$/';

    /** The editor's line wherever the directory store is the publish target (#183) */
    public const SERVER_WARNING = 'No CDN connected – the published content is stored and served by this server only. Readers load from here without edge caching; heavy media goes through this server. Back up the content store.';

    /** A version folder name: the first 12 hex digits of the content hash (content-manifest.ts `CONTENT_BUILD`) */
    public const BUILD = '/^[0-9a-f]{12}$/';

    /** The files below an environment that the local store serves (nothing else, no other folders) */
    private const SERVED = '#^(latest\.json|versions\.json|[0-9a-f]{12}/(game\.config|files)\.json)$#';
    /** The assets' files (Assets.php): `<book>/<asset>/v<n>.<ext>` under the `assets` environment */
    private const SERVED_ASSET = '#^[a-z0-9][a-z0-9-]{0,63}/[0-9a-f-]{36}/v\d+\.([a-z0-9]{2,5})$#';

    private function __construct(private readonly string $kind, private readonly string $env)
    {
    }

    public static function for(string $env): self
    {
        return new self($env !== 'local' && Config::get('CONTENT_STORE') === 'bunny' ? 'bunny' : 'local', $env);
    }

    public function isLocal(): bool
    {
        return $this->kind === 'local';
    }

    /**
     * This instance's environments, its own first: staging and production, and its own when it is another one – `local`
     * on a developer's machine (ENV=local), a white-label instance's name. `local` never appears elsewhere.
     * @return list<string>
     */
    public static function environments(): array
    {
        $own = Config::env();
        return in_array($own, self::ENVIRONMENTS, true) ? [$own, ...array_values(array_diff(self::ENVIRONMENTS, [$own]))] : [$own, ...self::ENVIRONMENTS];
    }

    /**
     * What the editor shows per environment (GET /editor/environments): its backend – `cdn` (the storage zone) or
     * `server` (the directory store, served by this API) –, whether this instance publishes there (its own environment
     * only), where readers load it, and the warning wherever the directory store is the publish target
     * @return list<array{env: string, store: string, publish: bool, url: ?string, warning: ?string}>
     */
    public static function describe(): array
    {
        $own = Config::env();
        $list = [];
        foreach (self::environments() as $env) {
            $local = self::for($env)->isLocal();
            $publish = $env === $own;
            $cdn = rtrim(Config::get('CONTENT_BASE_URL'), '/');
            $list[] = [
                'env' => $env,
                'store' => $local ? 'server' : 'cdn',
                'publish' => $publish,
                'url' => $local ? Http::apiUrl() . "/content/$env" : ($publish && $cdn !== '' ? $cdn : null),
                'warning' => $publish && $local ? self::SERVER_WARNING : null,
            ];
        }
        return $list;
    }

    /** Writes a file below the environment (folders are created; a write is complete or absent, never half) */
    public function put(string $path, string $data, string $mime = 'application/json'): void
    {
        if ($this->kind === 'bunny') {
            $this->request('PUT', $path, $data, [201], [], $mime);
            return;
        }
        $file = self::dir() . "/{$this->env}/$path";
        $folder = dirname($file);
        if (!is_dir($folder) && !@mkdir($folder, 0775, true) && !is_dir($folder)) {
            throw new ApiError(502, 'content-store-failed', "The content store folder $folder cannot be created.");
        }
        $temp = "$file." . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($temp, $data) !== strlen($data) || (is_file($file) && !@unlink($file)) || !@rename($temp, $file)) {
            @unlink($temp);
            throw new ApiError(502, 'content-store-failed', "The content store cannot write $this->env/$path.");
        }
    }

    /** A file below the environment, null when there is none */
    public function get(string $path): ?string
    {
        if ($this->kind === 'bunny') {
            [$status, $body] = $this->request('GET', $path, null, [200, 404]);
            return $status === 404 ? null : $body;
        }
        $file = self::dir() . "/{$this->env}/$path";
        return is_file($file) ? (string) file_get_contents($file) : null;
    }

    /** Removes a file below the environment (none = fine) */
    public function delete(string $path): void
    {
        if ($this->kind === 'bunny') {
            $this->request('DELETE', $path, null, [200, 404]);
            return;
        }
        $file = self::dir() . "/{$this->env}/$path";
        if (is_file($file)) @unlink($file);
    }

    public function exists(string $path): bool
    {
        if ($this->kind === 'bunny') {
            // The Storage API has no HEAD; a ranged GET keeps it cheap
            [$status] = $this->request('GET', $path, null, [200, 206, 404], ['Range: bytes=0-0']);
            return $status !== 404;
        }
        return is_file(self::dir() . "/{$this->env}/$path");
    }

    /**
     * The book this environment serves, after latest.json: null when nothing is published here; `book` null when it
     * cannot be told (an unreadable manifest, a version without its configuration). A manifest without `book` was
     * written before it existed – the book of its version's game.config.json (`book.id`) tells.
     * @return array{book: ?string, build: ?string, since: ?string}|null
     */
    public function live(): ?array
    {
        $raw = $this->get('latest.json');
        if ($raw === null) return null;
        $manifest = json_decode($raw, true);
        $build = is_array($manifest) && is_string($manifest['build'] ?? null) && preg_match(self::BUILD, $manifest['build']) ? $manifest['build'] : null;
        if ($build === null) return ['book' => null, 'build' => null, 'since' => null];
        $book = is_string($manifest['book'] ?? null) ? $manifest['book'] : null;
        if ($book === null) {
            $configuration = json_decode((string) $this->get("$build/game.config.json"), true);
            $id = is_array($configuration) && is_array($configuration['book'] ?? null) ? ($configuration['book']['id'] ?? null) : null;
            $book = is_string($id) ? $id : null;
        }
        return ['book' => $book, 'build' => $build, 'since' => is_string($manifest['activatedAt'] ?? null) ? $manifest['activatedAt'] : null];
    }

    /**
     * GET /content/{env}/{path} – a json file of the local store. Public, like the CDN: latest.json and versions.json
     * are revalidated, a version folder's files never change.
     */
    public static function serve(string $env, string $path): never
    {
        $asset = $env === Assets::STORE_ENV && preg_match(self::SERVED_ASSET, $path, $match) ? strtolower($match[1]) : null;
        if ($asset === null && !preg_match(self::SERVED, $path)) throw new ApiError(404, 'not-found', 'Unknown endpoint.');
        $file = self::dir() . "/$env/$path";
        if (!is_file($file)) throw new ApiError(404, 'not-found', 'No such content file.');
        http_response_code(200);
        header('Content-Type: ' . ($asset !== null ? (Assets::MIMES[$asset] ?? 'application/octet-stream') : 'application/json; charset=utf-8'));
        header('Cache-Control: ' . (str_contains($path, '/') ? 'public, max-age=31536000, immutable' : 'no-cache'));
        header('Content-Length: ' . (string) filesize($file));
        // Media are loaded cross-origin by the reader's engine (video textures, models): any origin may read them
        if ($asset !== null) header('Access-Control-Allow-Origin: *');
        readfile($file);
        exit;
    }

    /**
     * versions.json after `version` (build, hash, schema) became current at `now`: the previous current version is
     * retired, this build's entry is appended or updated – the osct CLI's bookkeeping (content-sync.ts `activate`),
     * so `osct content purge` reads what the editor publishes.
     * The entry records the book (`book`).
     * @param array<int, mixed> $versions
     * @param array{build: string, hash: string, schema: string} $version
     * @return array<int, array<string, mixed>>
     */
    public static function activate(array $versions, array $version, string $now, bool $uploadedNow, string $bookId): array
    {
        $existing = null;
        $result = [];
        foreach ($versions as $entry) {
            if (!is_array($entry)) continue;
            if (($entry['build'] ?? null) === $version['build']) {
                $existing = $entry;
                continue;
            }
            if (($entry['retiredAt'] ?? null) === null) $entry['retiredAt'] = $now;
            $result[] = $entry;
        }
        $result[] = [
            'build' => $version['build'],
            'hash' => $version['hash'],
            'schema' => $version['schema'],
            'version' => Version::APP,
            'uploadedAt' => $uploadedNow || !$existing ? $now : $existing['uploadedAt'],
            'activatedAt' => $existing && ($existing['retiredAt'] ?? null) === null ? $existing['activatedAt'] : $now,
            'retiredAt' => null,
            'book' => $bookId,
        ];
        usort($result, fn(array $a, array $b) => strcmp((string) ($a['activatedAt'] ?? ''), (string) ($b['activatedAt'] ?? '')));
        return $result;
    }

    /** The directory store's folder: the content store (Paths – CONTENT_STORE_DIR, content-store/ by default) */
    public static function dir(): string
    {
        return rtrim(Paths::contentStore(), '/');
    }

    /**
     * One call to the Storage API: `{method} https://{endpoint}/{zone}/{env}/{path}` with the zone's access key;
     * uploads carry the checksum the server verifies. Any other answer than `$ok` → 502 content-store-failed.
     * @param int[] $ok
     * @param string[] $headers
     * @return array{0: int, 1: string}
     */
    private function request(string $method, string $path, ?string $body, array $ok, array $headers = [], string $mime = 'application/json'): array
    {
        $url = $this->url($path);
        $headers[] = 'AccessKey: ' . Config::get('BUNNY_STORAGE_PASSWORD');
        if ($body !== null) {
            $headers[] = "Content-Type: $mime";
            $headers[] = 'Checksum: ' . strtoupper(hash('sha256', $body));
        }
        $context = stream_context_create(['http' => [
            'method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? '',
            'timeout' => 30, 'ignore_errors' => true,
        ]]);
        $response = @file_get_contents($url, false, $context);
        $status = isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s(\d{3})#', $http_response_header[0], $match) ? (int) $match[1] : 0;
        if ($response === false || !in_array($status, $ok, true)) {
            error_log("[osct] content store: $method $url answered " . ($status ?: 'nothing') . ($response ? ' ' . substr($response, 0, 200) : ''));
            throw new ApiError(502, 'content-store-failed', "The content store answered " . ($status ?: 'nothing') . " for $method $this->env/$path.");
        }
        return [$status, $response];
    }

    private function url(string $path): string
    {
        $zone = Config::get('BUNNY_STORAGE_ZONE');
        if ($zone === '' || Config::get('BUNNY_STORAGE_PASSWORD') === '') {
            throw new ApiError(500, 'content-store-unconfigured', 'BUNNY_STORAGE_ZONE / BUNNY_STORAGE_PASSWORD are not set.');
        }
        $endpoint = rtrim(Config::get('BUNNY_STORAGE_ENDPOINT'), '/');
        $origin = preg_match('#^https?://#', $endpoint) ? $endpoint : "https://$endpoint";
        $segments = array_map('rawurlencode', explode('/', "{$this->env}/$path"));
        return "$origin/" . rawurlencode($zone) . '/' . implode('/', $segments);
    }
}
