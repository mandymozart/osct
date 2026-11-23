<?php
declare(strict_types=1);

/**
 * A publish as a job (#345, docs/server.md "Publish jobs"). `POST …/publish` checks the draft as before, then writes
 * what the publish will write into a row of `publish_jobs` – the version folder's files (the plugins' modules, the
 * landing's landing.json – #355 –, files.json, game.config.json last), the switch (versions.json, latest.json, the publish log), the build's export archive
 * (`ExportArchive::files`, export.json last) – and runs it for at most PUBLISH_STEP_SECONDS in the request. Done in that
 * time → 200 with the outcome, as before; else 202 `{ job }`, and the job runs on:
 *
 * - under PHP-FPM (`fastcgi_finish_request`, staging's host): the answer is sent, the same request keeps writing
 *   (`ignore_user_abort`, no time limit) – the gateway has its answer long before any timeout;
 * - elsewhere (Apache mod_php – the Docker image –, the built-in server): every poll of `GET …/publish/{job}` writes the
 *   next PUBLISH_STEP_SECONDS and answers the progress.
 *
 * One runner at a time: a run holds a lease (`lease_until`, renewed after every slice of files). A runner that died (a
 * killed FPM worker, a closed editor) leaves the lease to run out and the next poll goes on where the job stands – every
 * slice's progress is saved. A job no one moved for ABANDONED_MS gives way to the next publish of the experience.
 * The store learns what it holds without a request per file: the version folder is one check (a folder is never
 * overwritten), an incomplete archive one listing per folder (`ContentStore::checksums`) – files with the same checksum
 * are skipped; the rest go up CONCURRENCY at a time (`ContentStore::putMany`). latest.json is written only after the
 * whole version folder is there, an archive's export.json only after every other file of it.
 */
final class PublishJob
{
    /** Files per slice: progress is saved (and the lease renewed) after each */
    private const SLICE = 32;
    /** Uploads at a time on the storage zone */
    private const CONCURRENCY = 16;
    /** A run's lease, renewed after every slice (ms) */
    private const LEASE_MS = 90000;
    /** A running job no one moved for this long gives way to a new publish of the experience (ms) */
    private const ABANDONED_MS = 120000;
    /** Ended jobs are kept this long (the editor reads the outcome), then removed */
    private const KEEP_MS = 14 * 86400000;

    /**
     * The job of a checked publish: its row, then its first run in this request – the job's state
     * @param array{configuration: stdClass, files: stdClass, hash: string, build: string, schema: string} $version
     * @param array<string, array{declaration: stdClass, code: string, registers: array<string, mixed>}> $injected
     * @return array<string, mixed>
     */
    public static function start(string $experienceId, string $env, string $userId, ?string $note, array $version, array $injected): array
    {
        $nowMs = Editor::nowMs();
        Db::run("DELETE FROM publish_jobs WHERE status <> 'running' AND updated_at < :before", ['before' => $nowMs - self::KEEP_MS]);
        $running = Db::one("SELECT * FROM publish_jobs WHERE experience_id = :experience AND env = :env AND status = 'running' ORDER BY created_at DESC LIMIT 1",
            ['experience' => $experienceId, 'env' => $env]);
        if ($running) {
            if ((int) $running['updated_at'] > $nowMs - self::ABANDONED_MS || (int) $running['lease_until'] > $nowMs) {
                throw new ApiError(409, 'publish-running', 'A publish of this experience is running – wait for it (its progress: job).', ['job' => self::state($running)]);
            }
            self::save($running['id'], ['status' => 'failed', 'plan_json' => '{}', 'error_code' => 'abandoned',
                'error_message' => 'No one continued this publish for ' . (self::ABANDONED_MS / 60000) . ' minutes – a newer publish took its place.']);
        }

        $publishedAt = Editor::iso($nowMs);
        $folder = [];
        // The plugins' modules first, game.config.json last: a version whose configuration is there is complete
        foreach ($injected as $plugin) $folder[] = [ltrim((string) $plugin['declaration']->src, '/'), $plugin['code'], 'text/javascript'];
        // The desktop landing's data (#355): from the experience's landing as stored – its pick's hero, its texts and shop (#365);
        // none without any of them (the reader derives it then). The readers' configuration leaves a pick-less landing out.
        $row = Db::one('SELECT assets_base, experience_json FROM experiences WHERE id = :id', ['id' => $experienceId]);
        $stored = $row ? Editor::decode((string) $row['experience_json']) : null;
        $landing = Landing::file($version['configuration'], (string) ($row['assets_base'] ?? ''), $stored instanceof stdClass ? ($stored->landing ?? null) : null);
        if ($landing !== null) $folder[] = [Landing::FILE, $landing, 'application/json'];
        $folder[] = ['files.json', Editor::encode($version['files']), 'application/json'];
        $folder[] = ['game.config.json', Editor::encode($version['configuration']), 'application/json'];
        // The export archive of the build (#322): planned now, written after the switch – a failure is reported, not a failed publish
        try {
            $archive = ExportArchive::files(Export::ofPublish($experienceId, $version, $env, $publishedAt), $env);
        } catch (Throwable $error) {
            error_log("[osct] export archive of $env/$experienceId/{$version['build']} failed: " . $error->getMessage());
            $archive = ['folder' => ExportArchive::FOLDER . '/' . $version['build'], 'files' => [], 'error' => $error->getMessage()];
        }
        $plan = ['folder' => $folder, 'archive' => $archive, 'schema' => $version['schema']];
        $state = ['pending' => null, 'uploadedNow' => null, 'export' => null, 'publishedAt' => $publishedAt,
            'parts' => ['build' => count($folder), 'archive' => count($archive['files'])]];
        $id = Db::uuid();
        Db::run('INSERT INTO publish_jobs (id, experience_id, env, user_id, note, status, phase, build, hash, done, total, skipped, plan_json, state_json, created_at, updated_at, lease_until)
            VALUES (:id, :experience, :env, :user, :note, :status, :phase, :build, :hash, 0, :total, 0, :plan, :state, :created, :updated, 0)', [
            'id' => $id, 'experience' => $experienceId, 'env' => $env, 'user' => $userId, 'note' => $note, 'status' => 'running', 'phase' => 'version',
            'build' => $version['build'], 'hash' => $version['hash'], 'total' => count($folder) + 2 + count($archive['files']),
            'plan' => self::pack($plan), 'state' => Editor::encode($state), 'created' => $nowMs, 'updated' => $nowMs,
        ]);
        self::advance($id);
        return self::state(self::row($id));
    }

    /** The state of the experience's publish that runs in `$env` and is not abandoned, null when none (make live, #348) */
    public static function running(string $experienceId, string $env): ?array
    {
        $nowMs = Editor::nowMs();
        $running = Db::one("SELECT * FROM publish_jobs WHERE experience_id = :experience AND env = :env AND status = 'running' ORDER BY created_at DESC LIMIT 1",
            ['experience' => $experienceId, 'env' => $env]);
        if (!$running || ((int) $running['updated_at'] <= $nowMs - self::ABANDONED_MS && (int) $running['lease_until'] <= $nowMs)) return null;
        return self::state($running);
    }

    /**
     * The answer of `POST …/publish`: done → 200 with the outcome (and `job`); failed → the error's status with `job`;
     * running → 202 `{ job }`, and under PHP-FPM the request runs the job on after the answer.
     * @param array<string, mixed> $job
     */
    public static function answer(array $job): never
    {
        if ($job['status'] === 'done') Http::json(200, [...$job['result'], 'job' => $job]);
        if ($job['status'] === 'failed') {
            Http::json((int) ($job['error']['status'] ?? 500), ['error' => ['code' => $job['error']['code'], 'message' => $job['error']['message'], 'job' => $job]]);
        }
        Http::send(202, ['job' => $job]);
        if (function_exists('fastcgi_finish_request')) {
            ignore_user_abort(true);
            set_time_limit(0);
            fastcgi_finish_request();
            self::advance((string) $job['id'], INF);
        }
        exit;
    }

    /**
     * GET /editor/experiences/{id}/publish/{job} → { job }: a running job first runs on for PUBLISH_STEP_SECONDS
     * (unless another request runs it), then its state – also when it failed (that is the job's state, not the poll's)
     */
    public static function poll(string $experienceId, string $jobId): never
    {
        Editor::user();
        Auth::refuseToken('Publishing');
        $row = Db::one('SELECT * FROM publish_jobs WHERE id = :id AND experience_id = :experience', ['id' => $jobId, 'experience' => $experienceId]);
        if (!$row) throw new ApiError(404, 'unknown-job', 'No such publish of this experience.');
        if ($row['status'] === 'running') {
            self::advance($jobId);
            $row = self::row($jobId);
        }
        Http::json(200, ['job' => self::state($row)]);
    }

    /**
     * GET /editor/experiences/{id}/publish → { job }: the experience's newest publish (null: none kept) – where the editor
     * finds a publish whose start it did not hear the answer of (a gateway's timeout); a running one runs on like a poll
     */
    public static function latest(string $experienceId): never
    {
        Editor::user();
        Auth::refuseToken('Publishing');
        $row = Db::one('SELECT * FROM publish_jobs WHERE experience_id = :experience ORDER BY created_at DESC LIMIT 1', ['experience' => $experienceId]);
        if ($row && $row['status'] === 'running') {
            self::advance((string) $row['id']);
            $row = self::row((string) $row['id']);
        }
        Http::json(200, ['job' => $row ? self::state($row) : null]);
    }

    /** Runs the job for `$seconds` (PUBLISH_STEP_SECONDS) – at least one step – unless another run holds it */
    public static function advance(string $id, ?float $seconds = null): void
    {
        $seconds ??= (float) max(0, Config::int('PUBLISH_STEP_SECONDS'));
        $now = Editor::nowMs();
        $leased = Db::run("UPDATE publish_jobs SET lease_until = :until WHERE id = :id AND status = 'running' AND lease_until < :now",
            ['until' => $now + self::LEASE_MS, 'id' => $id, 'now' => $now])->rowCount() === 1;
        if (!$leased) return;
        $until = microtime(true) + $seconds;
        try {
            do {
                $more = self::step($id);
            } while ($more && microtime(true) < $until);
        } finally {
            Db::run('UPDATE publish_jobs SET lease_until = 0 WHERE id = :id', ['id' => $id]);
        }
    }

    /**
     * What a client sees of a job: { id, experience, env, status (running | done | failed), phase (version | switch |
     * archive | done), build, hash, live (latest.json names the build – the archive may still be written), done, total,
     * skipped, parts? ({ build, archive }: the files of the version folder and of the export archive – total = build + 2 +
     * archive), startedAt, updatedAt, result? (done: what the publish answered),
     * error? (failed: code, message, status) }
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function state(array $row): array
    {
        $state = json_decode((string) $row['state_json'], true) ?: [];
        $job = [
            'id' => $row['id'], 'experience' => $row['experience_id'], 'env' => $row['env'], 'status' => $row['status'], 'phase' => $row['phase'],
            'build' => $row['build'], 'hash' => $row['hash'], 'live' => in_array($row['phase'], ['archive', 'done'], true), 'done' => (int) $row['done'], 'total' => (int) $row['total'], 'skipped' => (int) $row['skipped'],
            'startedAt' => Editor::iso((int) $row['created_at']), 'updatedAt' => Editor::iso((int) $row['updated_at']),
        ];
        if (isset($state['parts'])) $job['parts'] = ['build' => (int) $state['parts']['build'], 'archive' => (int) $state['parts']['archive']];
        if ($row['status'] === 'done') {
            $job['result'] = [
                'env' => $row['env'],
                'store' => ContentStore::for((string) $row['env'], (string) $row['experience_id'])->isLocal() ? 'server' : 'cdn',
                'build' => $row['build'], 'hash' => $row['hash'], 'publishedAt' => $state['publishedAt'] ?? null,
                'export' => $state['export'] ?? ['path' => ExportArchive::FOLDER . '/' . $row['build'], 'written' => false],
            ];
        }
        if ($row['status'] === 'failed') {
            $job['error'] = ['code' => $row['error_code'], 'message' => $row['error_message'], 'status' => (int) ($state['errorStatus'] ?? 500)];
        }
        return $job;
    }

    /** One step of the job – a check, a slice of files, the switch; false when it ended */
    private static function step(string $id): bool
    {
        $row = self::row($id);
        if ($row['status'] !== 'running') return false;
        $plan = self::unpack((string) $row['plan_json']);
        $state = json_decode((string) $row['state_json'], true);
        $store = ContentStore::for((string) $row['env'], (string) $row['experience_id']);
        try {
            return match ($row['phase']) {
                'version' => self::version($row, $plan, $state, $store),
                'switch' => self::switch($row, $plan, $state, $store),
                'archive' => self::archive($row, $plan, $state, $store),
                default => false,
            };
        } catch (Throwable $error) {
            $message = $error->getMessage();
            if ($row['phase'] === 'archive') {
                // The publish went through: the archive's failure is reported (the next publish of the build writes it)
                error_log("[osct] export archive of {$row['env']}/{$row['experience_id']}/{$row['build']} failed: $message");
                $state['export'] = ['path' => $plan['archive']['folder'], 'written' => false, 'error' => $message];
                self::finish($row, $state);
                return false;
            }
            error_log("[osct] publish of {$row['env']}/{$row['experience_id']}/{$row['build']} failed in {$row['phase']}: $message");
            $state['errorStatus'] = $error instanceof ApiError ? $error->status : 500;
            self::save($id, ['status' => 'failed', 'plan_json' => '{}', 'state_json' => Editor::encode($state),
                'error_code' => $error instanceof ApiError ? $error->errorCode : 'publish-failed',
                'error_message' => $error instanceof ApiError ? $message : "The publish failed: $message"]);
            return false;
        }
    }

    /**
     * The version folder `<build>/`: nothing when its game.config.json is there (a folder is never overwritten), else its
     * files, game.config.json last
     * @param array<string, mixed> $row
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $state
     */
    private static function version(array $row, array $plan, array $state, ContentStore $store): bool
    {
        $files = $plan['folder'];
        $build = (string) $row['build'];
        if ($state['pending'] === null) {
            if ($store->exists("$build/game.config.json")) {
                $state['uploadedNow'] = false;
                self::save($row['id'], ['phase' => 'switch', 'done' => (int) $row['done'] + count($files), 'skipped' => (int) $row['skipped'] + count($files), 'state_json' => Editor::encode($state)]);
                return true;
            }
            $state['uploadedNow'] = true;
            $state['pending'] = array_keys($files);
            self::save($row['id'], ['state_json' => Editor::encode($state)]);
            return true;
        }
        if (self::slice($row, $state, $store, $build, $files)) {
            $state['pending'] = null;
            self::save($row['id'], ['phase' => 'switch', 'state_json' => Editor::encode($state)]);
        }
        return true;
    }

    /**
     * The switch: versions.json, then latest.json, then the publish log
     * @param array<string, mixed> $row
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $state
     */
    private static function switch(array $row, array $plan, array $state, ContentStore $store): bool
    {
        $env = (string) $row['env'];
        $experienceId = (string) $row['experience_id'];
        $version = ['build' => (string) $row['build'], 'hash' => (string) $row['hash'], 'schema' => (string) $plan['schema']];
        $now = (string) $state['publishedAt'];
        $current = $store->get('versions.json');
        $versions = $current === null ? [] : json_decode($current, true);
        if (!is_array($versions)) throw new ApiError(502, 'content-store-failed', "$env/$experienceId/versions.json is not readable – fix it before publishing.");
        $store->put('versions.json', Editor::encode(ContentStore::activate($versions, $version, $now, (bool) $state['uploadedNow'], $experienceId), true));
        $store->put('latest.json', Editor::encode(ContentVersion::manifest($version, $now, $experienceId), true));
        Db::run('INSERT INTO experience_versions (id, experience_id, env, build, hash, published_by, published_at, note) VALUES (:id, :experience, :env, :build, :hash, :by, :at, :note)',
            ['id' => Db::uuid(), 'experience' => $experienceId, 'env' => $env, 'build' => $version['build'], 'hash' => $version['hash'], 'by' => $row['user_id'], 'at' => Editor::nowMs(), 'note' => $row['note']]);
        $state['pending'] = null;
        self::save($row['id'], ['phase' => 'archive', 'done' => (int) $row['done'] + 2, 'state_json' => Editor::encode($state)]);
        return true;
    }

    /**
     * The export archive `exports/<build>/`: nothing when its export.json is there; else what the folder holds with the
     * same checksum is skipped (one listing per folder) and the rest written, export.json last
     * @param array<string, mixed> $row
     * @param array<string, mixed> $plan
     * @param array<string, mixed> $state
     */
    private static function archive(array $row, array $plan, array $state, ContentStore $store): bool
    {
        $archive = $plan['archive'];
        $folder = (string) $archive['folder'];
        $files = $archive['files'];
        if (isset($archive['error'])) {
            $state['export'] = ['path' => $folder, 'written' => false, 'error' => $archive['error']];
            self::finish($row, $state);
            return false;
        }
        if ($state['pending'] === null) {
            if ($store->exists("$folder/" . ExportArchive::COMPLETE)) {
                $state['export'] = ['path' => $folder, 'written' => false];
                $row['done'] = (int) $row['done'] + count($files);
                $row['skipped'] = (int) $row['skipped'] + count($files);
                self::finish($row, $state);
                return false;
            }
            // An archive a broken-off publish left incomplete: what it holds already is not written again
            $have = $store->checksums($folder);
            $last = count($files) - 1;
            $pending = [];
            foreach ($files as $i => [$path, $data]) {
                if ($i === $last || ($have[$path] ?? null) !== hash('sha256', $data)) $pending[] = $i;
            }
            $skipped = count($files) - count($pending);
            $state['pending'] = $pending;
            self::save($row['id'], ['done' => (int) $row['done'] + $skipped, 'skipped' => (int) $row['skipped'] + $skipped, 'state_json' => Editor::encode($state)]);
            return true;
        }
        if (!self::slice($row, $state, $store, $folder, $files)) return true;
        $state['export'] = ['path' => $folder, 'written' => true];
        $row = self::row((string) $row['id']);
        self::finish($row, $state);
        return false;
    }

    /**
     * Writes the next slice of the pending files below `$prefix` – the last file of the list (the one that marks the
     * folder as complete) only on its own, after all others. True when nothing is pending any more.
     * @param array<string, mixed> $row
     * @param array<string, mixed> $state
     * @param list<array{0: string, 1: string, 2: string}> $files
     */
    private static function slice(array $row, array &$state, ContentStore $store, string $prefix, array $files): bool
    {
        $last = count($files) - 1;
        $pending = array_values($state['pending']);
        $others = array_values(array_filter($pending, static fn(int $i): bool => $i !== $last));
        $take = $others ? array_slice($others, 0, self::SLICE) : (in_array($last, $pending, true) ? [$last] : []);
        if ($take === []) return true;
        if ($take === [$last]) {
            [$path, $data, $mime] = $files[$last];
            $store->put("$prefix/$path", $data, $mime);
        } else {
            $store->putMany(array_map(static fn(int $i): array => ["$prefix/{$files[$i][0]}", $files[$i][1], $files[$i][2]], $take), self::CONCURRENCY);
        }
        $state['pending'] = array_values(array_diff($pending, $take));
        self::save($row['id'], ['done' => (int) $row['done'] + count($take), 'state_json' => Editor::encode($state)]);
        return $state['pending'] === [];
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $state
     */
    private static function finish(array $row, array $state): void
    {
        $state['pending'] = null;
        self::save($row['id'], ['status' => 'done', 'phase' => 'done', 'done' => (int) $row['done'], 'skipped' => (int) $row['skipped'],
            'plan_json' => '{}', 'state_json' => Editor::encode($state)]);
    }

    /**
     * The plan as stored: deflated and base64 (`z:` – the book's plan is ~2.5 MB of JSON and YAML, a tenth of it packed,
     * well within any database's packet size), plain JSON where PHP has no zlib
     * @param array<string, mixed> $plan
     */
    private static function pack(array $plan): string
    {
        $json = Editor::encode($plan);
        return function_exists('gzdeflate') ? 'z:' . base64_encode((string) gzdeflate($json, 6)) : $json;
    }

    /** @return array<string, mixed> */
    private static function unpack(string $stored): array
    {
        $json = str_starts_with($stored, 'z:') ? (string) gzinflate((string) base64_decode(substr($stored, 2))) : $stored;
        $plan = json_decode($json, true);
        return is_array($plan) ? $plan : [];
    }

    /** @return array<string, mixed> */
    private static function row(string $id): array
    {
        $row = Db::one('SELECT * FROM publish_jobs WHERE id = :id', ['id' => $id]);
        if (!$row) throw new ApiError(404, 'unknown-job', 'No such publish.');
        return $row;
    }

    /**
     * Saves columns of the job – its progress – and renews a running job's lease
     * @param array<string, mixed> $columns
     */
    private static function save(string $id, array $columns): void
    {
        $now = Editor::nowMs();
        $columns['updated_at'] = $now;
        if (($columns['status'] ?? 'running') === 'running') $columns['lease_until'] = $now + self::LEASE_MS;
        $set = implode(', ', array_map(static fn(string $column): string => "$column = :$column", array_keys($columns)));
        Db::run("UPDATE publish_jobs SET $set WHERE id = :job_id", [...$columns, 'job_id' => $id]);
    }
}
