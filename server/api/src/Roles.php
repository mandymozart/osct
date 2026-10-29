<?php
declare(strict_types=1);

/**
 * Account roles (docs/server.md "Roles"), after SCUTOONS' `Domain\Roles\Roles` so the two can be unified later: the
 * tables `roles` (seeded with fixed ids – 1 reader, 2 editor, 3 admin) and `user_roles` (who has which role, granted
 * when and by whom). Every account has `reader` (SCUTOONS' `member`); `editor` may use /editor and the editor API;
 * `admin` may use the admin page and /admin/* (the admin secret stays the break-glass path, `Admin::actor()`).
 *
 * `users.role` (`reader` / `editor`) is kept as a mirror of the editor role for the schema's backfill and older
 * readers of the column – checks go through `has()` / `require()`, never through the column.
 *
 * `granted_by`: `signup` (reader, when the account is made), `migration` (the schema's backfill), `config` (an address
 * in EDITORS / ADMINS), `secret` (X-Admin-Secret), or the granting admin's user id.
 */
final class Roles
{
    public const READER = 'reader';
    public const EDITOR = 'editor';
    public const ADMIN = 'admin';

    /** Which config list (comma-separated addresses) grants which role at sign-in – the instance's first editors and admins */
    public const CONFIGURED = ['EDITORS' => self::EDITOR, 'ADMINS' => self::ADMIN];

    /** @return list<array{id: int, name: string, description: string}> every known role, by id */
    public static function all(): array
    {
        return array_map(
            static fn(array $row) => ['id' => (int) $row['id'], 'name' => (string) $row['name'], 'description' => (string) $row['description']],
            Db::run('SELECT id, name, description FROM roles ORDER BY id')->fetchAll()
        );
    }

    /** @return list<string> the role names of a user (reader first, then by id) */
    public static function of(string $userId): array
    {
        return array_map(static fn(array $row) => (string) $row['name'],
            Db::run('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id ORDER BY r.id', ['id' => $userId])->fetchAll());
    }

    /** @return list<array{role: string, grantedAt: string, grantedBy: string|null}> the grants of a user with when and by whom */
    public static function grants(string $userId): array
    {
        return array_map(
            static fn(array $row) => ['role' => (string) $row['name'], 'grantedAt' => gmdate('c', strtotime($row['granted_at'] . ' UTC')), 'grantedBy' => $row['granted_by']],
            Db::run('SELECT r.name, ur.granted_at, ur.granted_by FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id ORDER BY r.id', ['id' => $userId])->fetchAll()
        );
    }

    /** @param array<string, mixed>|string $user a users row or a user id */
    public static function has(array|string $user, string $role): bool
    {
        $userId = is_array($user) ? (string) ($user['id'] ?? '') : $user;
        if ($userId === '') return false;
        return Db::value('SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id AND r.name = :role', ['id' => $userId, 'role' => $role]) !== null;
    }

    /**
     * The user when they have the role, else 403 forbidden { role } (401 for no session comes from Auth::user()).
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    public static function require(array $user, string $role): array
    {
        if (!self::has($user, $role)) throw new ApiError(403, 'forbidden', "This needs the $role role.", ['role' => $role]);
        return $user;
    }

    /** Gives a user a role; false when they had it already. 404 unknown-role for a role that does not exist. */
    public static function grant(string $userId, string $role, string $grantedBy): bool
    {
        $roleId = self::id($role);
        if (self::has($userId, $role)) return false;
        Db::run('INSERT INTO user_roles (user_id, role_id, granted_at, granted_by) VALUES (:user, :role, :now, :by)',
            ['user' => $userId, 'role' => $roleId, 'now' => Db::now(), 'by' => substr($grantedBy, 0, 64)]);
        self::sync($userId);
        return true;
    }

    /** Takes a role away; false when the user did not have it. 404 unknown-role for a role that does not exist. */
    public static function revoke(string $userId, string $role): bool
    {
        $roleId = self::id($role);
        $changed = Db::run('DELETE FROM user_roles WHERE user_id = :user AND role_id = :role', ['user' => $userId, 'role' => $roleId])->rowCount() > 0;
        if ($changed) self::sync($userId);
        return $changed;
    }

    /** How many accounts have the role */
    public static function count(string $role): int
    {
        return (int) Db::value('SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = :role', ['role' => $role]);
    }

    /**
     * An address listed in EDITORS / ADMINS (config, docs/server.md "Roles") gets that role when the user signs in or
     * is looked up – the instance's first editors and admins, without the admin secret. Returns the user.
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    public static function grantConfigured(array $user): array
    {
        $email = strtolower((string) ($user['email'] ?? ''));
        foreach (self::CONFIGURED as $key => $role) {
            $listed = array_map(static fn(string $address) => strtolower(trim($address)), Config::list($key));
            if (in_array($email, $listed, true)) self::grant((string) $user['id'], $role, 'config');
        }
        return $user;
    }

    /** The role's id, else 404 unknown-role */
    public static function id(string $role): int
    {
        $id = Db::value('SELECT id FROM roles WHERE name = :name', ['name' => $role]);
        if ($id === null) throw new ApiError(404, 'unknown-role', "There is no role $role.", ['role' => $role]);
        return (int) $id;
    }

    /** users.role mirrors the editor role (editor / reader) */
    private static function sync(string $userId): void
    {
        Db::run('UPDATE users SET role = :role WHERE id = :id', ['role' => self::has($userId, self::EDITOR) ? self::EDITOR : self::READER, 'id' => $userId]);
    }
}
