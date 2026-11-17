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

/** Where a page image lies on its sheet: the left or the right half of a double page, or the whole of a cover */
export type PageHalf = "left" | "right" | "whole";

/** The page images over a sheet, by half (URLs as uploaded) */
export type SheetPageImages = Partial<Record<PageHalf, string>>;

/** A page image's key – `12`, `-3`, `1f` (the unnumbered half next to page 1) – as the API's `Pages::key` */
const keyOf = (page: number, facing = false): string => `${page}${facing ? "f" : ""}`;

/**
 * The page images (#251, by page key) that lie over a spread's sheet: a cover's on the whole, a double page's first page
 * left and its last right, a single page on its side (odd right, even left) with the unnumbered half on the other.
 * Pages without an image keep the layout's half.
 */
export const pageImagesOfSpread = (
  spread: Pick<Spread, "firstPage" | "lastPage" | "format"> | undefined,
  images: Readonly<Record<string, string>>,
): SheetPageImages => {
  if (!spread) return {};
  const result: SheetPageImages = {};
  const put = (half: PageHalf, key: string) => {
    if (images[key]) result[half] = images[key];
  };
  if (spread.format === "cover" || spread.format === "back") put("whole", keyOf(spread.firstPage));
  else if (spread.lastPage > spread.firstPage) {
    put("left", keyOf(spread.firstPage));
    put("right", keyOf(spread.lastPage));
  } else {
    const even = spread.firstPage % 2 === 0;
    put(even ? "left" : "right", keyOf(spread.firstPage));
    put(even ? "right" : "left", keyOf(spread.firstPage, true));
  }
  return result;
};

/** A sheet two pages wide – a double page – against one page of the book (in mm) */
export const isDoubleSheet = (sheet: Pick<LayoutSheet, "widthMm">, page: { width: number }): boolean => sheet.widthMm > page.width * 1.5;

/** The side of a single printed page's unnumbered facing half (#251): left of an odd (right-hand) page, right of an even one */
export const facingSideOf = (page: number): "left" | "right" => (page % 2 === 0 ? "right" : "left");

/**
 * Whether a single printed page (page 1, the last printed page – not a cover, not matter) shows as its double page
 * (#251), and on which side its unnumbered facing half lies: when the half exists – a page image of its own (`1f`) or
 * the other half of the layout's double sheet. Null: anything else, or a single page without its facing half.
 */
export const facingHalfOf = (
  spread: { firstPage: number; lastPage: number; format?: string } | undefined,
  sheet: Pick<LayoutSheet, "widthMm"> | null,
  page: { width: number },
  images: Readonly<Record<string, string>>,
): "left" | "right" | null => {
  if (!spread || (spread.format && spread.format !== "spread") || spread.firstPage !== spread.lastPage) return null;
  const exists = !!images[keyOf(spread.firstPage, true)] || (!!sheet && isDoubleSheet(sheet, page));
  return exists ? facingSideOf(spread.firstPage) : null;
};

/**
 * The half a single printed page's one-page layout sheet lies on in the stage's open book (#251): its printed page's
 * (odd right, even left), the facing half beside it free for its page image; nothing for a double sheet, a cover or a
 * double page (centred on the spine)
 */
export const onePageSheetSide = (
  spread: { firstPage: number; lastPage: number; format?: string } | undefined,
  sheet: Pick<LayoutSheet, "widthMm">,
  page: { width: number },
): { side?: "left" | "right" } => {
  if (!spread || (spread.format && spread.format !== "spread") || spread.firstPage !== spread.lastPage || isDoubleSheet(sheet, page)) return {};
  return { side: facingSideOf(spread.firstPage) === "left" ? "right" : "left" };
};

/** The sheet that shows a spread's pages (the one with its first page, else its last), null when there is none */
export const sheetForSpread = (layout: StageLayout | null, spread: { firstPage: number; lastPage: number; format?: string; matter?: string } | undefined): LayoutSheet | null => {
  if (!layout || !spread) return null;
  // The covers have no page: their sheets are the layout's cover-front / cover-back
  if (spread.format === "cover" || spread.format === "back") {
    return layout.sheets.find(sheet => sheet.kind === (spread.format === "cover" ? "cover-front" : "cover-back")) ?? null;
  }
  const numbered = layout.sheets.find(sheet => sheet.pages.includes(spread.firstPage))
    ?? layout.sheets.find(sheet => sheet.pages.includes(spread.lastPage));
  if (numbered) return numbered;
  // Front and back matter have no printed numbers: their sheets are the layout's front-matter / back-matter sheets in
  // book order – front matter counts down to page −1, back matter on from the last printed page (#296)
  const matter = spread.matter === "front" || spread.matter === "back" ? spread.matter : null;
  if (!matter) return null;
  const sheets = layout.sheets.filter(sheet => sheet.kind === `${matter}-matter`);
  const lastPrinted = Math.max(0, ...layout.sheets.flatMap(sheet => sheet.pages));
  const index = matter === "front" ? sheets.length - Math.floor(-spread.firstPage / 2) : Math.floor((spread.firstPage - lastPrinted - 1) / 2);
  return sheets[index] ?? null;
};
