<?php
declare(strict_types=1);

/**
 * The editor's side of the API (/editor/*, docs/server.md "Editor data"): who may use it, the admin endpoint that
 * makes editors, and the checks the editor endpoints share (ids, entity bodies, request size, JSON). The editor is
 * an authors' tool – only users with role `editor` get past `Editor::user()`; readers get 403.
 */
final class Editor
{
    /** Ids and references in paths and bodies (books, spreads, entries, targets, entities) */
    public const ID = '[A-Za-z0-9_-]{1,64}';

    /** The entity types of the content contract: shared/types/game-config.ts `ENTITY_TYPES` – keep in step */
    public const ENTITY_TYPES = ['model', 'video', 'image'];

    /**
     * The signed-in editor, else 401 (not signed in) or 403 (a reader).
     * @return array<string, mixed>
     */
    public static function user(): array
    {
        $user = Auth::user();
        if (($user['role'] ?? 'reader') !== 'editor') throw new ApiError(403, 'forbidden', 'Only editors may use this.');
        return $user;
    }

    /**
     * POST /admin/editors { email } (X-Admin-Secret) → { user, created }: gives the user the role editor, creating
     * the user (confirmed, language en, no options) when the address is new.
     */
    public static function makeEditor(array $body): never
    {
        $email = Auth::email($body['email'] ?? null);
        $now = Db::now();
        $user = Db::one('SELECT * FROM users WHERE email = :email', ['email' => $email]);
        $created = $user === null;
        if ($created) {
            $id = Db::uuid();
            Db::run(
                'INSERT INTO users (id, email, language, role, created_at, confirmed_at, updated_at) VALUES (:id, :email, :language, :role, :now, :now2, :now3)',
                ['id' => $id, 'email' => $email, 'language' => 'en', 'role' => 'editor', 'now' => $now, 'now2' => $now, 'now3' => $now]
            );
        } else {
            $id = $user['id'];
            Db::run('UPDATE users SET role = :role, updated_at = :now WHERE id = :id', ['role' => 'editor', 'now' => $now, 'id' => $id]);
        }
        Http::json(200, ['user' => Users::toJson(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $id])), 'created' => $created]);
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
     */
    public static function entity(mixed $value, string $path = 'entity'): stdClass
    {
        if (!$value instanceof stdClass) throw new ApiError(400, 'invalid-entity', "$path must be an object.");
        if (!is_string($value->type ?? null) || !in_array($value->type, self::ENTITY_TYPES, true)) {
            throw new ApiError(400, 'invalid-entity', "$path.type must be one of " . implode(', ', self::ENTITY_TYPES) . '.');
        }
        if (!is_array($value->assets ?? null)) throw new ApiError(400, 'invalid-entity', "$path.assets must be an array.");
        foreach ($value->assets as $i => $asset) {
            if (!$asset instanceof stdClass || !is_string($asset->id ?? null) || !is_string($asset->assetType ?? null) || !is_string($asset->src ?? null)) {
                throw new ApiError(400, 'invalid-entity', "$path.assets[$i] needs string id, assetType and src.");
            }
        }
        return $value;
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
