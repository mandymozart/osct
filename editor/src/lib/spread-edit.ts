/**
 * Adding and removing spreads on the book page – what the API allows (docs/server.md "Spreads made in the editor"),
 * so the page offers only what will be accepted: a double page follows any spread but the back cover; any spread but
 * the one the book opens on can go, with everything on it – after the person saw the API's impact and confirmed it
 * (`removal.ts`, #198). A double page added or removed renumbers the later pages.
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
export const followBlockedBy = (spread: EditableSpread): string | null =>
  canFollow(spread) ? null : "Nothing follows the back cover.";

/** Why the spread cannot be removed, or null when it can: only the spread the book opens on stays */
export const removeBlockedBy = (spread: EditableSpread, initialSpreadId: string | null | undefined): string | null =>
  spread.id === initialSpreadId ? "The book opens on this spread." : null;
