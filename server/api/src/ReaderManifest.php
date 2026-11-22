<?php
declare(strict_types=1);

/**
 * The web app manifest of one experience (#343, docs/content-cdn.md "The installed app"): every experience is at its own
 * path in the reader (`/<id>/`), and installing the app from there installs that experience – `id`, `start_url` and
 * `scope` are `/<id>/`. The reader links it from index.html for every experience but the build's default, whose manifest
 * is the build's own (`/manifest.webmanifest`, id and start `/` – the app installed before #343; its `/` opens the
 * experience opened last). Name and description come from the experience once it has been published – a draft's title
 * is not given away –, else the id stands for the name. Colours and icons are the build's (client/vite.config.js `pwa()`).
 *
 *   GET /experiences/{id}/manifest.webmanifest   no sign-in; 404 not-found for one of the site's own paths
 */
final class ReaderManifest
{
    /** The build manifest's icons (client/vite.config.js), absolute so they resolve from this URL */
    private const ICONS = [
        ['src' => '/assets/icons/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => '/assets/icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => '/assets/icons/icon-maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
    ];

    public static function get(string $experienceId): never
    {
        if (Experiences::isReserved($experienceId)) throw new ApiError(404, 'not-found', 'No such experience.');
        Http::json(200, self::manifest($experienceId));
    }

    /** @return array<string, mixed> */
    public static function manifest(string $experienceId): array
    {
        $path = '/' . rawurlencode($experienceId) . '/';
        $title = $experienceId;
        $author = null;
        $row = Db::hasTable('experiences') ? Db::one('SELECT title, experience_json FROM experiences WHERE id = :id', ['id' => $experienceId]) : null;
        $published = $row !== null && Db::value('SELECT 1 FROM experience_versions WHERE experience_id = :id LIMIT 1', ['id' => $experienceId]) !== null;
        if ($published) {
            $title = (string) $row['title'];
            $experience = Editor::decode($row['experience_json']);
            $book = is_object($experience) ? ($experience->book ?? null) : null;
            if (is_object($book) && is_string($book->author ?? null) && $book->author !== '') $author = $book->author;
        }
        return [
            'id' => $path,
            'name' => $title,
            'short_name' => $title,
            'description' => $author !== null ? "Augmented reality companion to $author's book $title." : "Augmented reality companion to $title.",
            'lang' => 'en',
            'start_url' => $path,
            'scope' => $path,
            'display' => 'standalone',
            'orientation' => 'portrait',
            'background_color' => '#000000',
            'theme_color' => '#000000',
            'icons' => self::ICONS,
        ];
    }
}
