/**
 * The entry as the Inspector shows it when the tree selects one (#227), read-only until content editing (#223) turns
 * the view into its form in the same place: the meta rows (category, title, access page, author, tags), the body as
 * the reader's paragraphs (a blank line between two), the image, a link's URL and the target. The words are here; the
 * panel (`EntryView.svelte`) draws them.
 */

export interface EntryFields {
  category: string;
  title: string;
  page: number;
  body: string;
  author?: string;
  image?: string;
  media?: string;
  tags: readonly string[];
}

export interface EntryRow {
  label: string;
  value: string;
}

/** The body's paragraphs as the reader shows them: split at blank lines, trimmed, empty ones left out */
export const entryParagraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

/** The meta rows: category, title, access page, then the author and the tags where the entry has them */
export const entryRows = (entry: EntryFields): EntryRow[] => [
  { label: "category", value: entry.category },
  { label: "title", value: entry.title },
  { label: "access page", value: `p. ${entry.page}` },
  ...(entry.author?.trim() ? [{ label: "author", value: entry.author.trim() }] : []),
  ...(entry.tags.length ? [{ label: "tags", value: entry.tags.join(", ") }] : []),
];

/** A link's URL to open – only http(s); anything else is shown as text, never a link */
export const entryLink = (media: string | undefined): string | null => {
  const url = media?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
};

/** The entry row's help in the tree: what a tap does, with or without a target */
export const entryRowHelp = (entry: { category: string; page: number }, hasTarget: boolean): string =>
  `${entry.category} · p. ${entry.page} – a tap selects the entry: the Inspector shows its text${hasTarget ? ", the stage outlines its target" : " (it has no target)"}`;
