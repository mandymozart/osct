/**
 * Adding and removing spreads on the book page – what the API allows (docs/server.md "Spreads made in the editor"),
 * so the page offers only what will be accepted: a double page follows any spread but the back cover; a spread can go
 * while it has no entries and the book does not open on it. A double page added or removed renumbers the later pages.
 */

export interface EditableSpread {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  format?: string;
  entries: readonly unknown[];
}

/** Whether a double page can be added right after this spread (nothing follows the back cover) */
export const canFollow = (spread: EditableSpread): boolean => spread.format !== "back";

/** Why no double page can be added after the spread (the card's menu shows it), or null when one can */
export const followBlockedBy = (spread: EditableSpread, addRefused = false): string | null => {
  if (!canFollow(spread)) return "Nothing follows the back cover.";
  if (addRefused) return "New spreads come in with an import for now.";
  return null;
};

/** Why the spread cannot be removed, or null when it can */
export const removeBlockedBy = (spread: EditableSpread, initialSpreadId: string | null | undefined): string | null => {
  if (spread.id === initialSpreadId) return "The book opens on this spread.";
  const n = spread.entries.length;
  if (n) return `It has ${n === 1 ? "an entry" : `${n} entries`} – delete ${n === 1 ? "it" : "them"} first.`;
  return null;
};

/** How many pages go with the spread: a cover has no page number, so removing it renumbers nothing */
export const pagesOfSpread = (spread: EditableSpread): number =>
  spread.format === "cover" || spread.format === "back" ? 0 : spread.lastPage - spread.firstPage + 1;

/** The question before removing a spread: which one, and what happens to the pages after it */
export const removeQuestion = (spread: EditableSpread, spreads: readonly EditableSpread[]): string => {
  const pages = pagesOfSpread(spread);
  const later = pages > 0 && spreads.some(s => s.id !== spread.id && s.firstPage > spread.lastPage);
  const name = spread.format === "cover" ? "the cover" : spread.format === "back" ? "the back cover" : `the spread “${spread.title}” (pages ${spread.firstPage}–${spread.lastPage})`;
  return `Remove ${name}?${later ? ` The pages after it are numbered back by ${pages}.` : ""}`;
};

/**
 * The API refuses a double page (it knows only the covers): an API from before `format: "spread"`, e.g. the editor
 * against an older server – then new spreads come only with an import
 */
export const isAddRefused = (error: unknown): boolean =>
  !!error && typeof error === "object" && (error as { code?: unknown }).code === "invalid-spread" && /cover or back/.test(String((error as { message?: unknown }).message));
