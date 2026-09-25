import { ENTRY_CATEGORIES, Entry, EntryCategory } from "@/types";
import { isEntryCategory } from "@shared/guards/game-config";

/**
 * Pure helpers of consultation mode (entries list + entry view, design p.15–31). No DOM, no store.
 */

/**
 * Label from the enum value, plural everywhere as in the design ("Videos" in the list, the menu and the
 * entry's category row, frames 18/20). The glossary has no plural.
 */
export const categoryLabel = (category: EntryCategory): string =>
  category.charAt(0).toLocaleUpperCase("en") + category.slice(1) +
  (category !== EntryCategory.Glossary ? "s" : "");

export const DEFAULT_CATEGORY = EntryCategory.Glossary;

export const isCategory = isEntryCategory;

/** Filter of the entries list: a category, or all bookmarked entries (PLAN Phase 4, not in the design yet) */
export const BOOKMARKED = "bookmarked";
export type EntriesFilter = EntryCategory | typeof BOOKMARKED;

export const isEntriesFilter = (value: unknown): value is EntriesFilter => value === BOOKMARKED || isCategory(value);

export const filterLabel = (filter: EntriesFilter): string =>
  filter === BOOKMARKED ? "Bookmarked" : categoryLabel(filter);

/** The filter options in menu order: the four categories, then "Bookmarked" (5th item for now – Tilman) */
export const ENTRIES_FILTERS: readonly EntriesFilter[] = [...ENTRY_CATEGORIES, BOOKMARKED];

/**
 * Unconsulted entries are hidden in the final app (more game-like) and shown **locked** during
 * development to check that everything is listed (PLAN Phase 4). `VITE_SHOW_LOCKED_ENTRIES=true|false`
 * overrides the default (dev: shown, production: hidden).
 */
export const showLockedEntries = (): boolean => {
  const flag = import.meta.env.VITE_SHOW_LOCKED_ENTRIES;
  return flag === undefined ? import.meta.env.DEV : flag === "true";
};

/** List label: texts show the author (frame 24), the others their title */
export const entryLabel = (entry: Pick<Entry, "category" | "title" | "author">): string =>
  entry.category === EntryCategory.Text && entry.author ? `'${entry.title}', ${entry.author}` : entry.title;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const sortEntries = <T extends Pick<Entry, "title">>(entries: readonly T[]): T[] =>
  [...entries].sort((a, b) => collator.compare(a.title, b.title));

export interface EntryGroup<T> {
  /** Letter header (glossary), or null for entries without one (e.g. "4th wall", other categories) */
  letter: string | null;
  entries: T[];
}

/**
 * Sorted entries; the glossary is grouped by first letter (frame 17: "4th wall" before "A" without
 * a header), the other categories are one list.
 */
export const groupEntries = <T extends Pick<Entry, "title" | "category">>(
  entries: readonly T[],
  category: EntryCategory,
): EntryGroup<T>[] => {
  const sorted = sortEntries(entries.filter(e => e.category === category));
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
 * How a Links entry is shown (frames 30–31): YouTube / Vimeo as a player, everything else as an
 * embedded page. Pages may refuse embedding (X-Frame-Options) – the view always offers "open in a
 * new tab" as well.
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
