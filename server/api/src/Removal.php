<?php
declare(strict_types=1);

/**
 * What goes when entries are removed with everything on them (docs/server.md "Removing a spread or an entry"): the
 * entries, their targets, the shared entities no other target uses (a shared entity used elsewhere is kept and
 * listed with its other targets), the targets' own entities with them, and the Library files those rows name – split
 * into the files used only there and the files used elsewhere (`Assets::usagesOf` beyond the removed rows).
 *
 * `impact()` is what the first step answers, `state()` what its confirmation is bound to, `remove()` the rows inside
 * the caller's transaction (every removed row a change with its `before`), `deleteStoredFiles()` the files of the
 * removed Library rows after the commit. A Library file is removed only with `deleteFiles` and only when used only
 * there; a file used elsewhere never.
 */
final class Removal
{
    /** @var list<array<string, mixed>> */
    private array $targets = [];
    /** @var array<string, array{row: array<string, mixed>, targets: list<string>}> shared entities that go, by ref */
    private array $entities = [];
    /** @var array<string, array{row: array<string, mixed>, targets: list<string>, usedBy: list<string>}> shared entities kept, by ref */
    private array $kept = [];
    /** @var list<array{asset: array<string, mixed>, usedBy: list<array{kind: string, ref: string}>}> */
    private array $onlyHere = [];
    /** @var list<array{asset: array<string, mixed>, usedBy: list<array{kind: string, ref: string}>}> */
    private array $elsewhere = [];

    /** @param list<array<string, mixed>> $entries the entry rows that go */
    public function __construct(private readonly string $bookId, private readonly array $entries)
    {
        foreach ($entries as $entry) {
            foreach (Db::run('SELECT * FROM targets WHERE book_id = :book AND entry_id = :entry ORDER BY id', ['book' => $bookId, 'entry' => $entry['id']])->fetchAll() as $target) {
                $this->targets[] = $target;
            }
        }
        $targetIds = array_column($this->targets, 'id');
        foreach ($this->targets as $target) {
            $ref = $target['entity_ref'];
            if (!is_string($ref) || $ref === '' || isset($this->entities[$ref]) || isset($this->kept[$ref])) continue;
            $row = Db::one('SELECT * FROM entities WHERE book_id = :book AND ref = :ref', ['book' => $bookId, 'ref' => $ref]);
            if (!$row) continue;
            $users = array_column(Db::run('SELECT id FROM targets WHERE book_id = :book AND entity_ref = :ref ORDER BY id', ['book' => $bookId, 'ref' => $ref])->fetchAll(), 'id');
            $here = array_values(array_intersect($users, $targetIds));
            $others = array_values(array_diff($users, $targetIds));
            if ($others) $this->kept[$ref] = ['row' => $row, 'targets' => $here, 'usedBy' => $others];
            else $this->entities[$ref] = ['row' => $row, 'targets' => $here];
        }
        $this->files();
    }

    /** The removed rows' texts, and the Library files they name: used only by removed rows, or elsewhere too */
    private function files(): void
    {
        $texts = [];
        foreach ($this->entries as $entry) $texts[] = (string) $entry['data_json'];
        foreach ($this->targets as $target) $texts[] = $target['image_src'] . "\n" . $target['data_json'];
        foreach ($this->entities as $entity) $texts[] = (string) $entity['row']['data_json'];
        $removed = [
            'entry' => array_column($this->entries, 'id'),
            'target' => array_column($this->targets, 'id'),
            'entity' => array_keys($this->entities),
        ];
        $assets = Db::run('SELECT * FROM assets WHERE book_id = :book AND status = :status ORDER BY name, id', ['book' => $this->bookId, 'status' => 'active'])->fetchAll();
        foreach ($assets as $asset) {
            $named = false;
            foreach ($texts as $text) {
                if (str_contains($text, (string) $asset['url'])) { $named = true; break; }
            }
            if (!$named) continue;
            $usedBy = array_values(array_filter(Assets::usagesOf($this->bookId, $asset),
                static fn(array $usage) => !in_array($usage['ref'], $removed[$usage['kind']] ?? [], true)));
            if ($usedBy) $this->elsewhere[] = ['asset' => $asset, 'usedBy' => $usedBy];
            else $this->onlyHere[] = ['asset' => $asset, 'usedBy' => []];
        }
    }

    /**
     * What the removal takes (the first step's `impact`, without the spread – the caller adds it): the entries, their
     * targets, the entities that go (a shared one with its `ref`, a target's own with `ref: null`), the shared entities
     * kept (with the targets that still use them), the Library files used only here and those used elsewhere, the counts
     * @return array<string, mixed>
     */
    public function impact(): array
    {
        $entities = [];
        foreach ($this->entities as $ref => $entity) {
            $entities[] = ['ref' => (string) $ref, 'type' => $entity['row']['type'], 'shared' => true, 'targets' => $entity['targets']];
        }
        foreach ($this->targets as $target) {
            $own = Editor::decode($target['data_json'])->entity ?? null;
            if ($own instanceof stdClass && !isset($own->ref)) $entities[] = ['ref' => null, 'type' => $own->type ?? null, 'shared' => false, 'targets' => [$target['id']]];
        }
        $kept = [];
        foreach ($this->kept as $ref => $entity) {
            $kept[] = ['ref' => (string) $ref, 'type' => $entity['row']['type'], 'targets' => $entity['targets'], 'usedBy' => $entity['usedBy']];
        }
        $file = static fn(array $f) => ['id' => $f['asset']['id'], 'name' => $f['asset']['name'], 'kind' => $f['asset']['kind'], 'size' => (int) $f['asset']['size'], 'url' => $f['asset']['url']]
            + ($f['usedBy'] ? ['usedBy' => $f['usedBy']] : []);
        return [
            'entries' => array_map(static fn(array $e) => ['id' => $e['id'], 'title' => $e['title'], 'page' => (int) $e['page'], 'category' => $e['category']], $this->entries),
            'targets' => array_map(static fn(array $t) => ['id' => $t['id'], 'entry' => $t['entry_id'], 'imageSrc' => $t['image_src']], $this->targets),
            'entities' => $entities,
            'keptEntities' => $kept,
            'files' => ['onlyHere' => array_map($file, $this->onlyHere), 'elsewhere' => array_map($file, $this->elsewhere)],
            'counts' => [
                'entries' => count($this->entries), 'targets' => count($this->targets), 'entities' => count($entities), 'keptEntities' => count($kept),
                'filesOnlyHere' => count($this->onlyHere), 'filesElsewhere' => count($this->elsewhere),
            ],
        ];
    }

    /**
     * What a confirmation of this removal is bound to: every row that goes as it is now, the kept entities' users, the
     * files and their uses, and the book's last change – anything that changes in the book voids the id
     * @param list<mixed> $more the caller's own rows (the spread)
     */
    public function state(array $more = []): string
    {
        $log = Db::one('SELECT COUNT(*) AS n, MAX(created_at) AS latest FROM changes WHERE book_id = :book', ['book' => $this->bookId]);
        $updated = Db::value('SELECT updated_at FROM books WHERE id = :id', ['id' => $this->bookId]);
        return Confirmation::digest([
            $more,
            array_map(static fn(array $e) => [$e['id'], $e['data_json']], $this->entries),
            array_map(static fn(array $t) => [$t['id'], $t['image_src'], $t['entity_ref'], $t['data_json']], $this->targets),
            array_map(static fn(array $e) => [$e['row']['data_json'], $e['targets']], $this->entities),
            array_map(static fn(array $e) => [$e['targets'], $e['usedBy']], $this->kept),
            array_map(static fn(array $f) => [$f['asset']['id'], $f['asset']['url'], $f['asset']['version']], $this->onlyHere),
            array_map(static fn(array $f) => [$f['asset']['id'], $f['asset']['url'], $f['usedBy']], $this->elsewhere),
            [(int) ($log['n'] ?? 0), $log['latest'] ?? null, $updated],
        ]);
    }

    /**
     * Removes the rows inside the caller's transaction: targets, the shared entities used only here, entries – and with
     * `$deleteFiles` the Library rows of the files used only here – each a change with its `before`
     * @param array<string, mixed> $user
     * @return array{entries: list<string>, targets: list<string>, entities: list<string>, files: list<string>, paths: list<string>}
     */
    public function remove(array $user, bool $deleteFiles): array
    {
        $book = $this->bookId;
        foreach ($this->targets as $target) {
            Db::run('DELETE FROM targets WHERE book_id = :book AND id = :id', ['book' => $book, 'id' => $target['id']]);
            Books::recordChange($book, $user, 'target', $target['id'], $target['data_json'], 'null');
        }
        foreach ($this->entities as $ref => $entity) {
            Db::run('DELETE FROM entities WHERE book_id = :book AND ref = :ref', ['book' => $book, 'ref' => (string) $ref]);
            Books::recordChange($book, $user, 'entity', (string) $ref, $entity['row']['data_json'], 'null');
        }
        foreach ($this->entries as $entry) {
            Db::run('DELETE FROM entries WHERE book_id = :book AND id = :id', ['book' => $book, 'id' => $entry['id']]);
            Books::recordChange($book, $user, 'entry', $entry['id'], $entry['data_json'], 'null');
        }
        $files = [];
        $paths = [];
        if ($deleteFiles) {
            foreach ($this->onlyHere as $file) {
                $asset = $file['asset'];
                $versions = Db::run('SELECT version, path, url FROM asset_versions WHERE asset_id = :id ORDER BY version', ['id' => $asset['id']])->fetchAll();
                array_push($paths, ...array_column($versions, 'path'));
                Db::run('DELETE FROM asset_versions WHERE asset_id = :id', ['id' => $asset['id']]);
                Db::run('DELETE FROM assets WHERE id = :id', ['id' => $asset['id']]);
                $before = ['id' => $asset['id'], 'name' => $asset['name'], 'kind' => $asset['kind'], 'mime' => $asset['mime'], 'size' => (int) $asset['size'],
                    'sha256' => $asset['sha256'], 'url' => $asset['url'], 'version' => (int) $asset['version'],
                    'versions' => array_map(static fn(array $v) => ['version' => (int) $v['version'], 'path' => $v['path'], 'url' => $v['url']], $versions)];
                Books::recordChange($book, $user, 'asset', $asset['id'], Editor::encode($before), 'null');
                $files[] = $asset['id'];
            }
        }
        return [
            'entries' => array_column($this->entries, 'id'), 'targets' => array_column($this->targets, 'id'),
            'entities' => array_map('strval', array_keys($this->entities)), 'files' => $files, 'paths' => $paths,
        ];
    }

    /**
     * The stored files of the Library rows `remove()` took, after the commit (a store cannot roll back) – a file that
     * cannot be deleted is logged, the rows are gone either way
     * @param list<string> $paths
     */
    public static function deleteStoredFiles(array $paths): void
    {
        if (!$paths) return;
        $store = ContentStore::for(Assets::STORE_ENV);
        foreach ($paths as $path) {
            try {
                $store->delete($path);
            } catch (Throwable $error) {
                error_log("Removal: the stored file $path stays – {$error->getMessage()}");
            }
        }
    }
}
