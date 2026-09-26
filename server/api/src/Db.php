<?php
declare(strict_types=1);

/**
 * PDO connection: MySQL in production, SQLite when DB_SQLITE_PATH is set (local development / tests –
 * the schema is created on first use). Queries are written to run on both.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        $sqlite = Config::get('DB_SQLITE_PATH');
        if ($sqlite !== '') {
            $new = !is_file($sqlite);
            $pdo = new PDO('sqlite:' . $sqlite, null, null, $options);
            $pdo->exec('PRAGMA foreign_keys = ON');
            if ($new) $pdo->exec((string) file_get_contents(__DIR__ . '/../db/schema.sqlite.sql'));
        } else {
            $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                Config::get('DB_HOST'), Config::get('DB_PORT'), Config::get('DB_NAME'));
            $pdo = new PDO($dsn, Config::get('DB_USER'), Config::get('DB_PASS'), $options);
            $pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo = $pdo;
    }

    /**
     * Creates the missing tables (schema files use CREATE TABLE IF NOT EXISTS – safe to run again).
     * @return int statements run
     */
    public static function migrate(): int
    {
        $file = __DIR__ . '/../db/' . (self::isSqlite() ? 'schema.sqlite.sql' : 'schema.mysql.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
        $statements = array_filter(array_map('trim', preg_split('/;\s*(
|$)/', (string) $sql)));
        foreach ($statements as $statement) self::pdo()->exec($statement);
        return count($statements);
    }

    public static function isSqlite(): bool
    {
        return self::pdo()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    }

    /** @param array<string, mixed> $params */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>|null
     */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<string, mixed> $params */
    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    public static function transaction(callable $work): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();
            return $result;
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
    }

    /** UTC time as stored in the DATETIME columns */
    public static function now(int $offsetSeconds = 0): string
    {
        return gmdate('Y-m-d H:i:s', time() + $offsetSeconds);
    }

    /** Random version 4 UUID */
    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
