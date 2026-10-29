import type { Spread } from "../../../../engine/src/types/index";
import { contentUrl } from "../../../../engine/src/content/game-config";

/**
 * The book's layout for the editor's mock stage (three-free): every sheet of the book as laid out (the covers as
 * single pages, the rest as double pages) with its rendered image, and every printed target's geometry in mm from
 * the top left corner of its page. Written by `scripts/layout/extract-layout.py` from the designed PDFs into the
 * content's `layout/` folder, copied by the content build (`/assets/content/layout/`). Optional: without it the
 * stage shows blank pages and places the targets by the trigger protocol or in a row.
 */

export type SheetKind = "spread" | "cover-front" | "cover-back" | "front-matter" | "back-matter" | "sheet";

export interface LayoutSheet {
  id: string;
  kind: SheetKind;
  /** The book pages printed on it (a double page has two, a cover none) */
  pages: number[];
  /** Image path inside `layout/` */
  image: string;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  /** The surfaces targets may lie on: left / right page, or the cover's front / back */
  surfaces: string[];
}

export interface LayoutTarget {
  page: number;
  surface: string;
  /** mm from the top left corner of the surface */
  x: number;
  y: number;
  width: number;
  height: number;
  sheet: string | null;
}

export interface StageLayout {
  page: { width: number; height: number };
  sheets: LayoutSheet[];
  targets: Record<string, LayoutTarget>;
}

const LAYOUT_PATH = "/assets/content/layout/";

/** The layout, or null when the content has none (never throws) */
export const fetchStageLayout = async (): Promise<StageLayout | null> => {
  try {
    const response = await fetch(contentUrl(`${LAYOUT_PATH}layout.json`));
    if (!response.ok) return null;
    const layout = await response.json();
    return layout && typeof layout === "object" && Array.isArray(layout.sheets) && layout.targets ? (layout as StageLayout) : null;
  } catch {
    return null;
  }
};

/** URL of a sheet's image */
export const sheetImageUrl = (sheet: LayoutSheet): string => contentUrl(`${LAYOUT_PATH}${sheet.image}`);

/** The sheet that shows a spread's pages (the one with its first page, else its last), null when there is none */
export const sheetForSpread = (layout: StageLayout | null, spread: Pick<Spread, "firstPage" | "lastPage"> | undefined): LayoutSheet | null => {
  if (!layout || !spread) return null;
  return layout.sheets.find(sheet => sheet.pages.includes(spread.firstPage))
    ?? layout.sheets.find(sheet => sheet.pages.includes(spread.lastPage))
    ?? null;
};
