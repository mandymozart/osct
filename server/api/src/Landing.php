<?php
declare(strict_types=1);

/**
 * The desktop landing's hero (#355, content schema 6.1 – shared/types/landing.ts): the experience's pick
 * `experience.landing { scene, target, hero?, cover? }` – one target with AR content (a model, a video, a component –
 * marginalia and links have none) on a scene, its hero and the print
 * layout's cover extracted by the editor (or the MCP server) when it was picked (shared/api/landing-extract.ts) – and the
 * version's `landing.json` a publish writes from it (shared/api/landing.ts `LandingFile`).
 *
 * The API checks the essentials of the guard and of the content build: the ids name a scene and one of its targets,
 * whose entity draws something (`hasContent`), and the hero has the shape the landing reads. The derivation itself is
 * TypeScript: without a pick (or a pick without a hero) a publish writes no hero, and the reader derives it from the game
 * configuration as before.
 *
 * Content schema 6.4 (#365): the landing's own `texts` (by language: intro, getApp, openOnPhone, shop) and its `shop` (up
 * to 4 items: label, url, image?, cover?) – with a pick or without one. Publish writes them into landing.json (`texts`,
 * `shopItems`), with a pick-less landing a landing.json without `hero`; and it leaves a landing without a pick out of the
 * readers' configuration (`forReaders`) – an app of 6.3 refuses one.
 */
final class Landing
{
    /** The file in a version's folder (shared/api/landing.ts `LANDING_FILE`) and its shape's version (`LANDING_FORMAT`) */
    public const FILE = 'landing.json';
    public const FORMAT = 2;
    /** The stored pick at most (the hero names a model's node tree and the experience's plugins – small) */
    private const MAX_BYTES = 262144;
    private const CONTENT_PREFIX = '/assets/content/';
    /** The texts an experience may write and their longest (shared/types/landing.ts `LANDING_TEXT_KEYS`, `LANDING_TEXT_MAX`) */
    public const TEXT_MAX = ['intro' => 600, 'getApp' => 120, 'openOnPhone' => 300, 'shop' => 120];
    /** The shop's items at most, a label's and a link's longest (`LANDING_SHOP_MAX`, `LANDING_SHOP_LABEL_MAX`, `LANDING_SHOP_URL_MAX`) */
    public const SHOP_MAX = 4;
    public const SHOP_LABEL_MAX = 120;
    public const SHOP_URL_MAX = 2000;
    private const FIELDS = ['scene', 'target', 'hero', 'cover', 'texts', 'shop'];

    /**
     * `experience.landing` as sent (`PUT /editor/experiences/{id} { landing }`), checked against the experience's rows –
     * the stored object in the shared field order, every file below the experience's assets base as its content path
     * (RULES #36); 400 `invalid-landing` otherwise. Blank texts and empty languages are left out (the app's text); a
     * landing that holds nothing then is null (removed).
     */
    public static function check(mixed $landing, string $experienceId): ?stdClass
    {
        $fail = static fn(string $message) => throw new ApiError(400, 'invalid-landing', $message);
        if (!$landing instanceof stdClass) $fail('landing must be { scene?, target?, hero?, cover?, texts?, shop? } or null.');
        $unknown = array_diff(array_keys(get_object_vars($landing)), self::FIELDS);
        if ($unknown) $fail('Unknown field landing.' . implode(', landing.', $unknown) . ' – send scene, target, hero, cover, texts and shop.');
        $base = rtrim((string) (Db::value('SELECT assets_base FROM experiences WHERE id = :id', ['id' => $experienceId]) ?? ''), '/');
        $landing = self::contentPaths(json_decode(Editor::encode($landing)), $base);
        $out = new stdClass();
        if (property_exists($landing, 'scene') || property_exists($landing, 'target')) {
            foreach (['scene', 'target'] as $key) {
                if (!is_string($landing->$key ?? null) || $landing->$key === '') $fail("landing.$key must be an id.");
            }
            $problem = self::pickProblem($experienceId, $landing->scene, $landing->target);
            if ($problem !== null) $fail("landing: $problem.");
            $out->scene = $landing->scene;
            $out->target = $landing->target;
        } elseif (property_exists($landing, 'hero') || property_exists($landing, 'cover')) {
            $fail('landing: a hero or a cover needs its pick (scene, target).');
        }
        if (property_exists($landing, 'hero')) {
            $problem = self::heroProblem($landing->hero);
            if ($problem !== null) $fail("landing.hero: $problem.");
            $out->hero = $landing->hero;
        }
        if (property_exists($landing, 'cover')) {
            if (!is_string($landing->cover) || $landing->cover === '') $fail('landing.cover must be a path or URL.');
            $out->cover = $landing->cover;
        }
        if (property_exists($landing, 'texts')) {
            $texts = self::texts($landing->texts);
            $problem = self::textsProblem($texts);
            if ($problem !== null) $fail($problem);
            if (get_object_vars($texts)) $out->texts = $texts;
        }
        if (property_exists($landing, 'shop')) {
            $problem = self::shopProblem($landing->shop);
            if ($problem !== null) $fail($problem);
            $out->shop = self::shop($landing->shop);
        }
        if (!get_object_vars($out)) return null;
        if (strlen(Editor::encode($out)) > self::MAX_BYTES) $fail('landing is larger than ' . (self::MAX_BYTES / 1024) . ' KB.');
        return $out;
    }

    /** The texts as sent, blank ones and empty languages left out (a text that is not one stays – `textsProblem` refuses it) */
    private static function texts(mixed $texts): mixed
    {
        if (!$texts instanceof stdClass) return $texts;
        $out = new stdClass();
        foreach (get_object_vars($texts) as $language => $own) {
            if (!$own instanceof stdClass) {
                $out->$language = $own;
                continue;
            }
            $kept = new stdClass();
            foreach (get_object_vars($own) as $key => $text) {
                if (!is_string($text) || trim($text) !== '') $kept->$key = $text;
            }
            if (get_object_vars($kept)) $out->$language = $kept;
        }
        return $out;
    }

    /** The shop's items in the shared field order */
    private static function shop(array $items): array
    {
        return array_map(static function (stdClass $item): stdClass {
            $out = (object) ['label' => $item->label, 'url' => $item->url];
            if (property_exists($item, 'image')) $out->image = $item->image;
            if (property_exists($item, 'cover')) $out->cover = true;
            return $out;
        }, $items);
    }

    /** Why the landing's texts cannot be stored (shared/types/landing.ts `landingTextsProblems`), null when they can */
    public static function textsProblem(mixed $texts, string $path = 'landing.texts'): ?string
    {
        if (!$texts instanceof stdClass) return "$path must be { <language>: { " . implode(', ', array_keys(self::TEXT_MAX)) . ' } }.';
        foreach (get_object_vars($texts) as $language => $own) {
            if (!preg_match('/^[a-z]{2}$/', (string) $language)) return "$path.$language: a language is a two-letter code (en, de, fr, nl).";
            if (!$own instanceof stdClass) return "$path.$language must be { " . implode(', ', array_keys(self::TEXT_MAX)) . ' }.';
            foreach (get_object_vars($own) as $key => $text) {
                if (!isset(self::TEXT_MAX[$key])) return "$path.$language.$key: unknown text – " . implode(', ', array_keys(self::TEXT_MAX)) . '.';
                if (!is_string($text) || trim($text) === '') return "$path.$language.$key must be a text (leave it out for the app's).";
                if (mb_strlen($text) > self::TEXT_MAX[$key]) return "$path.$language.$key is longer than " . self::TEXT_MAX[$key] . ' characters.';
            }
        }
        return null;
    }

    /** Why the landing's shop cannot be stored (shared/types/landing.ts `landingShopProblems`), null when it can */
    public static function shopProblem(mixed $shop, string $path = 'landing.shop'): ?string
    {
        if (!is_array($shop)) return "$path must be a list of { label, url, image?, cover? }.";
        if (count($shop) > self::SHOP_MAX) return "$path: at most " . self::SHOP_MAX . ' items.';
        foreach ($shop as $i => $item) {
            $at = "{$path}[$i]";
            if (!$item instanceof stdClass) return "$at must be { label, url, image?, cover? }.";
            $unknown = array_diff(array_keys(get_object_vars($item)), ['label', 'url', 'image', 'cover']);
            if ($unknown) return "$at: unknown " . implode(', ', $unknown) . ' – label, url, image, cover.';
            if (!is_string($item->label ?? null) || trim($item->label) === '') return "$at.label must be a text.";
            if (mb_strlen($item->label) > self::SHOP_LABEL_MAX) return "$at.label is longer than " . self::SHOP_LABEL_MAX . ' characters.';
            if (!is_string($item->url ?? null) || !preg_match('#^https?://[^\s/?\#]+\S*$#i', $item->url)) return "$at.url must be an http(s) address.";
            if (strlen($item->url) > self::SHOP_URL_MAX) return "$at.url is longer than " . self::SHOP_URL_MAX . ' characters.';
            if (property_exists($item, 'image') && (!is_string($item->image) || $item->image === '')) return "$at.image must be a path or URL.";
            if (property_exists($item, 'cover') && $item->cover !== true) return "$at.cover must be true (the book's cover) or left out.";
            if (property_exists($item, 'image') && property_exists($item, 'cover')) return "$at: a picture (image) or the book's cover (cover), not both.";
        }
        return null;
    }

    /** Every `<base>/assets/content/…` string in a JSON value back to its content path */
    private static function contentPaths(mixed $value, string $base): mixed
    {
        if ($base === '') return $value;
        if (is_string($value)) return str_starts_with($value, $base . self::CONTENT_PREFIX) ? substr($value, strlen($base)) : $value;
        if (is_array($value)) return array_map(static fn($item) => self::contentPaths($item, $base), $value);
        if ($value instanceof stdClass) {
            foreach (get_object_vars($value) as $key => $item) $value->$key = self::contentPaths($item, $base);
        }
        return $value;
    }

    /** Whether a landing names a pick (scene and target) – texts and a shop alone do not */
    public static function picked(mixed $landing): bool
    {
        return $landing instanceof stdClass && is_string($landing->scene ?? null) && is_string($landing->target ?? null);
    }

    /**
     * The experience as readers get it (a publish, `ContentVersion::assemble(forReaders)`): a landing without a pick left
     * out – an app of content schema 6.3 refuses one; its texts and shop reach the reader in landing.json
     */
    public static function forReaders(stdClass $experience): void
    {
        if (property_exists($experience, 'landing') && !self::picked($experience->landing)) unset($experience->landing);
    }

    /** The shape of `experience.landing` in an imported configuration (shared/types/landing.ts `experienceLandingProblems`), null when it holds */
    public static function shapeProblem(mixed $landing): ?string
    {
        if (!$landing instanceof stdClass) return 'experience.landing must be { scene, target } and / or { texts, shop }.';
        if (property_exists($landing, 'scene') || property_exists($landing, 'target')) {
            foreach (['scene', 'target'] as $key) {
                if (!is_string($landing->$key ?? null) || $landing->$key === '') return "experience.landing.$key must be an id.";
            }
        } elseif (property_exists($landing, 'hero') || property_exists($landing, 'cover')) {
            return 'experience.landing: a hero or a cover needs its pick (scene, target).';
        }
        if (property_exists($landing, 'hero') && !$landing->hero instanceof stdClass) return 'experience.landing.hero must be an object.';
        if (property_exists($landing, 'cover') && !is_string($landing->cover)) return 'experience.landing.cover must be a string.';
        if (property_exists($landing, 'texts') && ($problem = self::textsProblem($landing->texts, 'experience.landing.texts')) !== null) return $problem;
        if (property_exists($landing, 'shop') && ($problem = self::shopProblem($landing->shop, 'experience.landing.shop')) !== null) return $problem;
        return null;
    }

    /** Why the scene and target cannot be the hero (no such scene, no such target on it, no model), null when they can */
    private static function pickProblem(string $experienceId, string $sceneId, string $targetId): ?string
    {
        $params = ['experience' => $experienceId];
        if (!Db::one('SELECT id FROM scenes WHERE experience_id = :experience AND id = :id', $params + ['id' => $sceneId])) return "no scene \"$sceneId\"";
        $row = Db::one('SELECT t.data_json FROM targets t JOIN entries e ON e.experience_id = t.experience_id AND e.id = t.entry_id
            WHERE t.experience_id = :experience AND t.id = :target AND e.scene_id = :scene', $params + ['target' => $targetId, 'scene' => $sceneId]);
        $target = $row ? Editor::decode($row['data_json']) : null;
        if (!$target instanceof stdClass) $target = null;
        if ($target === null) return "no target \"$targetId\" on the scene \"$sceneId\"";
        if (($target->enabled ?? true) === false) return "the target \"$targetId\" is switched off";
        $entity = $target->entity ?? null;
        if ($entity instanceof stdClass && is_string($entity->ref ?? null)) {
            $row = Db::one('SELECT data_json FROM entities WHERE experience_id = :experience AND ref = :ref', $params + ['ref' => $entity->ref]);
            $entity = $row ? Editor::decode($row['data_json']) : null;
        }
        return $entity instanceof stdClass && self::hasContent($entity) ? null
            : "the target \"$targetId\" has no AR content – the landing's hero shows a target's model, video or component (marginalia and links cannot)";
    }

    /**
     * The entity draws something (shared/api/landing-extract.ts `hasLandingContent`): a node of any type but an empty
     * `group` or a `light`, or one a component drives – anywhere in its tree
     */
    private static function hasContent(stdClass $entity): bool
    {
        $type = $entity->type ?? null;
        if (!is_string($type)) return false;
        if (($type !== 'group' && $type !== 'light') || (is_array($entity->components ?? null) && $entity->components !== [])) return true;
        foreach ((array) ($entity->children ?? []) as $child) {
            if ($child instanceof stdClass && self::hasContent($child)) return true;
        }
        return false;
    }

    /** The hero's shape as the landing reads it (shared/api/landing.ts `isLandingFile`'s hero), null when it holds */
    private static function heroProblem(mixed $hero): ?string
    {
        if (!$hero instanceof stdClass) return 'must be the extracted hero';
        $number = static fn(mixed $v): bool => is_int($v) || is_float($v);
        $print = static fn(mixed $p): bool => $p instanceof stdClass && is_string($p->src ?? null) && $number($p->x ?? null) && $number($p->width ?? null)
            && (($p->top ?? null) === null || $number($p->top)) && (!property_exists($p, 'height') || $number($p->height));
        $strings = static fn(mixed $v): bool => is_array($v) && array_filter($v, static fn($s) => !is_string($s)) === [];
        if (!$number($hero->aspect ?? null)) return 'aspect must be a number';
        if (!is_array($hero->pages ?? null) || array_filter($hero->pages, static fn($p) => !$number($p)) !== []) return 'pages must be numbers';
        if (!is_array($hero->prints ?? null) || array_filter($hero->prints, static fn($p) => !$print($p)) !== []) return 'prints must be { src, x, top, width, height? }';
        if (!$print($hero->target ?? null)) return 'target must be { src, x, top, width, height? }';
        if (!($hero->entity ?? null) instanceof stdClass || !is_array($hero->entity->assets ?? null) || !self::hasContent($hero->entity)) return "entity must be the target's entity";
        if (!(($hero->spread ?? null) === null || is_string($hero->spread))) return 'spread must be a path or null';
        if (!$strings($hero->earlier ?? null) || !$strings($hero->pageImages ?? null)) return 'earlier and pageImages must be lists of paths';
        if (!is_array($hero->plugins ?? null)) return 'plugins must be a list';
        if (property_exists($hero, 'appearance') && !$hero->appearance instanceof stdClass) return 'appearance must be an object';
        return null;
    }

    /**
     * The version's `landing.json` (shared/api/landing.ts `LandingFile`) from the configuration of the draft it publishes
     * (the experience's landing as stored – `$landing`, since the readers' configuration leaves a pick-less one out): its
     * experience's title and target images, the stored pick's hero and cover – the plugins and looks the version's own
     * (they may have changed since the pick) –, and the landing's own texts and shop (`shopItems`, #365). Every content path
     * below the assets base, as the configuration's (`ContentVersion::rewrite`). Without a pick with a hero the file has no
     * `hero` (the reader derives it); null when the landing holds nothing either – the reader derives all of it then.
     */
    public static function file(stdClass $configuration, string $assetsBase, mixed $landing = null): ?string
    {
        $experience = $configuration->experience ?? null;
        if (!$experience instanceof stdClass) return null;
        $landing ??= $experience->landing ?? null;
        if (!$landing instanceof stdClass) return null;
        $withHero = self::picked($landing) && ($landing->hero ?? null) instanceof stdClass;
        if (!$withHero && !property_exists($landing, 'texts') && !property_exists($landing, 'shop')) return null;
        $base = rtrim($assetsBase, '/');
        $hero = null;
        if ($withHero) {
            $hero = self::below(json_decode(Editor::encode($landing->hero)), $base);
            // The version's own plugins (their modules are in its folder) and looks
            $hero->plugins = array_values(array_map(static fn(stdClass $p) => (object) ['id' => $p->id, 'src' => $p->src, 'api' => $p->api],
                array_filter((array) ($configuration->plugins ?? []), static fn($p) => $p instanceof stdClass && is_string($p->id ?? null) && is_string($p->src ?? null) && is_string($p->api ?? null))));
            unset($hero->appearance);
            if (($experience->appearance ?? null) instanceof stdClass) $hero->appearance = $experience->appearance;
        }
        $images = [];
        $scenes = array_map(static fn($s) => (string) ($s->id ?? ''), (array) ($configuration->scenes ?? []));
        foreach ($scenes as $sceneId) {
            foreach ((array) ($configuration->entries ?? []) as $entry) {
                $target = $entry->target ?? null;
                if (($entry->scene ?? null) === $sceneId && $target instanceof stdClass && ($target->enabled ?? true) !== false && is_string($target->imageSrc ?? null)) $images[] = $target->imageSrc;
            }
        }
        $book = $experience->book ?? null;
        $cover = $withHero && is_string($landing->cover ?? null) ? self::below($landing->cover, $base) : null;
        $file = (object) [
            'format' => self::FORMAT,
            'schema' => (string) ($configuration->version->schema ?? Editor::CONTENT_SCHEMA),
            'experience' => (string) ($experience->id ?? ''),
            'title' => (string) ($experience->title ?? ''),
            'author' => $book instanceof stdClass ? (string) ($book->author ?? '') : '',
            'publisher' => $book instanceof stdClass ? (string) ($book->publisher ?? '') : '',
            'images' => $images,
            'cover' => $cover,
        ];
        if ($withHero) $file->hero = $hero;
        if (($landing->texts ?? null) instanceof stdClass) $file->texts = $landing->texts;
        if (is_array($landing->shop ?? null)) $file->shopItems = self::below(json_decode(Editor::encode($landing->shop)), $base);
        return Editor::encode($file);
    }

    /** Every content path (`/assets/content/…`) in a JSON value below the assets base; without one they stay (the version's folder) */
    private static function below(mixed $value, string $base): mixed
    {
        if ($base === '') return $value;
        if (is_string($value)) return str_starts_with($value, self::CONTENT_PREFIX) ? $base . $value : $value;
        if (is_array($value)) return array_map(static fn($item) => self::below($item, $base), $value);
        if ($value instanceof stdClass) {
            foreach (get_object_vars($value) as $key => $item) $value->$key = self::below($item, $base);
        }
        return $value;
    }
}
