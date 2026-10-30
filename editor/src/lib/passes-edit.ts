import type { PassData } from "@engine/types";

/**
 * The post-processing panel's model (content schema 2.5): the book's passes are the master every spread shows; a
 * spread's own list overrides them (`[]` = off there). The panel edits both at once – the book's list and the spread's
 * own (`null` = it uses the book's) – and compares them with the draft to know what Save writes. Pure, for the tests.
 */
export interface PassesDraft {
  book: PassData[];
  own: PassData[] | null;
}

/** Which list a spread shows */
export type PassesSource = "book" | "spread";

const copy = (passes: readonly PassData[]): PassData[] => passes.map(pass => ({ ...pass }));

export const samePasses = (a: readonly PassData[] | null, b: readonly PassData[] | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The draft's lists as the panel starts from them (copies – the panel never edits the loaded content) */
export const draftPasses = (book: readonly PassData[] | null | undefined, own: readonly PassData[] | null | undefined): PassesDraft => ({
  book: copy(book ?? []),
  own: own ? copy(own) : null,
});

export const passesSource = (draft: PassesDraft): PassesSource => (draft.own === null ? "book" : "spread");

/** The passes the spread shows (the list in effect) – what the panel lists and the stage previews */
export const effectivePasses = (draft: PassesDraft): PassData[] => draft.own ?? draft.book;

/** What is in effect, in a word: the book's, this spread's, off (an empty list of its own) or none */
export const passesStatus = (draft: PassesDraft): string =>
  draft.own === null ? (draft.book.length ? "the book's" : "none") : draft.own.length ? "this spread's" : "off";

/** *Own passes for this spread*: the override starts as a copy of the book's */
export const ownPasses = (draft: PassesDraft): PassesDraft => ({ ...draft, own: copy(draft.book) });

/** *Back to the book's*: the override goes */
export const backToBooks = (draft: PassesDraft): PassesDraft => ({ ...draft, own: null });

/** A change to the list in effect: the spread's own, or – while it uses the book's – the book's (every spread without its own) */
export const editInEffect = (draft: PassesDraft, change: (list: PassData[]) => PassData[]): PassesDraft =>
  draft.own === null ? { ...draft, book: change(draft.book) } : { ...draft, own: change(draft.own) };

/**
 * What Save writes, only what changed: `book` – the book's list (`null` when it is empty: the book holds none) for
 * `PUT …/passes`; `spread` – the spread's own (`null`: back to the book's) for `PUT …/spreads/{id}`
 */
export const pendingSaves = (draft: PassesDraft, saved: PassesDraft): { book?: PassData[] | null; spread?: PassData[] | null } => ({
  ...(samePasses(draft.book, saved.book) ? {} : { book: draft.book.length ? draft.book : null }),
  ...(samePasses(draft.own, saved.own) ? {} : { spread: draft.own }),
});
