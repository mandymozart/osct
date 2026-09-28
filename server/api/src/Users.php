<?php
declare(strict_types=1);

/** The signed-in user (the reader's account): read, change the options, delete */
final class Users
{
    /** GET /user → { user } */
    public static function get(): never
    {
        Http::json(200, ['user' => self::toJson(Auth::user())]);
    }

    /** PATCH /user { options?, language? } → { user } */
    public static function update(array $body): never
    {
        $user = Auth::user();
        $options = Auth::options($body['options'] ?? [], false);
        $language = $body['language'] ?? null;
        $set = [];
        $params = ['id' => $user['id'], 'now' => Db::now()];
        foreach ($options as $key => $on) {
            $column = Auth::OPTIONS[$key];
            $set[] = "$column = :$column";
            $params[$column] = (int) $on;
        }
        if (is_string($language) && LoginMail::isLanguage($language)) {
            $set[] = 'language = :language';
            $params['language'] = $language;
        }
        if ($set) Db::run('UPDATE users SET ' . implode(', ', $set) . ', updated_at = :now WHERE id = :id', $params);
        Http::json(200, ['user' => self::toJson(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $user['id']]))]);
    }

    /** DELETE /user → 204: the user, its sessions, progress, open requests and failed password sign-ins */
    public static function delete(): never
    {
        $user = Auth::user();
        Db::transaction(function () use ($user) {
            // Explicit (also where foreign keys are off)
            Db::run('DELETE FROM progress WHERE user_id = :id', ['id' => $user['id']]);
            Db::run('DELETE FROM sessions WHERE user_id = :id', ['id' => $user['id']]);
            Db::run('DELETE FROM login_requests WHERE email = :email', ['email' => $user['email']]);
            Db::run('DELETE FROM password_attempts WHERE email = :email', ['email' => $user['email']]);
            Db::run('DELETE FROM users WHERE id = :id', ['id' => $user['id']]);
        });
        Http::json(204, null);
    }

    /** @param array<string, mixed> $row */
    public static function toJson(array $row): array
    {
        $options = [];
        foreach (Auth::OPTIONS as $key => $column) $options[$key] = (bool) (int) $row[$column];
        return [
            'email' => $row['email'],
            'language' => $row['language'],
            'options' => $options,
            'hasPassword' => ($row['password_hash'] ?? null) !== null,
            'createdAt' => gmdate('c', strtotime($row['created_at'] . ' UTC')),
        ];
    }
}
