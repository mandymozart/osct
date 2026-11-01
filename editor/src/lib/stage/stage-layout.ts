import type { Spread } from "@engine/types";
import { contentUrl } from "@engine/content/game-config";
import { PRINT_SURFACES, type PrintPlacement, type PrintSurface } from "@shared/types/game-config";

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
  /** A much sharper image of the same sheet (`sheets/<id>@sharp.jpg`), fetched by the stage only when the camera is close */
  imageSharp?: string;
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

/** The page (mm) the stage assumes when the content has no layout: one page of the double page – this book's print format */
export const DEFAULT_PAGE_MM = { width: 230, height: 320 } as const;

/** The layout's folder in the content */
export const LAYOUT_PATH = "/assets/content/layout/";

/** A fetched `layout.json` as a layout, null when it is none */
export const layoutFrom = (data: unknown): StageLayout | null => {
  const layout = data as Partial<StageLayout> | null;
  return layout && typeof layout === "object" && Array.isArray(layout.sheets) && layout.targets ? (layout as StageLayout) : null;
};

/** The layout, or null when the content has none (never throws) */
export const fetchStageLayout = async (): Promise<StageLayout | null> => {
  try {
    const response = await fetch(contentUrl(`${LAYOUT_PATH}layout.json`));
    return response.ok ? layoutFrom(await response.json()) : null;
  } catch {
    return null;
  }
};

/** Where a target is printed in the book's layout (its box in mm on the surface), null when the layout has none */
export const printedPlaceOf = (layout: StageLayout | null, targetId: string): PrintPlacement | null => {
  const printed = layout?.targets[targetId];
  if (!printed || !PRINT_SURFACES.includes(printed.surface as PrintSurface)) return null;
  return { surface: printed.surface as PrintPlacement["surface"], x: printed.x, y: printed.y, width: printed.width, height: printed.height };
};

/** URL of a sheet's image */
export const sheetImageUrl = (sheet: LayoutSheet): string => contentUrl(`${LAYOUT_PATH}${sheet.image}`);

/** URL of a sheet's sharper image, undefined when the layout has none */
export const sheetSharpImageUrl = (sheet: LayoutSheet): string | undefined => (sheet.imageSharp ? contentUrl(`${LAYOUT_PATH}${sheet.imageSharp}`) : undefined);

/** The sheet that shows a spread's pages (the one with its first page, else its last), null when there is none */
export const sheetForSpread = (layout: StageLayout | null, spread: Pick<Spread, "firstPage" | "lastPage" | "format"> | undefined): LayoutSheet | null => {
  if (!layout || !spread) return null;
  // The covers have no page: their sheets are the layout's cover-front / cover-back
  if (spread.format === "cover" || spread.format === "back") {
    return layout.sheets.find(sheet => sheet.kind === (spread.format === "cover" ? "cover-front" : "cover-back")) ?? null;
  }
  return layout.sheets.find(sheet => sheet.pages.includes(spread.firstPage))
    ?? layout.sheets.find(sheet => sheet.pages.includes(spread.lastPage))
    ?? null;
};
