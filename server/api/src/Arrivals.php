<?php
declare(strict_types=1);

/**
 * Arrivals by source (#324, docs/server.md "Arrivals"): how many people came to the app from a printed QR code or
 * another link that carries `?s=<source>` – the book's code is `?s=bk1`, the desktop landing page's `?s=lp1`.
 *
 * The app reports an arrival once (`POST /arrivals`, no cookie – `credentials: "omit"`) and takes `s` out of the
 * address. Only counts are kept, per source, UTC day and device class: arrivals, and first arrivals (the browser had
 * never reported one – a flag in its own storage). No IP, no user, no cookie, no user agent (data sovereignty,
 * agents/STRATEGY.md). A source nobody planned still counts, so a new printed code shows up by itself; to keep a
 * stray script from filling the table, a day takes at most MAX_NEW_SOURCES_PER_DAY sources it has not seen before.
 */
final class Arrivals
{
    /** A source: a short code of lowercase letters, digits and dashes */
    public const SOURCE = '/^[a-z0-9][a-z0-9-]{0,31}$/';
    public const DEVICES = ['phone', 'tablet', 'desktop'];
    /** Sources a day accepts that were never counted before */
    private const MAX_NEW_SOURCES_PER_DAY = 50;
    /** The admin's window (days) */
    private const MAX_DAYS = 366;

    /** POST /arrivals { source, device, first } → 204; a malformed one → 400 */
    public static function record(array $body): never
    {
        $source = is_string($body['source'] ?? null) ? strtolower(trim($body['source'])) : '';
        if (!preg_match(self::SOURCE, $source)) throw new ApiError(400, 'invalid-source', 'The source is a short code: a–z, 0–9 and dashes.');
        $device = in_array($body['device'] ?? null, self::DEVICES, true) ? $body['device'] : 'desktop';
        $first = ($body['first'] ?? false) === true ? 1 : 0;
        $day = gmdate('Y-m-d');
        $known = (bool) Db::value('SELECT COUNT(*) FROM arrivals WHERE source = :source', ['source' => $source]);
        if (!$known) {
            $newToday = (int) Db::value(
                'SELECT COUNT(DISTINCT a.source) FROM arrivals a WHERE a.day = :day AND NOT EXISTS '
                . '(SELECT 1 FROM arrivals b WHERE b.source = a.source AND b.day < :before)',
                ['day' => $day, 'before' => $day],
            );
            if ($newToday >= self::MAX_NEW_SOURCES_PER_DAY) throw new ApiError(429, 'too-many-sources', 'Too many new sources today.');
        }
        $params = ['source' => $source, 'day' => $day, 'device' => $device, 'first' => $first];
        Db::run(Db::isSqlite()
            ? 'INSERT INTO arrivals (source, day, device, arrivals, first_arrivals) VALUES (:source, :day, :device, 1, :first) '
                . 'ON CONFLICT (source, day, device) DO UPDATE SET arrivals = arrivals + 1, first_arrivals = first_arrivals + excluded.first_arrivals'
            : 'INSERT INTO arrivals (source, day, device, arrivals, first_arrivals) VALUES (:source, :day, :device, 1, :first) '
                . 'ON DUPLICATE KEY UPDATE arrivals = arrivals + 1, first_arrivals = first_arrivals + VALUES(first_arrivals)',
            $params);
        http_response_code(204);
        exit;
    }

    /**
     * GET /admin/arrivals?days=30 → { days, from, to, sources: [{ source, arrivals, firstArrivals, devices: { phone,
     * tablet, desktop }, firstDay, lastDay, recent: [{ day, arrivals }] }] }: every source ever counted, most arrivals
     * first – the totals over all time, `recent` the last `days` days (days without arrivals left out)
     */
    public static function admin(): never
    {
        Admin::actor();
        $days = max(1, min(self::MAX_DAYS, (int) ($_GET['days'] ?? 30)));
        $to = gmdate('Y-m-d');
        $from = gmdate('Y-m-d', time() - ($days - 1) * 86400);
        $sources = [];
        $rows = Db::run('SELECT source, device, SUM(arrivals) AS arrivals, SUM(first_arrivals) AS first_arrivals, MIN(day) AS first_day, MAX(day) AS last_day '
            . 'FROM arrivals GROUP BY source, device')->fetchAll();
        foreach ($rows as $row) {
            $source = (string) $row['source'];
            $sources[$source] ??= ['source' => $source, 'arrivals' => 0, 'firstArrivals' => 0, 'devices' => array_fill_keys(self::DEVICES, 0),
                'firstDay' => (string) $row['first_day'], 'lastDay' => (string) $row['last_day'], 'recent' => []];
            $entry = &$sources[$source];
            $entry['arrivals'] += (int) $row['arrivals'];
            $entry['firstArrivals'] += (int) $row['first_arrivals'];
            if (isset($entry['devices'][$row['device']])) $entry['devices'][$row['device']] += (int) $row['arrivals'];
            $entry['firstDay'] = min($entry['firstDay'], (string) $row['first_day']);
            $entry['lastDay'] = max($entry['lastDay'], (string) $row['last_day']);
            unset($entry);
        }
        $recent = Db::run('SELECT source, day, SUM(arrivals) AS arrivals FROM arrivals WHERE day >= :from GROUP BY source, day ORDER BY day',
            ['from' => $from])->fetchAll();
        foreach ($recent as $row) {
            if (isset($sources[$row['source']])) $sources[$row['source']]['recent'][] = ['day' => (string) $row['day'], 'arrivals' => (int) $row['arrivals']];
        }
        $list = array_values($sources);
        usort($list, static fn(array $a, array $b): int => [$b['arrivals'], $a['source']] <=> [$a['arrivals'], $b['source']]);
        Http::json(200, ['days' => $days, 'from' => $from, 'to' => $to, 'sources' => $list]);
    }
}
