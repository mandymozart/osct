import type { BookPage, PageImageChange } from "./api";
import { matchNames, pageKey } from "@shared/api/page-names";
import { sheetForSpread, type StageLayout } from "#lib/stage/stage-layout.js";
import { sheetUrl } from "#lib/sheet-preview.js";
import type { Spread } from "@engine/types";

/**
 * The Pages view's logic (#251, `PagesView.svelte`): the layout's half a page shows without a page image, the print
 * format the matter is checked against, and the bulk upload's proposal (`@shared/api/page-names` reads the names).
 */

/** The layout's picture of a page: its sheet's image and which part of it is the page */
export interface LayoutHalf {
  url: string;
  part: "left" | "right" | "whole";
}

/** The layout's half for a page, null without a layout sheet for its spread */
export const layoutHalfOf = (
  page: BookPage,
  spread: Pick<Spread, "firstPage" | "lastPage" | "format" | "matter"> | undefined,
  layout: StageLayout | null,
  assetsBase: string | null | undefined,
): LayoutHalf | null => {
  const sheet = sheetForSpread(layout, spread);
  if (!sheet || !layout) return null;
  const single = sheet.widthMm < layout.page.width * 1.5;
  return { url: sheetUrl(assetsBase, sheet), part: single || page.side === "front" || page.side === "back" ? "whole" : page.side };
};

/**
 * The book's print format as its layout has it: the front and back matter sheets and the last printed page – what the
 * matter is checked against. Without a layout: two sheets each (the book's format), the last page as the spreads have it.
 */
export const printFormatOf = (layout: StageLayout | null): { front: number; back: number; lastPage?: number } => {
  if (!layout) return { front: 2, back: 2 };
  const pages = layout.sheets.flatMap(sheet => sheet.pages);
  return {
    front: layout.sheets.filter(sheet => sheet.kind === "front-matter").length,
    back: layout.sheets.filter(sheet => sheet.kind === "back-matter").length,
    ...(pages.length ? { lastPage: Math.max(...pages) } : {}),
  };
};

/** A row of the bulk upload: a file and the page it goes to ("" = skipped) */
export interface BulkRow {
  file: File;
  key: string;
  /** The name read no page, or an earlier file took the page: shown as a hint */
  note: string | null;
}

/** The proposal for dropped or picked files: each one's page by its name; unmatched and duplicates are skipped with a note */
export const bulkRows = (files: readonly File[], pages: readonly BookPage[]): BulkRow[] =>
  matchNames(files.map(file => file.name), pages).map((match, i) => ({
    file: files[i],
    key: match.page && !match.duplicate ? pageKey(match.page) : "",
    note: !match.page ? "no page by this name – choose one or skip" : match.duplicate ? `${match.page.label} is taken by an earlier file` : null,
  }));

/** The pages two or more rows go to – Apply waits until each page has one file */
export const bulkClashes = (rows: readonly BulkRow[]): Set<string> => {
  const seen = new Set<string>();
  const clashes = new Set<string>();
  for (const row of rows) {
    if (!row.key) continue;
    if (seen.has(row.key)) clashes.add(row.key);
    seen.add(row.key);
  }
  return clashes;
};

/** The page of a key, undefined when the book has none */
export const pageByKey = (pages: readonly BookPage[], key: string): BookPage | undefined => pages.find(page => pageKey(page) === key);

/** The change that sets a page's image */
export const setItem = (page: BookPage, url: string, name?: string): PageImageChange => ({ page: page.page, facing: page.facing, url, ...(name ? { name } : {}) });

/** A page's name in a list: its label and what it is (`F1 · front matter`, `next to 1 · unnumbered`) */
export const pageTitle = (page: BookPage): string => {
  const kinds: Record<BookPage["kind"], string> = {
    cover: "", back: "", "front-matter": "front matter", "back-matter": "back matter", page: "", facing: "unnumbered half",
  };
  const kind = kinds[page.kind];
  const label = page.kind === "page" ? `p. ${page.label}` : page.label;
  return kind ? `${label} · ${kind}` : label;
};
