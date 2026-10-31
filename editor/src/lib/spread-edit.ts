/**
 * Adding and removing spreads – what the API allows (docs/server.md "Spreads made in the editor"), so the editor offers
 * only what will be accepted: only a digital-first book's spreads are added or removed (#238 – a print-first book's come
 * from its layout, the controls are absent); a double page follows any spread but the back cover, a cover and a back
 * cover only while the book has none; any spread but the one the book opens on can go, with everything on it – after
 * the person saw the API's impact and confirmed it (`removal.ts`, #198). A double page added or removed renumbers the
 * later pages. The creation step (`NewSpreadForm.svelte`) reads the formats, the place and the pages from here.
 */
import { sourceOfTruthOf, type BookData, type SpreadFormat } from "@shared/types/game-config";

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

/** Spreads are added and removed in the editor only for a digital-first book (#238) */
export const canEditSpreads = (book: Pick<BookData, "sourceOfTruth"> | null | undefined): boolean => sourceOfTruthOf(book) === "digital";

/** The formats the book can still take: a double page always, the cover and the back cover while it has none */
export const creatableFormats = (spreads: readonly Pick<EditableSpread, "format">[]): SpreadFormat[] => [
  "spread",
  ...(spreads.some(s => s.format === "cover") ? [] : ["cover" as const]),
  ...(spreads.some(s => s.format === "back") ? [] : ["back" as const]),
];

/** The spreads a double page may follow, in book order (all but the back cover) */
export const followable = <T extends Pick<EditableSpread, "format">>(spreads: readonly T[]): T[] => spreads.filter(s => s.format !== "back");

/** Where a new double page goes by default: after `preferred` when it can follow, else after the last that can (the API's own default) */
export const defaultAfter = (spreads: readonly Pick<EditableSpread, "id" | "format">[], preferred?: string | null): string | null => {
  const options = followable(spreads);
  return options.find(s => s.id === preferred)?.id ?? options.at(-1)?.id ?? null;
};

/** The pages a new double page after `after` takes (the two after its last page); the later pages move on by two */
export const newPagesAfter = (spreads: readonly Pick<EditableSpread, "id" | "lastPage">[], after: string | null): { first: number; last: number } => {
  const anchor = spreads.find(s => s.id === after);
  const last = anchor ? anchor.lastPage : 0;
  return { first: last + 1, last: last + 2 };
};
