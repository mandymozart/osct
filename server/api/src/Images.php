<?php
declare(strict_types=1);

/**
 * The image rule at upload (#298, docs/server.md "The image rule at upload", shared/api/images.ts): an uploaded picture
 * (jpg, png, webp) is decoded, turned upright by its EXIF orientation, scaled down to the longest side of its use
 * (`Assets::IMAGE_MAX_SIDE`) and encoded as WebP (`Assets::IMAGE_WEBP_QUALITY`, lossless when it has transparency).
 * Re-encoding drops every piece of metadata (EXIF, XMP, ICC). The original is not kept.
 *
 * Needs GD with WebP (the Dockerfile builds it). Without it – or for a file GD cannot read, an animated PNG / WebP, or a
 * WebP that already keeps the rule – `convert` answers null and the upload stores the file as it came.
 * An image above `Assets::IMAGE_MAX_PIXELS` is refused before anything decodes it (`check`).
 */
final class Images
{
    /** The memory a conversion may take: a 50 MP picture is ~200 MB as GD holds it, plus the scaled copy */
    private const MEMORY = '768M';

    /** GD can read the three formats and write WebP (lossy and lossless) */
    public static function available(): bool
    {
        if (!function_exists('imagewebp') || !function_exists('imagecreatefromstring') || !defined('IMG_WEBP_LOSSLESS')) return false;
        $info = gd_info();
        return !empty($info['WebP Support']) && !empty($info['JPEG Support']) && !empty($info['PNG Support']);
    }

    /** 413 `image-too-large` for a picture above IMAGE_MAX_PIXELS – read from its header, nothing decoded */
    public static function check(string $data): void
    {
        $info = @getimagesizefromstring($data);
        if (!$info) return;
        $pixels = (int) $info[0] * (int) $info[1];
        if ($pixels > Assets::IMAGE_MAX_PIXELS) {
            throw new ApiError(413, 'image-too-large', sprintf('The picture has %d × %d px – at most %d MP. Scale it down before uploading.',
                $info[0], $info[1], intdiv(Assets::IMAGE_MAX_PIXELS, 1_000_000)));
        }
    }

    /**
     * The picture under the rule for `$fit`, or null when it stays as it came (no GD, unreadable, animated, a WebP
     * within the size).
     * @return array{data: string, width: int, height: int, lossless: bool}|null
     */
    public static function convert(string $data, string $extension, string $fit = 'default'): ?array
    {
        if (!self::available() || !in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true) || self::animated($data)) return null;
        $info = @getimagesizefromstring($data);
        if (!$info) return null;
        $max = Assets::IMAGE_MAX_SIDE[$fit] ?? Assets::IMAGE_MAX_SIDE['default'];
        $orientation = self::orientation($data);
        $turned = $orientation >= 5;
        [$width, $height] = $turned ? [(int) $info[1], (int) $info[0]] : [(int) $info[0], (int) $info[1]];
        $scale = min(1.0, $max / max($width, $height, 1));
        // A WebP that keeps the rule stays as it is: a second lossy pass only costs quality
        if (($info[2] ?? null) === IMAGETYPE_WEBP && $scale >= 1.0 && $orientation <= 1) return null;

        $memory = ini_get('memory_limit');
        if ($memory !== false && $memory !== '-1' && self::bytes($memory) < self::bytes(self::MEMORY)) ini_set('memory_limit', self::MEMORY);
        $image = @imagecreatefromstring($data);
        if ($image === false) return null;
        try {
            if (!imageistruecolor($image)) imagepalettetotruecolor($image);
            $image = self::upright($image, $orientation);
            if ($scale < 1.0) {
                $target = [max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale))];
                $scaled = imagecreatetruecolor($target[0], $target[1]);
                imagealphablending($scaled, false);
                imagesavealpha($scaled, true);
                imagefill($scaled, 0, 0, imagecolorallocatealpha($scaled, 0, 0, 0, 127));
                imagecopyresampled($scaled, $image, 0, 0, 0, 0, $target[0], $target[1], imagesx($image), imagesy($image));
                imagedestroy($image);
                $image = $scaled;
            }
            $lossless = self::mayHaveAlpha($data, (int) ($info[2] ?? 0)) && self::transparent($image);
            imagealphablending($image, false);
            imagesavealpha($image, true);
            ob_start();
            $written = imagewebp($image, null, $lossless ? IMG_WEBP_LOSSLESS : Assets::IMAGE_WEBP_QUALITY);
            $webp = (string) ob_get_clean();
            if (!$written || $webp === '') return null;
            return ['data' => $webp, 'width' => imagesx($image), 'height' => imagesy($image), 'lossless' => $lossless];
        } finally {
            imagedestroy($image);
        }
    }

    /** An animated PNG (`acTL` before the image data) or WebP (`ANIM`): GD would keep only the first frame */
    private static function animated(string $data): bool
    {
        if (str_starts_with($data, "\x89PNG")) {
            $idat = strpos($data, 'IDAT');
            $actl = strpos($data, 'acTL');
            return $actl !== false && ($idat === false || $actl < $idat);
        }
        return str_starts_with($data, 'RIFF') && substr($data, 8, 4) === 'WEBP' && str_contains(substr($data, 12, 64), 'ANIM');
    }

    /** A format and header that can carry transparency: PNG with an alpha channel or `tRNS`, WebP with alpha or lossless */
    private static function mayHaveAlpha(string $data, int $type): bool
    {
        if ($type === IMAGETYPE_PNG) {
            $colour = ord($data[25] ?? "\0");
            $idat = strpos($data, 'IDAT');
            $trns = strpos($data, 'tRNS');
            return $colour === 4 || $colour === 6 || ($trns !== false && ($idat === false || $trns < $idat));
        }
        if ($type === IMAGETYPE_WEBP) {
            $chunk = substr($data, 12, 4);
            if ($chunk === 'VP8L') return true;
            return $chunk === 'VP8X' && (ord($data[20] ?? "\0") & 0x10) !== 0;
        }
        return false;
    }

    /** Any pixel not fully opaque (GD: alpha 0 = opaque … 127 = transparent) */
    private static function transparent(GdImage $image): bool
    {
        $width = imagesx($image);
        $height = imagesy($image);
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                if ((imagecolorat($image, $x, $y) >> 24) & 0x7F) return true;
            }
        }
        return false;
    }

    /** The picture as it is meant to be seen: EXIF orientation 2–8 undone (imagerotate turns counter-clockwise) */
    private static function upright(GdImage $image, int $orientation): GdImage
    {
        $rotate = static function (GdImage $image, int $angle): GdImage {
            $turned = imagerotate($image, $angle, 0);
            if ($turned === false) return $image;
            imagedestroy($image);
            return $turned;
        };
        switch ($orientation) {
            case 2: imageflip($image, IMG_FLIP_HORIZONTAL); break;
            case 3: $image = $rotate($image, 180); break;
            case 4: imageflip($image, IMG_FLIP_VERTICAL); break;
            case 5: $image = $rotate($image, 270); imageflip($image, IMG_FLIP_HORIZONTAL); break; // transpose
            case 6: $image = $rotate($image, 270); break; // 90° clockwise
            case 7: $image = $rotate($image, 90); imageflip($image, IMG_FLIP_HORIZONTAL); break; // transverse
            case 8: $image = $rotate($image, 90); break; // 90° counter-clockwise
        }
        return $image;
    }

    /**
     * A JPEG's EXIF orientation (1 = upright; 0 when it names none) – read from the APP1 segment by hand, so the exif
     * extension is not needed
     */
    public static function orientation(string $data): int
    {
        if (!str_starts_with($data, "\xFF\xD8")) return 0;
        $offset = 2;
        $length = strlen($data);
        while ($offset + 4 <= $length && $data[$offset] === "\xFF") {
            $marker = ord($data[$offset + 1]);
            if ($marker === 0xDA || $marker === 0xD9) break; // the image data: no metadata after it
            $size = unpack('n', substr($data, $offset + 2, 2))[1];
            if ($marker === 0xE1 && substr($data, $offset + 4, 6) === "Exif\0\0") {
                return self::tiffOrientation(substr($data, $offset + 10, $size - 8));
            }
            $offset += 2 + $size;
        }
        return 0;
    }

    /** The orientation tag (0x0112) of a TIFF header's first directory */
    private static function tiffOrientation(string $tiff): int
    {
        $order = substr($tiff, 0, 2);
        if ($order !== 'II' && $order !== 'MM') return 0;
        $short = $order === 'II' ? 'v' : 'n';
        $long = $order === 'II' ? 'V' : 'N';
        $read = static function (string $format, int $at, int $bytes) use ($tiff): ?int {
            $chunk = substr($tiff, $at, $bytes);
            return strlen($chunk) === $bytes ? unpack($format, $chunk)[1] : null;
        };
        $directory = $read($long, 4, 4);
        $count = $directory === null ? null : $read($short, $directory, 2);
        if ($count === null) return 0;
        for ($i = 0; $i < $count; $i++) {
            $entry = $directory + 2 + $i * 12;
            if ($read($short, $entry, 2) !== 0x0112) continue;
            $value = $read($short, $entry + 8, 2);
            return $value !== null && $value >= 1 && $value <= 8 ? $value : 0;
        }
        return 0;
    }

    /** A php.ini size (`128M`) in bytes */
    private static function bytes(string $size): int
    {
        $size = trim($size);
        $number = (int) $size;
        return match (strtolower(substr($size, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
