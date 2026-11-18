<?php
declare(strict_types=1);

/**
 * The reading side of a book in the editor (docs/server.md "Texts"): an entry's fields – its title, its text (Markdown
 * with the book's variables, shared/text/entry-text.ts), author, image, link, tags, category, its scene and surface –, and the
 * book's title, author and publisher. Every write reads the row, changes it and writes it
 * back in one transaction with the row locked (`Db::forUpdate()`), touches the book and records a change with the row
 * before and after. An AI connection's token may write here like the person – these are the book's texts, not the
 * account; publishing stays the person's (`Books::publish`).
 *
 * The checks are the content build's (scripts/src/lib/schema.ts): the categories, a title and a scene, a link that is
 * http(s) – and an image from the book's Library (an uploaded image or a file of the import).
 */
final class BookTexts
{
    /** The fields of an entry a PUT may change */
    private const ENTRY_FIELDS = ['title', 'body', 'author', 'image', 'caption', 'media', 'tags', 'category', 'scene', 'surface'];
    /** At most this many tags, each at most TAG_MAX_LENGTH characters (shared/api/rules.ts `ENTRY_TAGS`) */
    public const TAGS_MAX = 32;
    public const TAG_MAX_LENGTH = 64;
    /** A text field's limit in characters (shared/api/rules.ts `TEXT_MAX_LENGTH`): a title, an author */
    public const TEXT_MAX_LENGTH = 500;
    /** An entry's body, in characters (shared/api/rules.ts `BODY_MAX_LENGTH`) */
    public const BODY_MAX_LENGTH = 100000;

    /**
     * GET /editor/books/{id}/entries → { entries: [EntryData without its target (its `scene` and `surface` among the
     * fields), target: { id, imageSrc } | null] } in the book's order: every field as the content holds it (an image's path
     * or URL as written, not resolved)
     */
    public static function entries(string $bookId): never
    {
        Editor::user();
        Books::exists($bookId);
        $params = ['book' => $bookId];
        $targets = [];
        foreach (Db::run('SELECT id, entry_id, image_src FROM targets WHERE book_id = :book', $params)->fetchAll() as $row) {
            $targets[$row['entry_id']] = ['id' => $row['id'], 'imageSrc' => $row['image_src']];
        }
        $entries = [];
        foreach (Db::run('SELECT id, spread_id, data_json FROM entries WHERE book_id = :book ORDER BY position', $params)->fetchAll() as $row) {
            $entry = ContentVersion::withScene(Editor::decode($row['data_json']), (string) $row['spread_id']);
            $entry->target = $targets[$row['id']] ?? null;
            $entries[] = $entry;
        }
        Http::json(200, ['entries' => $entries]);
    }

    /**
     * PUT /editor/books/{id}/entries/{eid} { title?, body?, author?, image?, caption?, media?, tags?, category?, scene?,
     * surface? } → 200 { entry, scene, previousScene }: the fields sent change, `null` removes an optional one (author,
     * image, caption – the line under the picture, plain text, #289 –, media, surface). `scene` moves the entry to that
     * scene (its surface goes unless the new scene has one of that id or `surface` names one). 400 `invalid-entry`,
     * `unknown-scene`, 404.
     */
    public static function putEntry(string $bookId, string $entryId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        $unknown = array_diff(array_keys(get_object_vars($body)), self::ENTRY_FIELDS);
        if ($unknown) throw new ApiError(400, 'invalid-entry', 'Unknown field ' . implode(', ', $unknown) . ' – send ' . implode(', ', self::ENTRY_FIELDS) . '.');
        if (!get_object_vars($body)) throw new ApiError(400, 'invalid-entry', 'Send at least one of ' . implode(', ', self::ENTRY_FIELDS) . '.');
        [$entry, $sceneId, $previous] = Db::transaction(static function () use ($bookId, $entryId, $body, $user) {
            $params = ['book' => $bookId, 'id' => $entryId];
            $row = Db::one('SELECT * FROM entries WHERE book_id = :book AND id = :id' . Db::forUpdate(), $params);
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
                if ($image !== null && $image !== ($entry->image ?? null) && !Assets::isBookImage($bookId, $image)) {
                    throw new ApiError(400, 'invalid-entry', 'image must be a picture of the book\'s Library – upload it first.');
                }
                self::optional($entry, 'image', $image);
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
            $sceneId = (string) $row['spread_id'];
            // The entry's scene and surface: `scene` moves it, `surface` (null: none) places it on one of its scene's surfaces
            $hasScene = property_exists($body, 'scene');
            $hasSurface = property_exists($body, 'surface');
            if ($hasScene && $body->scene === null) throw new ApiError(400, 'invalid-entry', 'scene must be a scene of the book – an entry always has one.');
            if ($hasScene || $hasSurface) {
                $context = Scenes::context($bookId);
                $scene = $hasScene ? $body->scene : $sceneId;
                $surface = $hasSurface ? $body->surface : ($entry->surface ?? null);
                // A surface kept from before goes when the new scene has no such surface
                if (!$hasSurface && is_string($surface) && !in_array($surface, Scenes::surfaceIds($context['data'][(string) $scene] ?? new stdClass()), true)) $surface = null;
                [$sceneId, $surface] = Books::sceneOf($context, $scene, $surface);
                if ($surface === null) unset($entry->surface);
                else $entry->surface = $surface;
            }
            unset($entry->page, $entry->scene);
            $json = Editor::encode($entry);
            Db::run('UPDATE entries SET spread_id = :scene, category = :category, title = :title, data_json = :data WHERE book_id = :book AND id = :id',
                $params + ['scene' => $sceneId, 'category' => $entry->category, 'title' => $entry->title, 'data' => $json]);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'entry', $entryId, $row['data_json'], $json);
            return [$entry, $sceneId, (string) $row['spread_id']];
        });
        Http::json(200, ['entry' => ContentVersion::withScene($entry, $sceneId), 'scene' => $sceneId, 'previousScene' => $previous]);
    }

    /**
     * PUT /editor/books/{id} { title?, author?, publisher?, sourceOfTruth? } → 200 { book }: the book's texts – the
     * splash, the home page and the onboarding show them – and its source of truth (`print` | `digital`, #238: whether
     * spreads are added and removed in the editor). `publisher: null` (or "") removes it. 400 `invalid-book`.
     */
    public static function putBook(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        $fields = ['title', 'author', 'publisher', 'sourceOfTruth'];
        $unknown = array_diff(array_keys(get_object_vars($body)), $fields);
        if ($unknown) throw new ApiError(400, 'invalid-book', 'Unknown field ' . implode(', ', $unknown) . ' – send title, author, publisher or sourceOfTruth.');
        if (!get_object_vars($body)) throw new ApiError(400, 'invalid-book', 'Send title, author, publisher or sourceOfTruth.');
        if (property_exists($body, 'sourceOfTruth') && !in_array($body->sourceOfTruth, Editor::SOURCES_OF_TRUTH, true)) {
            throw new ApiError(400, 'invalid-book', 'sourceOfTruth must be one of ' . implode(', ', Editor::SOURCES_OF_TRUTH) . '.');
        }
        $book = Db::transaction(static function () use ($bookId, $body, $user) {
            $row = Books::bookRow($bookId, true);
            $book = Editor::decode($row['book_json']);
            foreach (['title', 'author'] as $key) {
                if (property_exists($body, $key)) $book->{$key} = self::text($body->{$key}, $key, true, 'invalid-book');
            }
            if (property_exists($body, 'publisher')) {
                $publisher = $body->publisher === null ? null : self::text($body->publisher, 'publisher', false, 'invalid-book');
                self::optional($book, 'publisher', $publisher === '' ? null : $publisher);
            }
            if (property_exists($body, 'sourceOfTruth')) $book->sourceOfTruth = $body->sourceOfTruth;
            $json = Editor::encode($book);
            Db::run('UPDATE books SET title = :title, author = :author, book_json = :data WHERE id = :id', ['title' => $book->title, 'author' => $book->author, 'data' => $json, 'id' => $bookId]);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'book', $bookId, $row['book_json'], $json);
            return $book;
        });
        Http::json(200, ['book' => $book]);
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
