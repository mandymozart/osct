/**
 * The spread as the Stage panel's spread section shows it when the tree selects it (#227): its pages in words and the
 * state of its post-processing – which level is in effect (the book's passes or the spread's own) and what it holds.
 */

export interface SpreadPagesSource {
  firstPage: number;
  lastPage: number;
  format?: string;
}

/** "28–29", "3", "cover", "back" */
export const spreadPages = (spread: SpreadPagesSource): string => {
  if (spread.format === "cover") return "cover";
  if (spread.format === "back") return "back";
  return spread.lastPage !== spread.firstPage ? `${spread.firstPage}–${spread.lastPage}` : `${spread.firstPage}`;
};

/**
 * The post-processing in effect, in words: "the whole book · bloom, grade" while the spread uses the book's passes,
 * "only this spread · vignette" with its own; "none" when the book holds none, "off" for an empty list of its own
 */
export const passesState = (book: readonly { type: string }[] | null | undefined, own: readonly { type: string }[] | null | undefined): string => {
  const list = own ?? book ?? [];
  const level = own ? "only this spread" : "the whole book";
  const types = list.length ? list.map(pass => pass.type).join(", ") : own ? "off" : "none";
  return `${level} · ${types}`;
};
