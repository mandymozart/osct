<?php
declare(strict_types=1);

/** The signed-in user (the reader's account): read, change the options, delete */
final class Users
{
    /**
     * GET /user → { user }, plus `token` (ApiTokens::toJson) when the request came with an AI connection's token, and
     * `csrfToken` when it came with the session cookie (the browser keeps it in memory for its writes – Auth::csrfToken)
     */
    public static function get(): never
    {
        $answer = ['user' => self::toJson(Auth::user())];
        $token = Auth::token();
        if ($token !== null) $answer['token'] = ApiTokens::toJson($token);
        $csrf = Auth::csrf();
        if ($csrf !== null) $answer['csrfToken'] = $csrf;
        Http::json(200, $answer);
    }

    /**
     * PATCH /user { options?, language? } → { user }. The update options are the person's consent and, with the language,
     * user-centric data (RULES #33): only the person's own sign-in changes them – an AI connection's token gets 403
     * not-for-ai (`Auth::session()`), and no admin route writes them.
     */
    public static function update(array $body): never
    {
        [$user] = Auth::session();
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

    /**
     * DELETE /user → 204: the user, its sessions, AI connections' tokens, progress, open requests and failed password
     * sign-ins. The person's own sign-in only (403 not-for-ai for a token).
     */
    public static function delete(): never
    {
        [$user] = Auth::session();
        Db::transaction(function () use ($user) {
            // Explicit (also where foreign keys are off)
            Db::run('DELETE FROM progress WHERE user_id = :id', ['id' => $user['id']]);
            Db::run('DELETE FROM sessions WHERE user_id = :id', ['id' => $user['id']]);
            Db::run('DELETE FROM api_tokens WHERE user_id = :id', ['id' => $user['id']]);
            Db::run('DELETE FROM user_roles WHERE user_id = :id', ['id' => $user['id']]);
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
        $roles = Roles::of((string) $row['id']);
        return [
            'email' => $row['email'],
            'language' => $row['language'],
            'options' => $options,
            'hasPassword' => ($row['password_hash'] ?? null) !== null,
            // Roles (docs/server.md "Roles"): reader for every account, editor (the editor API), admin (the admin API);
            // `role` stays for older readers of the field – editor when the user has that role, else reader
            'roles' => $roles,
            'role' => in_array(Roles::EDITOR, $roles, true) ? Roles::EDITOR : Roles::READER,
            'createdAt' => gmdate('c', strtotime($row['created_at'] . ' UTC')),
        ];
    }
}
