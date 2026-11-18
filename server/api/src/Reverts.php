<?php

declare(strict_types=1);

/**
 * Reverting saved changes (#312): a change of the log (`changes`, Books::change) is taken back by writing its `before`
 * again – as a **new** change, so nothing is erased and a revert can itself be reverted. Two steps, as the matter and the
 * scene migration: without `apply: true` the plan (nothing written), with it the plan made again and written in one
 * transaction. Every change written by one call shares a change set (`changes.change_set`) and names the change it takes
 * back (`changes.reverts`).
 *
 * - `POST …/changes/{cid}/revert` – one change, with every later change of the **same thing** (the same row; for the
 *   book's own JSON the same fields): those later edits would be lost, so they are reverted first and listed (`later`).
 * - `POST …/changes/revert { ids }` – the given changes (the editor's undo / redo step), later ones of the same things too.
 * - `POST …/changes/revert-to { after }` – every change after the given one, newest first: back to the state right after it.
 *
 * A change is reverted only while its thing still holds what the change wrote (`after`); otherwise it is a **conflict**:
 * listed, never overwritten, and the older changes of that thing are skipped as well. Kinds the log cannot take back –
 * a creation, a removal, a moved entry or scene page, a plugin source, a deleted file – are listed as not revertable.
 * A revert changes the draft only; readers see it with the next publish.
 */
final class Reverts
{
    /** The book's own JSON (`books.book_json`): a change of one of these kinds compares and restores only the fields it changed */
    private const BOOK_KINDS = ['environment', 'passes', 'appearance', 'book'];
    /** Kinds of rows the log can restore */
    private const ROW_KINDS = ['entity', 'target', 'entry', 'spread'];
    /** At most this many changes in one revert */
    public const MAX = 2000;

    /** POST /editor/books/{id}/changes/{cid}/revert { apply? } → { plan, applied, set, written } */
    public static function one(string $bookId, string $changeId): never
    {
        self::respond($bookId, static fn(): array => [self::row($bookId, $changeId)]);
    }

    /** POST /editor/books/{id}/changes/revert { ids, apply? } → { plan, applied, set, written } */
    public static function many(string $bookId): never
    {
        $body = Editor::body();
        $ids = $body->ids ?? null;
        if (!is_array($ids) || !$ids || count($ids) > self::MAX || array_filter($ids, static fn($id) => !is_string($id))) {
            throw new ApiError(400, 'invalid-revert', 'Send { ids: [change ids] } (at most ' . self::MAX . ').');
        }
        self::respond($bookId, static fn(): array => array_map(static fn(string $id) => self::row($bookId, $id), array_values(array_unique($ids))), $body);
    }

    /** POST /editor/books/{id}/changes/revert-to { after, apply? } → { plan, applied, set, written }: every change after `after` */
    public static function to(string $bookId): never
    {
        $body = Editor::body();
        if (!is_string($body->after ?? null)) throw new ApiError(400, 'invalid-revert', 'Send { after: change id } – every change after it is reverted.');
        self::respond($bookId, static function () use ($bookId, $body): array {
            $point = self::row($bookId, $body->after);
            $rows = self::rowsAfter($bookId, (int) $point['created_at']);
            if (!$rows) throw new ApiError(400, 'nothing-to-revert', 'No change was saved after this one.');
            return $rows;
        }, $body);
    }

    /**
     * Why a change cannot be reverted, null when it can (the history lists the reason)
     * @param array<string, mixed> $row
     */
    public static function notRevertable(array $row): ?string
    {
        $kind = (string) $row['kind'];
        if ($kind === 'asset') return 'A file a removal deleted – its bytes are gone.';
        if ($kind === 'plugin') return 'A plugin source – change it in the Code tab.';
        if ($row['before_json'] === null) return 'A creation – remove it instead.';
        if ($row['after_json'] === null || $row['after_json'] === 'null') return 'A removal – it cannot be brought back from the log.';
        $before = Editor::decode($row['before_json']);
        $after = Editor::decode($row['after_json']);
        if ($kind === 'order') {
            if (!is_array($before) || !is_array($after)) return 'Not revertable.';
            $a = $before;
            $b = $after;
            sort($a);
            sort($b);
            return $a === $b ? null : 'The scenes changed with this order – move them instead.';
        }
        if ($kind === 'groups') return is_array($before) && is_array($after) ? null : 'Not revertable.';
        if (in_array($kind, self::BOOK_KINDS, true)) return $before instanceof stdClass && $after instanceof stdClass ? null : 'Not revertable.';
        if (!in_array($kind, self::ROW_KINDS, true)) return 'Not revertable.';
        if (!$before instanceof stdClass || !$after instanceof stdClass) return 'Not revertable.';
        if ($kind === 'entry' && (self::canon($before->page ?? null) !== self::canon($after->page ?? null) || self::canon($before->surface ?? null) !== self::canon($after->surface ?? null))) {
            return 'Moves the entry to another page or surface – move it back instead.';
        }
        if ($kind === 'spread' && (self::canon($before->firstPage ?? null) !== self::canon($after->firstPage ?? null) || self::canon($before->lastPage ?? null) !== self::canon($after->lastPage ?? null))) {
            return 'Changes the scene\'s pages – not revertable.';
        }
        return null;
    }

    // ── the plan and its writing ────────────────────────────────────────────────────────────────

    /**
     * Plan (and with `apply: true` write) the revert of the changes `$pick` returns, each with the later changes of the same
     * thing, newest first
     * @param callable(): list<array<string, mixed>> $pick
     */
    private static function respond(string $bookId, callable $pick, ?stdClass $body = null): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body ??= trim((string) file_get_contents('php://input')) === '' ? new stdClass() : Editor::body();
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($bookId, $pick, $apply, $user): array {
            $chosen = $pick();
            $rows = self::withLater($bookId, $chosen);
            if (count($rows) > self::MAX) throw new ApiError(400, 'too-many', 'More than ' . self::MAX . ' changes – go back in smaller steps.');
            return self::plan($bookId, $rows, array_map(static fn(array $r) => (string) $r['id'], $chosen), $user, $apply);
        };
        $result = $apply ? Db::transaction($run) : $run();
        Http::json(200, $result);
    }

    /**
     * The chosen changes and every later change of the same things, newest first, without duplicates
     * @param list<array<string, mixed>> $chosen
     * @return list<array<string, mixed>>
     */
    private static function withLater(string $bookId, array $chosen): array
    {
        if (!$chosen) return [];
        $oldest = min(array_map(static fn(array $r) => (int) $r['created_at'], $chosen));
        $byId = [];
        foreach ($chosen as $row) $byId[(string) $row['id']] = $row;
        $later = self::rowsAfter($bookId, $oldest - 1);
        foreach ($later as $row) {
            if (isset($byId[(string) $row['id']])) continue;
            foreach ($chosen as $c) {
                if ((int) $row['created_at'] >= (int) $c['created_at'] && self::sameThing($row, $c)) {
                    $byId[(string) $row['id']] = $row + ['later' => true];
                    break;
                }
            }
        }
        $rows = array_values($byId);
        usort($rows, static fn(array $a, array $b) => [(int) $b['created_at'], (string) $b['id']] <=> [(int) $a['created_at'], (string) $a['id']]);
        return $rows;
    }

    /**
     * Two changes of the same thing: the same row – for the book's JSON, fields both changed
     * @param array<string, mixed> $a
     * @param array<string, mixed> $b
     */
    private static function sameThing(array $a, array $b): bool
    {
        $bookA = in_array($a['kind'], self::BOOK_KINDS, true);
        $bookB = in_array($b['kind'], self::BOOK_KINDS, true);
        if ($bookA || $bookB) return $bookA && $bookB && (bool) array_intersect(self::fields($a), self::fields($b));
        return $a['kind'] === $b['kind'] && $a['ref'] === $b['ref'];
    }

    /**
     * The fields of the book's JSON a book-level change changed
     * @param array<string, mixed> $row
     * @return list<string>
     */
    private static function fields(array $row): array
    {
        $before = Editor::decode($row['before_json']);
        $after = Editor::decode($row['after_json']);
        $before = $before instanceof stdClass ? get_object_vars($before) : [];
        $after = $after instanceof stdClass ? get_object_vars($after) : [];
        $fields = [];
        foreach (array_unique([...array_keys($before), ...array_keys($after)]) as $key) {
            if (self::canon($before[$key] ?? null) !== self::canon($after[$key] ?? null)) $fields[] = (string) $key;
        }
        return $fields;
    }

    /**
     * Walk the changes newest first: each one whose thing still holds its `after` gets its `before` back (written with
     * `$apply`, else only remembered for the older ones); one that does not is a conflict, and its thing is skipped from
     * there on
     * @param list<array<string, mixed>> $rows
     * @param list<string> $chosen
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private static function plan(string $bookId, array $rows, array $chosen, array $user, bool $apply): array
    {
        $set = $apply ? Db::uuid() : null;
        $state = [];
        $blocked = [];
        $items = [];
        $written = [];
        $counts = ['revert' => 0, 'conflict' => 0, 'notRevertable' => 0];
        $others = [];
        $later = 0;
        foreach ($rows as $row) {
            $item = ['id' => $row['id'], 'kind' => $row['kind'], 'ref' => $row['ref'], 'user' => $row['email'] ?? null, 'token' => $row['token_name'] ?? null,
                'createdAt' => Editor::iso((int) $row['created_at']), 'later' => !empty($row['later']), 'other' => $row['user_id'] !== $user['id']];
            if ($item['later']) $later++;
            if ($item['other']) $others[(string) ($row['email'] ?? '?')] = true;
            $reason = self::notRevertable($row);
            if ($reason !== null) {
                $items[] = $item + ['status' => 'not-revertable', 'reason' => $reason];
                $counts['notRevertable']++;
                continue;
            }
            $key = in_array($row['kind'], self::BOOK_KINDS, true) ? 'book' : $row['kind'] . ':' . $row['ref'];
            $fields = $key === 'book' ? self::fields($row) : [];
            $blockedFields = $key === 'book' ? array_intersect($fields, $blocked['book'] ?? []) : [];
            if ($key === 'book' ? (bool) $blockedFields : isset($blocked[$key])) {
                $items[] = $item + ['status' => 'conflict', 'reason' => 'A newer change of the same thing could not be reverted.'];
                $counts['conflict']++;
                if ($key === 'book') $blocked['book'] = array_values(array_unique([...$blocked['book'], ...$fields]));
                continue;
            }
            $current = array_key_exists($key, $state) ? $state[$key] : self::read($bookId, $key);
            $after = Editor::decode($row['after_json']);
            $before = Editor::decode($row['before_json']);
            if (!self::holds($current, $after, $fields, $key)) {
                $items[] = $item + ['status' => 'conflict', 'reason' => $current === null ? 'It is gone from the draft.' : 'It was changed since, outside this log – it is left as it is.'];
                $counts['conflict']++;
                if ($key === 'book') $blocked['book'] = array_values(array_unique([...($blocked['book'] ?? []), ...$fields]));
                else $blocked[$key] = true;
                continue;
            }
            $next = $key === 'book' ? self::withFields($current, $before, $fields) : $before;
            $state[$key] = $next;
            if ($apply) $written[] = self::write($bookId, $key, (string) $row['kind'], (string) $row['ref'], $current, $next, $user, (string) $set, (string) $row['id']);
            $items[] = $item + ['status' => 'revert'];
            $counts['revert']++;
        }
        if ($apply && $written) Books::touchBook($bookId);
        return [
            'plan' => ['changes' => $items, 'chosen' => $chosen, 'counts' => $counts, 'later' => $later, 'others' => array_keys($others)],
            'applied' => $apply && (bool) $written,
            'set' => $written ? $set : null,
            'written' => $written,
        ];
    }

    /** Whether the thing's current value is what the change wrote (the book: only the fields it changed) */
    private static function holds(mixed $current, mixed $after, array $fields, string $key): bool
    {
        if ($current === null) return false;
        if ($key !== 'book') return self::canon($current) === self::canon($after);
        foreach ($fields as $field) {
            if (self::canon($current->{$field} ?? null) !== self::canon($after->{$field} ?? null)) return false;
        }
        return true;
    }

    /** The book's JSON with `$fields` as `$from` has them (a field `$from` has not is removed) */
    private static function withFields(stdClass $book, stdClass $from, array $fields): stdClass
    {
        $next = clone $book;
        foreach ($fields as $field) {
            if (property_exists($from, $field)) $next->{$field} = $from->{$field};
            else unset($next->{$field});
        }
        return $next;
    }

    /** The thing's value now, as the log stores it (null: the row is gone) */
    private static function read(string $bookId, string $key): mixed
    {
        $params = ['book' => $bookId];
        if ($key === 'book') return Editor::decode((string) Books::bookRow($bookId, true)['book_json']);
        if ($key === 'groups:' . $bookId) return Editor::decode((string) (Books::bookRow($bookId, true)['groups_json'] ?? '[]'));
        if ($key === 'order:' . $bookId) return array_map(static fn(array $row) => (string) $row['id'], Scenes::context($bookId, true)['rows']);
        [$kind, $ref] = explode(':', $key, 2);
        $sql = match ($kind) {
            'entity' => 'SELECT data_json FROM entities WHERE book_id = :book AND ref = :id',
            'target' => 'SELECT data_json FROM targets WHERE book_id = :book AND id = :id',
            'entry' => 'SELECT data_json FROM entries WHERE book_id = :book AND id = :id',
            'spread' => 'SELECT data_json FROM spreads WHERE book_id = :book AND id = :id',
            default => null,
        };
        if ($sql === null) return null;
        $row = Db::one($sql . Db::forUpdate(), $params + ['id' => $ref]);
        return $row ? Editor::decode($row['data_json']) : null;
    }

    /**
     * Write the thing's restored value and record it as a new change of the set; returns the new change's id
     * @param array<string, mixed> $user
     */
    private static function write(string $bookId, string $key, string $kind, string $ref, mixed $current, mixed $next, array $user, string $set, string $reverts): string
    {
        $json = Editor::encode($next);
        $before = Editor::encode($current);
        $params = ['book' => $bookId];
        if ($key === 'book') {
            Db::run('UPDATE books SET title = :title, author = :author, book_json = :data WHERE id = :book',
                $params + ['title' => (string) ($next->title ?? ''), 'author' => (string) ($next->author ?? ''), 'data' => $json]);
        } elseif ($kind === 'groups') {
            Db::run('UPDATE books SET groups_json = :data WHERE id = :book', $params + ['data' => $json]);
        } elseif ($kind === 'order') {
            Scenes::writePositions($bookId, Scenes::context($bookId)['rows'], $next);
        } elseif ($kind === 'entity') {
            Db::run('UPDATE entities SET type = :type, data_json = :data WHERE book_id = :book AND ref = :id', $params + ['type' => (string) ($next->type ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === 'target') {
            $entity = $next->entity ?? null;
            $entityRef = $entity instanceof stdClass && is_string($entity->ref ?? null) && !isset($entity->type) ? $entity->ref : null;
            Db::run('UPDATE targets SET entity_ref = :ref, image_src = :image, data_json = :data WHERE book_id = :book AND id = :id',
                $params + ['ref' => $entityRef, 'image' => (string) ($next->imageSrc ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === 'entry') {
            Db::run('UPDATE entries SET category = :category, title = :title, data_json = :data WHERE book_id = :book AND id = :id',
                $params + ['category' => (string) ($next->category ?? ''), 'title' => (string) ($next->title ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === 'spread') {
            Db::run('UPDATE spreads SET title = :title, data_json = :data WHERE book_id = :book AND id = :id', $params + ['title' => (string) ($next->title ?? ''), 'data' => $json, 'id' => $ref]);
        }
        return Books::recordChange($bookId, $user, $kind, $ref, $before, $json, $set, $reverts);
    }

    // ── the log's rows ──────────────────────────────────────────────────────────────────────────

    /** @return array<string, mixed> one change of the book, else 404 */
    private static function row(string $bookId, mixed $changeId): array
    {
        if (!is_string($changeId)) throw new ApiError(400, 'invalid-revert', 'A change id is a string.');
        $row = Db::one('SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.book_id = :book AND c.id = :id', ['book' => $bookId, 'id' => $changeId]);
        if (!$row) throw new ApiError(404, 'not-found', "No change \"$changeId\" in this book's log.");
        return $row;
    }

    /** @return list<array<string, mixed>> the book's changes saved after `$at` (ms), newest first */
    private static function rowsAfter(string $bookId, int $at): array
    {
        $limit = self::MAX + 1;
        return Db::run("SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.book_id = :book AND c.created_at > :at ORDER BY c.created_at DESC, c.id DESC LIMIT $limit",
            ['book' => $bookId, 'at' => $at])->fetchAll();
    }

    /** A value as one comparable string: objects' keys sorted (the log and the row may order them differently) */
    public static function canon(mixed $value): string
    {
        $sort = static function (mixed $v) use (&$sort): mixed {
            if ($v instanceof stdClass) $v = get_object_vars($v);
            if (!is_array($v)) return $v;
            if (!array_is_list($v)) ksort($v);
            return array_map($sort, $v);
        };
        return json_encode($sort($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    }
}
