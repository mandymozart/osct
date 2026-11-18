/**
 * The spread as the Inspector's spread section shows it when the tree selects it (#227): its pages in words and the
 * state of its post-processing – which level is in effect (the book's passes or the spread's own) and what it holds.
 */

export interface SpreadPagesSource {
  firstPage: number;
  lastPage: number;
  format?: string;
  matter?: string;
}

/** "28–29", "3", "cover", "back", "front matter", "back matter" */
export const spreadPages = (spread: SpreadPagesSource): string => {
  if (spread.format === "cover") return "cover";
  if (spread.format === "back") return "back";
  if (spread.matter === "front" || spread.matter === "back") return `${spread.matter} matter`;
  return spread.lastPage !== spread.firstPage ? `${spread.firstPage}–${spread.lastPage}` : `${spread.firstPage}`;
};
