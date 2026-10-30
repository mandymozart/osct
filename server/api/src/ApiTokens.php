<?php
declare(strict_types=1);

/**
 * Personal access tokens for AI connections (docs/server.md "AI connections"), after SCUTOONS' `api_tokens`: an editor
 * or admin makes one on the editor's books page and hands it to an MCP client (`OSCT_EDITOR_TOKEN`). A request with
 * `Authorization: Bearer osct_…` is that user with their current roles – every role check decides as for a session.
 *
 * - Stored as a SHA-256 hash, like sessions; the token itself is answered once, when it is made. The prefix `osct_`
 *   tells it from a session token (sessions have none).
 * - It expires LIFETIME_DAYS after it was made or renewed; renewing and revoking need the person's own sign-in.
 * - What a token never does (403 `not-for-ai`): make, renew or revoke tokens, change the password or the account,
 *   delete the account (`Auth::session()` refuses it) and publish to any environment (`Auth::refuseToken()`).
 * - A token whose account has neither the editor nor the admin role any more stops working (401).
 * - `last_used_at` is written at most once a minute.
 */
final class ApiTokens
{
    public const PREFIX = 'osct_';
    public const LIFETIME_DAYS = 182;
    /** How often `last_used_at` is written at most */
    private const TOUCH_SECONDS = 60;
    /** The characters of the token kept in clear to tell tokens apart in the list (the prefix and four more) */
    private const SHOWN = 9;

    public static function isToken(string $bearer): bool
    {
        return str_starts_with($bearer, self::PREFIX);
    }

    /** Only these roles have tools for an AI to use */
    public static function mayHold(array $user): bool
    {
        return Roles::has($user, Roles::EDITOR) || Roles::has($user, Roles::ADMIN);
    }

    /**
     * The user behind a token and its row, else 401: unknown, revoked (`token-revoked`), expired (`token-expired`) or
     * an account without the editor or admin role (`no-editor-role`).
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    public static function authenticate(string $token): array
    {
        $row = Db::one('SELECT * FROM api_tokens WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
        if (!$row) throw new ApiError(401, 'unauthorized', 'Unknown token.');
        if ($row['revoked_at'] !== null) {
            throw new ApiError(401, 'token-revoked', 'This token was revoked – make a new one on the editor\'s books page (AI connections).');
        }
        if ($row['expires_at'] !== null && $row['expires_at'] < Db::now()) {
            throw new ApiError(401, 'token-expired', 'This token has expired – renew it on the editor\'s books page (AI connections).');
        }
        $user = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $row['user_id']]);
        if (!$user) throw new ApiError(401, 'unauthorized', 'Unknown token.');
        $user = Roles::grantConfigured($user);
        if (!self::mayHold($user)) throw new ApiError(401, 'no-editor-role', 'This token\'s account has neither the editor nor the admin role.');
        if ($row['last_used_at'] === null || $row['last_used_at'] < Db::now(-self::TOUCH_SECONDS)) {
            $now = Db::now();
            Db::run('UPDATE api_tokens SET last_used_at = :now WHERE id = :id', ['now' => $now, 'id' => $row['id']]);
            $row['last_used_at'] = $now;
        }
        return [$user, $row];
    }

    /** GET /user/tokens → { tokens } – the signed-in person's tokens that are not revoked, newest first */
    public static function list(): never
    {
        [$user] = Auth::session();
        $rows = Db::run('SELECT * FROM api_tokens WHERE user_id = :user AND revoked_at IS NULL ORDER BY created_at DESC, id', ['user' => $user['id']])->fetchAll();
        Http::json(200, ['tokens' => array_map(static fn(array $row) => self::toJson($row), $rows)]);
    }

    /**
     * POST /user/tokens { name } → 201 { token, apiToken } – always for the signed-in person (nothing in the body names
     * another user); the token itself is in this answer only. 403 `forbidden` for a reader, 400 `invalid-name`.
     */
    public static function create(array $body): never
    {
        [$user] = Auth::session();
        self::requireRole($user);
        $name = self::name($body['name'] ?? null);
        $token = self::PREFIX . Auth::randomToken();
        $id = Db::uuid();
        Db::run(
            'INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix, created_at, expires_at) VALUES (:id, :user, :name, :hash, :prefix, :created, :expires)',
            ['id' => $id, 'user' => $user['id'], 'name' => $name, 'hash' => hash('sha256', $token), 'prefix' => substr($token, 0, self::SHOWN),
             'created' => Db::now(), 'expires' => Db::now(86400 * self::LIFETIME_DAYS)]
        );
        Http::json(201, ['token' => $token, 'apiToken' => self::toJson(self::own($user, $id))]);
    }

    /** POST /user/tokens/{id}/renew → { apiToken } – expires LIFETIME_DAYS from now; 404 for another's or a revoked one */
    public static function renew(string $id): never
    {
        [$user] = Auth::session();
        self::requireRole($user);
        $row = self::own($user, $id);
        Db::run('UPDATE api_tokens SET expires_at = :expires WHERE id = :id', ['expires' => Db::now(86400 * self::LIFETIME_DAYS), 'id' => $row['id']]);
        Http::json(200, ['apiToken' => self::toJson(self::own($user, $id))]);
    }

    /** DELETE /user/tokens/{id} → 204 – the token stops working at once (the row stays for the record) */
    public static function revoke(string $id): never
    {
        [$user] = Auth::session();
        $row = self::own($user, $id);
        Db::run('UPDATE api_tokens SET revoked_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $row['id']]);
        Http::json(204, null);
    }

    /** @param array<string, mixed> $row */
    public static function toJson(array $row): array
    {
        $iso = static fn(?string $value) => $value === null ? null : gmdate('c', (int) strtotime($value . ' UTC'));
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'prefix' => $row['token_prefix'] . '…',
            'createdAt' => $iso($row['created_at']),
            'lastUsedAt' => $iso($row['last_used_at']),
            'expiresAt' => $iso($row['expires_at']),
            'expired' => $row['expires_at'] !== null && $row['expires_at'] < Db::now(),
        ];
    }

    /** @param array<string, mixed> $user */
    private static function requireRole(array $user): void
    {
        if (!self::mayHold($user)) throw new ApiError(403, 'forbidden', 'Only editors and admins can connect an AI.', ['role' => Roles::EDITOR]);
    }

    /**
     * The person's own token that is not revoked, else 404 – another user's token is as unknown as none
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private static function own(array $user, string $id): array
    {
        $row = Db::one('SELECT * FROM api_tokens WHERE id = :id AND user_id = :user AND revoked_at IS NULL', ['id' => $id, 'user' => $user['id']]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such token.');
        return $row;
    }

    /** A token's name: 1–80 characters, no control characters, trimmed */
    private static function name(mixed $value): string
    {
        $name = is_string($value) ? trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value)) : '';
        if ($name === '' || !preg_match('/^.{1,80}$/u', $name)) {
            throw new ApiError(400, 'invalid-name', 'Name the connection in 1–80 characters, e.g. "Claude on my laptop".');
        }
        return $name;
    }
}
