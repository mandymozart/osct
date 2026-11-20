<?php
declare(strict_types=1);

/**
 * The reading side of an experience in the editor (docs/server.md "Texts"): an entry's fields – its title, its text (Markdown
 * with the experience's variables, shared/text/entry-text.ts), author, image, link, tags, category, its scene and surface –, and the
 * experience's title and its printed book's author and publisher. Every write reads the row, changes it and writes it
 * back in one transaction with the row locked (`Db::forUpdate()`), touches the experience and records a change with the row
 * before and after. An AI connection's token may write here like the person – these are the experience's texts, not the
 * account; publishing stays the person's (`Experiences::publish`).
 *
 * The checks are the content build's (scripts/src/lib/schema.ts): the categories, a title and a scene, a link that is
 * http(s) – and an image from the experience's Library (an uploaded image or a file of the import).
 */
final class ExperienceTexts
{
    /** The fields of an entry a PUT may change */
    private const ENTRY_FIELDS = ['title', 'body', 'author', 'image', 'imageLevels', 'caption', 'media', 'tags', 'category', 'scene', 'surface'];
    /** At most this many tags, each at most TAG_MAX_LENGTH characters (shared/api/rules.ts `ENTRY_TAGS`) */
    public const TAGS_MAX = 32;
    public const TAG_MAX_LENGTH = 64;
    /** A text field's limit in characters (shared/api/rules.ts `TEXT_MAX_LENGTH`): a title, an author */
    public const TEXT_MAX_LENGTH = 500;
    /** An entry's body, in characters (shared/api/rules.ts `BODY_MAX_LENGTH`) */
    public const BODY_MAX_LENGTH = 100000;

    /**
     * GET /editor/experiences/{id}/entries → { entries: [EntryData without its target (its `scene` and `surface` among the
     * fields), target: { id, imageSrc } | null] } in the experience's order: every field as the content holds it (an image's path
     * or URL as written, not resolved)
     */
    public static function entries(string $experienceId): never
    {
        Editor::user();
        Experiences::exists($experienceId);
        $params = ['experience' => $experienceId];
        $targets = [];
        foreach (Db::run('SELECT id, entry_id, image_src FROM targets WHERE experience_id = :experience', $params)->fetchAll() as $row) {
            $targets[$row['entry_id']] = ['id' => $row['id'], 'imageSrc' => $row['image_src']];
        }
        $entries = [];
        foreach (Db::run('SELECT id, scene_id, data_json FROM entries WHERE experience_id = :experience ORDER BY position', $params)->fetchAll() as $row) {
            $entry = ContentVersion::withScene(Editor::decode($row['data_json']), (string) $row['scene_id']);
            $entry->target = $targets[$row['id']] ?? null;
            $entries[] = $entry;
        }
        Http::json(200, ['entries' => $entries]);
    }

    /**
     * PUT /editor/experiences/{id}/entries/{eid} { title?, body?, author?, image?, caption?, media?, tags?, category?, scene?,
     * surface?, imageLevels? } → 200 { entry, scene, previousScene }: the fields sent change, `null` removes an optional one
     * (author, image, caption – the line under the picture, plain text, #289 –, media, surface, imageLevels). `imageLevels`
     * (#331, schema 4.3): the picture in several sizes, `[{ level: 512 | 1024 | 2048, src }]`, each a picture of the
     * Library; removing the image removes its levels. `scene` moves the entry to that
     * scene (its surface goes unless the new scene has one of that id or `surface` names one). 400 `invalid-entry`,
     * `unknown-scene`, 404.
     */
    public static function putEntry(string $experienceId, string $entryId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $body = Editor::body();
        $unknown = array_diff(array_keys(get_object_vars($body)), self::ENTRY_FIELDS);
        if ($unknown) throw new ApiError(400, 'invalid-entry', 'Unknown field ' . implode(', ', $unknown) . ' – send ' . implode(', ', self::ENTRY_FIELDS) . '.');
        if (!get_object_vars($body)) throw new ApiError(400, 'invalid-entry', 'Send at least one of ' . implode(', ', self::ENTRY_FIELDS) . '.');
        [$entry, $sceneId, $previous] = Db::transaction(static function () use ($experienceId, $entryId, $body, $user) {
            $params = ['experience' => $experienceId, 'id' => $entryId];
            $row = Db::one('SELECT * FROM entries WHERE experience_id = :experience AND id = :id' . Db::forUpdate(), $params);
            if (!$row) throw new ApiError(404, 'not-found', 'No such entry.');
            $entry = Editor::decode($row['data_json']);
            if (property_exists($body, 'title')) $entry->title = self::text($body->title, 'title', true);
            if (property_exists($body, 'body')) {
                if (!is_string($body->body)) throw new ApiError(400, 'invalid-entry', 'body must be a string (Markdown).');
                if (mb_strlen($body->body) > self::BODY_MAX_LENGTH) throw new ApiError(400, 'invalid-entry', 'body is longer than ' . self::BODY_MAX_LENGTH . ' characters.');
                $entry->body = str_replace("\r\n", "\n", $body->body);
            }
            if (property_exists($body, 'author')) self::optional($entry, 'author', $body->author === null ? null : self::text($body->author, 'author', false));
            if (property_exists($body, 'image')) {
                $image = $body->image === null ? null : self::text($body->image, 'image', false);
                if ($image !== null && $image !== ($entry->image ?? null) && !Assets::isExperienceImage($experienceId, $image)) {
                    throw new ApiError(400, 'invalid-entry', 'image must be a picture of the experience\'s Library – upload it first.');
                }
                self::optional($entry, 'image', $image);
                if ($image === null) unset($entry->imageLevels);
            }
            if (property_exists($body, 'imageLevels')) {
                if ($body->imageLevels === null || $body->imageLevels === []) unset($entry->imageLevels);
                else {
                    if (!isset($entry->image)) throw new ApiError(400, 'invalid-entry', 'imageLevels need the entry\'s image – set image first.');
                    $levels = Editor::mediaLevels($body->imageLevels, 'image', 'imageLevels', 'invalid-entry');
                    $known = array_map(static fn(stdClass $level) => $level->src, $entry->imageLevels ?? []);
                    foreach ($levels as $level) {
                        if (!in_array($level->src, $known, true) && !Assets::isExperienceImage($experienceId, $level->src)) {
                            throw new ApiError(400, 'invalid-entry', "imageLevels: {$level->src} is not a picture of the experience's Library – upload it first.");
                        }
                    }
                    $entry->imageLevels = $levels;
                }
            }
            if (property_exists($body, 'caption')) self::optional($entry, 'caption', $body->caption === null ? null : self::text($body->caption, 'caption', false));
            if (property_exists($body, 'media')) {
                $media = $body->media === null ? null : self::text($body->media, 'media', false);
                if ($media !== null && !self::isLinkUrl($media)) throw new ApiError(400, 'invalid-entry', 'media must be an http(s) link.');
                self::optional($entry, 'media', $media);
            }
            if (property_exists($body, 'tags')) $entry->tags = self::tags($body->tags);
            if (property_exists($body, 'category')) {
                if (!is_string($body->category) || !in_array($body->category, Editor::ENTRY_CATEGORIES, true)) {
                    throw new ApiError(400, 'invalid-entry', 'category must be one of ' . implode(', ', Editor::ENTRY_CATEGORIES) . '.');
                }
                $entry->category = $body->category;
            }
            $sceneId = (string) $row['scene_id'];
            // The entry's scene and surface: `scene` moves it, `surface` (null: none) places it on one of its scene's surfaces
            $hasScene = property_exists($body, 'scene');
            $hasSurface = property_exists($body, 'surface');
            if ($hasScene && $body->scene === null) throw new ApiError(400, 'invalid-entry', 'scene must be a scene of the experience – an entry always has one.');
            if ($hasScene || $hasSurface) {
                $context = Scenes::context($experienceId);
                $scene = $hasScene ? $body->scene : $sceneId;
                $surface = $hasSurface ? $body->surface : ($entry->surface ?? null);
                // A surface kept from before goes when the new scene has no such surface
                if (!$hasSurface && is_string($surface) && !in_array($surface, Scenes::surfaceIds($context['data'][(string) $scene] ?? new stdClass()), true)) $surface = null;
                [$sceneId, $surface] = Experiences::sceneOf($context, $scene, $surface);
                if ($surface === null) unset($entry->surface);
                else $entry->surface = $surface;
            }
            unset($entry->page, $entry->scene);
            $json = Editor::encode($entry);
            Db::run('UPDATE entries SET scene_id = :scene, category = :category, title = :title, data_json = :data WHERE experience_id = :experience AND id = :id',
                $params + ['scene' => $sceneId, 'category' => $entry->category, 'title' => $entry->title, 'data' => $json]);
            Experiences::touchExperience($experienceId);
            Experiences::recordChange($experienceId, $user, 'entry', $entryId, $row['data_json'], $json);
            return [$entry, $sceneId, (string) $row['scene_id']];
        });
        Http::json(200, ['entry' => ContentVersion::withScene($entry, $sceneId), 'scene' => $sceneId, 'previousScene' => $previous]);
    }

    /**
     * PUT /editor/experiences/{id} { title?, book?: { author?, publisher? } | null, recognition?: "original" | "prepared" | null }
     * → 200 { experience }: the experience's
     * title – the splash, the home page and the onboarding show it – and the printed book it accompanies (#320): `book`
     * changes the fields sent (`publisher: null` or "" removes it), `book: null` removes the printed book, a new one needs
     * its `author`. `recognition` (#306, schema 4.2): how the reader gets its targets' recognition data – only "prepared"
     * is stored, "original" or null is the default (none). 400 `invalid-experience`.
     */
    public static function putExperience(string $experienceId): never
    {
        $user = Editor::user();
        Experiences::exists($experienceId);
        $body = Editor::body();
        $unknown = array_diff(array_keys(get_object_vars($body)), ['title', 'book', 'recognition']);
        if ($unknown) throw new ApiError(400, 'invalid-experience', 'Unknown field ' . implode(', ', $unknown) . ' – send title, book or recognition.');
        if (!get_object_vars($body)) throw new ApiError(400, 'invalid-experience', 'Send title, book or recognition.');
        if (property_exists($body, 'recognition') && !in_array($body->recognition, [null, ...Experiences::RECOGNITION_MODES], true)) {
            throw new ApiError(400, 'invalid-experience', 'recognition must be "original", "prepared" or null.');
        }
        $bookBody = $body->book ?? null;
        if (property_exists($body, 'book') && $bookBody !== null) {
            if (!$bookBody instanceof stdClass) throw new ApiError(400, 'invalid-experience', 'book must be an object { author?, publisher? } or null.');
            $unknown = array_diff(array_keys(get_object_vars($bookBody)), ['author', 'publisher']);
            if ($unknown) throw new ApiError(400, 'invalid-experience', 'Unknown field book.' . implode(', book.', $unknown) . ' – send book.author or book.publisher.');
        }
        $experience = Db::transaction(static function () use ($experienceId, $body, $bookBody, $user) {
            $row = Experiences::experienceRow($experienceId, true);
            $experience = Editor::decode($row['experience_json']);
            if (property_exists($body, 'title')) $experience->title = self::text($body->title, 'title', true, 'invalid-experience');
            if (property_exists($body, 'book')) $experience = self::withBook($experience, $bookBody);
            // The recognition path (#306): only "prepared" is stored – the default, "original", is none
            if (property_exists($body, 'recognition')) {
                if ($body->recognition === 'prepared') $experience->recognition = 'prepared';
                else unset($experience->recognition);
            }
            $json = Editor::encode($experience);
            Db::run('UPDATE experiences SET title = :title, experience_json = :data WHERE id = :id', ['title' => $experience->title, 'data' => $json, 'id' => $experienceId]);
            Experiences::touchExperience($experienceId);
            Experiences::recordChange($experienceId, $user, 'experience', $experienceId, $row['experience_json'], $json);
            return $experience;
        });
        Http::json(200, ['experience' => $experience]);
    }

    /** The experience with its printed book changed by $book (null: removed), the book placed after the title */
    private static function withBook(stdClass $experience, ?stdClass $book): stdClass
    {
        $current = isset($experience->book) && $experience->book instanceof stdClass ? clone $experience->book : null;
        if ($book !== null) {
            $next = $current ?? new stdClass();
            if (property_exists($book, 'author')) $next->author = self::text($book->author, 'book.author', true, 'invalid-experience');
            if (property_exists($book, 'publisher')) {
                self::optional($next, 'publisher', $book->publisher === null ? null : self::text($book->publisher, 'book.publisher', false, 'invalid-experience'));
            }
            if (!is_string($next->author ?? null)) throw new ApiError(400, 'invalid-experience', 'A new printed book needs book.author.');
            // author first, as experience.yaml has it
            $book = (object) (['author' => $next->author] + get_object_vars($next));
        }
        $out = new stdClass();
        foreach (get_object_vars($experience) as $key => $value) {
            if ($key === 'book') continue;
            $out->$key = $value;
            if ($key === 'title' && $book !== null) $out->book = $book;
        }
        if ($book !== null && !isset($out->book)) $out->book = $book;
        return $out;
    }

    /** A link an entry may point to: http(s) with a host (shared/api/rules.ts `isLinkUrl`) */
    public static function isLinkUrl(string $url): bool
    {
        if (preg_match('/[\x00-\x20\x7f]/', $url)) return false;
        $parts = parse_url($url);
        return is_array($parts) && in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) && ($parts['host'] ?? '') !== '';
    }

    /** A text field: a string (trimmed), not empty when `$required`, at most `$max` characters */
    private static function text(mixed $value, string $what, bool $required, string $code = 'invalid-entry', int $max = self::TEXT_MAX_LENGTH): string
    {
        if (!is_string($value)) throw new ApiError(400, $code, "$what must be a string.");
        $value = trim($value);
        if ($required && $value === '') throw new ApiError(400, $code, "$what must not be empty.");
        if (mb_strlen($value) > $max) throw new ApiError(400, $code, "$what is longer than $max characters.");
        return $value;
    }

    /** Sets an optional field, or leaves it out when null or empty */
    private static function optional(stdClass $object, string $key, ?string $value): void
    {
        if ($value === null || $value === '') unset($object->{$key});
        else $object->{$key} = $value;
    }

    /** Tags: a list of words, trimmed, each once, the empty ones left out */
    private static function tags(mixed $value): array
    {
        if (!is_array($value)) throw new ApiError(400, 'invalid-entry', 'tags must be a list of words.');
        $tags = [];
        foreach ($value as $tag) {
            if (!is_string($tag)) throw new ApiError(400, 'invalid-entry', 'tags must be a list of words.');
            $tag = trim($tag);
            if ($tag === '' || in_array($tag, $tags, true)) continue;
            if (mb_strlen($tag) > self::TAG_MAX_LENGTH) throw new ApiError(400, 'invalid-entry', 'A tag is longer than ' . self::TAG_MAX_LENGTH . ' characters.');
            $tags[] = $tag;
        }
        if (count($tags) > self::TAGS_MAX) throw new ApiError(400, 'invalid-entry', 'At most ' . self::TAGS_MAX . ' tags.');
        return $tags;
    }
}
