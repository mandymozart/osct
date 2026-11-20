<?php
declare(strict_types=1);

/**
 * The editor's experiences: a game configuration (content schema 3.0) imported into rows (experiences, scenes – the `scenes` table –,
 * entries, targets, entities), read
 * as a tree, edited entity by entity, published as a content version, with a change log and a publish log.
 * Every row keeps the imported object in its data_json column and the assembly (ContentVersion) gives the
 * configuration back from those – the typed columns index the rows for the tree and the queries, they are no
 * second copy of the truth. An entry's data_json holds the entry without its target, the target row holds the
 * target with its entity (inline, or `{ ref }` to a shared one); positions keep the imported order.
 */
final class Experiences
{
    /** Environments whose content store could not be read in this request (ContentStore::live of an experience failed) */
    private static array $unreadable = [];

    /**
     * GET /editor/experiences → { experiences: [{ id, title, author, experience, initialScene, scenes, updatedAt, lastPublish, live, … }],
     * environments: [{ env, error }] } – the environments where an experience's store could not be read (where it is live
     * there is not known)
     */
    public static function list(): never
    {
        Editor::user();
        $experiences = [];
        foreach (Db::run('SELECT * FROM experiences ORDER BY title, id')->fetchAll() as $row) $experiences[] = self::summary($row);
        $environments = array_map(static fn(string $env): array => ['env' => $env, 'error' => 'content-store-failed'], array_keys(self::$unreadable));
        Http::json(200, ['experiences' => $experiences, 'environments' => $environments]);
    }

    /**
     * GET /editor/environments → { env, environments: [{ env, store, publish, url, warning }] }: this instance's
     * environment (the only one it publishes to) and, per environment, its backend – `cdn` or `server` (the directory
     * store this API serves) –, where readers load it, and the warning wherever the directory store is the target
     */
    public static function environments(): never
    {
        Editor::user();
        Http::json(200, ['env' => Config::env(), 'environments' => ContentStore::describe()]);
    }

    /**
     * Where an experience is live: every environment whose store of it (#87) names a build – [{ env, build, since }]. A store
     * that cannot be read is left out and its environment noted (`$unreadable`).
     * @return list<array{env: string, build: ?string, since: ?string}>
     */
    private static function liveIn(string $experienceId): array
    {
        $live = [];
        foreach (ContentStore::environments() as $env) {
            if (isset(self::$unreadable[$env])) continue;
            try {
                $serving = ContentStore::for($env, $experienceId)->live();
            } catch (ApiError) {
                self::$unreadable[$env] = true;
                continue;
            }
            if ($serving !== null) $live[] = ['env' => $env, 'build' => $serving['build'], 'since' => $serving['since']];
        }
        return $live;
    }

    /**
     * POST /editor/experiences/{id}/import { configuration, files?, assetsBase?, confirm? } | { source: "cdn", confirm? }
     * → { experience, counts, draft, imported }
     * The configuration's `experience.id` must be `{id}` (400 invalid-configuration naming both, `experienceIdOf`).
     * Replaces the experience's content rows in one transaction (the logs stay). `assetsBase` is where the configuration's
     * `/assets/content/…` paths resolve; `source: "cdn"` imports the current version of `{id}` on CONTENT_BASE_URL
     * (`<base>/{id}/latest.json`).
     * An experience that exists is overwritten only in two steps: without `confirm` the answer is 409 confirm-import with the
     * `comparison` (what comes in against what the draft is based on and its edits since) and a `confirmation`
     * { id, expiresAt }; the same import again with `confirm: <id>` replaces the draft. The id is bound to the person (and
     * the AI connection), the incoming content and the draft as it was compared, and lasts Confirmation::SECONDS – any
     * change meanwhile voids it (409 confirmation-void, with a new comparison). A new experience is imported at once.
     */
    public static function import(string $experienceId): never
    {
        $user = Editor::user();
        $body = Editor::body();
        [$configuration, $files, $assetsBase, $source] = self::source($body, $experienceId);
        $parts = self::parse($configuration, Plugins::hasSources($experienceId));
        self::experienceIdOf($configuration, $experienceId);
        $incoming = self::incoming($configuration, $parts, $files, $assetsBase, $source);
        $existing = Db::one('SELECT * FROM experiences WHERE id = :id', ['id' => $experienceId]);
        if ($existing !== null) self::confirmImport($experienceId, $existing, $incoming, $user, $body->confirm ?? null);
        $now = Db::now();
        $imported = Editor::encode(['build' => $incoming['build'], 'hash' => $incoming['hash'], 'date' => $incoming['date'], 'appVersion' => $incoming['appVersion'],
            'schema' => $incoming['schema'], 'source' => $source, 'from' => $incoming['from'], 'at' => Editor::nowMs(), 'by' => $user['email'] ?? null]);

        Db::transaction(function () use ($experienceId, $parts, $files, $assetsBase, $now, $imported) {
            foreach (['targets', 'entries', 'scenes', 'entities'] as $table) {
                Db::run("DELETE FROM $table WHERE experience_id = :experience", ['experience' => $experienceId]);
            }
            $experience = $parts['experience'];
            $params = [
                'id' => $experienceId, 'title' => $experience->title, 'experience' => Editor::encode($experience),
                'initial' => $parts['initialScene'], 'base' => $assetsBase,
                'files' => Editor::encode($files), 'schema' => $parts['schema'], 'hash' => $parts['hash'], 'now' => $now,
                'plugins' => Editor::encode($parts['plugins']), 'imported' => $imported, 'groups' => Editor::encode(array_values($parts['groups'])),
            ];
            if (Db::value('SELECT id FROM experiences WHERE id = :id', ['id' => $experienceId]) !== null) {
                Db::run('UPDATE experiences SET title = :title, experience_json = :experience, initial_scene = :initial,
                         assets_base = :base, files_json = :files, content_schema = :schema, imported_hash = :hash, plugins_json = :plugins, imported_json = :imported, groups_json = :groups, updated_at = :now WHERE id = :id', $params);
            } else {
                Db::run('INSERT INTO experiences (id, title, experience_json, initial_scene, assets_base, files_json, content_schema, imported_hash, plugins_json, imported_json, groups_json, created_at, updated_at)
                         VALUES (:id, :title, :experience, :initial, :base, :files, :schema, :hash, :plugins, :imported, :groups, :created, :now)', $params + ['created' => $now]);
            }
            foreach ($parts['scenes'] as $s) {
                Db::run('INSERT INTO scenes (experience_id, id, position, label, data_json) VALUES (:experience, :id, :position, :label, :data)',
                    ['experience' => $experienceId, 'id' => $s['id'], 'position' => $s['position'], 'label' => $s['data']->label, 'data' => Editor::encode($s['data'])]);
            }
            foreach ($parts['entities'] as $e) {
                Db::run('INSERT INTO entities (experience_id, ref, position, type, data_json) VALUES (:experience, :ref, :position, :type, :data)',
                    ['experience' => $experienceId, 'ref' => $e['ref'], 'position' => $e['position'], 'type' => $e['type'], 'data' => Editor::encode($e['data'])]);
            }
            foreach ($parts['entries'] as $e) {
                Db::run('INSERT INTO entries (experience_id, id, scene_id, position, category, title, data_json) VALUES (:experience, :id, :scene, :position, :category, :title, :data)',
                    ['experience' => $experienceId, 'id' => $e['id'], 'scene' => $e['scene'], 'position' => $e['position'], 'category' => $e['category'], 'title' => $e['title'], 'data' => Editor::encode($e['data'])]);
            }
            foreach ($parts['targets'] as $t) {
                Db::run('INSERT INTO targets (experience_id, id, entry_id, image_src, entity_ref, data_json) VALUES (:experience, :id, :entry, :image, :ref, :data)',
                    ['experience' => $experienceId, 'id' => $t['id'], 'entry' => $t['entry'], 'image' => $t['image'], 'ref' => $t['ref'], 'data' => Editor::encode($t['data'])]);
            }
        });

        $draft = ContentVersion::assemble($experienceId);
        Http::json(200, [
            'experience' => self::summary(self::experience($experienceId)),
            'counts' => ['scenes' => count($parts['scenes']), 'entries' => count($parts['entries']), 'targets' => count($parts['targets']), 'entities' => count($parts['entities'])],
            'draft' => ['build' => $draft['build'], 'hash' => $draft['hash']],
            'imported' => self::basedOn(Editor::decode($imported)),
        ]);
    }

    /**
     * POST /editor/import/preview { configuration, files?, assetsBase? } | { source: "cdn", experience? }
     * → { source, contentBase, manifest, incoming, counts, existing }
     * What the same import body would bring in, before anything is imported – read-only, the import's access. The
     * configuration is checked as the import checks it (the same 400s); `source: "cdn"` reads the current version of the
     * experience `experience` (default: the instance's, EXPERIENCE) on CONTENT_BASE_URL (`contentBase` = that experience's
     * store, `<base>/<experience>`; `manifest` = its latest.json { url, build, activatedAt }) – 502
     * content-fetch-failed with the `url` that failed. `incoming` as in the import's comparison, `counts` the scenes,
     * entries, targets and entities it holds; `existing` = the comparison the import would answer (the draft of that id
     * it replaces, its edits since its import, where it is live), null when the experience is new.
     */
    public static function preview(): never
    {
        Editor::user();
        $body = Editor::body();
        $named = $body->experience ?? Config::get('EXPERIENCE');
        if (($body->source ?? null) === 'cdn' && (!is_string($named) || !preg_match('/^' . Editor::ID . '$/', $named))) {
            throw new ApiError(400, 'invalid-experience', 'Name the experience to preview from the CDN (experience) – this instance has no default (EXPERIENCE).');
        }
        [$configuration, $files, $assetsBase, $source, $manifest] = self::source($body, is_string($named) ? $named : '');
        $experienceId = self::experienceIdOf($configuration);
        $parts = self::parse($configuration, Plugins::hasSources($experienceId));
        $incoming = self::incoming($configuration, $parts, $files, $assetsBase, $source);
        $existing = Db::one('SELECT * FROM experiences WHERE id = :id', ['id' => $experienceId]);
        $comparison = $existing !== null ? self::comparison($experienceId, $existing, $incoming, self::editsSince($experienceId, $existing)) : null;
        unset($incoming['digest']);
        Http::json(200, [
            'source' => $source,
            'contentBase' => $manifest !== null ? $manifest['base'] : null,
            'manifest' => $manifest !== null ? ['url' => $manifest['url'], 'build' => $manifest['build'], 'activatedAt' => $manifest['activatedAt']] : null,
            'incoming' => $incoming,
            'counts' => ['scenes' => count($parts['scenes']), 'entries' => count($parts['entries']), 'targets' => count($parts['targets']), 'entities' => count($parts['entities'])],
            'existing' => $comparison,
        ]);
    }

    /**
     * The experience a configuration is of: its `experience.id` (400 invalid-id unless it is an id). The import stores the rows under
     * the path's id and keeps the configuration's `experience` as it is, so the two must agree – else a publish would name one
     * experience in latest.json and another in game.config.json: 400 invalid-configuration naming both. The preview has no
     * path id; it answers for the configuration's own id, the one the import is then called with.
     */
    private static function experienceIdOf(stdClass $configuration, ?string $pathId = null): string
    {
        $experience = $configuration->experience ?? null;
        $id = Editor::id($experience instanceof stdClass ? ($experience->id ?? null) : null, 'experience.id');
        if ($pathId !== null && $id !== $pathId) {
            throw new ApiError(400, 'invalid-configuration', "The configuration is of experience \"$id\", not \"$pathId\" – import it as $id, or change its experience.id.");
        }
        return $id;
    }

    /**
     * What an import (or its preview) reads: the configuration, its files, the assets base and the source – from the
     * body, or for `source: "cdn"` from the current version of `$experienceId` on CONTENT_BASE_URL, with that latest.json. A body without
     * `files` but with an assets base (the editor's URL and file modes, the MCP's `url`) reads `<assetsBase>/files.json`
     * from there – optional, as for the reader: a base without one (the reader's dev server) imports with none (#244)
     * @return array{0: stdClass, 1: stdClass, 2: string, 3: string, 4: ?array{base: string, url: string, build: string, activatedAt: ?string}}
     */
    private static function source(stdClass $body, string $experienceId): array
    {
        if (($body->source ?? null) === 'cdn') {
            [$configuration, $files, $assetsBase, $manifest] = self::fetchFromCdn($experienceId);
            return [$configuration, $files, $assetsBase, 'cdn', $manifest];
        }
        $configuration = $body->configuration ?? null;
        if (!$configuration instanceof stdClass) throw new ApiError(400, 'invalid-configuration', 'configuration must be an object.');
        $files = new stdClass();
        if (isset($body->files)) {
            if (!$body->files instanceof stdClass) throw new ApiError(400, 'invalid-configuration', 'files must be an object.');
            $files = $body->files;
        }
        $assetsBase = '';
        if (isset($body->assetsBase)) {
            if (!is_string($body->assetsBase)) throw new ApiError(400, 'invalid-configuration', 'assetsBase must be a string.');
            $assetsBase = rtrim($body->assetsBase, '/');
        }
        if (!isset($body->files) && $assetsBase !== '') {
            try {
                $fetched = self::fetchJson("$assetsBase/files.json");
                if ($fetched instanceof stdClass) $files = $fetched;
            } catch (ApiError) {
                // no files.json below the base – the import carries no imported files, as before
            }
        }
        return [$configuration, $files, $assetsBase, 'configuration', null];
    }

    /**
     * What an import brings in: the experience, the build (content checksum, first 12 digits), its date, the app and the
     * schema version that built it, where it comes from, and a digest of everything the import would write
     * @return array{experience: string, title: string, build: ?string, hash: ?string, date: ?string, appVersion: ?string, schema: string, source: string, from: ?string, digest: string}
     */
    private static function incoming(stdClass $configuration, array $parts, stdClass $files, string $assetsBase, string $source): array
    {
        $version = $configuration->version;
        $hash = is_string($parts['hash']) && $parts['hash'] !== '' ? $parts['hash'] : null;
        return [
            'experience' => $parts['experience']->id,
            'title' => $parts['experience']->title,
            'build' => $hash !== null ? substr($hash, 0, 12) : null,
            'hash' => $hash,
            'date' => is_string($version->timestamp ?? null) ? $version->timestamp : null,
            'appVersion' => is_string($version->version ?? null) ? $version->version : null,
            'schema' => $parts['schema'],
            'source' => $source,
            'from' => $assetsBase !== '' ? $assetsBase : null,
            'digest' => hash('sha256', Editor::encode([$configuration, $files, $assetsBase])),
        ];
    }

    /**
     * The import's second step (`Confirmation`): passes when `$confirm` is a confirmation id for exactly this
     * comparison, else 409 – `confirm-import` when none was sent, `confirmation-void` when it is expired, someone else's
     * or the draft or the incoming content changed since – both with the comparison and a new confirmation
     * @param array<string, mixed> $row
     * @param array<string, mixed> $user
     */
    private static function confirmImport(string $experienceId, array $row, array $incoming, array $user, mixed $confirm): void
    {
        $edits = self::editsSince($experienceId, $row);
        // What the comparison showed: the draft's import, its last change and the rows' state, and what comes in
        $state = Confirmation::digest([$incoming['digest'], $row['imported_json'] ?? null, $row['imported_hash'], $row['updated_at'], $edits['count'], $edits['last']]);
        Confirmation::require("import|$experienceId", $user, $state, $confirm,
            ['confirm-import', 'Importing replaces the draft of ' . $row['title'] . ' – compare the versions, then import again with confirm: <confirmation id>.'],
            'The confirmation is expired, someone else\'s, or the draft or the incoming content changed since – compare again and confirm with the new id.',
            fn() => ['comparison' => self::comparison($experienceId, $row, $incoming, $edits)]);
    }

    /**
     * The import's comparison: the experience, what comes in, and the draft – the build it is based on, its edits since that
     * import (the change log), its build now and where that is live
     * @param array<string, mixed> $row
     * @param array{count: int, last: ?string, since: ?int, recent: list<array<string, mixed>>} $edits
     * @return array<string, mixed>
     */
    private static function comparison(string $experienceId, array $row, array $incoming, array $edits): array
    {
        // A 2.x draft is no configuration of today's schema: its build is unknown until it is migrated (#319)
        $draft = Editor::isCurrentSchema((string) $row['content_schema']) ? ContentVersion::assemble($experienceId) : ['build' => null];
        $live = array_map(static fn(array $l): array => ['env' => $l['env'], 'build' => $l['build'], 'current' => $l['build'] === $draft['build']], self::liveIn($experienceId));
        $basedOn = self::basedOn(Editor::decode($row['imported_json'] ?? null));
        if ($basedOn === null && is_string($row['imported_hash']) && $row['imported_hash'] !== '') {
            $basedOn = ['build' => substr($row['imported_hash'], 0, 12), 'hash' => $row['imported_hash'], 'date' => null, 'appVersion' => null, 'schema' => $row['content_schema'], 'source' => null, 'from' => null, 'importedAt' => null, 'importedBy' => null];
        }
        unset($incoming['digest']);
        return [
            'experience' => ['id' => $experienceId, 'title' => $row['title']],
            'incoming' => $incoming,
            'draft' => [
                'basedOn' => $basedOn,
                'build' => $draft['build'],
                'edits' => $edits['count'],
                'editsSince' => $edits['since'] !== null ? Editor::iso($edits['since']) : null,
                'recentEdits' => $edits['recent'],
                'live' => $live,
            ],
            'same' => $basedOn !== null && $incoming['hash'] !== null && $basedOn['hash'] === $incoming['hash'],
        ];
    }

    /**
     * The draft's edits since its import: the change log after `imported_json.at` (all of it for an experience imported before
     * that was recorded), the newest ten in short
     * @param array<string, mixed> $row
     * @return array{count: int, last: ?string, since: ?int, recent: list<array<string, mixed>>}
     */
    private static function editsSince(string $experienceId, array $row): array
    {
        $imported = Editor::decode($row['imported_json'] ?? null);
        $since = is_object($imported) && is_int($imported->at ?? null) ? $imported->at : null;
        $params = ['experience' => $experienceId, 'since' => $since ?? 0];
        $count = (int) Db::value('SELECT COUNT(*) FROM changes WHERE experience_id = :experience AND created_at > :since', $params);
        $recent = [];
        foreach (Db::run('SELECT c.id, c.kind, c.ref, c.created_at, c.token_name, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id
                          WHERE c.experience_id = :experience AND c.created_at > :since ORDER BY c.created_at DESC, c.id LIMIT 10', $params)->fetchAll() as $change) {
            $recent[] = ['kind' => $change['kind'], 'ref' => $change['ref'], 'user' => $change['email'], 'token' => $change['token_name'], 'at' => Editor::iso((int) $change['created_at'])];
        }
        $last = $count ? Db::value('SELECT id FROM changes WHERE experience_id = :experience AND created_at > :since ORDER BY created_at DESC, id LIMIT 1', $params) : null;
        return ['count' => $count, 'last' => is_string($last) ? $last : null, 'since' => $since, 'recent' => $recent];
    }

    /**
     * What an import recorded (experiences.imported_json) as the API shows it, null when nothing was recorded
     * @return array{build: ?string, hash: ?string, date: ?string, appVersion: ?string, schema: ?string, source: ?string, from: ?string, importedAt: ?string, importedBy: ?string}|null
     */
    private static function basedOn(mixed $imported): ?array
    {
        if (!is_object($imported)) return null;
        $string = static fn(string $key): ?string => is_string($imported->$key ?? null) ? $imported->$key : null;
        return [
            'build' => $string('build'), 'hash' => $string('hash'), 'date' => $string('date'), 'appVersion' => $string('appVersion'),
            'schema' => $string('schema'), 'source' => $string('source'), 'from' => $string('from'),
            'importedAt' => is_int($imported->at ?? null) ? Editor::iso($imported->at) : null, 'importedBy' => $string('by'),
        ];
    }

    /**
     * GET /editor/experiences/{id} → { experience, scenes: [{ …SceneData, entries: [{ id, category, title, scene, surface?, target }] }],
     * groups }: the scenes in order, each with its entries; `target` = the entry's TargetData (id, imageSrc, place, entity
     * inline or `{ ref }`) or null
     */
    public static function tree(string $experienceId): never
    {
        Editor::user();
        $experience = self::experience($experienceId);
        $params = ['experience' => $experienceId];
        $targets = [];
        foreach (Db::run('SELECT entry_id, data_json FROM targets WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $targets[$row['entry_id']] = Editor::decode($row['data_json']);
        }
        $context = Scenes::context($experienceId);
        $groups = Scenes::groups($experience);
        $byScene = [];
        foreach (Db::run('SELECT * FROM entries WHERE experience_id = :experience ORDER BY position', $params)->fetchAll() as $row) {
            $scene = (string) $row['scene_id'];
            if (!isset($context['data'][$scene])) continue;
            $data = Editor::decode($row['data_json']);
            $entry = ['id' => $row['id'], 'category' => $row['category'], 'title' => $row['title'], 'scene' => $scene];
            if (is_string($data->surface ?? null) && in_array($data->surface, Scenes::surfaceIds($context['data'][$scene]), true)) $entry['surface'] = $data->surface;
            $entry['target'] = $targets[$row['id']] ?? null;
            $byScene[$scene][] = $entry;
        }
        $scenes = Scenes::shown($context, array_map(static fn($g) => (string) $g->id, $groups));
        foreach ($scenes as $scene) $scene->entries = $byScene[$scene->id] ?? [];
        Http::json(200, ['experience' => self::summary($experience), 'scenes' => $scenes, 'groups' => $groups]);
    }

    /** GET /editor/experiences/{id}/entities → { entities: { ref: EntityData } } */
    public static function entities(string $experienceId): never
    {
        Editor::user();
        self::experience($experienceId);
        $entities = new stdClass();
        foreach (Db::run('SELECT ref, data_json FROM entities WHERE experience_id = :experience ORDER BY position', ['experience' => $experienceId])->fetchAll() as $row) {
            $entities->{$row['ref']} = Editor::decode($row['data_json']);
        }
        Http::json(200, ['entities' => $entities]);
    }

    /** PUT /editor/experiences/{id}/entities/{ref} (body: EntityData) → { ref, entity }: saves a shared entity (new or changed), records a change */
    public static function putEntity(string $experienceId, string $ref): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        $entity = Editor::entity(Editor::body(), 'entity', 0, Editor::pluginNodeTypes($experienceId), Editor::pluginMaterials($experienceId));
        $json = Editor::encode($entity);
        Db::transaction(function () use ($experienceId, $ref, $entity, $json, $user) {
            $params = ['experience' => $experienceId, 'ref' => $ref];
            $current = Db::one('SELECT data_json FROM entities WHERE experience_id = :experience AND ref = :ref' . Db::forUpdate(), $params);
            if ($current) {
                Db::run('UPDATE entities SET type = :type, data_json = :data WHERE experience_id = :experience AND ref = :ref', $params + ['type' => $entity->type, 'data' => $json]);
            } else {
                $position = (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM entities WHERE experience_id = :experience', ['experience' => $experienceId]);
                Db::run('INSERT INTO entities (experience_id, ref, position, type, data_json) VALUES (:experience, :ref, :position, :type, :data)', $params + ['position' => $position, 'type' => $entity->type, 'data' => $json]);
            }
            self::touch($experienceId);
            self::change($experienceId, $user, 'entity', $ref, $current['data_json'] ?? null, $json);
        });
        Http::json(200, ['ref' => $ref, 'entity' => $entity]);
    }

    /**
     * PUT /editor/experiences/{id}/targets/{targetId} { entity } | { ref } | { imageSrc } | { place } | { enabled } | { recognition }
     * → { target }: the target's entity – inline (`entity`, null removes it) or a shared one (`ref`) –, its printed image and
     * where it is printed (`place` { surface?, x, y, width, height? } on a surface of its entry's scene, null removes it),
     * whether it is in the experience (`enabled`, #249) and its recognition data made ahead (`recognition` { imageSrc, width,
     * height }, #306 – `osct targets prepare`; null removes it; with `madeFrom` – the image it was made from – it is set only
     * while that is still the target's image, else 409 `stale-image`). A new `imageSrc` drops the recognition data unless
     * the same body sets it. Records a change with the whole target before and after.
     */
    public static function putTarget(string $experienceId, string $targetId): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        $body = Editor::body();
        // Read, change and write back in one transaction, the row locked: two saves of the same target never lose one's change
        $target = Db::transaction(static function () use ($experienceId, $targetId, $body, $user) {
            $params = ['experience' => $experienceId, 'id' => $targetId];
            $row = Db::one('SELECT data_json, entity_ref, entry_id FROM targets WHERE experience_id = :experience AND id = :id' . Db::forUpdate(), $params);
            if (!$row) throw new ApiError(404, 'not-found', 'No such target.');
            $target = Editor::decode($row['data_json']);
            $ref = $row['entity_ref'];
            $touched = false;
            if (property_exists($body, 'ref')) {
                $ref = Editor::id($body->ref, 'ref');
                if (Db::value('SELECT ref FROM entities WHERE experience_id = :experience AND ref = :ref', ['experience' => $experienceId, 'ref' => $ref]) === null) {
                    throw new ApiError(400, 'unknown-entity', "No entity \"$ref\" in this experience.");
                }
                $target->entity = (object) ['ref' => $ref];
                $touched = true;
            } elseif (property_exists($body, 'entity')) {
                $ref = null;
                if ($body->entity === null) unset($target->entity);
                else $target->entity = Editor::entity($body->entity, 'entity', 0, Editor::pluginNodeTypes($experienceId), Editor::pluginMaterials($experienceId));
                $touched = true;
            }
            // The printed image and where it is printed (docs/server.md "Targets")
            if (property_exists($body, 'imageSrc')) {
                if (!is_string($body->imageSrc) || $body->imageSrc === '') throw new ApiError(400, 'invalid-target', 'imageSrc must be a non-empty string.');
                // Recognition data is made from the image: another image makes it stale (#306)
                if ($body->imageSrc !== ($target->imageSrc ?? null)) unset($target->recognition);
                $target->imageSrc = $body->imageSrc;
                $touched = true;
            }
            if (property_exists($body, 'recognition')) {
                if (property_exists($body, 'madeFrom') && $body->madeFrom !== ($target->imageSrc ?? null)) {
                    throw new ApiError(409, 'stale-image', 'The target has another image now – make its recognition data from that one.');
                }
                if ($body->recognition === null) unset($target->recognition);
                else $target->recognition = self::targetRecognition($body->recognition);
                $touched = true;
            }
            if (property_exists($body, 'place')) {
                if ($body->place === null) unset($target->place);
                else $target->place = self::targetPlace($experienceId, (string) $row['entry_id'], $body->place);
                $touched = true;
            }
            // In the experience or switched off (#249): only `false` is stored, on is the default
            if (property_exists($body, 'enabled')) {
                $target = self::withEnabled($target, $body->enabled, 'enabled');
                $touched = true;
            }
            if (!$touched) throw new ApiError(400, 'invalid-target', 'Send { entity } or { ref }, { imageSrc }, { place }, { enabled } or { recognition }.');
            $json = Editor::encode($target);
            Db::run('UPDATE targets SET entity_ref = :ref, image_src = :image, data_json = :data WHERE experience_id = :experience AND id = :id', $params + ['ref' => $ref, 'image' => $target->imageSrc, 'data' => $json]);
            self::touch($experienceId);
            self::change($experienceId, $user, 'target', $targetId, $row['data_json'], $json);
            return $target;
        });
        Http::json(200, ['target' => $target]);
    }

    /**
     * A target's recognition data (#306, shared `TargetRecognitionData`): the grey frame's URL and the size in px of the
     * printed image it was made from
     */
    private static function targetRecognition(mixed $value): stdClass
    {
        $valid = $value instanceof stdClass && is_string($value->imageSrc ?? null) && $value->imageSrc !== '';
        foreach (['width', 'height'] as $key) $valid = $valid && is_int($value->{$key} ?? null) && $value->{$key} >= 1;
        if (!$valid) throw new ApiError(400, 'invalid-target', 'recognition must be { imageSrc, width, height } (width and height whole px) or null.');
        return (object) ['imageSrc' => $value->imageSrc, 'width' => $value->width, 'height' => $value->height];
    }

    /**
     * POST /editor/experiences/{id}/entries { id?, category, title, scene, surface?, body?, caption?, target?: { id?, imageSrc,
     * place?, entity?, enabled? } } → 201 { entry, scene }: a new entry on the scene `scene` (and its surface `surface`),
     * with its target (made in the editor – docs/server.md "Targets") or without one – an entry read only in the list (a
     * glossary term, a text). 400 `invalid-entry`, `unknown-scene`; 409 `duplicate-id`.
     */
    public static function addEntry(string $experienceId): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        $body = Editor::body();
        $title = $body->title ?? null;
        $category = $body->category ?? 'glossary';
        if (!is_string($title) || trim($title) === '') throw new ApiError(400, 'invalid-entry', 'title must be a non-empty string.');
        if (!property_exists($body, 'scene') || $body->scene === null) throw new ApiError(400, 'invalid-entry', 'scene is needed: the id of the scene the entry lies on.');
        $context = Scenes::context($experienceId);
        [$sceneId, $surface] = self::sceneOf($context, $body->scene, $body->surface ?? null);
        if (!is_string($category) || !in_array($category, Editor::ENTRY_CATEGORIES, true)) throw new ApiError(400, 'invalid-entry', 'category must be one of ' . implode(', ', Editor::ENTRY_CATEGORIES) . '.');
        $caption = $body->caption ?? null;
        if ($caption !== null && (!is_string($caption) || mb_strlen(trim($caption)) > ExperienceTexts::TEXT_MAX_LENGTH)) {
            throw new ApiError(400, 'invalid-entry', 'caption must be a string of at most ' . ExperienceTexts::TEXT_MAX_LENGTH . ' characters.');
        }
        $id = Editor::id($body->id ?? self::slug($title, (string) $sceneId), 'id');
        if (Db::one('SELECT id FROM entries WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $id])) throw new ApiError(409, 'duplicate-id', "An entry \"$id\" exists.");
        $targetIn = $body->target ?? null;
        $target = null;
        $targetId = null;
        $ref = null;
        if ($targetIn !== null) {
            if (!$targetIn instanceof stdClass || !is_string($targetIn->imageSrc ?? null) || $targetIn->imageSrc === '') throw new ApiError(400, 'invalid-entry', 'target.imageSrc is needed.');
            $targetId = Editor::id($targetIn->id ?? $id, 'target.id');
            if (Db::one('SELECT id FROM targets WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $targetId])) throw new ApiError(409, 'duplicate-id', "A target \"$targetId\" exists.");
            $target = (object) ['id' => $targetId, 'imageSrc' => $targetIn->imageSrc];
            if (isset($targetIn->place)) $target->place = self::placeOn($context['data'][$sceneId], $targetIn->place, 'target.place', 'invalid-entry');
            if (property_exists($targetIn, 'enabled')) $target = self::withEnabled($target, $targetIn->enabled, 'target.enabled', 'invalid-entry');
        }
        if ($target !== null && isset($targetIn->entity)) {
            if ($targetIn->entity instanceof stdClass && property_exists($targetIn->entity, 'ref')) {
                $ref = Editor::id($targetIn->entity->ref, 'target.entity.ref');
                if (Db::value('SELECT ref FROM entities WHERE experience_id = :experience AND ref = :ref', ['experience' => $experienceId, 'ref' => $ref]) === null) throw new ApiError(400, 'unknown-entity', "No entity \"$ref\" in this experience.");
                $target->entity = (object) ['ref' => $ref];
            } else {
                $target->entity = Editor::entity($targetIn->entity, 'target.entity', 0, Editor::pluginNodeTypes($experienceId), Editor::pluginMaterials($experienceId));
            }
        }
        $entry = (object) ['id' => $id, 'category' => $category, 'title' => trim($title)];
        if ($surface !== null) $entry->surface = $surface;
        $entry->body = is_string($body->body ?? null) ? $body->body : '';
        $entry->tags = [];
        // The line under the picture (#289): optional, left out when empty
        if (is_string($caption) && trim($caption) !== '') $entry->caption = trim($caption);
        $position = (int) Db::value('SELECT COALESCE(MAX(position), -1) + 1 FROM entries WHERE experience_id = :experience', ['experience' => $experienceId]);
        $entryJson = Editor::encode($entry);
        $targetJson = $target === null ? null : Editor::encode($target);
        Db::transaction(function () use ($experienceId, $id, $sceneId, $position, $category, $entry, $entryJson, $targetId, $target, $ref, $targetJson, $user) {
            Db::run('INSERT INTO entries (experience_id, id, scene_id, position, category, title, data_json) VALUES (:experience, :id, :scene, :position, :category, :title, :data)',
                ['experience' => $experienceId, 'id' => $id, 'scene' => $sceneId, 'position' => $position, 'category' => $category, 'title' => $entry->title, 'data' => $entryJson]);
            if ($target !== null) {
                Db::run('INSERT INTO targets (experience_id, id, entry_id, image_src, entity_ref, data_json) VALUES (:experience, :id, :entry, :image, :ref, :data)',
                    ['experience' => $experienceId, 'id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => $ref, 'data' => $targetJson]);
            }
            self::touch($experienceId);
            self::change($experienceId, $user, 'entry', $id, null, $entryJson);
            if ($target !== null) self::change($experienceId, $user, 'target', $targetId, null, $targetJson);
        });
        $shown = ContentVersion::withScene($entry, (string) $sceneId);
        if ($target !== null) $shown->target = $target;
        Http::json(201, ['entry' => $shown, 'scene' => $sceneId]);
    }

    /**
     * A target's `place` on its entry's scene (PUT …/targets/{id})
     */
    private static function targetPlace(string $experienceId, string $entryId, mixed $value): stdClass
    {
        $sceneId = Db::value('SELECT scene_id FROM entries WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $entryId]);
        $row = is_string($sceneId) ? Db::one('SELECT data_json FROM scenes WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $sceneId]) : null;
        $scene = $row ? Editor::decode($row['data_json']) : null;
        return self::placeOn($scene instanceof stdClass ? $scene : new stdClass(), $value, 'place', 'invalid-target');
    }

    /**
     * Where a target is printed (`TargetPlace`, schema 3.0): { surface?, x, y, width, height? } in mm from the top left of a
     * surface of the scene – `surface` one of its surfaces, required when it has several. 400 `$code`.
     */
    public static function placeOn(stdClass $scene, mixed $value, string $path, string $code): stdClass
    {
        if (!$value instanceof stdClass) throw new ApiError(400, $code, "$path must be an object { surface?, x, y, width, height? } (mm).");
        $ids = Scenes::surfaceIds($scene);
        $place = new stdClass();
        if (property_exists($value, 'surface') && $value->surface !== null) {
            $surface = Editor::id($value->surface, "$path.surface");
            if (!in_array($surface, $ids, true)) throw new ApiError(400, $code, "$path.surface: the scene has no surface \"$surface\" (" . implode(', ', $ids) . ').');
            $place->surface = $surface;
        } elseif (count($ids) > 1) {
            throw new ApiError(400, $code, "$path.surface is needed: the scene has several surfaces (" . implode(', ', $ids) . ').');
        }
        foreach (['x', 'y', 'width'] as $key) {
            $n = $value->{$key} ?? null;
            if (!(is_int($n) || is_float($n)) || !is_finite((float) $n)) throw new ApiError(400, $code, "$path.$key must be a number (mm).");
            $place->{$key} = $n;
        }
        if (property_exists($value, 'height') && $value->height !== null) {
            if (!(is_int($value->height) || is_float($value->height)) || !is_finite((float) $value->height)) throw new ApiError(400, $code, "$path.height must be a number (mm).");
            $place->height = $value->height;
        }
        foreach (array_keys(get_object_vars($value)) as $key) {
            if (!in_array($key, ['surface', 'x', 'y', 'width', 'height'], true)) throw new ApiError(400, $code, "$path.$key is not a field of a target's place.");
        }
        return $place;
    }

    /**
     * An entry's scene and surface as a request names them: `scene` a scene of the experience (else 400 unknown-scene),
     * `surface` one of its surfaces (else 400 invalid-entry) or null
     * @param array{data: array<string, stdClass>} $context
     * @return array{0: ?string, 1: ?string}
     */
    public static function sceneOf(array $context, mixed $scene, mixed $surface): array
    {
        $scene = Editor::id($scene, 'scene');
        if (!isset($context['data'][$scene])) throw new ApiError(400, 'unknown-scene', "No scene \"$scene\" in this experience.");
        if ($surface === null) return [$scene, null];
        $surface = Editor::id($surface, 'surface');
        if (!in_array($surface, Scenes::surfaceIds($context['data'][$scene]), true)) {
            throw new ApiError(400, 'invalid-entry', "The scene \"$scene\" has no surface \"$surface\"" . (Scenes::surfaceIds($context['data'][$scene]) ? ' (' . implode(', ', Scenes::surfaceIds($context['data'][$scene])) . ').' : ' – it has none yet.'));
        }
        return [$scene, $surface];
    }

    /**
     * PUT /editor/experiences/{id}/environment { environment: { world, onionSky, worldSrc?, skySrc? } | null } → 200
     * { environment }: the world around the reader and the onion sky (the world model and the sky
     * image as asset references, shared/types/environment.ts). `null` removes it – the default applies. Experience-level
     * only; the reader's Graphics switches still apply on top.
     */
    public static function putEnvironment(string $experienceId): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        $body = Editor::body();
        if (!property_exists($body, 'environment')) throw new ApiError(400, 'invalid-environment', 'Send { environment: { world, onionSky, worldSrc?, skySrc? } } or { environment: null }.');
        $environment = null;
        if ($body->environment !== null) {
            $problems = self::environmentProblems($body->environment);
            if ($problems) throw new ApiError(400, 'invalid-environment', $problems[0]);
            $environment = ['world' => $body->environment->world, 'onionSky' => $body->environment->onionSky];
            foreach (['worldSrc', 'skySrc'] as $key) {
                if (isset($body->environment->{$key})) $environment[$key] = $body->environment->{$key};
            }
            $environment = (object) $environment;
        }
        // The experience's JSON read, changed and written back in one transaction, the row locked: a parallel save of the
        // experience's passes (or a relink) is never lost
        Db::transaction(static function () use ($experienceId, $environment, $user) {
            $row = self::experience($experienceId, true);
            $experience = Editor::decode($row['experience_json']);
            if ($environment === null) unset($experience->environment);
            else $experience->environment = $environment;
            $json = Editor::encode($experience);
            Db::run('UPDATE experiences SET experience_json = :experience WHERE id = :id', ['experience' => $json, 'id' => $experienceId]);
            self::touch($experienceId);
            self::change($experienceId, $user, 'environment', $experienceId, $row['experience_json'], $json);
        });
        Http::json(200, ['environment' => $environment]);
    }

    /**
     * PUT /editor/experiences/{id}/passes { passes: [{ type, …parameters }] | null } → 200 { passes }: the experience's post-processing
     * (`experience.passes`) – the master every scene without a list of its own shows (a scene's
     * `passes` override it, `PUT …/scenes/{sid}`). `null` removes it; the shape is checked as for a scene's – a
     * plugin's pass included.
     */
    public static function putPasses(string $experienceId): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        $body = Editor::body();
        if (!property_exists($body, 'passes')) throw new ApiError(400, 'invalid-passes', 'Send { passes: [{ type, …parameters }] } or { passes: null }.');
        $passes = $body->passes === null ? null : self::passes($body->passes, 'invalid-passes', self::pluginPasses($experienceId));
        // As putEnvironment: the experience's JSON read, changed and written back in one transaction, the row locked
        Db::transaction(static function () use ($experienceId, $passes, $user) {
            $row = self::experience($experienceId, true);
            $experience = Editor::decode($row['experience_json']);
            if ($passes === null) unset($experience->passes);
            else $experience->passes = $passes;
            $json = Editor::encode($experience);
            Db::run('UPDATE experiences SET experience_json = :experience WHERE id = :id', ['experience' => $json, 'id' => $experienceId]);
            self::touch($experienceId);
            self::change($experienceId, $user, 'passes', $experienceId, $row['experience_json'], $json);
        });
        Http::json(200, ['passes' => $passes]);
    }

    /**
     * PUT /editor/experiences/{id}/appearance { appearance: { reveal?, found?, lost? } | null } → 200 { appearance }: how the
     * experience's entities appear and disappear (`experience.appearance`, shared/types/appearance.ts) – a look `{ type, …parameters }`
     * for the first find (`reveal`), every later find (`found`) and the lost page (`lost`), each a built-in look or one
     * the experience's plugins register (`appearances`). A moment left out takes `found`'s look, then the default; `null` – or
     * no moment at all – removes the field, so the default look plays everywhere.
     */
    public static function putAppearance(string $experienceId): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        $body = Editor::body();
        if (!property_exists($body, 'appearance')) {
            throw new ApiError(400, 'invalid-appearance', 'Send { appearance: { reveal?, found?, lost? } }, each { type, …parameters }, or { appearance: null }.');
        }
        $appearance = $body->appearance === null ? null : self::appearance($body->appearance, Editor::pluginTypesOfExperience($experienceId, 'appearances'));
        // As putPasses: the experience's JSON read, changed and written back in one transaction, the row locked
        Db::transaction(static function () use ($experienceId, $appearance, $user) {
            $row = self::experience($experienceId, true);
            $experience = Editor::decode($row['experience_json']);
            if ($appearance === null) unset($experience->appearance);
            else $experience->appearance = $appearance;
            $json = Editor::encode($experience);
            Db::run('UPDATE experiences SET experience_json = :experience WHERE id = :id', ['experience' => $json, 'id' => $experienceId]);
            self::touch($experienceId);
            self::change($experienceId, $user, 'appearance', $experienceId, $row['experience_json'], $json);
        });
        Http::json(200, ['appearance' => $appearance]);
    }

    /** The problems of an `environment` (shared/types/environment.ts `environmentProblems`, strict); [] when valid */
    public static function environmentProblems(mixed $value): array
    {
        if (!$value instanceof stdClass) return ['environment must be an object { world, onionSky }.'];
        $problems = [];
        if (!in_array($value->world ?? null, self::WORLDS, true)) $problems[] = 'environment.world must be one of ' . implode(', ', self::WORLDS) . '.';
        if (!is_bool($value->onionSky ?? null)) $problems[] = 'environment.onionSky must be true or false.';
        $references = ['worldSrc' => ['a glTF model', self::WORLD_MODEL_EXTENSIONS], 'skySrc' => ['an equirectangular image', self::SKY_IMAGE_EXTENSIONS]];
        foreach ($references as $key => [$what, $extensions]) {
            if (!property_exists($value, $key)) continue;
            $reference = $value->{$key};
            if (!is_string($reference) || !(str_starts_with($reference, '/assets/content/') || preg_match('#^https?://[^/]+/#', $reference))) {
                $problems[] = "environment.$key must be a content path (/assets/content/…) or an absolute URL of $what.";
                continue;
            }
            $path = preg_split('/[?#]/', $reference)[0];
            $dot = strrpos($path, '.');
            $extension = $dot !== false && $dot > (int) strrpos($path, '/') ? strtolower(substr($path, $dot)) : '';
            if (!in_array($extension, $extensions, true)) $problems[] = "environment.$key must be $what (" . implode(', ', $extensions) . ').';
        }
        foreach (array_keys(get_object_vars($value)) as $key) {
            if (!in_array($key, ['world', 'onionSky', 'worldSrc', 'skySrc'], true)) $problems[] = "environment.$key is not a field of the environment.";
        }
        return $problems;
    }

    /**
     * DELETE /editor/experiences/{id}/scenes/{sceneId} { confirm?, deleteFiles? }: the scene with everything on it, in two steps
     * (`Confirmation`, docs/server.md "Removing a scene or an entry"):
     * 1. without `confirm` nothing is written: 409 `confirm-delete` with the `impact` (the scene, and what `Removal` takes:
     *    entries, targets, entities, kept shared entities, Library files used only here and elsewhere) and a `confirmation`;
     * 2. with `confirm` exactly that goes, in one transaction → 200 { deleted }: entries, targets, the entities used only
     *    there, the scene and its surfaces' reference images. `deleteFiles: true` also removes the Library files used only
     *    here (off by default; a file used elsewhere never goes). A confirmation that does not fit any more (anything in
     *    the experience changed, another person or token, expired) → 409 `confirmation-void` with a fresh impact.
     * 409 `initial-scene` for the scene the experience opens on (it never goes); 404.
     */
    public static function deleteScene(string $experienceId, string $sceneId): never
    {
        $user = Editor::user();
        $experience = self::experience($experienceId);
        [$confirm, $deleteFiles] = self::deleteOptions();
        $row = Db::one('SELECT * FROM scenes WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $sceneId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such scene.');
        if ($experience['initial_scene'] === $sceneId) throw new ApiError(409, 'initial-scene', 'The experience opens on this scene.');
        $entries = Db::run('SELECT * FROM entries WHERE experience_id = :experience AND scene_id = :scene ORDER BY position, id', ['experience' => $experienceId, 'scene' => $sceneId])->fetchAll();
        $removal = new Removal($experienceId, $entries);
        $impact = ['experience' => $experienceId, 'kind' => 'scene', 'scene' => ['id' => $sceneId, 'label' => (string) (Editor::decode($row['data_json'])->label ?? $row['label'])]] + $removal->impact();
        Confirmation::require("delete-scene|$experienceId|$sceneId", $user, $removal->state([$row]), $confirm,
            ['confirm-delete', 'Removing the scene takes ' . self::impactLine($impact) . ' – show this to the person, then remove again with confirm: <confirmation id>.'],
            'The confirmation is expired, someone else\'s, or the experience changed since – here is what the removal takes now; confirm with the new id.',
            fn() => ['impact' => $impact]);
        $deleted = Db::transaction(function () use ($experienceId, $sceneId, $row, $user, $removal, $deleteFiles) {
            $deleted = $removal->remove($user, $deleteFiles);
            Db::run('DELETE FROM scenes WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $sceneId]);
            self::change($experienceId, $user, Scenes::KIND, $sceneId, $row['data_json'], 'null');
            // Its surfaces' reference images go with it (#314)
            SurfaceReferences::dropScene($experienceId, $sceneId, $user);
            Db::run('UPDATE scenes SET position = position - 1 WHERE experience_id = :experience AND position > :position', ['experience' => $experienceId, 'position' => (int) $row['position']]);
            self::touch($experienceId);
            return $deleted;
        });
        Removal::deleteStoredFiles($deleted['paths']);
        unset($deleted['paths']);
        Http::json(200, ['deleted' => ['scene' => $sceneId] + $deleted]);
    }

    /**
     * A removal's options from the body (none for the first step): `confirm` (the confirmation id) and `deleteFiles`
     * (true / false, default false)
     * @return array{0: mixed, 1: bool}
     */
    private static function deleteOptions(): array
    {
        $body = trim((string) file_get_contents('php://input')) === '' ? new stdClass() : Editor::body();
        $deleteFiles = $body->deleteFiles ?? false;
        if (!is_bool($deleteFiles)) throw new ApiError(400, 'invalid-delete', 'deleteFiles must be true or false.');
        return [$body->confirm ?? null, $deleteFiles];
    }

    /**
     * An impact in words for the 409's message: "3 entries, 3 targets, 2 entities and 1 Library file used only there"
     * @param array<string, mixed> $impact
     */
    private static function impactLine(array $impact): string
    {
        $n = static fn(int $count, string $one, string $many) => $count . ' ' . ($count === 1 ? $one : $many);
        $counts = $impact['counts'];
        $parts = [$n($counts['entries'], 'entry', 'entries'), $n($counts['targets'], 'target', 'targets'), $n($counts['entities'], 'entity', 'entities')];
        $line = implode(', ', $parts);
        if ($counts['filesOnlyHere'] > 0) $line .= ' (' . $n($counts['filesOnlyHere'], 'Library file', 'Library files') . ' used only there, deleted only with deleteFiles: true)';
        return $line;
    }

    /** The built-in post-processing passes of the contract (shared/types/passes.ts `PASSES`) */
    public const PASS_TYPES = ['bloom', 'vignette', 'grade'];
    /** A plugin's pass type (shared/types/components.ts `COMPONENT_TYPE_PATTERN`, which a pass's spec is checked with) */
    public const PLUGIN_PASS_TYPE = '[a-z][a-zA-Z0-9]{0,39}';
    /** The moments an entity appears or disappears at (shared/types/appearance.ts `MOMENTS`) */
    public const MOMENTS = ['reveal', 'found', 'lost'];
    /** The built-in looks of the contract (shared/types/appearance.ts `APPEARANCES`) */
    public const APPEARANCE_TYPES = ['inflateDissolve', 'printLift', 'fade'];
    /** The environment's worlds (shared/types/environment.ts ENVIRONMENT_WORLDS) */
    public const WORLDS = ['cafe'];
    /** The files a world model and a sky may be (shared/types/environment.ts WORLD_MODEL_EXTENSIONS, SKY_IMAGE_EXTENSIONS) */
    public const WORLD_MODEL_EXTENSIONS = ['.glb', '.gltf'];
    public const SKY_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

    /**
     * The plugin pass types a save of this experience accepts: the passes its declared plugins recorded (a list),
     * any camelCase name while a plugin is unknown until it runs (`true` – a Code tab source, a plugin of an older build),
     * none without plugins (`false`) – as `Editor::pluginNodeTypes`
     * @return bool|list<string>
     */
    private static function pluginPasses(string $experienceId): bool|array
    {
        return Editor::pluginTypesOfExperience($experienceId, 'passes');
    }

    /**
     * A scene's `passes` list as the content holds it (`passes`, with the experience's plugin passes) – PUT …/scenes/{id}
     * @return list<stdClass>
     */
    public static function checkPasses(string $experienceId, mixed $value, string $code): array
    {
        return self::passes($value, $code, self::pluginPasses($experienceId));
    }

    /**
     * A `passes` list as the content holds it: every pass an object with a built-in `type` – or one of the experience's
     * plugins (`$pluginPasses`: a list = the recorded ones, `true` = any camelCase name, `false` = none) –, an optional
     * `enabled` true / false and scalar parameters (the engine and the guard check the parameters against the specs; the
     * API keeps the shape)
     * @param bool|list<string> $pluginPasses
     * @return list<stdClass>
     */
    private static function passes(mixed $value, string $code = 'invalid-scene', bool|array $pluginPasses = false): array
    {
        if (!is_array($value)) throw new ApiError(400, $code, 'passes must be a list of { type, …parameters }.');
        $passes = [];
        foreach ($value as $i => $pass) {
            if (!$pass instanceof stdClass || !is_string($pass->type ?? null)) throw new ApiError(400, $code, "passes[$i] needs a type.");
            $type = $pass->type;
            $plugin = is_array($pluginPasses)
                ? in_array($type, $pluginPasses, true)
                : $pluginPasses && preg_match('/^' . self::PLUGIN_PASS_TYPE . '$/', $type) === 1;
            if (!in_array($type, self::PASS_TYPES, true) && !$plugin) {
                $plugins = match (true) {
                    is_array($pluginPasses) && $pluginPasses !== [] => ' or a pass a plugin of the experience registers (' . implode(', ', $pluginPasses) . ').',
                    is_array($pluginPasses) => ' – the experience\'s plugins register no pass.',
                    $pluginPasses => ' or a plugin\'s pass (camelCase letters and digits).',
                    default => ' – a plugin\'s pass needs a plugin in the experience.',
                };
                throw new ApiError(400, $code, "passes[$i].type must be one of " . implode(', ', self::PASS_TYPES) . $plugins);
            }
            // Off keeps the pass and its values, the chain skips it (#233)
            if (property_exists($pass, 'enabled') && !is_bool($pass->enabled)) throw new ApiError(400, $code, "passes[$i].enabled must be true or false.");
            foreach (get_object_vars($pass) as $name => $param) {
                if (!is_scalar($param)) throw new ApiError(400, $code, "passes[$i].$name must be a number, a string or true / false.");
            }
            $passes[] = $pass;
        }
        return $passes;
    }

    /**
     * An experience's `appearance` as the content holds it: an object of moments (MOMENTS), each a look – an object with a
     * built-in `type` or one of the experience's plugins (`$pluginLooks`: a list = the recorded ones, `true` = any camelCase
     * name, `false` = none) and scalar parameters (the engine and the guard check the parameters against the specs; the
     * API keeps the shape). Null when it names no moment: the experience holds no `appearance` then.
     * @param bool|list<string> $pluginLooks
     */
    private static function appearance(mixed $value, bool|array $pluginLooks = false): ?stdClass
    {
        $code = 'invalid-appearance';
        if (!$value instanceof stdClass) throw new ApiError(400, $code, 'appearance must be an object { reveal?, found?, lost? }, each { type, …parameters }.');
        $appearance = new stdClass();
        foreach (get_object_vars($value) as $moment => $look) {
            if (!in_array($moment, self::MOMENTS, true)) throw new ApiError(400, $code, "appearance.$moment is not a moment (" . implode(', ', self::MOMENTS) . ').');
            if (!$look instanceof stdClass || !is_string($look->type ?? null)) throw new ApiError(400, $code, "appearance.$moment needs a type.");
            $type = $look->type;
            $plugin = is_array($pluginLooks)
                ? in_array($type, $pluginLooks, true)
                : $pluginLooks && preg_match('/^' . self::PLUGIN_PASS_TYPE . '$/', $type) === 1;
            if (!in_array($type, self::APPEARANCE_TYPES, true) && !$plugin) {
                $plugins = match (true) {
                    is_array($pluginLooks) && $pluginLooks !== [] => ' or a look a plugin of the experience registers (' . implode(', ', $pluginLooks) . ').',
                    is_array($pluginLooks) => ' – the experience\'s plugins register no look.',
                    $pluginLooks => ' or a plugin\'s look (camelCase letters and digits).',
                    default => ' – a plugin\'s look needs a plugin in the experience.',
                };
                throw new ApiError(400, $code, "appearance.$moment.type must be one of " . implode(', ', self::APPEARANCE_TYPES) . $plugins);
            }
            foreach (get_object_vars($look) as $name => $param) {
                if (!is_scalar($param)) throw new ApiError(400, $code, "appearance.$moment.$name must be a number, a string or true / false.");
            }
            $appearance->{$moment} = $look;
        }
        return get_object_vars($appearance) ? $appearance : null;
    }

    /**
     * DELETE /editor/experiences/{id}/entries/{entryId} { confirm?, deleteFiles? } – the entry with its target, the entity used
     * only there and (with `deleteFiles: true`) the Library files used only there, in the same two steps as a scene:
     * 409 `confirm-delete` with the `impact` and a `confirmation`, then with `confirm` → 200 { deleted }; 409
     * `confirmation-void` with a fresh impact; 404.
     */
    public static function deleteEntry(string $experienceId, string $entryId): never
    {
        $user = Editor::user();
        self::experience($experienceId);
        [$confirm, $deleteFiles] = self::deleteOptions();
        $entry = Db::one('SELECT * FROM entries WHERE experience_id = :experience AND id = :id', ['experience' => $experienceId, 'id' => $entryId]);
        if (!$entry) throw new ApiError(404, 'not-found', 'No such entry.');
        $removal = new Removal($experienceId, [$entry]);
        $impact = ['experience' => $experienceId, 'kind' => 'entry',
            'entry' => ['id' => $entryId, 'title' => $entry['title'], 'category' => $entry['category'], 'scene' => $entry['scene_id']]] + $removal->impact();
        Confirmation::require("delete-entry|$experienceId|$entryId", $user, $removal->state(), $confirm,
            ['confirm-delete', 'Removing the entry takes ' . self::impactLine($impact) . ' – show this to the person, then remove again with confirm: <confirmation id>.'],
            'The confirmation is expired, someone else\'s, or the experience changed since – here is what the removal takes now; confirm with the new id.',
            fn() => ['impact' => $impact]);
        $deleted = Db::transaction(function () use ($experienceId, $user, $removal, $deleteFiles) {
            $deleted = $removal->remove($user, $deleteFiles);
            self::touch($experienceId);
            return $deleted;
        });
        Removal::deleteStoredFiles($deleted['paths']);
        unset($deleted['paths']);
        Http::json(200, ['deleted' => ['scene' => null] + $deleted]);
    }

    /** An id from a title and a scene: `s102-103-shadows` – lower case, letters, digits and dashes, at most 64 */
    private static function slug(string $title, string $scene): string
    {
        $words = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: $title), '-'));
        return substr($scene . '-' . (substr($words, 0, 40) ?: 'entry'), 0, 64);
    }

    /**
     * POST /editor/experiences/{id}/publish { env, note? } → { env, store, build, hash, publishedAt }: the assembled version
     * into the experience's own store in the environment (#87: `<title>/<env>/<id>/` – a publish never touches another
     * experience) – the version folder (unless that build is there already: a folder is never overwritten), then
     * versions.json, then latest.json (the switch) – and a row in the publish log.
     * `env` must be this instance's own environment (ENV): another one answers 403 other-environment with `env`, the
     * own one. `store` = where it went: `cdn` or `server` (the directory store).
     *
     * `plugins` (#78) = the experience's Code tab sources as the editor transpiled them, `[{ id, code, api, registered? }]`: every
     * id a saved source of the experience, `code` the module (JavaScript, `export const register`), `api` the plugin API it was
     * written against, `registered` the specs a stage run recorded (optional – without them the reader learns the types when
     * the plugin loads). Each goes into the version as `assets/content/plugins/<id>/plugin-<hash of the code>.js` and is
     * declared in its configuration (a compiled plugin of the same id gives way); the types the publish checks are read from
     * the saved source. The server compiles nothing: the code is the browser's transpile, not type-checked (#266).
     */
    public static function publish(string $experienceId, stdClass $body): never
    {
        $user = Editor::user();
        // Readers are reached only by a person: no environment takes a publish from an AI connection
        Auth::refuseToken('Publishing');
        self::experience($experienceId);
        $env = $body->env ?? null;
        $own = Config::env();
        if (!is_string($env) || !preg_match(ContentStore::ENV_NAME, $env)) {
            throw new ApiError(400, 'invalid-env', "env must be this instance's environment ($own).");
        }
        // An instance publishes to its own environment only: another one is published from its own editor
        if ($env !== $own) {
            throw new ApiError(403, 'other-environment', "This instance publishes to $own only – $env is published from its own editor.", ['env' => $own]);
        }
        $note = $body->note ?? null;
        if ($note !== null && !is_string($note)) throw new ApiError(400, 'invalid-note', 'note must be a string.');

        $store = ContentStore::for($env, $experienceId);

        $injected = self::injectedPlugins($experienceId, $body->plugins ?? null);
        $version = ContentVersion::assemble($experienceId);
        if ($injected) $version = ContentVersion::withPlugins($version, array_map(static fn(array $plugin): stdClass => $plugin['declaration'], $injected));
        // A component type no plugin can register would make the reader refuse the whole content: a plugin of the Code tab
        // reaches readers only when the publish carries it (`plugins`). What the compiled plugins register is known when
        // they recorded it (none declared: nothing) – else they may register anything; what a carried source registers
        // is read from its text
        $compiled = array_values(array_filter((array) ($version['configuration']->plugins ?? []),
            static fn(mixed $plugin): bool => !($plugin instanceof stdClass && isset($injected[$plugin->id ?? ''])))); 
        $recorded = Editor::recorded($compiled);
        if ($recorded !== null) {
            foreach ($injected as $plugin) {
                foreach ($plugin['registers'] as $kind => $types) {
                    $into = $kind === 'layers' ? 'components' : $kind;
                    if (isset($recorded[$into])) $recorded[$into] = array_values(array_unique([...$recorded[$into], ...$types]));
                }
            }
        }
        $unknown = $recorded === null ? [] : array_values(array_diff(self::unknownComponentTypes($version['configuration']), $recorded['components']));
        if ($unknown) {
            throw new ApiError(409, 'unknown-components', 'Nodes use components no compiled plugin provides: ' . implode(', ', $unknown) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['components' => $unknown]);
        }
        // The same for a plugin's node type: without a compiled plugin the reader renders nothing for those nodes
        $unknownNodes = $recorded === null ? [] : array_values(array_diff(self::unknownNodeTypes($version['configuration']), $recorded['nodeTypes']));
        if ($unknownNodes) {
            throw new ApiError(409, 'unknown-node-types', 'Nodes have types no compiled plugin provides: ' . implode(', ', $unknownNodes) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['nodeTypes' => $unknownNodes]);
        }
        // The same for a plugin's material: without a compiled plugin the reader keeps the node's own material
        $unknownMaterials = $recorded === null ? [] : array_values(array_diff(self::materialTypes($version['configuration']), $recorded['materials']));
        if ($unknownMaterials) {
            throw new ApiError(409, 'unknown-materials', 'Nodes use materials no compiled plugin provides: ' . implode(', ', $unknownMaterials) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['materials' => $unknownMaterials]);
        }
        // And for a plugin's pass: the reader's guard refuses a pass type no declared plugin recorded
        $unknownPasses = $recorded === null ? [] : array_values(array_diff(self::pluginPassTypes($version['configuration']), $recorded['passes']));
        if ($unknownPasses) {
            throw new ApiError(409, 'unknown-passes', 'The experience\'s or a scene\'s post-processing names passes no compiled plugin provides: ' . implode(', ', $unknownPasses) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['passes' => $unknownPasses]);
        }
        // And for a plugin's look: the reader's guard refuses a look no declared plugin recorded
        $unknownLooks = $recorded === null ? [] : array_values(array_diff(self::pluginAppearanceTypes($version['configuration']), $recorded['appearances']));
        if ($unknownLooks) {
            throw new ApiError(409, 'unknown-appearances', 'The experience\'s appearance or an entity\'s own looks name looks no compiled plugin provides: ' . implode(', ', $unknownLooks) . '. A plugin of the Code tab reaches readers only when the publish carries it (the editor\'s Publish sends the saved sources, #78).', ['appearances' => $unknownLooks]);
        }
        $root = $version['build'];
        $uploaded = $store->exists("$root/game.config.json");
        if (!$uploaded) {
            // The plugins' modules first: a version whose configuration is there is complete
            foreach ($injected as $plugin) $store->put("$root/" . ltrim($plugin['declaration']->src, '/'), $plugin['code'], 'text/javascript');
            $store->put("$root/files.json", Editor::encode($version['files']));
            // Last in the folder: the configuration marks the version as complete
            $store->put("$root/game.config.json", Editor::encode($version['configuration']));
        }
        $now = Editor::iso();
        $current = $store->get('versions.json');
        $versions = $current === null ? [] : json_decode($current, true);
        if (!is_array($versions)) throw new ApiError(502, 'content-store-failed', "$env/$experienceId/versions.json is not readable – fix it before publishing.");
        $store->put('versions.json', Editor::encode(ContentStore::activate($versions, $version, $now, !$uploaded, $experienceId), true));
        $store->put('latest.json', Editor::encode(ContentVersion::manifest($version, $now, $experienceId), true));

        Db::run('INSERT INTO experience_versions (id, experience_id, env, build, hash, published_by, published_at, note) VALUES (:id, :experience, :env, :build, :hash, :by, :at, :note)',
            ['id' => Db::uuid(), 'experience' => $experienceId, 'env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'by' => $user['id'], 'at' => Editor::nowMs(), 'note' => $note]);
        Http::json(200, ['env' => $env, 'store' => $store->isLocal() ? 'server' : 'cdn', 'build' => $version['build'], 'hash' => $version['hash'], 'publishedAt' => $now]);
    }

    /**
     * The publish's `plugins` (#78), checked: by id → { declaration (the configuration's `PluginData`), code, registers (the
     * types the saved source registers, `Plugins::registers`) }. Null or absent = none.
     * @return array<string, array{declaration: stdClass, code: string, registers: array<string, array<int, string>>}>
     */
    private static function injectedPlugins(string $experienceId, mixed $raw): array
    {
        if ($raw === null) return [];
        if (!is_array($raw)) throw new ApiError(400, 'invalid-plugins', 'plugins must be a list of { id, code, api, registered? }.');
        $sources = [];
        foreach (Db::run('SELECT id, source FROM plugins WHERE experience_id = :experience', ['experience' => $experienceId])->fetchAll() as $row) $sources[$row['id']] = (string) $row['source'];
        $injected = [];
        foreach ($raw as $i => $plugin) {
            $at = "plugins[$i]";
            if (!$plugin instanceof stdClass) throw new ApiError(400, 'invalid-plugins', "$at must be an object { id, code, api, registered? }.");
            $id = $plugin->id ?? null;
            if (!is_string($id) || !preg_match('/^' . Plugins::ID . '$/', $id)) throw new ApiError(400, 'invalid-plugins', "$at.id must be a plugin id (letters, digits, -).");
            if (isset($injected[$id])) throw new ApiError(400, 'invalid-plugins', "$at.id: \"$id\" is there twice.");
            if (!isset($sources[$id])) throw new ApiError(400, 'invalid-plugins', "$at.id: the experience has no saved source \"$id\" – save it in the Code tab first.");
            $code = $plugin->code ?? null;
            if (!is_string($code) || trim($code) === '') throw new ApiError(400, 'invalid-plugins', "$at.code must be the transpiled module.");
            if (strlen($code) > 2 * Plugins::MAX_SOURCE_BYTES) throw new ApiError(413, 'plugin-too-large', "$at.code is larger than " . (2 * Plugins::MAX_SOURCE_BYTES / 1024) . ' KB.');
            $api = $plugin->api ?? null;
            if (!is_string($api) || !preg_match('/^\d+\.\d+$/', $api)) throw new ApiError(400, 'invalid-plugins', "$at.api must be the plugin API version \"MAJOR.MINOR\".");
            $declaration = (object) ['id' => $id, 'src' => '/assets/content/plugins/' . $id . '/plugin-' . substr(hash('sha256', $code), 0, 12) . '.js', 'api' => $api];
            $registers = Plugins::registers($sources[$id]);
            if (property_exists($plugin, 'registered') && $plugin->registered !== null) {
                $problem = self::registeredProblem($plugin->registered);
                if ($problem !== null) throw new ApiError(400, 'invalid-plugins', "$at.registered $problem");
                // Specs of an older run name other types than the saved source: the reader would refuse a node of a newer
                // type, so the plugin is declared without them (its types are known when it loads)
                if (self::sameTypes($plugin->registered, $registers)) $declaration->registered = $plugin->registered;
            }
            $injected[$id] = ['declaration' => $declaration, 'code' => $code, 'registers' => $registers];
        }
        return $injected;
    }

    /**
     * Do the specs name the types the source registers (`Plugins::registers` – its layers are components in the content)?
     * @param array<string, array<int, string>> $registers
     */
    private static function sameTypes(stdClass $registered, array $registers): bool
    {
        $expected = [
            'components' => [...($registers['components'] ?? []), ...($registers['layers'] ?? [])],
            'nodeTypes' => $registers['nodeTypes'] ?? [], 'passes' => $registers['passes'] ?? [],
            'materials' => $registers['materials'] ?? [], 'textures' => $registers['textures'] ?? [],
            'appearances' => $registers['appearances'] ?? [],
        ];
        foreach ($expected as $kind => $types) {
            $named = ($registered->{$kind} ?? null) instanceof stdClass ? array_map('strval', array_keys(get_object_vars($registered->{$kind}))) : [];
            sort($named);
            $types = array_values(array_unique($types));
            sort($types);
            if ($named !== $types) return false;
        }
        return true;
    }

    /** Why a plugin's `registered` is not { components?, nodeTypes?, passes?, materials?, textures?, appearances? } of type → spec, or null */
    private static function registeredProblem(mixed $registered): ?string
    {
        if (!$registered instanceof stdClass) return 'must be an object { components?, nodeTypes?, passes?, materials?, textures?, appearances? }.';
        foreach (['components', 'nodeTypes', 'passes', 'materials', 'textures', 'appearances'] as $kind) {
            if (property_exists($registered, $kind) && !$registered->{$kind} instanceof stdClass) return ".$kind must be an object of type → spec.";
        }
        return null;
    }

    /**
     * The component types of every node of the configuration that are not built in (Editor::COMPONENT_TYPES), sorted
     * @return list<string>
     */
    public static function unknownComponentTypes(stdClass $configuration): array
    {
        return self::typesOfNodes($configuration, static function (stdClass $node): array {
            $types = [];
            foreach ((array) ($node->components ?? []) as $component) {
                $type = $component instanceof stdClass ? ($component->type ?? null) : null;
                if (is_string($type) && !in_array($type, Editor::COMPONENT_TYPES, true)) $types[] = $type;
            }
            return $types;
        });
    }

    /**
     * The pass types of the experience's and the scenes' `passes` that are not built in (PASS_TYPES) – a plugin's, sorted
     * @return list<string>
     */
    public static function pluginPassTypes(stdClass $configuration): array
    {
        $types = [];
        $lists = [$configuration->experience->passes ?? []];
        foreach ((array) ($configuration->scenes ?? []) as $scene) $lists[] = $scene instanceof stdClass ? ($scene->passes ?? []) : [];
        foreach ($lists as $list) {
            foreach ((array) $list as $pass) {
                $type = $pass instanceof stdClass ? ($pass->type ?? null) : null;
                if (is_string($type) && !in_array($type, self::PASS_TYPES, true)) $types[$type] = true;
            }
        }
        $list = array_map('strval', array_keys($types));
        sort($list);
        return $list;
    }

    /**
     * The looks of the experience's `appearance` and of the entities' own moments (the components reveal, found and lost) that are
     * not built in (APPEARANCE_TYPES) – a plugin's, sorted
     * @return list<string>
     */
    public static function pluginAppearanceTypes(stdClass $configuration): array
    {
        $types = [];
        $appearance = $configuration->experience->appearance ?? null;
        foreach ($appearance instanceof stdClass ? get_object_vars($appearance) : [] as $look) {
            $type = $look instanceof stdClass ? ($look->type ?? null) : null;
            if (is_string($type) && !in_array($type, self::APPEARANCE_TYPES, true)) $types[$type] = true;
        }
        $ownLooks = self::typesOfNodes($configuration, static function (stdClass $node): array {
            $looks = [];
            foreach ((array) ($node->components ?? []) as $component) {
                if (!$component instanceof stdClass || !in_array($component->type ?? null, self::MOMENTS, true)) continue;
                $look = $component->look ?? null;
                if (is_string($look) && $look !== '' && !in_array($look, self::APPEARANCE_TYPES, true)) $looks[] = $look;
            }
            return $looks;
        });
        foreach ($ownLooks as $look) $types[$look] = true;
        $list = array_map('strval', array_keys($types));
        sort($list);
        return $list;
    }

    /**
     * The material types of every node of the configuration (every material is a plugin's), sorted
     * @return list<string>
     */
    public static function materialTypes(stdClass $configuration): array
    {
        return self::typesOfNodes($configuration, static fn(stdClass $node): array =>
            ($node->material ?? null) instanceof stdClass && is_string($node->material->type ?? null) ? [$node->material->type] : []);
    }

    /**
     * The node types of the configuration that are not built in (Editor::ENTITY_TYPES) – a plugin's, sorted
     * @return list<string>
     */
    public static function unknownNodeTypes(stdClass $configuration): array
    {
        return self::typesOfNodes($configuration, static fn(stdClass $node): array =>
            is_string($node->type ?? null) && !in_array($node->type, Editor::ENTITY_TYPES, true) ? [$node->type] : []);
    }

    /**
     * What `$of` names for every node of the configuration (shared entities, the targets' own trees), distinct and sorted
     * @param callable(stdClass): list<string> $of
     * @return list<string>
     */
    private static function typesOfNodes(stdClass $configuration, callable $of): array
    {
        $types = [];
        $walk = static function (mixed $node) use (&$walk, &$types, $of): void {
            if (!$node instanceof stdClass) return;
            foreach ($of($node) as $type) $types[$type] = true;
            foreach ((array) ($node->children ?? []) as $child) $walk($child);
        };
        foreach (get_object_vars($configuration->entities ?? new stdClass()) as $entity) $walk($entity);
        foreach ((array) ($configuration->entries ?? []) as $entry) {
            $entity = $entry->target->entity ?? null;
            if ($entity instanceof stdClass && !isset($entity->ref)) $walk($entity);
        }
        $list = array_map('strval', array_keys($types));
        sort($list);
        return $list;
    }

    /** GET /editor/experiences/{id}/versions → { versions: [{ id, env, build, hash, publishedBy, publishedAt, note }] } newest first */
    public static function versions(string $experienceId): never
    {
        Editor::user();
        self::experience($experienceId, false, true);
        $versions = [];
        $rows = Db::run('SELECT v.*, u.email FROM experience_versions v LEFT JOIN users u ON u.id = v.published_by WHERE v.experience_id = :experience ORDER BY v.published_at DESC, v.id', ['experience' => $experienceId])->fetchAll();
        foreach ($rows as $row) {
            $versions[] = ['id' => $row['id'], 'env' => $row['env'], 'build' => $row['build'], 'hash' => $row['hash'], 'publishedBy' => $row['email'],
                'publishedAt' => Editor::iso((int) $row['published_at']), 'note' => $row['note']];
        }
        Http::json(200, ['versions' => $versions]);
    }

    /**
     * GET /editor/experiences/{id}/changes?limit= (default 50, at most 500) → { changes: [{ id, kind, ref, before, after, user, token,
     * createdAt, set, reverts, notRevertable }] } newest first; `token` = the AI connection's name for a save made through
     * one, else null; `set` = the change set a revert wrote (#312), `reverts` = the change it took back, `notRevertable` =
     * why the change cannot be reverted, null when it can (Reverts)
     */
    public static function changes(string $experienceId): never
    {
        Editor::user();
        self::experience($experienceId, false, true);
        $limit = min(500, max(1, (int) ($_GET['limit'] ?? 50)));
        $changes = [];
        $rows = Db::run("SELECT c.*, u.email FROM changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.experience_id = :experience ORDER BY c.created_at DESC, c.id DESC LIMIT $limit", ['experience' => $experienceId])->fetchAll();
        foreach ($rows as $row) {
            $changes[] = ['id' => $row['id'], 'kind' => $row['kind'], 'ref' => $row['ref'], 'before' => Editor::decode($row['before_json']), 'after' => Editor::decode($row['after_json']),
                'user' => $row['email'], 'token' => $row['token_name'] ?? null, 'createdAt' => Editor::iso((int) $row['created_at']),
                'set' => $row['change_set'] ?? null, 'reverts' => $row['reverts'] ?? null, 'notRevertable' => Reverts::notRevertable($row)];
        }
        Http::json(200, ['changes' => $changes]);
    }

    /**
     * The experience row, else 404. `$lock` (inside a transaction that writes the row back) locks it – `Db::forUpdate()`.
     * @return array<string, mixed>
     */
    private static function experience(string $experienceId, bool $lock = false, bool $anySchema = false): array
    {
        $row = Db::one('SELECT * FROM experiences WHERE id = :id' . ($lock ? Db::forUpdate() : ''), ['id' => $experienceId]);
        if (!$row) throw new ApiError(404, 'not-found', 'No such experience – import a configuration first.');
        // An experience of an older content schema MAJOR is not read or written (Db::migrate turns every 3.x one into 4.0, #320)
        if (!$anySchema && !Editor::isCurrentSchema((string) $row['content_schema'])) {
            throw new ApiError(409, 'old-schema', "The experience is of content schema {$row['content_schema']} – the editor reads " . Editor::CONTENT_SCHEMA . ': import a ' . Editor::CONTENT_SCHEMA_MAJOR . '.x configuration of it.', ['schema' => $row['content_schema']]);
        }
        return $row;
    }

    /** 404 unless the experience exists (Assets) */
    public static function exists(string $experienceId): void
    {
        self::experience($experienceId);
    }

    /**
     * The experience row, else 404 – locked with `$lock` inside a transaction that writes it back (ExperienceTexts)
     * @return array<string, mixed>
     */
    public static function experienceRow(string $experienceId, bool $lock = false, bool $anySchema = false): array
    {
        return self::experience($experienceId, $lock, $anySchema);
    }

    public static function touchExperience(string $experienceId): void
    {
        self::touch($experienceId);
    }

    /** One row of the change log (`change`); `$set` and `$reverts` for a revert (#312, Reverts) – returns the row's id */
    public static function recordChange(string $experienceId, array $user, string $kind, string $ref, ?string $before, string $after, ?string $set = null, ?string $reverts = null): string
    {
        return self::change($experienceId, $user, $kind, $ref, $before, $after, $set, $reverts);
    }

    /**
     * An experience for the list and the tree; `live` = the environments serving it [{ env, build, since }], empty = draft only
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function summary(array $row): array
    {
        $last = Db::one('SELECT env, build, published_at FROM experience_versions WHERE experience_id = :experience ORDER BY published_at DESC, id LIMIT 1', ['experience' => $row['id']]);
        $live = self::liveIn((string) $row['id']);
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'experience' => Editor::decode($row['experience_json']),
            'initialScene' => $row['initial_scene'],
            'schema' => $row['content_schema'],
            'assetsBase' => $row['assets_base'],
            'libraryBase' => Assets::folderUrl((string) $row['id']),
            'importedHash' => $row['imported_hash'],
            'scenes' => (int) Db::value('SELECT COUNT(*) FROM scenes WHERE experience_id = :experience', ['experience' => $row['id']]),
            'createdAt' => Editor::isoOf($row['created_at']),
            'updatedAt' => Editor::isoOf($row['updated_at']),
            'lastPublish' => $last ? ['env' => $last['env'], 'build' => $last['build'], 'at' => Editor::iso((int) $last['published_at'])] : null,
            'live' => $live,
        ];
    }

    /**
     * Checks what the rows need of a configuration (content schema 4.x – an older one is refused: convert its source with
     * `npm run convert:3` and `convert:4` in scripts/) and splits it into rows-to-be;
     * every other field stays inside the objects (data_json). Every entry names a scene of the configuration, its surface
     * and its target's place one of that scene's surfaces. The experience needs an id and a title; its printed book
     * (`book`, optional) an author and maybe a publisher – no print data on the top level (#320). `$pluginSources`: the experience has Code tab sources (any node type named like a
     * plugin's may pass – Editor::entity).
     * @return array{experience: stdClass, schema: string, hash: ?string, initialScene: string, plugins: array, groups: array, scenes: array, entities: array, entries: array, targets: array}
     */
    private static function parse(stdClass $c, bool $pluginSources = false): array
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-configuration', $message);
        $version = $c->version ?? null;
        if (!$version instanceof stdClass || !is_string($version->schema ?? null) || !preg_match('/^\d+\.\d+$/', $version->schema)) $fail('version.schema must be "MAJOR.MINOR".');
        if (!Editor::isCurrentSchema($version->schema)) $fail("The configuration is of content schema {$version->schema} – the editor reads " . Editor::CONTENT_SCHEMA_MAJOR . '.x (convert the source with npm run convert:3 and convert:4 in scripts/).');
        $experience = $c->experience ?? null;
        if (!$experience instanceof stdClass || !is_string($experience->id ?? null) || !is_string($experience->title ?? null)) $fail('experience needs id and title.');
        foreach (['author', 'publisher', 'sourceOfTruth'] as $key) {
            if (property_exists($experience, $key)) $fail("experience.$key is not a field of schema 4 – the printed book's author and publisher are in experience.book, sourceOfTruth is gone.");
        }
        if (property_exists($experience, 'book')) {
            $book = $experience->book;
            if (!$book instanceof stdClass || !is_string($book->author ?? null)) $fail('experience.book needs an author.');
            if (property_exists($book, 'publisher') && !is_string($book->publisher)) $fail('experience.book.publisher must be a string.');
        }
        if (isset($experience->environment)) {
            $problems = self::environmentProblems($experience->environment);
            if ($problems) $fail($problems[0]);
        }
        if (!is_string($c->initialScene ?? null)) $fail('initialScene must be a string.');
        if (!is_array($c->scenes ?? null) || !is_array($c->entries ?? null)) $fail('scenes and entries must be arrays.');
        $entitiesIn = $c->entities ?? new stdClass();
        if (!$entitiesIn instanceof stdClass) $fail('entities must be an object.');
        // The experience's compiled plugins: kept as declared – the content build is their one writer
        $plugins = $c->plugins ?? [];
        if (!is_array($plugins)) $fail('plugins must be an array.');
        foreach ($plugins as $i => $plugin) {
            if (!$plugin instanceof stdClass || !is_string($plugin->id ?? null) || !preg_match('/^' . Plugins::ID . '$/', $plugin->id)
                || !is_string($plugin->src ?? null) || !is_string($plugin->api ?? null)) {
                $fail("plugins[$i] needs id, src and api.");
            }
            // What it registered (optional): the specs by kind – the app's guard checks them in depth
            if (property_exists($plugin, 'registered')) {
                $problem = self::registeredProblem($plugin->registered);
                if ($problem !== null) $fail("plugins[$i].registered" . (str_starts_with($problem, '.') ? $problem : " $problem"));
            }
        }
        // A plugin's node type: the ones the declared plugins recorded, any camelCase name while a
        // plugin is unknown until it runs (a Code tab source, a declared plugin of an older build), none without plugins
        $pluginTypes = Editor::nodeTypesOf($plugins, $pluginSources);
        $pluginMaterials = Editor::typesOf($plugins, $pluginSources, 'materials');

        // The groups scenes name (schema 2.35, #307): kept in experiences.groups_json, written back at the root by the draft
        $groups = $c->groups ?? [];
        if (!is_array($groups)) $fail('groups must be an array.');
        $groupIds = [];
        foreach ($groups as $i => $group) {
            if (!$group instanceof stdClass || !is_string($group->label ?? null)) $fail("groups[$i] needs id and label.");
            $groupId = Editor::id($group->id ?? null, "groups[$i].id");
            if (in_array($groupId, $groupIds, true)) $fail("Duplicate group id \"$groupId\".");
            $groupIds[] = $groupId;
        }

        $scenes = [];
        foreach ($c->scenes as $i => $s) {
            if (!$s instanceof stdClass || !is_string($s->label ?? null) || trim($s->label) === '') $fail("scenes[$i] needs id, label and surfaces.");
            $id = Editor::id($s->id ?? null, "scenes[$i].id");
            if (isset($scenes[$id])) $fail("Duplicate scene id \"$id\".");
            if (property_exists($s, 'group') && !in_array($s->group, $groupIds, true)) $fail("scenes[$i].group names no group of the configuration.");
            try {
                $s->surfaces = Scenes::checkSurfaces($s->surfaces ?? null, 'invalid-configuration');
            } catch (ApiError $error) {
                $fail("scenes[$i]." . $error->getMessage());
            }
            $scenes[$id] = ['id' => $id, 'position' => $i, 'data' => $s];
        }
        if (!isset($scenes[$c->initialScene])) $fail("initialScene names no scene of the configuration (\"{$c->initialScene}\").");
        $entities = [];
        $position = 0;
        foreach (get_object_vars($entitiesIn) as $ref => $e) {
            $ref = Editor::id((string) $ref, 'entities key');
            Editor::entity($e, "entities.$ref", 0, $pluginTypes, $pluginMaterials);
            $entities[$ref] = ['ref' => $ref, 'position' => $position++, 'type' => $e->type, 'data' => $e];
        }
        $entries = [];
        $targets = [];
        foreach ($c->entries as $i => $e) {
            if (!$e instanceof stdClass || !is_string($e->title ?? null) || !is_string($e->category ?? null) || !is_string($e->scene ?? null)) $fail("entries[$i] needs id, category, title and scene.");
            $id = Editor::id($e->id ?? null, "entries[$i].id");
            if (isset($entries[$id])) $fail("Duplicate entry id \"$id\".");
            if (!isset($scenes[$e->scene])) $fail("entries[$i].scene names no scene of the configuration (\"{$e->scene}\").");
            $surfaceIds = Scenes::surfaceIds($scenes[$e->scene]['data']);
            if (property_exists($e, 'surface') && !in_array($e->surface, $surfaceIds, true)) $fail("entries[$i].surface names no surface of its scene.");
            $data = clone $e;
            // `scene_id` holds the scene; the draft writes it back (`ContentVersion::assemble`)
            unset($data->target, $data->scene);
            $entries[$id] = ['id' => $id, 'scene' => $e->scene, 'position' => $i, 'category' => $e->category, 'title' => $e->title, 'data' => $data];
            if (isset($e->target) && $e->target instanceof stdClass && property_exists($e->target, 'place')) {
                try {
                    $e->target->place = self::placeOn($scenes[$e->scene]['data'], $e->target->place, "entries[$i].target.place", 'invalid-configuration');
                } catch (ApiError $error) {
                    $fail($error->getMessage());
                }
            }
            $target = $e->target ?? null;
            if ($target === null) continue;
            if (!$target instanceof stdClass || !is_string($target->imageSrc ?? null)) $fail("entries[$i].target needs id and imageSrc.");
            if (property_exists($target, 'enabled') && !is_bool($target->enabled)) $fail("entries[$i].target.enabled must be true or false.");
            $targetId = Editor::id($target->id ?? null, "entries[$i].target.id");
            if (isset($targets[$targetId])) $fail("Duplicate target id \"$targetId\".");
            $targets[$targetId] = ['id' => $targetId, 'entry' => $id, 'image' => $target->imageSrc, 'ref' => self::entityRef($target->entity ?? null, $entities, "entries[$i].target.entity", $pluginTypes, $pluginMaterials), 'data' => $target];
        }
        return [
            'experience' => $experience, 'schema' => $version->schema, 'hash' => is_string($version->hash ?? null) ? $version->hash : null,
            'initialScene' => $c->initialScene, 'plugins' => $plugins, 'groups' => $groups,
            'scenes' => array_values($scenes), 'entities' => array_values($entities), 'entries' => array_values($entries), 'targets' => array_values($targets),
        ];
    }

    /**
     * The target switched on or off (#249): `false` is stored as `enabled: false`, `true` removes the field (on is the
     * default); anything else is a 400 with `$code`
     */
    private static function withEnabled(stdClass $target, mixed $enabled, string $path, string $code = 'invalid-target'): stdClass
    {
        if (!is_bool($enabled)) throw new ApiError(400, $code, "$path must be true or false.");
        if ($enabled) unset($target->enabled);
        else $target->enabled = false;
        return $target;
    }

    /**
     * A target's entity: `{ ref }` naming a shared entity → the ref; an inline entity (checked) or none → null
     * @param bool|list<string> $pluginTypes
     * @param bool|list<string> $pluginMaterials
     */
    private static function entityRef(mixed $entity, array $entities, string $path, bool|array $pluginTypes = false, bool|array $pluginMaterials = false): ?string
    {
        if ($entity === null) return null;
        if ($entity instanceof stdClass && property_exists($entity, 'ref')) {
            $ref = Editor::id($entity->ref, "$path.ref");
            if (!isset($entities[$ref])) throw new ApiError(400, 'unknown-entity', "$path.ref: no entity \"$ref\".");
            return $ref;
        }
        Editor::entity($entity, $path, 0, $pluginTypes, $pluginMaterials);
        return null;
    }

    /**
     * The current version of an experience on CONTENT_BASE_URL (`<base>/<experience>/latest.json` → <build>/game.config.json
     * + files.json, #87), with what latest.json said; `base` = the experience's store
     * @return array{0: stdClass, 1: stdClass, 2: string, 3: array{base: string, url: string, build: string, activatedAt: ?string}}
     */
    private static function fetchFromCdn(string $experienceId): array
    {
        $environment = rtrim(Config::get('CONTENT_BASE_URL'), '/');
        if ($environment === '') throw new ApiError(400, 'no-content-base', 'CONTENT_BASE_URL is not set on this server.');
        $base = "$environment/" . rawurlencode($experienceId);
        $latest = "$base/latest.json";
        $manifest = self::fetchJson("$latest?t=" . time(), $latest);
        $build = $manifest instanceof stdClass ? ($manifest->build ?? null) : null;
        if (!is_string($build) || !preg_match(ContentStore::BUILD, $build)) throw new ApiError(502, 'content-fetch-failed', "$latest names no content version.", ['url' => $latest]);
        $configuration = self::fetchJson("$base/$build/game.config.json");
        if (!$configuration instanceof stdClass) throw new ApiError(502, 'content-fetch-failed', "$base/$build/game.config.json is not an object.", ['url' => "$base/$build/game.config.json"]);
        try {
            $files = self::fetchJson("$base/$build/files.json");
        } catch (ApiError) {
            $files = null; // optional, as for the reader
        }
        $activatedAt = is_string($manifest->activatedAt ?? null) ? $manifest->activatedAt : null;
        return [$configuration, $files instanceof stdClass ? $files : new stdClass(), "$base/$build", ['base' => $base, 'url' => $latest, 'build' => $build, 'activatedAt' => $activatedAt]];
    }

    /** `$shown` = the URL errors name (without a cache-busting query) */
    private static function fetchJson(string $url, ?string $shown = null): mixed
    {
        $shown ??= $url;
        $context = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]]);
        $body = @file_get_contents($url, false, $context);
        $status = isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s(\d{3})#', $http_response_header[0], $match) ? (int) $match[1] : 0;
        if ($body === false || $status !== 200) throw new ApiError(502, 'content-fetch-failed', $status ? "$shown answered $status." : "$shown could not be reached.", ['url' => $shown]);
        try {
            return json_decode($body, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ApiError(502, 'content-fetch-failed', "$shown is not JSON.", ['url' => $shown]);
        }
    }

    private static function touch(string $experienceId): void
    {
        Db::run('UPDATE experiences SET updated_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $experienceId]);
    }

    /**
     * One row of the change log; a save through an AI connection records the token's name (`token_name`), so the log
     * tells which AI made it
     * @param array<string, mixed> $user
     */
    private static function change(string $experienceId, array $user, string $kind, string $ref, ?string $before, string $after, ?string $set = null, ?string $reverts = null): string
    {
        $id = Db::uuid();
        // Strictly later than the request's previous change: the order of one save's changes stays readable (a revert
        // walks them newest first, #312)
        static $last = 0;
        $last = max(Editor::nowMs(), $last + 1);
        Db::run('INSERT INTO changes (id, experience_id, user_id, token_name, kind, ref, before_json, after_json, created_at, change_set, reverts) VALUES (:id, :experience, :user, :token, :kind, :ref, :before, :after, :at, :set, :reverts)',
            ['id' => $id, 'experience' => $experienceId, 'user' => $user['id'], 'token' => Auth::token()['name'] ?? null, 'kind' => $kind, 'ref' => $ref,
             'before' => $before, 'after' => $after, 'at' => $last, 'set' => $set, 'reverts' => $reverts]);
        return $id;
    }
}
