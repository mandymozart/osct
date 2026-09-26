<?php
declare(strict_types=1);

/** The signed-in reader's account: read, change the options, delete */
final class Accounts
{
    /** GET /account → { account } */
    public static function get(): never
    {
        Http::json(200, ['account' => self::toJson(Auth::account())]);
    }

    /** PATCH /account { options?, language? } → { account } */
    public static function update(array $body): never
    {
        $account = Auth::account();
        $options = Auth::options($body['options'] ?? [], false);
        $language = $body['language'] ?? null;
        $set = [];
        $params = ['id' => $account['id'], 'now' => Db::now()];
        foreach ($options as $key => $on) {
            $column = Auth::OPTIONS[$key];
            $set[] = "$column = :$column";
            $params[$column] = (int) $on;
        }
        if (is_string($language) && LoginMail::isLanguage($language)) {
            $set[] = 'language = :language';
            $params['language'] = $language;
        }
        if ($set) Db::run('UPDATE accounts SET ' . implode(', ', $set) . ', updated_at = :now WHERE id = :id', $params);
        Http::json(200, ['account' => self::toJson(Db::one('SELECT * FROM accounts WHERE id = :id', ['id' => $account['id']]))]);
    }

    /** DELETE /account → 204: the account, its sessions, progress and open requests */
    public static function delete(): never
    {
        $account = Auth::account();
        Db::transaction(function () use ($account) {
            // Explicit (also where foreign keys are off)
            Db::run('DELETE FROM progress WHERE account_id = :id', ['id' => $account['id']]);
            Db::run('DELETE FROM sessions WHERE account_id = :id', ['id' => $account['id']]);
            Db::run('DELETE FROM login_requests WHERE email = :email', ['email' => $account['email']]);
            Db::run('DELETE FROM accounts WHERE id = :id', ['id' => $account['id']]);
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
            'createdAt' => gmdate('c', strtotime($row['created_at'] . ' UTC')),
        ];
    }
}
