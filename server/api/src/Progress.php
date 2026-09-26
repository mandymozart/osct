<?php
declare(strict_types=1);

/**
 * The reader's progress record per book, stored as the app sends it (client `ProgressRecord`, JSON) –
 * always kept for an account (a reset in the app is sent like any other change). `updatedAt` (ms) guards against two devices
 * overwriting each other: a PUT names the version it builds on, a newer one on the server → 409 with
 * the stored record, the app merges and sends again.
 */
final class Progress
{
    /** GET /progress/{bookId} → { record, updatedAt } (both null when nothing is stored) */
    public static function get(string $bookId): never
    {
        $account = Auth::account();
        $row = Db::one('SELECT record, updated_at FROM progress WHERE account_id = :id AND book_id = :book', ['id' => $account['id'], 'book' => $bookId]);
        Http::json(200, self::toJson($row));
    }

    /** PUT /progress/{bookId} { record, baseUpdatedAt } → { updatedAt } | 409 { error, record, updatedAt } */
    public static function put(string $bookId, array $body): never
    {
        $account = Auth::account();
        // Decoded as objects: an empty `{}` in the record stays an object
        $record = Http::bodyObject()->record ?? null;
        if (!$record instanceof stdClass || ($record->bookId ?? null) !== $bookId) {
            throw new ApiError(400, 'invalid-record', 'The progress record is missing or belongs to another book.');
        }
        $json = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false || strlen($json) > Config::int('PROGRESS_MAX_BYTES')) {
            throw new ApiError(413, 'record-too-large', 'The progress record is too large.');
        }
        $base = $body['baseUpdatedAt'] ?? null;
        if ($base !== null && !is_int($base)) throw new ApiError(400, 'invalid-record', 'baseUpdatedAt must be a number or null.');

        $result = Db::transaction(function () use ($account, $bookId, $json, $base) {
            $params = ['id' => $account['id'], 'book' => $bookId];
            $current = Db::one('SELECT record, updated_at FROM progress WHERE account_id = :id AND book_id = :book'
                . (Db::isSqlite() ? '' : ' FOR UPDATE'), $params);
            $currentAt = $current ? (int) $current['updated_at'] : null;
            if ($currentAt !== $base) return ['conflict' => self::toJson($current)];

            // Strictly newer than the last version, even within the same millisecond
            $now = max((int) floor(microtime(true) * 1000), ($currentAt ?? 0) + 1);
            if ($current) {
                Db::run('UPDATE progress SET record = :record, updated_at = :at WHERE account_id = :id AND book_id = :book', $params + ['record' => $json, 'at' => $now]);
            } else {
                Db::run('INSERT INTO progress (account_id, book_id, record, updated_at) VALUES (:id, :book, :record, :at)', $params + ['record' => $json, 'at' => $now]);
            }
            return ['updatedAt' => $now];
        });

        if (isset($result['conflict'])) {
            Http::json(409, ['error' => ['code' => 'conflict', 'message' => 'The stored progress changed.']] + $result['conflict']);
        }
        Http::json(200, $result);
    }

    /** @param array<string, mixed>|null $row */
    private static function toJson(?array $row): array
    {
        return $row
            ? ['record' => json_decode($row['record']), 'updatedAt' => (int) $row['updated_at']]
            : ['record' => null, 'updatedAt' => null];
    }
}
