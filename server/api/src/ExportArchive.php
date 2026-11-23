<?php
declare(strict_types=1);

/**
 * The export archive (#322, MEMORY 2026-11-21 "Export archive follows the CDN rules", docs/content-cdn.md, docs/content.md
 * "Export archive"): every publish writes the export of the build it published into the experience's own content store –
 * `exports/<build>/` below `<title>/<env>/<experience>` on the storage zone (`<env>/<experience>` in the directory store) –
 * once per build: a folder whose export.json is there is never written again.
 *
 * What lies in it is what `osct content export` writes (scripts/src/lib/content-export.ts – this is its PHP copy, and
 * scripts/test/export-archive.test.ts compares the two): experience.yaml, scenes/, entries/, entities/, groups.yaml,
 * credits.yaml, plugins/<id>/index.ts, EXPORT.md and export.json – **without the media**: export.json names every file
 * the YAML names by its folder path and the immutable URL it is read from (the build's own content files below
 * `<title>/<env>/<experience>/<build>/assets/content/…`, the Library's uploads below `assets/<experience>/…`), and lists
 * the content builds those URLs lie in (`builds`) – so `osct content purge` keeps every build the newest export of an
 * experience still needs. export.json is written last: a folder without it is incomplete and written again.
 *
 * The archive is readable through the pull zone like the versions: it names no person (`publishedBy` stays out).
 */
final class ExportArchive
{
    /** The archives' folder in an experience's store (shared with scripts/src/lib/content-export.ts `ARCHIVE_FOLDER`) */
    public const FOLDER = 'exports';
    private const MARKER = 'EXPORT.md';
    private const RECORD = 'export.json';
    private const CREDITS_FILE = 'credits.yaml';
    private const GROUPS_FILE = 'groups.yaml';
    private const CONTENT_PREFIX = '/assets/content/';
    /** A value that names a file (`Export::FILE`, content-export.ts `FILE_VALUE`) */
    private const FILE_VALUE = '#^(?:https?://|/assets/content/)\S+\.(?:glb|gltf|mp4|webm|mov|m4v|jpe?g|png|webp|gif|svg|mp3|m4a|ogg|wav|glsl|frag|vert|wgsl|vtt|json|js|hdr|exr|ktx2)(?:[?\#]\S*)?$#i';
    private const VIDEO = '/\.(mp4|webm|mov|m4v)$/i';
    private const KNOWN_ENTRY = ['id', 'category', 'title', 'scene', 'surface', 'body', 'author', 'image', 'imageLevels', 'caption', 'media', 'tags', 'target'];
    private const KNOWN_TARGET = ['id', 'imageSrc', 'entity', 'place', 'enabled', 'recognition', 'recognitionOff'];

    /** The file whose presence marks an archive as complete (written last) */
    public const COMPLETE = self::RECORD;

    /**
     * The archive of a published build (`$data`: `Export::ofPublish`): its folder `exports/<build>` and its files below it
     * in write order – export.json last, it marks the archive as complete. Nothing is written: a publish writes them
     * through its job (`PublishJob`, #345) unless the folder's export.json is there – files the store holds are skipped.
     * @param array<string, mixed> $data
     * @return array{folder: string, files: list<array{0: string, 1: string, 2: string}>}
     */
    public static function files(array $data, string $env, string $writtenBy = 'publish'): array
    {
        $build = (string) $data['build'];
        $folder = self::FOLDER . "/$build";
        $plan = self::plan($data);
        $files = [];
        foreach ($plan['downloads'] as $at => $planned) {
            $file = $planned['file'];
            $files[] = [
                'path' => (string) $at,
                'url' => $planned['url'],
                'origin' => $file['origin'] ?? 'unknown',
                'sha256' => $file['sha256'] ?? null,
                'v' => $file['v'] ?? null,
                'size' => $file['size'] ?? null,
            ];
        }
        usort($files, static fn(array $a, array $b): int => strcmp($a['path'], $b['path']));
        $record = [
            'archive' => true,
            'experience' => $data['experience'],
            'instance' => self::instance(),
            'title' => Config::title(),
            'env' => $env,
            'source' => $data['source'],
            'build' => $build,
            'hash' => $data['hash'],
            'schema' => $data['schema'],
            'appVersion' => $data['appVersion'],
            'writtenBy' => $writtenBy,
            'exportedAt' => $data['exportedAt'],
            'files' => $files,
            'builds' => self::builds(array_column($files, 'url'), Config::title(), (string) $data['experience'], ['env' => $env, 'build' => $build]),
            'problems' => $plan['problems'],
        ];
        $files = [];
        foreach ($plan['texts'] as $at => $text) $files[] = [(string) $at, $text, str_ends_with((string) $at, '.ts') ? 'text/plain' : 'text/yaml'];
        $files[] = [self::MARKER, self::marker($data, $record), 'text/markdown'];
        // Last: export.json marks the archive as complete
        $files[] = [self::RECORD, Editor::encode($record, true) . "\n", 'application/json'];
        return ['folder' => $folder, 'files' => $files];
    }

    /**
     * The content builds the files lie in: every `<title>/<env>/<experience>/<build>/` (the storage zone, also below a pull
     * zone URL) or `/content/<env>/<experience>/<build>/` (the directory store's route) of this experience, and the
     * archived build itself – content-export.ts `archiveBuilds`
     * @param list<string> $urls
     * @param array{env: string, build: string} $own
     * @return list<array{env: string, build: string}>
     */
    public static function builds(array $urls, string $title, string $experience, array $own): array
    {
        $found = [$own['env'] . '/' . $own['build'] => $own];
        $pattern = '#/(?:' . preg_quote($title, '#') . '|content)/(' . ContentStore::ENV . ')/' . preg_quote($experience, '#') . '/([0-9a-f]{12})/#';
        foreach ($urls as $url) {
            if (preg_match($pattern, (string) $url, $match)) $found["$match[1]/$match[2]"] = ['env' => $match[1], 'build' => $match[2]];
        }
        ksort($found);
        return array_values($found);
    }

    /** Where the archive came from: this API */
    private static function instance(): string
    {
        try {
            return Http::apiUrl();
        } catch (Throwable) {
            return Config::title();
        }
    }

    /**
     * The content source of an export (content-export.ts `planExport`): path → text, path → the file to download there
     * (`url` and what the export endpoint knows of it), what the source format cannot hold. Deterministic.
     * @param array<string, mixed> $data
     * @return array{texts: array<string, string>, downloads: array<string, array{url: string, file: ?array<string, mixed>}>, problems: list<string>}
     */
    public static function plan(array $data): array
    {
        $config = $data['configuration'];
        if (!$config instanceof stdClass) $config = json_decode((string) json_encode($config), false);
        $texts = [];
        $downloads = [];
        $problems = [];
        $filesByUrl = [];
        foreach ($data['files'] as $file) {
            $file = (array) $file;
            $filesByUrl[(string) $file['url']] = $file;
        }
        $placed = [];

        $reserve = static function (string $wanted, string $url) use (&$downloads, &$texts, $filesByUrl): string {
            $ext = self::extname($wanted);
            $stem = substr($wanted, 0, strlen($wanted) - strlen($ext));
            for ($n = 1; ; $n++) {
                $candidate = $n === 1 ? $wanted : "$stem-$n$ext";
                $taken = $downloads[$candidate] ?? null;
                if (!$taken && !isset($texts[$candidate])) {
                    $downloads[$candidate] = ['url' => $url, 'file' => $filesByUrl[$url] ?? null];
                    return $candidate;
                }
                if ($taken && $taken['url'] === $url) return $candidate;
            }
        };
        $local = static function (string $url, string $folder) use (&$placed, $reserve): string {
            $key = "$folder\n$url";
            if (isset($placed[$key])) return substr($placed[$key], strlen($folder) + 1);
            $contentPath = self::contentPathOf($url);
            $inFolder = $contentPath !== null && str_starts_with($contentPath, self::CONTENT_PREFIX . "$folder/") ? substr($contentPath, strlen(self::CONTENT_PREFIX)) : null;
            $at = $reserve($inFolder ?? "$folder/" . self::fileNameOf($url), $url);
            $placed[$key] = $at;
            return substr($at, strlen($folder) + 1);
        };
        $address = static function (string $url, string $folder) use ($reserve, $local): string {
            $contentPath = self::contentPathOf($url);
            if ($contentPath !== null) return self::CONTENT_PREFIX . $reserve(substr($contentPath, strlen(self::CONTENT_PREFIX)), $url);
            return self::CONTENT_PREFIX . "$folder/" . $local($url, $folder);
        };
        $isFile = static fn(string $value): bool => isset($filesByUrl[$value]) || (preg_match(self::FILE_VALUE, $value) && !preg_match('/\.js(?:[?#]|$)/i', $value));
        $addresses = static function (mixed $value, string $folder) use (&$addresses, $isFile, $address): mixed {
            if (is_string($value)) return $isFile($value) ? $address($value, $folder) : $value;
            if (is_array($value)) return array_map(static fn($item) => $addresses($item, $folder), $value);
            if ($value instanceof stdClass) {
                $out = new stdClass();
                foreach (get_object_vars($value) as $key => $item) $out->{$key} = $addresses($item, $folder);
                return $out;
            }
            return $value;
        };
        $levelsOf = static function (array $levels, string $folder) use ($local): stdClass {
            $out = new stdClass();
            foreach ($levels as $level) $out->{(string) $level->level} = $local((string) $level->src, $folder);
            return $out;
        };
        $texturesOf = static function (array $sets, string $folder) use ($local): mixed {
            $sizes = static function (stdClass $set) use ($local, $folder): stdClass {
                $out = new stdClass();
                foreach ($set->sizes as $size) $out->{(string) $size->size} = $local((string) $size->src, $folder);
                return $out;
            };
            if (count($sets) === 1 && !self::truthy($sets[0]->material ?? null)) return $sizes($sets[0]);
            return array_map(static function (stdClass $set) use ($sizes): stdClass {
                $out = new stdClass();
                if (self::truthy($set->material ?? null)) $out->material = $set->material;
                $out->sizes = $sizes($set);
                return $out;
            }, $sets);
        };
        $assetFiles = static function (stdClass $asset, string $folder, stdClass $into) use ($texturesOf, $levelsOf): void {
            if (isset($asset->textures)) $into->textures = $texturesOf($asset->textures, $folder);
            if (isset($asset->levels)) $into->levels = $levelsOf($asset->levels, $folder);
        };
        $nodeOf = static function (stdClass $node, string $label, string $idBase, string $folder, int $depth, string $kind) use (&$nodeOf, &$problems, $local, $assetFiles, $addresses): stdClass {
            $out = new stdClass();
            if (property_exists($node, 'id')) $out->id = $node->id;
            if (property_exists($node, 'name')) $out->name = $node->name;
            $out->type = $node->type ?? null;
            $srcId = $depth === 0 && $kind === 'entries' ? "$idBase-media" : $idBase;
            $assets = $node->assets ?? [];
            if (count($assets) === 1 && ($assets[0]->id ?? null) === $srcId) {
                $out->src = $local((string) $assets[0]->src, $folder);
                $assetFiles($assets[0], $folder, $out);
            } elseif ($assets) {
                $list = [];
                foreach ($assets as $i => $asset) {
                    $prefix = "$idBase-";
                    $id = (string) $asset->id;
                    if (str_starts_with($id, $prefix)) $id = substr($id, strlen($prefix));
                    else $problems[] = "$label: asset id \"{$asset->id}\" does not start with \"$prefix\" – the build will name it \"$prefix$id\"";
                    $item = new stdClass();
                    if ($id !== (string) $i) $item->id = $id;
                    $item->src = $local((string) $asset->src, $folder);
                    $assetFiles($asset, $folder, $item);
                    $list[] = $item;
                }
                $out->assets = $list;
            }
            if (property_exists($node, 'params')) $out->params = $addresses($node->params, $folder);
            if (property_exists($node, 'filters')) $out->filters = $node->filters;
            if (property_exists($node, 'components')) $out->components = $addresses($node->components, $folder);
            if (property_exists($node, 'material')) $out->material = $addresses($node->material, $folder);
            if (!empty($node->children)) {
                $out->children = [];
                foreach ($node->children as $i => $child) $out->children[] = $nodeOf($child, "$label children[$i]", "$idBase-$i", $folder, $depth + 1, $kind);
            }
            if (property_exists($node, 'text')) $out->text = $node->text;
            if (property_exists($node, 'color')) $out->color = $node->color;
            if (property_exists($node, 'light')) $out->light = $node->light;
            return $out;
        };

        // experience.yaml – every field as it is, the environment's world and sky as files of the folder
        $experience = new stdClass();
        $experience->id = $config->experience->id;
        $experience->title = $config->experience->title;
        foreach (get_object_vars($config->experience) as $key => $value) {
            if ($key === 'id' || $key === 'title') continue;
            if ($key === 'environment' && $value instanceof stdClass) {
                $environment = new stdClass();
                foreach (get_object_vars($value) as $field => $src) {
                    $environment->{$field} = ($field === 'worldSrc' || $field === 'skySrc') && is_string($src) && $src !== '' ? substr($address($src, 'environment'), strlen(self::CONTENT_PREFIX)) : $src;
                }
                $experience->environment = $environment;
            } elseif ($key === 'landing' && $value instanceof stdClass) {
                // The landing's pick (#355): its ids – the build extracts the hero again; its texts and shop as they are, a
                // shop item's picture as a file of the folder (#365)
                $landing = new stdClass();
                if (property_exists($value, 'scene')) {
                    $landing->scene = $value->scene;
                    $landing->target = $value->target ?? null;
                }
                if (property_exists($value, 'texts')) $landing->texts = $value->texts;
                if (is_array($value->shop ?? null)) {
                    $landing->shop = array_map(static function (mixed $item) use ($address): mixed {
                        if (!$item instanceof stdClass || !is_string($item->image ?? null) || $item->image === '') return $item;
                        $out = clone $item;
                        $out->image = substr($address($item->image, 'landing'), strlen(self::CONTENT_PREFIX));
                        return $out;
                    }, $value->shop);
                }
                if (get_object_vars($landing)) $experience->landing = $landing;
            } else {
                $experience->{$key} = $value;
            }
        }
        $texts['experience.yaml'] = self::yaml($experience);

        // scenes/<id>/scene.yaml – the order is their position; a surface's place only when it is not where the row puts it
        $scenes = $config->scenes ?? [];
        if ($scenes && self::truthy($config->initialScene ?? null) && $config->initialScene !== $scenes[0]->id) {
            $problems[] = "initialScene \"{$config->initialScene}\" is not the first scene – a content build opens on the first scene (\"{$scenes[0]->id}\")";
        }
        foreach ($scenes as $i => $scene) {
            $row = Scenes::rowPlaces(array_map(static fn(stdClass $surface) => (float) $surface->widthMm, $scene->surfaces));
            $surfaces = [];
            foreach ($scene->surfaces as $j => $surface) {
                $out = new stdClass();
                $out->id = $surface->id;
                if (property_exists($surface, 'label')) $out->label = $surface->label;
                $out->widthMm = $surface->widthMm;
                $out->heightMm = $surface->heightMm;
                if (!self::samePlace($surface->place ?? null, $row[$j])) $out->place = $surface->place ?? null;
                $surfaces[] = $out;
            }
            $out = new stdClass();
            $out->label = $scene->label ?? null;
            $out->order = $i + 1;
            if (property_exists($scene, 'group')) $out->group = $scene->group;
            $out->surfaces = $surfaces;
            if (property_exists($scene, 'passes')) $out->passes = $scene->passes;
            if (property_exists($scene, 'logic')) $out->logic = $scene->logic;
            $texts["scenes/{$scene->id}/scene.yaml"] = self::yaml($out);
        }
        if (!empty($config->groups)) {
            $texts[self::GROUPS_FILE] = self::yaml(array_map(static fn(stdClass $group) => (object) ['id' => $group->id, 'label' => $group->label], $config->groups));
        }

        // entities/<ref>/entity.yaml
        foreach (get_object_vars($config->entities ?? new stdClass()) as $ref => $node) {
            $texts["entities/$ref/entity.yaml"] = self::yaml($nodeOf($node, "entities/$ref", (string) $ref, "entities/$ref", 0, 'entities'));
        }

        // entries/<id>/entry.yaml
        $targetOf = static function (stdClass $target, string $entryId, string $folder) use (&$problems, $local, $nodeOf): stdClass {
            foreach (array_keys(get_object_vars($target)) as $key) {
                if (!in_array($key, self::KNOWN_TARGET, true)) $problems[] = "$folder target: \"$key\" is no field of a target's source – left out";
            }
            $out = new stdClass();
            if (($target->id ?? null) !== $entryId) $out->id = $target->id ?? null;
            $out->image = $local((string) $target->imageSrc, $folder);
            if (self::truthy($target->entity ?? null)) {
                $out->entity = property_exists($target->entity, 'ref') ? (object) ['ref' => $target->entity->ref] : $nodeOf($target->entity, "$folder target", (string) $target->id, $folder, 0, 'entries');
            }
            if (self::truthy($target->place ?? null)) $out->place = $target->place;
            if (($target->enabled ?? null) === false) $out->enabled = false;
            if (($target->recognitionOff ?? null) === true) $out->recognitionOff = true;
            if (self::truthy($target->recognition ?? null)) {
                $out->recognition = (object) ['image' => $local((string) $target->recognition->imageSrc, $folder), 'width' => $target->recognition->width ?? null, 'height' => $target->recognition->height ?? null];
            }
            return $out;
        };
        foreach ($config->entries ?? [] as $entry) {
            $folder = "entries/{$entry->id}";
            foreach (array_keys(get_object_vars($entry)) as $key) {
                if (!in_array($key, self::KNOWN_ENTRY, true)) $problems[] = "$folder: \"$key\" is no field of an entry's source – left out";
            }
            $out = new stdClass();
            $out->category = $entry->category ?? null;
            $out->title = $entry->title ?? null;
            $out->scene = $entry->scene ?? null;
            if (self::truthy($entry->surface ?? null)) $out->surface = $entry->surface;
            if (self::truthy($entry->author ?? null)) $out->author = $entry->author;
            $out->body = $entry->body ?? '';
            if (self::truthy($entry->image ?? null)) {
                $out->image = $local((string) $entry->image, $folder);
                if (property_exists($entry, 'imageLevels')) $out->imageLevels = $levelsOf($entry->imageLevels, $folder);
            }
            if (self::truthy($entry->caption ?? null)) $out->caption = $entry->caption;
            if (self::truthy($entry->media ?? null)) $out->media = $entry->media;
            $out->tags = $entry->tags ?? [];
            if (self::truthy($entry->target ?? null)) $out->target = $targetOf($entry->target, (string) $entry->id, $folder);
            $texts["$folder/entry.yaml"] = self::yaml($out);
        }

        // The subtitles: `<video name>.<language>.vtt` next to the video
        foreach ($config->subtitles ?? [] as $subtitle) {
            $video = null;
            foreach ($downloads as $at => $planned) {
                if ($planned['url'] === $subtitle->media) {
                    $video = (string) $at;
                    break;
                }
            }
            $name = $video !== null ? self::subtitleNameOf($video) : null;
            if ($video === null || $name === null) {
                $problems[] = "subtitles of {$subtitle->media}: the video is not in the export – left out";
                continue;
            }
            $slash = strrpos($video, '/');
            $dir = $slash === false ? '.' : substr($video, 0, $slash);
            foreach (get_object_vars($subtitle->tracks) as $language => $url) $reserve("$dir/$name.$language.vtt", (string) $url);
        }

        // The print layout: its files where the content holds them
        $layout = $data['layout'] ?? null;
        foreach ((is_array($layout) ? ($layout['files'] ?? []) : ($layout->files ?? [])) as $url) {
            $contentPath = self::contentPathOf((string) $url);
            $reserve($contentPath !== null ? substr($contentPath, strlen(self::CONTENT_PREFIX)) : 'layout/' . self::fileNameOf((string) $url), (string) $url);
        }

        // plugins/<id>/<file> – the Code tab's plugins, every file (#352)
        $plugins = array_map(static fn($plugin) => (array) $plugin, $data['plugins'] ?? []);
        usort($plugins, static fn(array $a, array $b): int => strcmp((string) $a['id'], (string) $b['id']));
        foreach ($plugins as $plugin) {
            foreach ($plugin['files'] ?? [] as $file) {
                $file = (array) $file;
                $texts["plugins/{$plugin['id']}/{$file['name']}"] = str_replace("\r\n", "\n", (string) $file['text']);
            }
        }
        $sourceIds = array_column($plugins, 'id');
        foreach ($config->plugins ?? [] as $plugin) {
            if (!in_array($plugin->id, $sourceIds, true)) $problems[] = "plugins/{$plugin->id}: the configuration declares it, but the database has no source of it – left out";
        }

        // credits.yaml – the Library's lines of the files the export holds
        $creditLines = (array) ($data['credits'] ?? []);
        $credits = new stdClass();
        $paths = array_map('strval', array_keys($downloads));
        sort($paths, SORT_STRING);
        foreach ($paths as $at) {
            $line = $creditLines[$downloads[$at]['url']] ?? null;
            if (is_string($line) && $line !== '') $credits->{$at} = $line;
        }
        if (get_object_vars($credits)) $texts[self::CREDITS_FILE] = self::yaml($credits);

        return ['texts' => $texts, 'downloads' => $downloads, 'problems' => $problems];
    }

    /** EXPORT.md of an archive (content-export.ts `archiveMarker`) */
    private static function marker(array $data, array $record): string
    {
        $title = $data['configuration']->experience->title ?? '';
        $lines = [
            '# Export archive – do not edit',
            '',
            "This folder is the export of the published build {$record['build']} of the experience `{$data['experience']}`, written",
            'into the content store when it was published (docs/content.md "Export archive"). It holds the content source',
            '(YAML, plugin sources) but no media: export.json names every file by its path in this folder and the URL it is read',
            'from – the build\'s own immutable content files and the Library\'s uploads. `osct content purge` keeps every build the',
            'newest export of an experience still names. A folder here is never written again.',
            '',
            '| | |',
            '|---|---|',
            "| Instance | {$record['instance']} |",
            "| Experience | {$data['experience']} – $title |",
            "| From | the published build {$record['build']} ({$record['env']}, {$data['source']['publishedAt']}) |",
            "| Build | {$record['build']} |",
            "| Hash | {$record['hash']} |",
            '| Content schema | ' . ($record['schema'] !== '' ? $record['schema'] : '–') . ' |',
            "| Exported | {$record['exportedAt']} |",
            "| App version | {$record['appVersion']} |",
            '| Files | ' . count($record['files']) . ' named, not copied (export.json: path, URL, checksum where known) |',
            '',
        ];
        if ($record['problems']) {
            $lines[] = 'What the content source cannot hold (left out or changed):';
            $lines[] = '';
            foreach ($record['problems'] as $problem) $lines[] = "- $problem";
            $lines[] = '';
        }
        return implode("\n", $lines);
    }

    /** JavaScript's truthiness (content-export.ts tests fields with it) */
    private static function truthy(mixed $value): bool
    {
        return $value !== null && $value !== false && $value !== 0 && $value !== 0.0 && $value !== '';
    }

    /** Whether a surface's place is the one the row gives it (content-export.ts compares them as JSON) */
    private static function samePlace(mixed $place, stdClass $row): bool
    {
        if (!$place instanceof stdClass) return false;
        $a = get_object_vars($place);
        $b = get_object_vars($row);
        if (array_keys($a) !== array_keys($b)) return false;
        foreach ($b as $key => $value) {
            if (!is_int($a[$key]) && !is_float($a[$key])) return false;
            if ((float) $a[$key] !== (float) $value) return false;
        }
        return true;
    }

    private static function contentPathOf(string $value): ?string
    {
        $at = strpos($value, self::CONTENT_PREFIX);
        if ($at === false) return null;
        return (string) preg_replace('/[?#].*$/s', '', substr($value, $at));
    }

    private static function fileNameOf(string $url): string
    {
        $last = (string) preg_replace('#^.*/#', '', (string) preg_replace('/[?#].*$/s', '', $url));
        $name = rawurldecode($last);
        if (!mb_check_encoding($name, 'UTF-8')) $name = $last;
        $name = (string) preg_replace('/^[.-]+/', '', (string) preg_replace('/[^A-Za-z0-9._@-]+/', '-', $name));
        return $name !== '' ? $name : 'file';
    }

    /** path.posix.extname */
    private static function extname(string $path): string
    {
        $base = (string) preg_replace('#^.*/#', '', $path);
        $dot = strrpos($base, '.');
        return $dot === false || $dot === 0 ? '' : substr($base, $dot);
    }

    private static function subtitleNameOf(string $path): ?string
    {
        $name = (string) preg_replace('#^.*[\\\\/]#', '', (string) preg_replace('/[?#].*$/s', '', $path));
        return preg_match(self::VIDEO, $name) ? (string) preg_replace(self::VIDEO, '', $name) : null;
    }

    /**
     * YAML of a JSON value – block style, maps (stdClass) and lists (arrays) as the content build reads them (js-yaml).
     * Strings stay plain only when nothing could read them as another type; everything else is double-quoted (JSON's
     * escapes are YAML's).
     */
    public static function yaml(mixed $value): string
    {
        return self::node($value, 0) . "\n";
    }

    private static function node(mixed $value, int $indent): string
    {
        $pad = str_repeat(' ', $indent);
        if ($value instanceof stdClass) {
            $vars = get_object_vars($value);
            if (!$vars) return $pad . '{}';
            $lines = [];
            foreach ($vars as $key => $item) {
                $head = $pad . self::scalar((string) $key) . ':';
                $lines[] = self::isBlock($item) ? $head . "\n" . self::node($item, $indent + 2) : $head . ' ' . self::scalar($item);
            }
            return implode("\n", $lines);
        }
        if (is_array($value)) {
            if (!$value) return $pad . '[]';
            $lines = [];
            foreach (array_values($value) as $item) {
                if (self::isBlock($item)) {
                    // The item's block, its first line behind the dash
                    $block = self::node($item, $indent + 2);
                    $lines[] = $pad . '- ' . substr($block, $indent + 2);
                } else {
                    $lines[] = $pad . '- ' . self::scalar($item);
                }
            }
            return implode("\n", $lines);
        }
        return $pad . self::scalar($value);
    }

    /** A non-empty map or list (written as a block); empty ones are `{}` / `[]` */
    private static function isBlock(mixed $value): bool
    {
        return ($value instanceof stdClass && get_object_vars($value)) || (is_array($value) && $value);
    }

    private static function scalar(mixed $value): string
    {
        if ($value === null) return 'null';
        if ($value === true) return 'true';
        if ($value === false) return 'false';
        if (is_int($value)) return (string) $value;
        if (is_float($value)) return (string) json_encode($value);
        if ($value instanceof stdClass) return '{}';
        if (is_array($value)) return '[]';
        $text = (string) $value;
        $plain = preg_match('#^[A-Za-z_/][A-Za-z0-9_ ./@()-]*$#', $text) && !str_ends_with($text, ' ')
            && !preg_match('/^(?:true|false|null|yes|no|on|off|y|n|~)$/i', $text);
        return $plain ? $text : (string) json_encode($text, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
