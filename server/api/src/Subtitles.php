<?php
declare(strict_types=1);

/**
 * The subtitle files of an experience's videos (shared/types/subtitles.ts `SubtitleData`), read from the files' names: a
 * WebVTT file `<video name>.<language>.vtt` belongs to the video of that name – nobody fills the pairing in.
 *
 * Two places hold files: the imported build (`files.json`: content paths – a subtitle file lies in its video's folder,
 * as the content build pairs them) and the Library (uploads, named as they were uploaded – a Library subtitle file
 * belongs to every video of its name, uploaded or imported, and replaces an imported track of the same language).
 * The list is part of the assembled version (`ContentVersion::assemble`), so the stage and a publish carry it.
 */
final class Subtitles
{
    public const KIND = 'subtitles';
    private const VIDEO = '/\.(mp4|webm|mov|m4v)$/i';
    /** `<video name>.<language>.vtt` – the language as `SUBTITLE_LANGUAGE_PATTERN` (shared/types/subtitles.ts) */
    private const FILE = '/^(.+)\.([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.vtt$/i';

    /**
     * @param stdClass $files files.json of the imported build (content paths)
     * @param string $base the assets base content paths resolve below ('' = none)
     * @return list<stdClass> { media, tracks: { language: file } } by media, the languages in order
     */
    public static function of(string $experienceId, stdClass $files, string $base): array
    {
        /** @var array<string, array{name: string, folder: ?string}> $videos by the file as the nodes name it */
        $videos = [];
        /** @var list<array{video: string, language: string, folder: ?string, file: string}> $tracks imported first */
        $tracks = [];
        $add = static function (string $name, string $file, ?string $folder) use (&$videos, &$tracks): void {
            if (preg_match(self::FILE, $name, $match)) {
                $tracks[] = ['video' => $match[1], 'language' => $match[2], 'folder' => $folder, 'file' => $file];
            } elseif (preg_match(self::VIDEO, $name)) {
                $videos[$file] = ['name' => (string) preg_replace(self::VIDEO, '', $name), 'folder' => $folder];
            }
        };
        foreach (array_keys(get_object_vars($files)) as $path) {
            $path = (string) $path;
            $slash = strrpos($path, '/');
            $add($slash === false ? $path : substr($path, $slash + 1), $base . $path, $slash === false ? '' : substr($path, 0, $slash + 1));
        }
        $rows = Db::run('SELECT name, url FROM assets WHERE experience_id = :experience AND status = :status AND kind IN (:video, :subtitles) ORDER BY created_at',
            ['experience' => $experienceId, 'status' => 'active', 'video' => 'video', 'subtitles' => self::KIND])->fetchAll();
        foreach ($rows as $row) $add((string) $row['name'], (string) $row['url'], null);

        $result = [];
        foreach ($videos as $media => $video) {
            $found = [];
            foreach ($tracks as $track) {
                if ($track['video'] !== $video['name']) continue;
                // An imported subtitle file lies beside its video; a Library one belongs to every video of its name
                if ($track['folder'] !== null && $track['folder'] !== $video['folder']) continue;
                $found[$track['language']] = $track['file'];
            }
            if (!$found) continue;
            ksort($found);
            $result[$media] = (object) ['media' => $media, 'tracks' => (object) $found];
        }
        ksort($result);
        return array_values($result);
    }
}
