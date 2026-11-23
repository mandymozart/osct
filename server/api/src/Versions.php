<?php
declare(strict_types=1);

/**
 * The experiences page's sheet and quick access (#348, docs/server.md "Make a version live again", "Recent places"):
 *
 * - **make live** – an older published build of this instance's environment becomes the current one again. Builds are
 *   immutable and stay in the store (a publish never deletes one; only `osct content purge` does, by hand): the switch is
 *   the publish's own – versions.json (`ContentStore::activate`), then latest.json – and a row in the publish log, so the
 *   log names who made which version live when. The draft is not touched.
 * - **recent** – the newest changes across the instance's experiences with the scene each one is on, for *Last worked on*.
 */
final class Versions
{
    /**
     * POST /editor/experiences/{id}/versions/{build}/activate → { env, build, hash, activatedAt, previous, version }:
     * `{build}` – a version of this experience the publish log names for this instance's environment (`ENV`) – is live
     * again: readers get it on their next start. 404 unknown-build (not in the publish log of this environment), 409
     * already-live, 409 publish-running (a publish of the experience is writing – its `job`), 409 build-missing (the
     * store no longer has the build's game.config.json – purged), 409 unreadable-schema (a build of a content schema
     * MAJOR today's reader cannot read), 403 not-for-ai (readers are reached only by a person, as with Publish).
     * The publish log's new row carries the note `Made live again – the version of <its first publish>`.
     */
    public static function activate(string $experienceId, string $build): never
    {
        $user = Editor::user();
        Auth::refuseToken('Making a version live');
        Experiences::experienceRow($experienceId, false, true);
        $env = Config::env();
        $row = Db::one('SELECT hash, published_at FROM experience_versions WHERE experience_id = :experience AND env = :env AND build = :build ORDER BY published_at ASC, id LIMIT 1',
            ['experience' => $experienceId, 'env' => $env, 'build' => $build]);
        if (!$row) throw new ApiError(404, 'unknown-build', "The publish log has no version $build of this experience on $env.", ['env' => $env]);
        $running = PublishJob::running($experienceId, $env);
        if ($running !== null) throw new ApiError(409, 'publish-running', 'A publish of this experience is running – wait for it (its progress: job).', ['job' => $running]);

        $store = ContentStore::for($env, $experienceId);
        $live = $store->live();
        if (($live['build'] ?? null) === $build) throw new ApiError(409, 'already-live', "Version $build is live on $env already.", ['env' => $env]);
        $configuration = json_decode((string) $store->get("$build/game.config.json"));
        if (!$configuration instanceof stdClass) {
            throw new ApiError(409, 'build-missing', "Version $build is in the publish log, but $env's content store no longer has its game.config.json (purged?).", ['env' => $env]);
        }
        $version = $configuration->version ?? null;
        $schema = $version instanceof stdClass && is_string($version->schema ?? null) ? $version->schema : '';
        if (!Editor::isCurrentSchema($schema)) {
            throw new ApiError(409, 'unreadable-schema', "Version $build is of content schema " . ($schema ?: 'unknown') . ' – today\'s reader reads ' . Editor::CONTENT_SCHEMA_MAJOR . '.x only.', ['schema' => $schema]);
        }
        $hash = $version instanceof stdClass && is_string($version->hash ?? null) ? $version->hash : (string) $row['hash'];

        $nowMs = Editor::nowMs();
        $now = Editor::iso($nowMs);
        $current = $store->get('versions.json');
        $versions = $current === null ? [] : json_decode($current, true);
        if (!is_array($versions)) throw new ApiError(502, 'content-store-failed', "$env/$experienceId/versions.json is not readable – fix it first.");
        $entry = ['build' => $build, 'hash' => $hash, 'schema' => $schema];
        $store->put('versions.json', Editor::encode(ContentStore::activate($versions, $entry, $now, false, $experienceId), true));
        $store->put('latest.json', Editor::encode(ContentVersion::manifest($entry, $now, $experienceId), true));
        $first = Editor::iso((int) $row['published_at']);
        $note = "Made live again – the version of $first";
        Db::run('INSERT INTO experience_versions (id, experience_id, env, build, hash, published_by, published_at, note) VALUES (:id, :experience, :env, :build, :hash, :by, :at, :note)',
            ['id' => Db::uuid(), 'experience' => $experienceId, 'env' => $env, 'build' => $build, 'hash' => $hash, 'by' => $user['id'], 'at' => $nowMs, 'note' => $note]);
        Http::json(200, [
            'env' => $env, 'build' => $build, 'hash' => $hash, 'activatedAt' => $now, 'previous' => $live['build'] ?? null,
            'version' => ['publishedAt' => $first, 'note' => $note],
        ]);
    }

    /**
     * GET /editor/recent?limit= (default 40, at most 200) → { changes: [{ experience, experienceTitle, kind, ref, scene,
     * sceneLabel, entry, user, token, at }] } – the newest changes across the instance's experiences, newest first. `scene`
     * = the scene the change is on: a scene's own (and its reference images'), an entry's, a target's entry's – null for
     * what is no scene's (the experience's settings, a plugin, a file, a shared entity); `sceneLabel` its label; `entry` the
     * entry's title for an entry or a target. A change of a scene or entry deleted since keeps its ref and no scene.
     */
    public static function recent(): never
    {
        Editor::user();
        $limit = min(200, max(1, (int) ($_GET['limit'] ?? 40)));
        $rows = Db::run("SELECT c.experience_id, c.kind, c.ref, c.created_at, c.token_name, u.email, x.title AS experience_title,
                COALESCE(te.scene_id, en.scene_id, sc.id) AS scene_id, COALESCE(te.title, en.title) AS entry_title
            FROM changes c
            JOIN experiences x ON x.id = c.experience_id
            LEFT JOIN users u ON u.id = c.user_id
            LEFT JOIN targets t ON c.kind = 'target' AND t.experience_id = c.experience_id AND t.id = c.ref
            LEFT JOIN entries te ON te.experience_id = t.experience_id AND te.id = t.entry_id
            LEFT JOIN entries en ON c.kind = 'entry' AND en.experience_id = c.experience_id AND en.id = c.ref
            LEFT JOIN scenes sc ON c.kind = 'scene' AND sc.experience_id = c.experience_id AND sc.id = c.ref
            ORDER BY c.created_at DESC, c.id DESC LIMIT $limit")->fetchAll();
        $labels = [];
        $changes = [];
        foreach ($rows as $row) {
            $experience = (string) $row['experience_id'];
            $scene = $row['scene_id'] !== null ? (string) $row['scene_id'] : null;
            // A reference image's ref is `<scene>/<surface>` (SurfaceReferences::ref)
            if ($scene === null && $row['kind'] === 'reference') $scene = explode('/', (string) $row['ref'])[0];
            if ($scene !== null && !array_key_exists("$experience/$scene", $labels)) {
                $label = Db::value("SELECT COALESCE(label, '') FROM scenes WHERE experience_id = :experience AND id = :id", ['experience' => $experience, 'id' => $scene]);
                $labels["$experience/$scene"] = $label === null ? false : (is_string($label) && $label !== '' ? $label : null);
            }
            // A scene deleted since: no place to open
            if ($scene !== null && $labels["$experience/$scene"] === false) $scene = null;
            $changes[] = [
                'experience' => $experience, 'experienceTitle' => $row['experience_title'], 'kind' => $row['kind'], 'ref' => $row['ref'],
                'scene' => $scene, 'sceneLabel' => $scene !== null ? $labels["$experience/$scene"] : null,
                'entry' => $row['entry_title'] !== null ? (string) $row['entry_title'] : null,
                'user' => $row['email'], 'token' => $row['token_name'] ?? null, 'at' => Editor::iso((int) $row['created_at']),
            ];
        }
        Http::json(200, ['changes' => $changes]);
    }
}
