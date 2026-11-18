import { ALL_CATEGORY, type Entry, EntryCategory, type ListCategory, type Spread } from "@/types";
import { entryPlaceLabel } from "@engine/content/scenes";
import { isEntryCategory } from "@shared/guards/game-config";
import { escapeHtml } from "@/utils/strings";
import { t } from "i18next";

/**
 * Pure helpers of consultation mode (entries list and entry view). No DOM, no store.
 */

/**
 * The Marginalia menu (#286), in its order: the categories the reader looks up, then All. Videos have a button of their
 * own beside it – they cannot be opened from the list (#288).
 */
export const MARGINALIA_MENU: readonly ListCategory[] = [EntryCategory.Glossary, EntryCategory.Text, EntryCategory.Link, ALL_CATEGORY];

/**
 * Label of a category (or All) in the current language. Always the plural form ("Videos"), in the list, the menu and
 * the entry's category row alike; the glossary is labelled "Marginalia" (#286 – the key stays `glossary`).
 */
export const categoryLabel = (category: ListCategory): string => t(`entries:categories.${category}`);

/**
 * The place an entry is on, as the reader finds it (the engine's `entryPlaceLabel`, #307, schema 3.0): its surface's
 * label, else its scene's label. The app reads it through `getEntryPlaceLabel(entry)`.
 */
export const placeLabel = (
  entry: Pick<Entry, "surface">,
  scene: Pick<Spread, "id" | "label" | "surfaces"> | undefined,
): string => entryPlaceLabel(entry, scene);

export const DEFAULT_CATEGORY = EntryCategory.Glossary;

export const isCategory = isEntryCategory;

/** A content category or All – a route param or a stored last category */
export const isListCategory = (value: unknown): value is ListCategory => value === ALL_CATEGORY || isEntryCategory(value);

/** The entries a list of `category` shows: its own, or for All every entry but the videos */
export const entriesOf = <T extends Pick<Entry, "category">>(entries: readonly T[], category: ListCategory): T[] =>
  entries.filter(e => (category === ALL_CATEGORY ? e.category !== EntryCategory.Video : e.category === category));

/** Categories whose entries are works with a title (and an author): the title is set in italics, no quotes (#287) */
const isWork = (category: EntryCategory): boolean => category !== EntryCategory.Glossary;

/**
 * List label as HTML (escaped): a glossary term as it is; a work's title in italics, followed by its author if it has
 * one – *Fake For Real*, Catherine Guiral (#287)
 */
export const entryLabelHtml = (entry: Pick<Entry, "category" | "title" | "author">): string => {
  if (!isWork(entry.category)) return escapeHtml(entry.title);
  const title = `<i>${escapeHtml(entry.title)}</i>`;
  return entry.author ? `${title}, ${escapeHtml(entry.author)}` : title;
};

/** List label as plain text (accessible names, tests): "Fake For Real, Catherine Guiral" */
export const entryLabel = (entry: Pick<Entry, "category" | "title" | "author">): string =>
  isWork(entry.category) && entry.author ? `${entry.title}, ${entry.author}` : entry.title;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const sortEntries = <T extends Pick<Entry, "title">>(entries: readonly T[]): T[] =>
  [...entries].sort((a, b) => collator.compare(a.title, b.title));

/** A scene's position in the experience, by scene id (`sortBySceneOrder`) */
export type SceneOrder = ReadonlyMap<string, number>;

/** The scene order of a list of scenes: their positions by id */
export const sceneOrderOf = (scenes: readonly Pick<Spread, "id">[]): SceneOrder => new Map(scenes.map((scene, i) => [scene.id, i]));

/** By scene order, then by title (the All view, #287); an entry of an unknown scene comes last */
export const sortBySceneOrder = <T extends Pick<Entry, "title" | "spreadId">>(entries: readonly T[], order: SceneOrder): T[] => {
  const position = (entry: T) => order.get(entry.spreadId) ?? Number.MAX_SAFE_INTEGER;
  return [...entries].sort((a, b) => position(a) - position(b) || collator.compare(a.title, b.title));
};

export interface EntryGroup<T> {
  /** Letter header (glossary), or null for entries without one (e.g. "4th wall", other categories) */
  letter: string | null;
  entries: T[];
}

/**
 * Sorted entries. The glossary is grouped by first letter; entries not starting with a letter
 * (e.g. "4th wall") come first without a header. Other categories form one ungrouped list; All is sorted by scene order.
 */
export const groupEntries = <T extends Pick<Entry, "title" | "category" | "spreadId">>(
  entries: readonly T[],
  category: ListCategory,
  sceneOrder: SceneOrder = new Map(),
): EntryGroup<T>[] => {
  const own = entriesOf(entries, category);
  const sorted = category === ALL_CATEGORY ? sortBySceneOrder(own, sceneOrder) : sortEntries(own);
  if (category !== EntryCategory.Glossary) return sorted.length ? [{ letter: null, entries: sorted }] : [];

  const groups: EntryGroup<T>[] = [];
  for (const entry of sorted) {
    const first = entry.title.trim().charAt(0).toLocaleUpperCase("en");
    const letter = /\p{L}/u.test(first) ? first.normalize("NFD").charAt(0) : null;
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.entries.push(entry);
    else groups.push({ letter, entries: [entry] });
  }
  return groups;
};

export type LinkEmbed =
  | { kind: "video"; src: string }
  | { kind: "page"; src: string };

/**
 * How a Links entry is shown: YouTube / Vimeo as a player, everything else as an embedded page.
 * Pages may refuse embedding (X-Frame-Options), so the view always offers "open in a new tab" as well.
 */
export const linkEmbed = (url: string): LinkEmbed | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(parsed.protocol)) return undefined;

  const host = parsed.hostname.replace(/^www\.|^m\./, "");
  const youtubeId =
    host === "youtu.be"
      ? parsed.pathname.slice(1)
      : host === "youtube.com"
        ? parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
        : undefined;
  if (youtubeId) return { kind: "video", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}` };

  const vimeoId = host === "vimeo.com" ? parsed.pathname.match(/^\/(\d+)/)?.[1] : undefined;
  if (vimeoId) return { kind: "video", src: `https://player.vimeo.com/video/${vimeoId}?dnt=1` };

  return { kind: "page", src: parsed.href };
};
