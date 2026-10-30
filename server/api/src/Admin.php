<?php
declare(strict_types=1);

/**
 * The admin endpoints (/admin/*, docs/server.md "Admin API"): who may call them, the users (search, their roles,
 * preferences and language), grant / revoke a role, the newsletter list as CSV. The admin page of the editor app
 * (/editor/admin, docs/admin.md) is their UI; after SCUTOONS' admin API (`/api/admin/users`, `…/roles/{role}`).
 *
 * Access: a signed-in user with the role `admin` (Bearer token), or the admin secret in `X-Admin-Secret` – the
 * break-glass path from the deploy or the shell, which also runs /admin/migrate (secret only, index.php).
 */
final class Admin
{
    /** How many users a search answers at most (a limit= below that narrows) */
    private const MAX_USERS = 200;

    /**
     * The caller of an admin endpoint: the admin's user row, or null for the secret. A secret that is given but wrong
     * → 403; no secret and no session → 401; a session without the role → 403 forbidden { role: admin }.
     * @return array<string, mixed>|null
     */
    public static function actor(): ?array
    {
        $given = (string) ($_SERVER['HTTP_X_ADMIN_SECRET'] ?? '');
        if ($given !== '') {
            $secret = Config::get('SECRET');
            if (strlen($secret) < 32 || !hash_equals($secret, $given)) throw new ApiError(403, 'forbidden', 'Not allowed.');
            return null;
        }
        $user = Auth::user();
        // An AI connection's token never reaches the admin page: roles and editors are the person's own business (#142)
        Auth::refuseToken('The admin page');
        return Roles::require($user, Roles::ADMIN);
    }

    /** user_roles.granted_by for this caller: the admin's id, or `secret` */
    public static function by(?array $actor): string
    {
        return $actor === null ? 'secret' : (string) $actor['id'];
    }

    /** GET /admin/roles → { roles: [{ id, name, description }] } */
    public static function roles(): never
    {
        self::actor();
        Http::json(200, ['roles' => Roles::all()]);
    }

    /**
     * GET /admin/users?q=&role=&newsletter=1&limit= → { users: [{ …user, id, roles, grants, lastSeenAt }], total }:
     * newest first; `q` = part of the e-mail address, `role` = only users with that role, `newsletter=1` = only users
     * with an update option on.
     */
    public static function users(): never
    {
        self::actor();
        [$where, $params] = self::filter($_GET);
        $limit = max(1, min(self::MAX_USERS, (int) ($_GET['limit'] ?? 50)));
        $total = (int) Db::value("SELECT COUNT(*) FROM users u $where", $params);
        $rows = Db::run("SELECT u.* FROM users u $where ORDER BY u.created_at DESC, u.email LIMIT $limit", $params)->fetchAll();
        Http::json(200, ['users' => array_map([self::class, 'userJson'], $rows), 'total' => $total]);
    }

    /**
     * GET /admin/users.csv?newsletter=1&option=bookUpdates → the users as CSV (email, language, the update options,
     * createdAt) for the mailing tool: `newsletter=1` keeps the users with any option on, `option=` with that one.
     */
    public static function usersCsv(): never
    {
        self::actor();
        [$where, $params] = self::filter($_GET);
        $rows = Db::run("SELECT u.* FROM users u $where ORDER BY u.created_at, u.email", $params)->fetchAll();
        $out = fopen('php://temp', 'w+');
        fputcsv($out, array_merge(['email', 'language'], array_keys(Auth::OPTIONS), ['createdAt']), ',', '"', '');
        foreach ($rows as $row) {
            $line = [$row['email'], $row['language']];
            foreach (Auth::OPTIONS as $column) $line[] = (int) $row[$column] ? 'yes' : 'no';
            $line[] = gmdate('c', strtotime($row['created_at'] . ' UTC'));
            fputcsv($out, $line, ',', '"', '');
        }
        rewind($out);
        http_response_code(200);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . (isset($_GET['newsletter']) ? 'newsletter' : 'users') . '-' . gmdate('Y-m-d') . '.csv"');
        header('Cache-Control: no-store');
        echo stream_get_contents($out);
        exit;
    }

    /**
     * PUT /admin/users/{id}/roles/{role} (grant) · DELETE … (revoke) → { changed, user }. 404 not-found / unknown-role;
     * 400 invalid-role for `reader` (every account has it); 409 last-admin when the last admin would go.
     */
    public static function setRole(string $userId, string $role, bool $on): never
    {
        $actor = self::actor();
        $user = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $userId]);
        if (!$user) throw new ApiError(404, 'not-found', 'No such user.');
        if ($role === Roles::READER) throw new ApiError(400, 'invalid-role', 'Every account has the reader role.', ['role' => $role]);
        if ($on) {
            $changed = Roles::grant($userId, $role, self::by($actor));
        } else {
            // The check and the revoke in one transaction, the admins' grants locked: two admins revoking each other at the
            // same moment cannot both pass the check – the second waits, then counts one admin and is refused
            $changed = Db::transaction(static function () use ($userId, $role): bool {
                if ($role === Roles::ADMIN) {
                    $admins = Roles::holders(Roles::ADMIN, true);
                    if (in_array($userId, $admins, true) && count($admins) <= 1) {
                        throw new ApiError(409, 'last-admin', 'The last admin keeps the role – make another admin first.', ['role' => $role]);
                    }
                }
                return Roles::revoke($userId, $role);
            });
        }
        Http::json(200, ['changed' => $changed, 'user' => self::userJson($user)]);
    }

    /**
     * POST /admin/editors { email } → { user, created, changed }: gives the user the role editor, creating the user
     * (confirmed, language en, no options) when the address is new – the older way to make an editor, kept for scripts.
     */
    public static function makeEditor(array $body): never
    {
        $by = self::by(self::actor());
        $email = Auth::email($body['email'] ?? null);
        // The new user, its reader role and the editor role in one transaction: never a user without its roles
        [$id, $created, $changed] = Db::transaction(static function () use ($email, $by): array {
            $user = Db::one('SELECT id FROM users WHERE email = :email', ['email' => $email]);
            if ($user) return [(string) $user['id'], false, Roles::grant((string) $user['id'], Roles::EDITOR, $by)];
            $id = Db::uuid();
            $now = Db::now();
            Db::run(
                'INSERT INTO users (id, email, language, created_at, confirmed_at, updated_at) VALUES (:id, :email, :language, :now, :now2, :now3)',
                ['id' => $id, 'email' => $email, 'language' => 'en', 'now' => $now, 'now2' => $now, 'now3' => $now]
            );
            Roles::grant($id, Roles::READER, $by);
            return [$id, true, Roles::grant($id, Roles::EDITOR, $by)];
        });
        Http::json(200, ['user' => self::userJson(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $id])), 'created' => $created, 'changed' => $changed]);
    }

    /**
     * The user as the admin page shows it: the account (Users::toJson) with its id, the grants (role, when, by whom –
     * `grantedByEmail` when the granter is a user) and when a device last used a session.
     * @param array<string, mixed> $row
     */
    public static function userJson(array $row): array
    {
        $grants = Roles::grants((string) $row['id']);
        foreach ($grants as &$grant) {
            $by = $grant['grantedBy'];
            $grant['grantedByEmail'] = is_string($by) && preg_match('/^[0-9a-f-]{36}$/', $by)
                ? Db::value('SELECT email FROM users WHERE id = :id', ['id' => $by])
                : null;
        }
        unset($grant);
        $lastSeen = Db::value('SELECT MAX(last_used_at) FROM sessions WHERE user_id = :id', ['id' => $row['id']]);
        return Users::toJson($row) + [
            'id' => $row['id'],
            'grants' => $grants,
            'lastSeenAt' => is_string($lastSeen) ? gmdate('c', strtotime($lastSeen . ' UTC')) : null,
        ];
    }

    /**
     * The WHERE clause of a users query from q=, role=, newsletter=, option=
     * @param array<string, mixed> $query
     * @return array{0: string, 1: array<string, mixed>}
     */
    private static function filter(array $query): array
    {
        $where = [];
        $params = [];
        $q = is_string($query['q'] ?? null) ? trim($query['q']) : '';
        if ($q !== '') {
            $where[] = "u.email LIKE :q ESCAPE '!'";
            $params['q'] = Db::contains(strtolower($q));
        }
        $role = is_string($query['role'] ?? null) ? $query['role'] : '';
        if ($role !== '') {
            $where[] = 'EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = :role)';
            $params['role'] = $role;
        }
        $option = is_string($query['option'] ?? null) ? $query['option'] : '';
        if ($option !== '') {
            if (!isset(Auth::OPTIONS[$option])) throw new ApiError(400, 'invalid-options', 'Unknown option ' . $option . '.');
            $where[] = 'u.' . Auth::OPTIONS[$option] . ' = 1';
        } elseif (!empty($query['newsletter'])) {
            $where[] = '(' . implode(' OR ', array_map(static fn(string $column) => "u.$column = 1", Auth::OPTIONS)) . ')';
        }
        return [$where ? 'WHERE ' . implode(' AND ', $where) : '', $params];
    }
}
