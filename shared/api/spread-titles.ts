/**
 * Spread titles (#298 phase 3, docs/editor.md "Spread titles"): a spread shows a title of its own, or – when it has
 * none – the title its pages give: `Pages 118–119`, `Page 256`, `Cover`, `Back cover`, `Front matter 1`, `Back matter 2`.
 * The API applies it where it serves spreads (the assembled content the reader reads, the editor's tree, the MCP) –
 * `Pages::withTitles`, pinned to this file by mcp/test/php-rules.test.ts. Ids never change with a title.
 *
 * A stored title that only repeats the pages (the import's `118–119`, `1`, `256`, an older `Cover`) counts as none, so
 * inserting or removing pages never leaves a stale title.
 */

/** A title that only says what the pages say: empty, page numbers, the covers' and matter's labels, `New spread` */
export const DERIVED_SPREAD_TITLE = /^(?:|(?:pages?\s*)?-?\d+(?:\s*[-–—]\s*-?\d+)?|cover|front cover|back|back cover|new spread|(?:front|back) matter(?:\s+\d+)?)$/iu;

export interface TitledSpread {
  id: string;
  title?: string;
  firstPage: number;
  lastPage: number;
  format?: string;
  matter?: string;
}

/** Whether a spread's title is its own (not one its pages give) */
export const hasOwnSpreadTitle = (title: string | undefined | null): boolean => typeof title === "string" && !DERIVED_SPREAD_TITLE.test(title.trim());

/** The title a spread's pages give; `matterNumber` = its place among the spreads of its matter, from 1 */
export function pagesTitle(spread: Omit<TitledSpread, "id" | "title">, matterNumber = 1): string {
  if (spread.format === "cover") return "Cover";
  if (spread.format === "back") return "Back cover";
  if ((!spread.format || spread.format === "spread") && (spread.matter === "front" || spread.matter === "back"))
    return `${spread.matter === "front" ? "Front" : "Back"} matter ${matterNumber}`;
  return spread.lastPage > spread.firstPage ? `Pages ${spread.firstPage}–${spread.lastPage}` : `Page ${spread.firstPage}`;
}

/** Every spread's shown title (spreads in book order), by id */
export function spreadTitles(spreads: readonly TitledSpread[]): Map<string, string> {
  const counts = { front: 0, back: 0 };
  const titles = new Map<string, string>();
  for (const spread of spreads) {
    const matter = (!spread.format || spread.format === "spread") && (spread.matter === "front" || spread.matter === "back") ? spread.matter : null;
    const number = matter ? ++counts[matter] : 1;
    titles.set(spread.id, hasOwnSpreadTitle(spread.title) ? spread.title! : pagesTitle(spread, number));
  }
  return titles;
}
