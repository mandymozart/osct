<?php

declare(strict_types=1);

/**
 * A video file's own numbers – the picture's width and height and the duration – read from its container header in
 * plain PHP (no ffmpeg): the boxes of an mp4 / mov (moov › mvhd for the duration, the video track's trak › tkhd for the
 * size) and the EBML elements of a webm / mkv (Segment › Info for the duration, Tracks › the video TrackEntry for the
 * size). Only the headers are read – the media data is skipped by its size –, and whatever cannot be read is null: an
 * unknown or damaged file never fails an upload.
 */
final class VideoInfo
{
    /** Boxes whose children hold what is read; every other box is skipped */
    private const MP4_CONTAINERS = ['moov', 'mdia'];
    /** Deeper than any file this reads needs: a crafted file cannot recurse without end */
    private const MAX_DEPTH = 8;

    /** EBML ids (with their length marker bits, as written) */
    private const EBML_SEGMENT = 0x18538067;
    private const EBML_INFO = 0x1549A966;
    private const EBML_TIMECODE_SCALE = 0x2AD7B1;
    private const EBML_DURATION = 0x4489;
    private const EBML_TRACKS = 0x1654AE6B;
    private const EBML_TRACK_ENTRY = 0xAE;
    private const EBML_TRACK_TYPE = 0x83;
    private const EBML_VIDEO = 0xE0;
    private const EBML_PIXEL_WIDTH = 0xB0;
    private const EBML_PIXEL_HEIGHT = 0xBA;
    private const EBML_CLUSTER = 0x1F43B675;

    /** @return array{width: ?int, height: ?int, durationMs: ?int} */
    public static function read(string $data, string $extension): array
    {
        $info = match (strtolower($extension)) {
            'mp4', 'mov' => self::mp4($data),
            'webm', 'mkv' => self::ebml($data),
            default => [],
        };
        $width = $info['width'] ?? null;
        $height = $info['height'] ?? null;
        $duration = $info['durationMs'] ?? null;
        // A size is a pair or nothing; a duration of 0 is an unknown one (a fragmented mp4, a live webm)
        if (!is_int($width) || !is_int($height) || $width <= 0 || $height <= 0) $width = $height = null;
        if (!is_int($duration) || $duration <= 0) $duration = null;
        return ['width' => $width, 'height' => $height, 'durationMs' => $duration];
    }

    // ── mp4 / mov (ISO base media file format) ───────────────────────────────────────────────────

    /** @return array<string, int> */
    private static function mp4(string $data): array
    {
        $found = [];
        $none = null;
        self::boxes($data, 0, strlen($data), 0, $found, $none);
        $result = [];
        if (isset($found['timescale'], $found['duration']) && $found['timescale'] > 0) {
            $result['durationMs'] = (int) round($found['duration'] * 1000 / $found['timescale']);
        }
        // the video track's size; without a `vide` handler the first track with a picture
        $size = $found['video'] ?? $found['sized'] ?? null;
        if ($size) [$result['width'], $result['height']] = $size;
        return $result;
    }

    /**
     * Walks the boxes in [$start, $end). `$track` collects one trak's tkhd size and handler type: a video track is told
     * from a sound track (whose tkhd says 0 × 0) only once its whole trak is read.
     * @param array<string, mixed> $found
     * @param array<string, mixed>|null $track
     */
    private static function boxes(string $data, int $start, int $end, int $depth, array &$found, ?array &$track): void
    {
        if ($depth > self::MAX_DEPTH) return;
        $at = $start;
        while ($at + 8 <= $end) {
            $size = self::uint($data, $at, 4);
            $type = substr($data, $at + 4, 4);
            $header = 8;
            if ($size === 1) {
                if ($at + 16 > $end) return;
                $size = self::uint($data, $at + 8, 8);
                $header = 16;
            } elseif ($size === 0) {
                $size = $end - $at;
            }
            // a box running past its parent (a truncated file): read what is there
            if ($size < $header || $at + $size > $end) $size = $end - $at;
            $body = $at + $header;
            $bodyEnd = $at + $size;
            if ($type === 'trak') {
                $current = [];
                self::boxes($data, $body, $bodyEnd, $depth + 1, $found, $current);
                if (isset($current['size'])) {
                    if (($current['handler'] ?? null) === 'vide') $found['video'] ??= $current['size'];
                    if ($current['size'][0] > 0 && $current['size'][1] > 0) $found['sized'] ??= $current['size'];
                }
            } elseif (in_array($type, self::MP4_CONTAINERS, true)) {
                self::boxes($data, $body, $bodyEnd, $depth + 1, $found, $track);
            } elseif ($type === 'mvhd') {
                self::mvhd($data, $body, $bodyEnd, $found);
            } elseif ($type === 'tkhd' && $track !== null) {
                $picture = self::tkhd($data, $body, $bodyEnd);
                if ($picture) $track['size'] = $picture;
            } elseif ($type === 'hdlr' && $track !== null && $body + 12 <= $bodyEnd) {
                $track['handler'] = substr($data, $body + 8, 4);
            }
            $at += $size;
        }
    }

    /** @param array<string, mixed> $found */
    private static function mvhd(string $data, int $body, int $end, array &$found): void
    {
        $version = ord($data[$body] ?? "\0");
        // version 1: 64-bit creation and modification times and duration
        [$offset, $durationBytes] = $version === 1 ? [20, 8] : [12, 4];
        if ($body + $offset + 4 + $durationBytes > $end) return;
        $found['timescale'] ??= self::uint($data, $body + $offset, 4);
        $found['duration'] ??= self::uint($data, $body + $offset + 4, $durationBytes);
    }

    /**
     * The track's presentation size (16.16 fixed point at the end of the tkhd), swapped when its matrix turns the
     * picture a quarter (a phone's portrait video is stored landscape) – as a browser's `videoWidth` reports it.
     * @return array{0: int, 1: int}|null
     */
    private static function tkhd(string $data, int $body, int $end): ?array
    {
        $version = ord($data[$body] ?? "\0");
        $matrix = $body + ($version === 1 ? 52 : 40);
        $size = $matrix + 36;
        if ($size + 8 > $end) return null;
        $width = (int) round(self::uint($data, $size, 4) / 65536);
        $height = (int) round(self::uint($data, $size + 4, 4) / 65536);
        $a = self::uint($data, $matrix, 4);
        $d = self::uint($data, $matrix + 16, 4);
        return $a === 0 && $d === 0 ? [$height, $width] : [$width, $height];
    }

    // ── webm / mkv (EBML / Matroska) ─────────────────────────────────────────────────────────────

    /** @return array<string, int> */
    private static function ebml(string $data): array
    {
        $length = strlen($data);
        $result = [];
        $at = 0;
        while ($at < $length) {
            $element = self::element($data, $at, $length);
            if (!$element) break;
            if ($element[0] === self::EBML_SEGMENT) {
                self::segment($data, $element[1], $element[2], $result);
                break;
            }
            $at = $element[2];
        }
        return $result;
    }

    /** @param array<string, int> $result */
    private static function segment(string $data, int $at, int $end, array &$result): void
    {
        $scale = 1000000; // TimecodeScale's default: 1 ms in ns
        $duration = null;
        $haveInfo = $haveTracks = false;
        while ($at < $end && !($haveInfo && $haveTracks)) {
            $element = self::element($data, $at, $end);
            if (!$element) break;
            [$id, $body, $bodyEnd, $unknown] = $element;
            // the media data: a file written for playback has Info and Tracks before it, and a cluster of unknown size
            // cannot be skipped
            if ($id === self::EBML_CLUSTER && $unknown) break;
            if ($id === self::EBML_INFO) {
                $haveInfo = true;
                foreach (self::children($data, $body, $bodyEnd) as [$child, $from, $to]) {
                    if ($child === self::EBML_TIMECODE_SCALE) $scale = self::uint($data, $from, $to - $from) ?: $scale;
                    if ($child === self::EBML_DURATION) $duration = self::float($data, $from, $to - $from);
                }
            } elseif ($id === self::EBML_TRACKS) {
                $haveTracks = true;
                foreach (self::children($data, $body, $bodyEnd) as [$child, $from, $to]) {
                    $picture = $child === self::EBML_TRACK_ENTRY ? self::videoTrack($data, $from, $to) : null;
                    if (!$picture) continue;
                    [$result['width'], $result['height']] = $picture;
                    break;
                }
            }
            $at = $bodyEnd;
        }
        if ($duration !== null && is_finite($duration)) $result['durationMs'] = (int) round($duration * $scale / 1000000);
    }

    /** @return array{0: int, 1: int}|null the pixel size of a video track entry (TrackType 1) */
    private static function videoTrack(string $data, int $at, int $end): ?array
    {
        $type = null;
        $size = null;
        foreach (self::children($data, $at, $end) as [$id, $from, $to]) {
            if ($id === self::EBML_TRACK_TYPE) $type = self::uint($data, $from, $to - $from);
            if ($id !== self::EBML_VIDEO) continue;
            $width = $height = 0;
            foreach (self::children($data, $from, $to) as [$child, $f, $t]) {
                if ($child === self::EBML_PIXEL_WIDTH) $width = self::uint($data, $f, $t - $f);
                if ($child === self::EBML_PIXEL_HEIGHT) $height = self::uint($data, $f, $t - $f);
            }
            $size = [$width, $height];
        }
        return $type === 1 ? $size : null;
    }

    /** @return array<int, array{0: int, 1: int, 2: int}> the child elements in [$at, $end): id, body start, body end */
    private static function children(string $data, int $at, int $end): array
    {
        $children = [];
        while ($at < $end) {
            $element = self::element($data, $at, $end);
            if (!$element) break;
            $children[] = [$element[0], $element[1], $element[2]];
            $at = $element[2];
        }
        return $children;
    }

    /**
     * The element at $at: its id, where its body starts and ends (clamped to $end – an unknown size runs to $end), and
     * whether its size was unknown. Null when no element can be read there.
     * @return array{0: int, 1: int, 2: int, 3: bool}|null
     */
    private static function element(string $data, int $at, int $end): ?array
    {
        $id = self::vint($data, $at, $end, true);
        if (!$id) return null;
        $size = self::vint($data, $at + $id[1], $end, false);
        if (!$size) return null;
        $body = $at + $id[1] + $size[1];
        $unknown = $size[0] === -1;
        return [$id[0], $body, $unknown ? $end : min($end, $body + $size[0]), $unknown];
    }

    /**
     * An EBML variable-size integer at $at: its value and its length in bytes. An id keeps its marker bits (ids are
     * written that way); a size drops them, and a size of all ones is unknown (-1).
     * @return array{0: int, 1: int}|null
     */
    private static function vint(string $data, int $at, int $end, bool $isId): ?array
    {
        if ($at >= $end) return null;
        $first = ord($data[$at]);
        $length = 1;
        while ($length <= 8 && !($first & (0x80 >> ($length - 1)))) $length++;
        if ($length > ($isId ? 4 : 8) || $at + $length > $end) return null;
        $value = $isId ? $first : $first & (0xFF >> $length);
        $allOnes = $value === (0xFF >> $length);
        for ($i = 1; $i < $length; $i++) {
            $byte = ord($data[$at + $i]);
            $value = ($value << 8) | $byte;
            $allOnes = $allOnes && $byte === 0xFF;
        }
        return !$isId && $allOnes ? [-1, $length] : [$value, $length];
    }

    // ── bytes ────────────────────────────────────────────────────────────────────────────────────

    /** A big-endian unsigned integer of 1–8 bytes, 0 when it lies outside the data */
    private static function uint(string $data, int $at, int $bytes): int
    {
        if ($bytes < 1 || $bytes > 8 || $at < 0 || $at + $bytes > strlen($data)) return 0;
        $value = 0;
        for ($i = 0; $i < $bytes; $i++) $value = ($value << 8) | ord($data[$at + $i]);
        return $value;
    }

    /** A big-endian IEEE float of 4 or 8 bytes (the EBML float sizes), null otherwise */
    private static function float(string $data, int $at, int $bytes): ?float
    {
        if ($at < 0 || $at + $bytes > strlen($data)) return null;
        if ($bytes === 4) return unpack('G', substr($data, $at, 4))[1];
        if ($bytes === 8) return unpack('E', substr($data, $at, 8))[1];
        return null;
    }
}
