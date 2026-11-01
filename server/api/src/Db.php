<?php
declare(strict_types=1);

/**
 * PDO connection: MySQL in production, SQLite when DB_SQLITE_PATH is set (local development / tests –
 * the schema is created on first use). Queries are written to run on both.
 */
final class Db
{
    private static ?PDO $pdo = null;
    /** Whether `transaction()` has one open (PDO does not know about SQLite's hand-written BEGIN IMMEDIATE) */
    private static bool $inTransaction = false;

    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        $sqlite = Paths::sqlite();
        if ($sqlite !== '') {
            $new = !is_file($sqlite);
            $pdo = new PDO('sqlite:' . $sqlite, null, null, $options);
            $pdo->exec('PRAGMA foreign_keys = ON');
            if ($new) {
                self::$pdo = $pdo;
                self::migrate();
            }
        } else {
            $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                Config::get('DB_HOST'), Config::get('DB_PORT'), Config::get('DB_NAME'));
            $pdo = new PDO($dsn, Config::get('DB_USER'), Config::get('DB_PASS'), $options);
            $pdo->exec("SET time_zone = '+00:00'");
        }
        return self::$pdo = $pdo;
    }

    /**
     * Creates the missing tables and columns – safe to run again: the schema files use CREATE TABLE IF NOT EXISTS,
     * an `ALTER TABLE … ADD COLUMN` is skipped when the column exists and an `ALTER TABLE … DROP COLUMN` (a removed
     * feature's column, RULES #25) when it does not.
     * @return int statements in the schema
     */
    public static function migrate(): int
    {
        $file = __DIR__ . '/../db/' . (self::isSqlite() ? 'schema.sqlite.sql' : 'schema.mysql.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
        $statements = array_filter(array_map('trim', preg_split('/;\s*(\n|$)/', (string) $sql)));
        foreach ($statements as $statement) {
            if (preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+COLUMN\s+`?(\w+)`?/i', $statement, $match)
                && self::hasColumn($match[1], $match[2])) continue;
            // A removed feature's column (RULES #25): removed once, skipped while it is gone
            if (preg_match('/^ALTER\s+TABLE\s+`?(\w+)`?\s+DROP\s+COLUMN\s+`?(\w+)`?/i', $statement, $match)
                && !self::hasColumn($match[1], $match[2])) continue;
            self::pdo()->exec($statement);
        }
        return count($statements);
    }

    public static function hasColumn(string $table, string $column): bool
    {
        $rows = self::isSqlite()
            ? self::pdo()->query("PRAGMA table_info($table)")->fetchAll()
            : self::pdo()->query("SHOW COLUMNS FROM `$table`")->fetchAll();
        foreach ($rows as $row) {
            if (strcasecmp((string) ($row['name'] ?? $row['Field'] ?? ''), $column) === 0) return true;
        }
        return false;
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

    /**
     * A LIKE pattern that finds $text anywhere, for `LIKE :param ESCAPE '!'`. The escape is `!` because a backslash
     * starts an escape sequence inside a MySQL string literal (not in SQLite): a backslash as the escape character is a
     * syntax error on MySQL.
     */
    public static function contains(string $text): string
    {
        return '%' . strtr($text, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
    }

    /**
     * Runs $work in one transaction: committed when it returns, rolled back when it throws. Called inside another
     * transaction it joins that one (the outer call commits or rolls back), so a helper that keeps its own statements
     * together (`Roles::grant`) can also run inside a caller's transaction.
     *
     * On SQLite the transaction is `BEGIN IMMEDIATE`: it takes the database's write lock at the start, so a second
     * writer waits (the busy timeout) before it reads anything and then reads what the first one committed. PDO's own
     * `beginTransaction()` starts a deferred transaction, where two writers that both read first deadlock on their
     * first write – hence the statements by hand and the flag below instead of PDO's.
     */
    public static function transaction(callable $work): mixed
    {
        $pdo = self::pdo();
        if (self::$inTransaction || $pdo->inTransaction()) return $work();
        $sqlite = self::isSqlite();
        if ($sqlite) $pdo->exec('BEGIN IMMEDIATE');
        else $pdo->beginTransaction();
        self::$inTransaction = true;
        try {
            $result = $work();
            if ($sqlite) $pdo->exec('COMMIT');
            else $pdo->commit();
            return $result;
        } catch (Throwable $error) {
            try {
                if ($sqlite) $pdo->exec('ROLLBACK');
                else $pdo->rollBack();
            } catch (PDOException) {
                // SQLite may have rolled back on its own (a failed COMMIT, a full disk): the first error is the one to report
            }
            throw $error;
        } finally {
            self::$inTransaction = false;
        }
    }

    /**
     * ` FOR UPDATE` on MySQL, nothing on SQLite – appended to a SELECT inside a transaction whose rows are read, changed
     * and written back, or counted before a change that depends on the count. On InnoDB a plain SELECT reads a snapshot,
     * so two requests could both read the old state and act on it; the locking read makes the second wait for the
     * first's commit and read its result. SQLite has no such clause and needs none: its transactions hold the write
     * lock from the start (`transaction()`).
     */
    public static function forUpdate(): string
    {
        return self::isSqlite() ? '' : ' FOR UPDATE';
    }

    /** Whether a failed statement broke a unique key or the primary key (MySQL 1062, SQLite's UNIQUE / PRIMARY KEY constraint) */
    public static function isDuplicate(PDOException $error): bool
    {
        $info = $error->errorInfo ?? [];
        $code = (int) ($info[1] ?? 0);
        if ($code === 1062) return true;
        return $code === 19 && preg_match('/UNIQUE|PRIMARY KEY/i', (string) ($info[2] ?? $error->getMessage())) === 1;
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
