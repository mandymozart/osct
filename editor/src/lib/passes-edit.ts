import type { PassData } from "@engine/types";

/**
 * The post-processing panel's model: the book's passes are the master every spread shows; a
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

/**
 * The section's head (#181): the level in words – "post-processing · the whole book" / "· only this spread" –, and
 * "· off" for an empty list of the spread's own, "· none" while the book holds none
 */
export const passesHeading = (draft: PassesDraft): string => {
  const list = effectivePasses(draft);
  const level = draft.own === null ? "the whole book" : "only this spread";
  const empty = list.length ? "" : draft.own === null ? " · none" : " · off";
  return `post-processing · ${level}${empty}`;
};

/**
 * How many spreads use the book's passes (no list of their own) – the draft's, with the spread on the stage as the
 * panel holds it now (`own`: its unsaved choice)
 */
export const spreadsOnBooks = (
  spreads: readonly { id: string; passes?: readonly PassData[] | null }[], spreadId: string, own: readonly PassData[] | null,
): number => spreads.filter(spread => (spread.id === spreadId ? own === null : !spread.passes)).length;

/** The line under the head: what editing the list changes – the book's for N spreads, or this spread's override */
export const levelLine = (draft: PassesDraft, spreads: number): string =>
  draft.own !== null ? "overrides the book's for this spread"
    : spreads === 1 ? "changes the 1 spread that uses the book's" : `changes all ${spreads} spreads that use the book's`;

/** Save's words: what it saves – the whole book, this spread, or both */
export const saveLabel = (pending: { book?: unknown; spread?: unknown }): string =>
  "book" in pending && "spread" in pending ? "Save for the book and this spread"
    : "spread" in pending ? "Save for this spread" : "Save for the whole book";

/** *Own passes for this spread*: the override starts as a copy of the book's */
export const ownPasses = (draft: PassesDraft): PassesDraft => ({ ...draft, own: copy(draft.book) });

/** *Back to the book's*: the override goes */
export const backToBooks = (draft: PassesDraft): PassesDraft => ({ ...draft, own: null });

/** The list with the pass at `index` moved by `by` places (−1 up, +1 down); a move past an end leaves it as it is */
export const movePass = (list: readonly PassData[], index: number, by: number): PassData[] => {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [pass] = next.splice(index, 1);
  next.splice(to, 0, pass);
  return next;
};

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
