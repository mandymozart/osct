<?php

declare(strict_types=1);

/**
 * Reverting saved changes (#312): a change of the log (`changes`, Experiences::change) is taken back by writing its `before`
 * again – as a **new** change, so nothing is erased and a revert can itself be reverted. Two steps, as the matter and the
 * scene migration: without `apply: true` the plan (nothing written), with it the plan made again and written in one
 * transaction. Every change written by one call shares a change set (`changes.change_set`) and names the change it takes
 * back (`changes.reverts`).
 *
 * - `POST …/changes/{cid}/revert` – one change, with every later change of the **same thing** (the same row; for the
 *   experience's own JSON the same fields): those later edits would be lost, so they are reverted first and listed (`later`).
 * - `POST …/changes/revert { ids }` – the given changes (the editor's undo / redo step), later ones of the same things too.
 * - `POST …/changes/revert-to { after }` – every change after the given one, newest first: back to the state right after it.
 *
 * A change is reverted only while its thing still holds what the change wrote (`after`); otherwise it is a **conflict**:
 * listed, never overwritten, and the older changes of that thing are skipped as well. Kinds the log cannot take back –
 * a creation, a removal, an entry moved to another surface, a plugin source, a deleted file, a change saved before the
 * content schema 3.0 and the migration itself – are listed as not revertable. A delivery's new scene, entry or target
 * (#322, `changes.delivery_id`) is the exception among the creations: it is removed again – a target first, an entry once
 * it has no target, a scene once nothing lies on it and the experience does not open on it (a conflict otherwise).
 * A revert changes the draft only; readers see it with the next publish.
 *
 * A surface's reference image (#314, kind `reference`, ref `<scene>/<surface>`) is revertable both ways – set, replaced
 * and removed (its `before` / `after` is the reference or null) – while its scene still has the surface.
 */
final class Reverts
{
    /** The experience's own JSON (`experiences.experience_json`): a change of one of these kinds compares and restores only the fields it changed */
    private const EXPERIENCE_KINDS = ['environment', 'passes', 'appearance', 'experience'];
    /** Kinds of rows the log can restore */
    private const ROW_KINDS = ['entity', 'target', 'entry', 'scene'];
    /** Kinds of rows a delivery makes (#322, Deliveries): their creation is revertable – the row is removed again */
    private const DELIVERED_KINDS = ['entry', 'target', 'scene'];
    /** At most this many changes in one revert */
    public const MAX = 2000;

    /** POST /editor/experiences/{id}/changes/{cid}/revert { apply? } → { plan, applied, set, written } */
    public static function one(string $experienceId, string $changeId): never
    {
        self::respond($experienceId, static fn(): array => [self::row($experienceId, $changeId)]);
    }

    /** POST /editor/experiences/{id}/changes/revert { ids, apply? } → { plan, applied, set, written } */
    public static function many(string $experienceId): never
    {
        $body = Editor::body();
        $ids = $body->ids ?? null;
        if (!is_array($ids) || !$ids || count($ids) > self::MAX || array_filter($ids, static fn($id) => !is_string($id))) {
            throw new ApiError(400, 'invalid-revert', 'Send { ids: [change ids] } (at most ' . self::MAX . ').');
        }
        self::respond($experienceId, static fn(): array => array_map(static fn(string $id) => self::row($experienceId, $id), array_values(array_unique($ids))), $body);
    }

    /** POST /editor/experiences/{id}/changes/revert-to { after, apply? } → { plan, applied, set, written }: every change after `after` */
    public static function to(string $experienceId): never
    {
        $body = Editor::body();
        if (!is_string($body->after ?? null)) throw new ApiError(400, 'invalid-revert', 'Send { after: change id } – every change after it is reverted.');
        self::respond($experienceId, static function () use ($experienceId, $body): array {
            $point = self::row($experienceId, $body->after);
            $rows = self::rowsAfter($experienceId, (int) $point['created_at']);
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
        // A reference image (#314): set, replaced and removed alike – its before / after is the reference or null
        if ($kind === SurfaceReferences::KIND) {
            foreach ([$row['before_json'], $row['after_json']] as $json) {
                $value = $json === null ? null : Editor::decode($json);
                if ($value !== null && !($value instanceof stdClass && is_string($value->url ?? null))) return 'Not revertable.';
            }
            return null;
        }
        if ($kind === 'asset') return 'A file a removal deleted – its bytes are gone.';
        // The migration to schema 3.0 (#319, its code is gone) wrote its changes with the kind `migration`
        if ($kind === 'migration') return 'The migration to the content schema 3.0 – not revertable.';
        if ($kind === 'plugin') return 'A plugin source – change it in the Code tab.';
        // A delivery's new scene, entry or target (#322): reverted by removing it again
        if ($row['before_json'] === null && self::deliveredRow($row)) return null;
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
        if (in_array($kind, self::EXPERIENCE_KINDS, true)) return $before instanceof stdClass && $after instanceof stdClass ? null : 'Not revertable.';
        if (!in_array($kind, self::ROW_KINDS, true)) return 'Not revertable.';
        if (!$before instanceof stdClass || !$after instanceof stdClass) return 'Not revertable.';
        // Saved before the content schema 3.0 (#319): its rows held pages, a target's print – nothing to write back now
        if (property_exists($before, 'page') || property_exists($after, 'page') || property_exists($before, 'print') || property_exists($after, 'print')) {
            return 'Saved before the content schema 3.0 – not revertable.';
        }
        if ($kind === 'entry' && self::canon($before->surface ?? null) !== self::canon($after->surface ?? null)) {
            return 'Moves the entry to another surface – move it back instead.';
        }
        return null;
    }

    // ── the plan and its writing ────────────────────────────────────────────────────────────────

    /**
     * Plan (and with `apply: true` write) the revert of the changes `$pick` returns, each with the later changes of the same
     * thing, newest first
     * @param callable(): list<array<string, mixed>> $pick
     */
    private static function respond(string $experienceId, callable $pick, ?stdClass $body = null): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $body ??= trim((string) file_get_contents('php://input')) === '' ? new stdClass() : Editor::body();
        $apply = ($body->apply ?? false) === true;
        $run = static function () use ($experienceId, $pick, $apply, $user): array {
            $chosen = $pick();
            $rows = self::withLater($experienceId, $chosen);
            if (count($rows) > self::MAX) throw new ApiError(400, 'too-many', 'More than ' . self::MAX . ' changes – go back in smaller steps.');
            return self::plan($experienceId, $rows, array_map(static fn(array $r) => (string) $r['id'], $chosen), $user, $apply);
        };
        $result = $apply ? Db::transaction($run) : $run();
        Http::json(200, $result);
    }

    /**
     * The chosen changes and every later change of the same things, newest first, without duplicates
     * @param list<array<string, mixed>> $chosen
     * @return list<array<string, mixed>>
     */
    private static function withLater(string $experienceId, array $chosen): array
    {
        if (!$chosen) return [];
        $oldest = min(array_map(static fn(array $r) => (int) $r['created_at'], $chosen));
        $byId = [];
        foreach ($chosen as $row) $byId[(string) $row['id']] = $row;
        $later = self::rowsAfter($experienceId, $oldest - 1);
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
     * Two changes of the same thing: the same row – for the experience's JSON, fields both changed
     * @param array<string, mixed> $a
     * @param array<string, mixed> $b
     */
    private static function sameThing(array $a, array $b): bool
    {
        $experienceA = in_array($a['kind'], self::EXPERIENCE_KINDS, true);
        $experienceB = in_array($b['kind'], self::EXPERIENCE_KINDS, true);
        if ($experienceA || $experienceB) return $experienceA && $experienceB && (bool) array_intersect(self::fields($a), self::fields($b));
        return $a['kind'] === $b['kind'] && $a['ref'] === $b['ref'];
    }

    /**
     * The fields of the experience's JSON an experience-level change changed
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
    private static function plan(string $experienceId, array $rows, array $chosen, array $user, bool $apply): array
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
            $key = in_array($row['kind'], self::EXPERIENCE_KINDS, true) ? 'experience' : $row['kind'] . ':' . $row['ref'];
            $fields = $key === 'experience' ? self::fields($row) : [];
            $blockedFields = $key === 'experience' ? array_intersect($fields, $blocked['experience'] ?? []) : [];
            if ($key === 'experience' ? (bool) $blockedFields : isset($blocked[$key])) {
                $items[] = $item + ['status' => 'conflict', 'reason' => 'A newer change of the same thing could not be reverted.'];
                $counts['conflict']++;
                if ($key === 'experience') $blocked['experience'] = array_values(array_unique([...$blocked['experience'], ...$fields]));
                continue;
            }
            $current = array_key_exists($key, $state) ? $state[$key] : self::read($experienceId, $key);
            $after = Editor::decode($row['after_json']);
            $before = Editor::decode($row['before_json']);
            if ($row['kind'] === SurfaceReferences::KIND && $before !== null && !SurfaceReferences::surfaceExists($experienceId, ...SurfaceReferences::split((string) $row['ref']))) {
                $items[] = $item + ['status' => 'conflict', 'reason' => 'Its scene has no such surface any more.'];
                $counts['conflict']++;
                $blocked[$key] = true;
                continue;
            }
            if (!self::holds($current, $after, $fields, $key)) {
                $items[] = $item + ['status' => 'conflict', 'reason' => $current === null ? 'It is gone from the draft.' : 'It was changed since, outside this log – it is left as it is.'];
                $counts['conflict']++;
                if ($key === 'experience') $blocked['experience'] = array_values(array_unique([...($blocked['experience'] ?? []), ...$fields]));
                else $blocked[$key] = true;
                continue;
            }
            // A delivery's new row goes again only when nothing else hangs on it (#322)
            $inUse = $before === null && self::deliveredRow($row) ? self::inUse($experienceId, (string) $row['kind'], (string) $row['ref'], $state) : null;
            if ($inUse !== null) {
                $items[] = $item + ['status' => 'conflict', 'reason' => $inUse];
                $counts['conflict']++;
                $blocked[$key] = true;
                continue;
            }
            $next = $key === 'experience' ? self::withFields($current, $before, $fields) : $before;
            $state[$key] = $next;
            if ($apply) $written[] = self::write($experienceId, $key, (string) $row['kind'], (string) $row['ref'], $current, $next, $user, (string) $set, (string) $row['id']);
            $items[] = $item + ['status' => 'revert'];
            $counts['revert']++;
        }
        if ($apply && $written) Experiences::touchExperience($experienceId);
        return [
            'plan' => ['changes' => $items, 'chosen' => $chosen, 'counts' => $counts, 'later' => $later, 'others' => array_keys($others)],
            'applied' => $apply && (bool) $written,
            'set' => $written ? $set : null,
            'written' => $written,
        ];
    }

    /**
     * A row a delivery made (#322): its creation is taken back by removing it
     * @param array<string, mixed> $row
     */
    private static function deliveredRow(array $row): bool
    {
        return ($row['delivery_id'] ?? null) !== null && in_array($row['kind'], self::DELIVERED_KINDS, true)
            && Editor::decode($row['after_json']) instanceof stdClass;
    }

    /**
     * Why a delivery's new entry or scene cannot go again, null when it can: an entry with a target, a scene with entries
     * or the one the experience opens on – unless the same plan removes those first (`$state`: null = removed)
     * @param array<string, mixed> $state
     */
    private static function inUse(string $experienceId, string $kind, string $ref, array $state): ?string
    {
        $params = ['experience' => $experienceId, 'id' => $ref];
        $kept = static fn(string $what, array $ids): array => array_values(array_filter(array_map('strval', $ids), static fn(string $id) => !(array_key_exists("$what:$id", $state) && $state["$what:$id"] === null)));
        if ($kind === 'entry') {
            $targets = $kept('target', Db::run('SELECT id FROM targets WHERE experience_id = :experience AND entry_id = :id', $params)->fetchAll(PDO::FETCH_COLUMN));
            return $targets ? 'It has a target (' . implode(', ', $targets) . ') – remove that first.' : null;
        }
        if ($kind === 'scene') {
            if (Db::value('SELECT initial_scene FROM experiences WHERE id = :id', ['id' => $experienceId]) === $ref) return 'The experience opens on this scene.';
            $entries = $kept('entry', Db::run('SELECT id FROM entries WHERE experience_id = :experience AND scene_id = :id', $params)->fetchAll(PDO::FETCH_COLUMN));
            return $entries ? 'Entries lie on it (' . implode(', ', array_slice($entries, 0, 5)) . (count($entries) > 5 ? ', …' : '') . ') – move or remove them first.' : null;
        }
        return null;
    }

    /** Whether the thing's current value is what the change wrote (the experience: only the fields it changed) */
    private static function holds(mixed $current, mixed $after, array $fields, string $key): bool
    {
        // A reference image (#314) may be none (null) before and after
        if (str_starts_with($key, SurfaceReferences::KIND . ':')) return self::canon($current) === self::canon($after);
        if ($current === null) return false;
        if ($key !== 'experience') return self::canon($current) === self::canon($after);
        foreach ($fields as $field) {
            if (self::canon($current->{$field} ?? null) !== self::canon($after->{$field} ?? null)) return false;
        }
        return true;
    }

    /** The experience's JSON with `$fields` as `$from` has them (a field `$from` has not is removed) */
    private static function withFields(stdClass $experience, stdClass $from, array $fields): stdClass
    {
        $next = clone $experience;
        foreach ($fields as $field) {
            if (property_exists($from, $field)) $next->{$field} = $from->{$field};
            else unset($next->{$field});
        }
        return $next;
    }

    /** The thing's value now, as the log stores it (null: the row is gone) */
    private static function read(string $experienceId, string $key): mixed
    {
        $params = ['experience' => $experienceId];
        if ($key === 'experience') return Editor::decode((string) Experiences::experienceRow($experienceId, true)['experience_json']);
        if ($key === 'groups:' . $experienceId) return Editor::decode((string) (Experiences::experienceRow($experienceId, true)['groups_json'] ?? '[]'));
        if ($key === 'order:' . $experienceId) return array_map(static fn(array $row) => (string) $row['id'], Scenes::context($experienceId, true)['rows']);
        [$kind, $ref] = explode(':', $key, 2);
        if ($kind === SurfaceReferences::KIND) {
            [$scene, $surface] = SurfaceReferences::split($ref);
            $reference = SurfaceReferences::one($experienceId, $scene, $surface, true);
            return $reference === null ? null : (object) $reference;
        }
        $sql = match ($kind) {
            'entity' => 'SELECT data_json FROM entities WHERE experience_id = :experience AND ref = :id',
            'target' => 'SELECT data_json FROM targets WHERE experience_id = :experience AND id = :id',
            'entry' => 'SELECT data_json FROM entries WHERE experience_id = :experience AND id = :id',
            'scene' => 'SELECT data_json FROM scenes WHERE experience_id = :experience AND id = :id',
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
    private static function write(string $experienceId, string $key, string $kind, string $ref, mixed $current, mixed $next, array $user, string $set, string $reverts): string
    {
        $json = Editor::encode($next);
        $before = Editor::encode($current);
        $params = ['experience' => $experienceId];
        if ($next === null && in_array($kind, self::DELIVERED_KINDS, true)) {
            // A delivery's new row taken back (#322): removed – a scene with its reference images, the others closing up
            $table = ['entry' => 'entries', 'target' => 'targets', 'scene' => 'scenes'][$kind];
            Db::run("DELETE FROM $table WHERE experience_id = :experience AND id = :id", $params + ['id' => $ref]);
            if ($kind === 'scene') {
                Db::run('DELETE FROM surface_references WHERE experience_id = :experience AND scene_id = :scene', $params + ['scene' => $ref]);
                Scenes::writePositions($experienceId, Scenes::rows($experienceId, true), null);
            }
        } elseif ($key === 'experience') {
            Db::run('UPDATE experiences SET title = :title, experience_json = :data WHERE id = :experience',
                $params + ['title' => (string) ($next->title ?? ''), 'data' => $json]);
        } elseif ($kind === 'groups') {
            Db::run('UPDATE experiences SET groups_json = :data WHERE id = :experience', $params + ['data' => $json]);
        } elseif ($kind === 'order') {
            Scenes::writePositions($experienceId, Scenes::context($experienceId)['rows'], $next);
        } elseif ($kind === 'entity') {
            Db::run('UPDATE entities SET type = :type, data_json = :data WHERE experience_id = :experience AND ref = :id', $params + ['type' => (string) ($next->type ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === 'target') {
            $entity = $next->entity ?? null;
            $entityRef = $entity instanceof stdClass && is_string($entity->ref ?? null) && !isset($entity->type) ? $entity->ref : null;
            Db::run('UPDATE targets SET entity_ref = :ref, image_src = :image, data_json = :data WHERE experience_id = :experience AND id = :id',
                $params + ['ref' => $entityRef, 'image' => (string) ($next->imageSrc ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === 'entry') {
            Db::run('UPDATE entries SET category = :category, title = :title, data_json = :data WHERE experience_id = :experience AND id = :id',
                $params + ['category' => (string) ($next->category ?? ''), 'title' => (string) ($next->title ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === 'scene') {
            Db::run('UPDATE scenes SET label = :label, data_json = :data WHERE experience_id = :experience AND id = :id', $params + ['label' => (string) ($next->label ?? ''), 'data' => $json, 'id' => $ref]);
        } elseif ($kind === SurfaceReferences::KIND) {
            [$scene, $surface] = SurfaceReferences::split($ref);
            $reference = $next instanceof stdClass ? ['url' => (string) $next->url, 'name' => (string) ($next->name ?? ''), 'fit' => (string) ($next->fit ?? SurfaceReferences::FIT_DEFAULT)] : null;
            SurfaceReferences::write($experienceId, $scene, $surface, $reference, $user['id']);
        }
        return Experiences::recordChange($experienceId, $user, $kind, $ref, $before, $json, $set, $reverts);
    }

    // ── the log's rows ──────────────────────────────────────────────────────────────────────────

    /** @return array<string, mixed> one change of the experience, else 404 */
    private static function row(string $experienceId, mixed $changeId): array
    {
        if (!is_string($changeId)) throw new ApiError(400, 'invalid-revert', 'A change id is a string.');
        $row = Db::one('SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.experience_id = :experience AND c.id = :id', ['experience' => $experienceId, 'id' => $changeId]);
        if (!$row) throw new ApiError(404, 'not-found', "No change \"$changeId\" in this experience's log.");
        return $row;
    }

    /** @return list<array<string, mixed>> the experience's changes saved after `$at` (ms), newest first */
    private static function rowsAfter(string $experienceId, int $at): array
    {
        $limit = self::MAX + 1;
        return Db::run("SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.experience_id = :experience AND c.created_at > :at ORDER BY c.created_at DESC, c.id DESC LIMIT $limit",
            ['experience' => $experienceId, 'at' => $at])->fetchAll();
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
