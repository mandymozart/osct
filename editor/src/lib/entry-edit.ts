import type { EditorEntry, EntryFields } from "@shared/api/editor";
import { BODY_MAX_LENGTH, cleanTags, ENTRY_TAGS, isLinkUrl, TEXT_MAX_LENGTH } from "@shared/api/rules";
import { ENTRY_CATEGORIES } from "@shared/types/entry";

/**
 * Editing an entry (#223): the form's fields as text, what a save sends (the fields that changed, `PUT …/entries/{id}`)
 * and what keeps Save off. The form (`EntryForm.svelte`) draws it; the book's entries are found with the top bar's
 * search (`book-search.ts`, #237).
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
