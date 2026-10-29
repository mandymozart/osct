/**
 * The book page's grid of spreads: one grid cell is one printed page. A double page spans two cells and starts on an
 * even column (a left-hand page), a single right-hand page (the front cover, page 1) sits on an odd column – so the
 * first cell of the first row stays empty and 2–3, 4–5 … line up as spreads. The back cover follows the flow.
 */

export interface GridSpread {
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  format?: string;
}

export type GridCell<T extends GridSpread> = { spacer: true } | { spacer: false; spread: T; span: 1 | 2 };

/** Columns of the grid (an even number, so a double page never wraps) */
export const GRID_COLUMNS = 8;

const isDoublePage = (spread: GridSpread) => !spread.format || spread.format === "spread" ? spread.lastPage > spread.firstPage : false;

export const spanOf = (spread: GridSpread): 1 | 2 => (isDoublePage(spread) ? 2 : 1);

/** The spreads in book order with empty spacer cells where a page has to start on the other side of the gutter */
export const gridCells = <T extends GridSpread>(spreads: T[]): GridCell<T>[] => {
  const cells: GridCell<T>[] = [];
  let column = 0;
  for (const spread of spreads) {
    const span = spanOf(spread);
    const rightHand = spread.format === "cover" || (span === 1 && spread.format !== "back");
    // A right-hand single page goes on an odd column, a double page on an even one
    const wanted = rightHand ? 1 : span === 2 ? 0 : column % 2;
    if (column % 2 !== wanted) {
      cells.push({ spacer: true });
      column += 1;
    }
    cells.push({ spacer: false, spread, span });
    column = (column + span) % GRID_COLUMNS;
  }
  return cells;
};

/** The pages a spread covers, e.g. `4–5`, or its format for the covers */
export const pagesOf = (spread: GridSpread): string =>
  spread.format === "cover" ? "cover" : spread.format === "back" ? "back" : `${spread.firstPage}${spread.lastPage !== spread.firstPage ? `–${spread.lastPage}` : ""}`;

/** The format worth a label: anything but the default double page */
export const formatLabelOf = (spread: GridSpread): string => (spread.format && spread.format !== "spread" ? spread.format : "");

/**
 * The one-line caption: the pages (the covers have none) and the title, when the title is more than the pages again.
 * The covers' format is the label, so it is not repeated here.
 */
export const captionOf = (spread: GridSpread): string => {
  const pages = formatLabelOf(spread) ? "" : pagesOf(spread);
  const title = spread.title.replace(/[-–—]/g, "–");
  const same = !title || title.toLowerCase() === pagesOf(spread).toLowerCase() || title.toLowerCase() === formatLabelOf(spread).toLowerCase();
  return [pages, same ? "" : spread.title].filter(Boolean).join(" · ");
};
