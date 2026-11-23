<?php
declare(strict_types=1);

/**
 * The editor's side of the API (/editor/*, docs/server.md "Editor data"): who may use it and the checks the editor
 * endpoints share (ids, entity bodies, request size, JSON). The editor is an authors' tool – only users with the role
 * `editor` (Roles) get past `Editor::user()`; readers get 403. Admins make editors (Admin.php).
 */
final class Editor
{
    /** Ids and references in paths and bodies (experiences, scenes, entries, targets, entities – shared/api/rules.ts `ID_PATTERN`) */
    public const ID = '[A-Za-z0-9_-]{1,64}';

    // The constants below copy rules of the content contract (shared/); mcp/test/php-rules.test.ts fails on a difference

    /** The entity types of the content contract: shared/types/game-config.ts `ENTITY_TYPES` */
    public const ENTITY_TYPES = ['group', 'model', 'video', 'image', 'text', 'light'];
    /** The built-in component types (shared/types/components.ts `COMPONENTS`) – every other type is a plugin's */
    public const COMPONENT_TYPES = ['animation', 'reveal', 'found', 'lost', 'behaviour'];
    /** A plugin's node type (shared/types/node-types.ts `NODE_TYPE_PATTERN`): camelCase letters and digits, at most 32 (entities.type) */
    public const PLUGIN_NODE_TYPE = '[a-z][a-zA-Z0-9]{0,31}';
    /** A plugin's material type (shared/types/materials.ts `MATERIAL_TYPE_PATTERN`): camelCase letters and digits, at most 40 */
    public const MATERIAL_TYPE = '[a-z][a-zA-Z0-9]{0,39}';
    /** The entry categories of the content contract (shared/types/entry.ts `ENTRY_CATEGORIES`) */
    public const ENTRY_CATEGORIES = ['glossary', 'video', 'text', 'link'];
    /**
     * The content schema the editor reads and the draft writes (shared/types/game-config.ts `CONTENT_SCHEMA_VERSION`): an
     * experience of an older MAJOR is refused (`Db::migrate` turns every stored 4.x experience into 6.0 – `Migration5`, #334 –
     * and every 5.x one – `Migration6`, #341)
     */
    public const CONTENT_SCHEMA = '6.1';
    /**
     * The levels a picture, video or sound may hold (shared/types/media-levels.ts `MEDIA_LEVELS`, schema 4.3, #331): image
     * px (longest side), video height, audio kbps
     */
    public const MEDIA_LEVELS = ['image' => [512, 1024, 2048], 'video' => [480, 720, 1080], 'audio' => [64, 128, 192]];
    public const CONTENT_SCHEMA_MAJOR = 6;

    /**
     * A medium's `levels` (#331, shared/types/media-levels.ts `mediaLevelProblems`): a list of at least one `{ level, src }`,
     * the level one of MEDIA_LEVELS[$kind], each once, smallest first in the answer. 400 `$code` otherwise.
     * @return list<stdClass>
     */
    public static function mediaLevels(mixed $value, string $kind, string $path, string $code = 'invalid-entity'): array
    {
        $allowed = self::MEDIA_LEVELS[$kind] ?? null;
        if ($allowed === null) throw new ApiError(400, $code, "$path: only an image, a video or a sound has levels.");
        if (!is_array($value) || $value === []) throw new ApiError(400, $code, "$path must be a list of at least one { level, src }.");
        $levels = [];
        foreach (array_values($value) as $i => $entry) {
            if (!$entry instanceof stdClass || !is_int($entry->level ?? null) || !in_array($entry->level, $allowed, true)) {
                throw new ApiError(400, $code, "$path[$i].level must be one of " . implode(', ', $allowed) . " ($kind).");
            }
            if (!is_string($entry->src ?? null) || $entry->src === '') throw new ApiError(400, $code, "$path[$i].src must be a file.");
            if (isset($levels[$entry->level])) throw new ApiError(400, $code, "$path[$i].level: {$entry->level} is there twice.");
            $levels[$entry->level] = (object) ['level' => $entry->level, 'src' => $entry->src];
        }
        ksort($levels);
        return array_values($levels);
    }

    /** Whether a content schema `MAJOR.MINOR` is the editor's (`CONTENT_SCHEMA_MAJOR`) */
    public static function isCurrentSchema(string $schema): bool
    {
        return (int) explode('.', $schema)[0] === self::CONTENT_SCHEMA_MAJOR;
    }
    /** How deep an entity's node tree may nest (shared/guards: MAX_NODE_DEPTH) */
    public const MAX_NODE_DEPTH = 8;
    /**
     * The signed-in editor, else 401 (not signed in) or 403 (a reader).
     * @return array<string, mixed>
     */
    public static function user(): array
    {
        $user = Auth::user();
        return Roles::require($user, Roles::EDITOR);
    }

    /** A valid id or reference, else 400 */
    public static function id(mixed $value, string $what): string
    {
        if (!is_string($value) || !preg_match('/^' . self::ID . '$/', $value)) {
            throw new ApiError(400, 'invalid-id', "$what must be 1–64 letters, digits, _ or -.");
        }
        return $value;
    }

    /** The request body as objects (a JSON `{}` stays an object), refused above EDITOR_MAX_BYTES */
    public static function body(): stdClass
    {
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > Config::int('EDITOR_MAX_BYTES')) {
            throw new ApiError(413, 'body-too-large', 'The request body is too large.');
        }
        return Http::bodyObject();
    }

    /**
     * An entity as the content contract describes it (`EntityData`): an object with a `type` from ENTITY_TYPES
     * and an `assets` list of objects with string `id`, `assetType` and `src`. Every other key (params, filters, …)
     * passes through untouched – the reader's guard checks the configuration in depth.
     * `$pluginTypes` (`Editor::pluginNodeTypes`) – which node types outside ENTITY_TYPES (a plugin's, `registerNodeType`)
     * pass: a list = the node types the experience's declared plugins recorded (anything else is a typo); `true` = any named like a plugin's (camelCase), because a plugin of the experience is unknown until it runs (a
     * declared one without recorded specs, a Code tab source – the editor's stage and the content build run the code,
     * the publish refuses one without compiled plugins); `false` = none (the experience has no plugins).
     * `$pluginMaterials` – the material types the same way: a list = the recorded ones, `true` = any camelCase name.
     * @param bool|list<string> $pluginTypes
     * @param bool|list<string> $pluginMaterials
     */
    public static function entity(mixed $value, string $path = 'entity', int $depth = 0, bool|array $pluginTypes = false, bool|array $pluginMaterials = true): stdClass
    {
        if (!$value instanceof stdClass) throw new ApiError(400, 'invalid-entity', "$path must be an object.");
        $type = $value->type ?? null;
        $builtIn = is_string($type) && in_array($type, self::ENTITY_TYPES, true);
        $plugin = is_string($type) && (is_array($pluginTypes)
            ? in_array($type, $pluginTypes, true)
            : $pluginTypes && preg_match('/^' . self::PLUGIN_NODE_TYPE . '$/', $type) === 1);
        if (!$builtIn && !$plugin) {
            $plugins = match (true) {
                is_array($pluginTypes) && $pluginTypes !== [] => ' or a node type a plugin of the experience registers (' . implode(', ', $pluginTypes) . ').',
                is_array($pluginTypes) => ' – the experience\'s plugins register no node type.',
                $pluginTypes => ' or a plugin\'s node type (camelCase letters and digits).',
                default => ' – a plugin\'s node type needs a plugin in the experience.',
            };
            throw new ApiError(400, 'invalid-entity', "$path.type must be one of " . implode(', ', self::ENTITY_TYPES) . $plugins);
        }
        if (!is_array($value->assets ?? null)) throw new ApiError(400, 'invalid-entity', "$path.assets must be an array.");
        foreach ($value->assets as $i => $asset) {
            if (!$asset instanceof stdClass || !is_string($asset->id ?? null) || !is_string($asset->assetType ?? null) || !is_string($asset->src ?? null)) {
                throw new ApiError(400, 'invalid-entity', "$path.assets[$i] needs string id, assetType and src.");
            }
            if (property_exists($asset, 'levels')) $asset->levels = self::mediaLevels($asset->levels, $asset->assetType, "$path.assets[$i].levels");
        }
        if (property_exists($value, 'id') && !is_string($value->id)) throw new ApiError(400, 'invalid-entity', "$path.id must be a string.");
        if (property_exists($value, 'name') && !is_string($value->name)) throw new ApiError(400, 'invalid-entity', "$path.name must be a string.");
        if (property_exists($value, 'text') && !is_string($value->text)) throw new ApiError(400, 'invalid-entity', "$path.text must be a string.");
        if (property_exists($value, 'color') && !(is_string($value->color) && preg_match('/^#[0-9a-f]{6}$/i', $value->color))) {
            throw new ApiError(400, 'invalid-entity', "$path.color must be #rrggbb.");
        }
        if (property_exists($value, 'light')) {
            if ($value->type !== 'light') throw new ApiError(400, 'invalid-entity', "$path.light: only a light node has a light.");
            if (!$value->light instanceof stdClass) throw new ApiError(400, 'invalid-entity', "$path.light must be an object.");
        }
        // A plugin's material: its type and values – which types exist the publish checks (409 unknown-materials)
        if (property_exists($value, 'material')) {
            $material = $value->material;
            if (!$material instanceof stdClass || !is_string($material->type ?? null) || !preg_match('/^' . self::MATERIAL_TYPE . '$/', $material->type)) {
                throw new ApiError(400, 'invalid-entity', "$path.material must be { type, params? } with a material type (camelCase letters and digits).");
            }
            if (property_exists($material, 'params') && !$material->params instanceof stdClass) throw new ApiError(400, 'invalid-entity', "$path.material.params must be an object.");
            if ($pluginTypes === false) throw new ApiError(400, 'invalid-entity', "$path.material: a material is a plugin's – the experience has no plugins.");
            if (is_array($pluginMaterials) && !in_array($material->type, $pluginMaterials, true)) {
                $known = $pluginMaterials === [] ? ' – the experience\'s plugins register none.' : ' (' . implode(', ', $pluginMaterials) . ').';
                throw new ApiError(400, 'invalid-entity', "$path.material.type must be a material a plugin of the experience registers$known");
            }
        }
        // The behaviour's rules: their shapes (content schema 5.0 – a condition is an expression, a goto goes to scene:<id>)
        if (property_exists($value, 'components')) Logic::components($value->components, "$path.components");
        if (property_exists($value, 'children')) {
            if (!is_array($value->children)) throw new ApiError(400, 'invalid-entity', "$path.children must be an array.");
            if ($depth >= self::MAX_NODE_DEPTH) throw new ApiError(400, 'invalid-entity', "$path.children: nodes nest deeper than " . self::MAX_NODE_DEPTH . ' levels.');
            foreach ($value->children as $i => $child) self::entity($child, "$path.children[$i]", $depth + 1, $pluginTypes, $pluginMaterials);
        }
        return $value;
    }

    /**
     * The plugin node types a save in this experience accepts (`Editor::entity`'s `$pluginTypes`): from the compiled plugins
     * its configuration declares (`experiences.plugins_json`) and its Code tab sources
     * @return bool|list<string>
     */
    public static function pluginNodeTypes(string $experienceId): bool|array
    {
        $json = Db::value('SELECT plugins_json FROM experiences WHERE id = :id', ['id' => $experienceId]);
        $declared = self::decode(is_string($json) ? $json : null);
        return self::nodeTypesOf(is_array($declared) ? $declared : [], Plugins::hasSources($experienceId));
    }

    /**
     * The plugin node types of declared plugins and Code tab sources: the recorded ones when every declared plugin
     * recorded what it registers and there are no sources; `true` (any camelCase name) when a plugin is unknown until it
     * runs – a Code tab source has no recorded specs (it is never built here), nor has a plugin of an older build;
     * `false` without plugins
     * @param array<mixed> $declared
     * @return bool|list<string>
     */
    public static function nodeTypesOf(array $declared, bool $hasSources): bool|array
    {
        return self::typesOf($declared, $hasSources, 'nodeTypes');
    }

    /**
     * The material types a save in this experience accepts (`Editor::entity`'s `$pluginMaterials`), as `pluginNodeTypes`
     * @return bool|list<string>
     */
    public static function pluginMaterials(string $experienceId): bool|array
    {
        return self::pluginTypesOfExperience($experienceId, 'materials');
    }

    /**
     * The types of a kind (`materials`, `passes`, `appearances`) a save in this experience accepts: from the compiled plugins its
     * configuration declares and its Code tab sources (`typesOf`)
     * @return bool|list<string>
     */
    public static function pluginTypesOfExperience(string $experienceId, string $kind): bool|array
    {
        $json = Db::value('SELECT plugins_json FROM experiences WHERE id = :id', ['id' => $experienceId]);
        $declared = self::decode(is_string($json) ? $json : null);
        return self::typesOf(is_array($declared) ? $declared : [], Plugins::hasSources($experienceId), $kind);
    }

    /**
     * The types of a kind (`nodeTypes`, `materials`, `passes`, `appearances`) the declared plugins and Code tab sources may register: the recorded
     * ones when every declared plugin recorded what it registers and there are no sources; `true` when a plugin is unknown
     * until it runs; `false` without plugins
     * @param array<mixed> $declared
     * @return bool|list<string>
     */
    public static function typesOf(array $declared, bool $hasSources, string $kind): bool|array
    {
        if ($hasSources) return true;
        if ($declared === []) return false;
        return self::recorded($declared)[$kind] ?? true;
    }

    /**
     * What the declared plugins registered, from their recorded `registered`
     * (shared/types/plugins.ts `recordedRegistrations`) – null when one of them recorded nothing (an older build: what it
     * registers is known only when it runs). No plugins: nothing registered.
     * @param array<mixed> $declared
     * @return array{components: list<string>, nodeTypes: list<string>, passes: list<string>, materials: list<string>, textures: list<string>, appearances: list<string>}|null
     */
    public static function recorded(array $declared): ?array
    {
        $recorded = ['components' => [], 'nodeTypes' => [], 'passes' => [], 'materials' => [], 'textures' => [], 'appearances' => []];
        foreach ($declared as $plugin) {
            $registered = $plugin instanceof stdClass ? ($plugin->registered ?? null) : null;
            if (!$registered instanceof stdClass) return null;
            foreach (array_keys($recorded) as $kind) {
                if (!($registered->{$kind} ?? null) instanceof stdClass) continue;
                foreach (array_keys(get_object_vars($registered->{$kind})) as $type) $recorded[$kind][] = (string) $type;
            }
        }
        return array_map(static fn(array $types): array => array_values(array_unique($types)), $recorded);
    }

    /** JSON as the *_json columns and the content files hold it – the same flags as the content build */
    public static function encode(mixed $value, bool $pretty = false): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR | ($pretty ? JSON_PRETTY_PRINT : 0));
    }

    /** A *_json column back to objects (`{}` stays an object) */
    public static function decode(?string $json): mixed
    {
        return $json === null || $json === '' ? null : json_decode($json, false, 512, JSON_THROW_ON_ERROR);
    }

    /** Milliseconds since 1970 (UTC), as the BIGINT *_at columns of the editor's tables store times */
    public static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    /** ISO 8601 UTC with milliseconds (`2026-10-29T20:15:03.123Z`), as the content build writes timestamps */
    public static function iso(?int $ms = null): string
    {
        $ms ??= self::nowMs();
        return gmdate('Y-m-d\TH:i:s', intdiv($ms, 1000)) . sprintf('.%03dZ', $ms % 1000);
    }

    /** A DATETIME column (UTC) as ISO 8601 */
    public static function isoOf(string $datetime): string
    {
        return gmdate('c', (int) strtotime($datetime . ' UTC'));
    }
}
