import type { EditorEntry, EntryFields } from "@shared/api/editor";
import { BODY_MAX_LENGTH, cleanTags, ENTRY_TAGS, isLinkUrl, TEXT_MAX_LENGTH } from "@shared/api/rules";
import { ENTRY_CATEGORIES } from "@shared/types/entry";

/**
 * Editing an entry (#223): the form's fields as text, what a save sends (the fields that changed, `PUT …/entries/{id}`),
 * what keeps Save off, and the Entries page's list – the filter, the search, the glossary grouped by its first letter as
 * the reader groups it. The form (`EntryForm.svelte`) and the page (`EntriesPage.svelte`) draw it.
 *
 * Every text field is one value today; a language variant (#224) becomes a second draft of the same shape per language,
 * so the form gains a switch without being reshaped.
 */

/** What the form edits: the entry's fields as the inputs hold them – tags as one line, separated by commas */
export interface EntryDraft {
  title: string;
  category: string;
  page: number;
  author: string;
  tags: string;
  body: string;
  image: string;
  media: string;
}

/** The fields the form shows, in the Inspector's order */
export const draftOf = (entry: EntryFields): EntryDraft => ({
  title: entry.title,
  category: entry.category,
  page: entry.page,
  author: entry.author ?? "",
  tags: entry.tags.join(", "),
  body: entry.body ?? "",
  image: entry.image ?? "",
  media: entry.media ?? "",
});

/** The tags of the line: split at commas, trimmed, each once */
export const tagsOf = (line: string): string[] => cleanTags(line.split(","));

/** A save's body: only the fields that differ from the entry; an optional field emptied is `null` (removed) */
export const entryChanges = (entry: EntryFields, draft: EntryDraft): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  if (draft.title.trim() !== entry.title) changes.title = draft.title.trim();
  if (draft.category !== entry.category) changes.category = draft.category;
  if (draft.page !== entry.page) changes.page = draft.page;
  if (draft.body !== (entry.body ?? "")) changes.body = draft.body;
  const optional = (key: "author" | "image" | "media") => {
    const value = draft[key].trim();
    if (value !== (entry[key] ?? "")) changes[key] = value === "" ? null : value;
  };
  optional("author");
  optional("image");
  optional("media");
  const tags = tagsOf(draft.tags);
  if (JSON.stringify(tags) !== JSON.stringify(entry.tags)) changes.tags = tags;
  return changes;
};

/** The draft differs from the entry */
export const isDirty = (entry: EntryFields, draft: EntryDraft): boolean => Object.keys(entryChanges(entry, draft)).length > 0;

/** What keeps Save off – the API's checks, before the API is asked */
export const draftProblems = (draft: EntryDraft): string[] => {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("The title is empty.");
  for (const [key, value] of [["title", draft.title], ["author", draft.author]] as const) {
    if (value.trim().length > TEXT_MAX_LENGTH) problems.push(`The ${key} is longer than ${TEXT_MAX_LENGTH} characters.`);
  }
  if (!(ENTRY_CATEGORIES as readonly string[]).includes(draft.category)) problems.push(`The category is none of ${ENTRY_CATEGORIES.join(", ")}.`);
  if (!Number.isInteger(draft.page)) problems.push("The access page is no whole number.");
  if (draft.media.trim() && !isLinkUrl(draft.media.trim())) problems.push("The link is no http(s) address.");
  const tags = tagsOf(draft.tags);
  if (tags.length > ENTRY_TAGS.max) problems.push(`More than ${ENTRY_TAGS.max} tags.`);
  if (tags.some(tag => tag.length > ENTRY_TAGS.length)) problems.push(`A tag is longer than ${ENTRY_TAGS.length} characters.`);
  if (draft.body.length > BODY_MAX_LENGTH) problems.push(`The text is longer than ${BODY_MAX_LENGTH} characters.`);
  return problems;
};

/** A picture's URL to show: an absolute URL as it is, a content path (`/assets/content/…`) below the book's assets base */
export const imageUrl = (src: string, assetsBase: string | null | undefined): string =>
  !src.startsWith("/") || src.startsWith("//") ? src : `${(assetsBase ?? "").replace(/\/+$/, "")}${src}`;

// ── The Entries page ──

/** The page's category filter: every entry, or one category */
export const ENTRY_FILTERS = ["all", ...ENTRY_CATEGORIES] as const;
export type EntryFilter = (typeof ENTRY_FILTERS)[number];

/** A text as the search compares it: lower case, without accents */
const folded = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");

/** The entries of the filter that match the search – in the title, the text, the author, the tags or the id */
export const filterEntries = (entries: readonly EditorEntry[], filter: EntryFilter, query: string): EditorEntry[] => {
  const words = folded(query).split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (filter !== "all" && entry.category !== filter) return false;
    if (!words.length) return true;
    const text = folded([entry.title, entry.body, entry.author ?? "", entry.tags.join(" "), entry.id].join(" "));
    return words.every(word => text.includes(word));
  });
};

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export interface EntryGroup {
  /** The first letter (the glossary), null for the entries without one ("4th wall") and for the other lists */
  letter: string | null;
  entries: EditorEntry[];
}

/**
 * The list as the page shows it: sorted by title; the glossary grouped by first letter as the reader groups it (an
 * accent folded – É under E –, the titles that start with no letter first, without a header); every other filter one
 * list in the book's order of pages
 */
export const groupEntries = (entries: readonly EditorEntry[], filter: EntryFilter): EntryGroup[] => {
  if (filter !== "glossary") {
    const sorted = [...entries].sort((a, b) => a.page - b.page || collator.compare(a.title, b.title));
    return sorted.length ? [{ letter: null, entries: sorted }] : [];
  }
  const groups: EntryGroup[] = [];
  for (const entry of [...entries].sort((a, b) => collator.compare(a.title, b.title))) {
    const first = entry.title.trim().charAt(0).toLocaleUpperCase("en");
    const letter = /\p{L}/u.test(first) ? first.normalize("NFD").charAt(0) : null;
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.entries.push(entry);
    else groups.push({ letter, entries: [entry] });
  }
  return groups;
};

/** How many entries each filter holds (its pill's count) */
export const filterCounts = (entries: readonly EditorEntry[]): Record<EntryFilter, number> =>
  Object.fromEntries(ENTRY_FILTERS.map(filter => [filter, filter === "all" ? entries.length : entries.filter(e => e.category === filter).length])) as Record<EntryFilter, number>;
