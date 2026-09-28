import { Entry, EntryCategory } from "@/types";
import { isEntryCategory } from "@shared/guards/game-config";
import { t } from "i18next";

/**
 * Pure helpers of consultation mode (entries list and entry view). No DOM, no store.
 */

/**
 * Label of a category in the current language. Always the plural form ("Videos"), in the list, the
 * menu and the entry's category row alike.
 */
export const categoryLabel = (category: EntryCategory): string => t(`entries:categories.${category}`);

export const DEFAULT_CATEGORY = EntryCategory.Glossary;

export const isCategory = isEntryCategory;

/**
 * Whether unconsulted entries are listed as locked. Production hides them (the reader discovers entries);
 * development shows them so the complete list can be checked. `VITE_SHOW_LOCKED_ENTRIES=true|false`
 * overrides the default.
 */
export const showLockedEntries = (): boolean => {
  const flag = import.meta.env.VITE_SHOW_LOCKED_ENTRIES;
  return flag === undefined ? import.meta.env.DEV : flag === "true";
};

/** List label: texts show their author, all other categories their title */
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
 * Sorted entries. The glossary is grouped by first letter; entries not starting with a letter
 * (e.g. "4th wall") come first without a header. Other categories form one ungrouped list.
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
