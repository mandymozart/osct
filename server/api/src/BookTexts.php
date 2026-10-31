<?php
declare(strict_types=1);

/**
 * The reading side of a book in the editor (docs/server.md "Texts"): an entry's fields – its title, its text (Markdown
 * with the book's variables, shared/text/entry-text.ts), author, image, link, tags, category and access page –, the
 * book's title, author and publisher, and the onboarding's steps. Every write reads the row, changes it and writes it
 * back in one transaction with the row locked (`Db::forUpdate()`), touches the book and records a change with the row
 * before and after. An AI connection's token may write here like the person – these are the book's texts, not the
 * account; publishing stays the person's (`Books::publish`).
 *
 * The checks are the content build's (scripts/src/lib/schema.ts): the categories, a title and a page, a link that is
 * http(s), the step actions – and an image from the book's Library (an uploaded image or a file of the import).
 */
final class BookTexts
{
    /** The fields of an entry a PUT may change */
    private const ENTRY_FIELDS = ['title', 'body', 'author', 'image', 'media', 'tags', 'category', 'page'];
    /** At most this many tags, each at most TAG_MAX_LENGTH characters (shared/api/rules.ts `ENTRY_TAGS`) */
    public const TAGS_MAX = 32;
    public const TAG_MAX_LENGTH = 64;
    /** A text field's limit in characters (shared/api/rules.ts `TEXT_MAX_LENGTH`): a title, an author, a step's line */
    public const TEXT_MAX_LENGTH = 500;
    /** An entry's body, in characters (shared/api/rules.ts `BODY_MAX_LENGTH`) */
    public const BODY_MAX_LENGTH = 100000;
    /** A step's fields (shared/types/game-config.ts `StepData`, without `index` – the list's order is the index) */
    private const STEP_TEXTS = ['title', 'description', 'footer', 'illustration', 'button'];
    private const STEP_TIMES = ['fadeIn', 'stagger', 'advance'];
    /** A step's timing in milliseconds: at most ten minutes (shared/api/rules.ts `STEP_TIME_MAX`) */
    public const STEP_TIME_MAX = 600000;
    /** At most this many steps (shared/api/rules.ts `STEPS_MAX`) */
    public const STEPS_MAX = 50;

    /**
     * GET /editor/books/{id}/entries → { entries: [EntryData without its target + spreadId, target: { id, imageSrc } | null] }
     * in the book's order: every field as the content holds it (an image's path or URL as written, not resolved)
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
            $entry = Editor::decode($row['data_json']);
            $entry->spreadId = $row['spread_id'];
            $entry->target = $targets[$row['id']] ?? null;
            $entries[] = $entry;
        }
        Http::json(200, ['entries' => $entries]);
    }

    /**
     * PUT /editor/books/{id}/entries/{eid} { title?, body?, author?, image?, media?, tags?, category?, page? } → 200
     * { entry, spreadId, previousSpreadId }: the fields sent change, `null` removes an optional one (author, image,
     * media). A new page moves the entry to the spread its page belongs to – the first whose pages include it, none
     * when no spread does (as `POST …/entries`). 400 `invalid-entry`, 404.
     */
    public static function putEntry(string $bookId, string $entryId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        $unknown = array_diff(array_keys(get_object_vars($body)), self::ENTRY_FIELDS);
        if ($unknown) throw new ApiError(400, 'invalid-entry', 'Unknown field ' . implode(', ', $unknown) . ' – send ' . implode(', ', self::ENTRY_FIELDS) . '.');
        if (!get_object_vars($body)) throw new ApiError(400, 'invalid-entry', 'Send at least one of ' . implode(', ', self::ENTRY_FIELDS) . '.');
        [$entry, $spreadId, $previous] = Db::transaction(static function () use ($bookId, $entryId, $body, $user) {
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
            $spreadId = $row['spread_id'];
            if (property_exists($body, 'page')) {
                $page = $body->page;
                if (!is_int($page) && !(is_float($page) && floor($page) === $page)) throw new ApiError(400, 'invalid-entry', 'page must be a whole number.');
                $entry->page = (int) $page;
                // Each named parameter once (RULES #25): the page twice as :first and :last
                $spreadId = Db::value('SELECT id FROM spreads WHERE book_id = :book AND first_page <= :first AND last_page >= :last ORDER BY position LIMIT 1',
                    ['book' => $bookId, 'first' => $entry->page, 'last' => $entry->page]);
                $spreadId = $spreadId === null ? null : (string) $spreadId;
            }
            $json = Editor::encode($entry);
            Db::run('UPDATE entries SET spread_id = :spread, category = :category, title = :title, page = :page, data_json = :data WHERE book_id = :book AND id = :id',
                $params + ['spread' => $spreadId, 'category' => $entry->category, 'title' => $entry->title, 'page' => (int) $entry->page, 'data' => $json]);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'entry', $entryId, $row['data_json'], $json);
            return [$entry, $spreadId, $row['spread_id']];
        });
        Http::json(200, ['entry' => $entry, 'spreadId' => $spreadId, 'previousSpreadId' => $previous]);
    }

    /**
     * PUT /editor/books/{id} { title?, author?, publisher? } → 200 { book }: the book's texts – the splash and the
     * home page show them (`{{title}}` in the steps). `publisher: null` (or "") removes it. 400 `invalid-book`.
     */
    public static function putBook(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        $fields = ['title', 'author', 'publisher'];
        $unknown = array_diff(array_keys(get_object_vars($body)), $fields);
        if ($unknown) throw new ApiError(400, 'invalid-book', 'Unknown field ' . implode(', ', $unknown) . ' – send title, author or publisher.');
        if (!get_object_vars($body)) throw new ApiError(400, 'invalid-book', 'Send title, author or publisher.');
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
            $json = Editor::encode($book);
            Db::run('UPDATE books SET title = :title, author = :author, book_json = :data WHERE id = :id', ['title' => $book->title, 'author' => $book->author, 'data' => $json, 'id' => $bookId]);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'book', $bookId, $row['book_json'], $json);
            return $book;
        });
        Http::json(200, ['book' => $book]);
    }

    /** GET /editor/books/{id}/tutorial → { tutorial: StepData[] }: the onboarding's steps in their order */
    public static function tutorial(string $bookId): never
    {
        Editor::user();
        $row = Books::bookRow($bookId);
        Http::json(200, ['tutorial' => Editor::decode($row['tutorial_json']) ?? []]);
    }

    /**
     * PUT /editor/books/{id}/tutorial { tutorial: [{ id, title?, description?, footer?, illustration?, button?, action?,
     * fadeIn?, stagger?, advance? }] } → 200 { tutorial }: the onboarding's steps, the whole ordered list – the order is
     * each step's `index`. An empty text leaves the field out; `action` (next, camera, scan) goes with a button. 400
     * `invalid-tutorial`.
     */
    public static function putTutorial(string $bookId): never
    {
        $user = Editor::user();
        Books::exists($bookId);
        $body = Editor::body();
        if (!property_exists($body, 'tutorial') || !is_array($body->tutorial)) throw new ApiError(400, 'invalid-tutorial', 'Send { tutorial: [steps] }.');
        if (count($body->tutorial) > self::STEPS_MAX) throw new ApiError(400, 'invalid-tutorial', 'At most ' . self::STEPS_MAX . ' steps.');
        $steps = [];
        $ids = [];
        foreach (array_values($body->tutorial) as $index => $in) {
            $at = "tutorial[$index]";
            if (!$in instanceof stdClass) throw new ApiError(400, 'invalid-tutorial', "$at must be an object.");
            $unknown = array_diff(array_keys(get_object_vars($in)), ['id', 'index', ...self::STEP_TEXTS, 'action', ...self::STEP_TIMES]);
            if ($unknown) throw new ApiError(400, 'invalid-tutorial', "$at: unknown field " . implode(', ', $unknown) . '.');
            $id = $in->id ?? null;
            if (!is_string($id) || !preg_match('/^' . Editor::ID . '$/', $id)) throw new ApiError(400, 'invalid-tutorial', "$at.id must be 1–64 letters, digits, _ or -.");
            if (isset($ids[$id])) throw new ApiError(400, 'invalid-tutorial', "$at.id: \"$id\" is used twice.");
            $ids[$id] = true;
            $step = ['id' => $id, 'index' => $index];
            foreach (self::STEP_TEXTS as $key) {
                if (!isset($in->{$key})) continue;
                $value = self::text($in->{$key}, "$at.$key", false, 'invalid-tutorial', $key === 'description' ? self::BODY_MAX_LENGTH : self::TEXT_MAX_LENGTH);
                if ($value !== '') $step[$key] = $value;
            }
            if (isset($in->action)) {
                if (!in_array($in->action, Editor::STEP_ACTIONS, true)) throw new ApiError(400, 'invalid-tutorial', "$at.action must be one of " . implode(', ', Editor::STEP_ACTIONS) . '.');
                if (!isset($step['button'])) throw new ApiError(400, 'invalid-tutorial', "$at.action goes with a button.");
                if ($in->action !== 'next') $step['action'] = $in->action;
            }
            foreach (self::STEP_TIMES as $key) {
                if (!isset($in->{$key})) continue;
                $value = $in->{$key};
                if (!(is_int($value) || is_float($value)) || $value < 0 || $value > self::STEP_TIME_MAX) {
                    throw new ApiError(400, 'invalid-tutorial', "$at.$key must be milliseconds from 0 to " . self::STEP_TIME_MAX . '.');
                }
                $step[$key] = (int) round($value);
            }
            $steps[] = (object) $step;
        }
        Db::transaction(static function () use ($bookId, $steps, $user) {
            $row = Books::bookRow($bookId, true);
            $json = Editor::encode($steps);
            Db::run('UPDATE books SET tutorial_json = :data WHERE id = :id', ['data' => $json, 'id' => $bookId]);
            Books::touchBook($bookId);
            Books::recordChange($bookId, $user, 'tutorial', $bookId, $row['tutorial_json'], $json);
        });
        Http::json(200, ['tutorial' => $steps]);
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
