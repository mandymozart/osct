import type { PrintPlacement } from "./api";
import type { LayoutSheet, StageLayout } from "./stage/stage-layout";

/**
 * Pictures of a book's pages outside the stage (#153): the books page's covers and the book page's spread cards.
 * A card is the sheet's image (the layout's, when the content has one) with each target's print laid over it where
 * it is printed – the same `print` the stage reads first, so a print moved in the editor shows at once. Sheets
 * rendered by `scripts/layout/render-layout.py` (the demo book) leave the targets out for exactly this reason.
 */

export const LAYOUT_PATH = "/assets/content/layout/";
const CONTENT_PATH = "/assets/content/";
/** The page the stage assumes without a layout (mock-tracker's BOOK_PAGE_MM) */
const DEFAULT_PAGE = { width: 230, height: 320 } as const;

/** A content path (`/assets/content/…`) under the book's assets base; any other URL as it is */
export const assetUrl = (assetsBase: string | null | undefined, src: string): string => {
  const root = (assetsBase ?? "").replace(/\/+$/, "");
  return root && src.startsWith(CONTENT_PATH) ? `${root}${src}` : src;
};

/** The book's layout from its assets base, or null without one (no base, no layout, not a layout – never throws) */
export const fetchBookLayout = async (assetsBase: string | null | undefined): Promise<StageLayout | null> => {
  const root = (assetsBase ?? "").replace(/\/+$/, "");
  if (!root) return null;
  try {
    const response = await fetch(`${root}${LAYOUT_PATH}layout.json`);
    const data = response.ok ? await response.json() : null;
    return data && Array.isArray(data.sheets) && data.targets ? (data as StageLayout) : null;
  } catch {
    return null;
  }
};

/** URL of a layout sheet's image under the book's assets base */
export const sheetUrl = (assetsBase: string | null | undefined, sheet: LayoutSheet): string => assetUrl(assetsBase, `${LAYOUT_PATH}${sheet.image}`);

/** The layout's front cover, null when it has none */
export const coverSheetOf = (layout: StageLayout | null): LayoutSheet | null => layout?.sheets.find(sheet => sheet.kind === "cover-front") ?? null;

/** One page in mm: the layout's, else the stage's default */
export const pageOf = (layout: StageLayout | null): { width: number; height: number } => layout?.page ?? DEFAULT_PAGE;

export interface PrintBox {
  id: string;
  src: string;
  /** Percent of the card's width / height; the height follows the image, as on the stage */
  left: number;
  top: number;
  width: number;
}

interface PrintedTarget {
  id: string;
  imageSrc: string;
  print?: PrintPlacement | null;
}

/**
 * Where each target with a `print` lies on a card of `span` pages (1: a cover or a single page, 2: a double page),
 * in percent of the card. A double page has the left page first; a single card is its own surface. Targets
 * without a print (the designed book's, already in its sheet image) are left out.
 */
export const printBoxes = (targets: readonly PrintedTarget[], span: 1 | 2, page: { width: number; height: number }, assetsBase?: string | null): PrintBox[] => {
  const cardWidth = page.width * span;
  return targets.flatMap(target => {
    const print = target.print;
    if (!print || !target.imageSrc || !(print.width > 0)) return [];
    const offset = span === 2 && print.surface === "right" ? page.width : 0;
    return [{
      id: target.id,
      src: assetUrl(assetsBase, target.imageSrc),
      left: ((offset + print.x) / cardWidth) * 100,
      top: (print.y / page.height) * 100,
      width: (print.width / cardWidth) * 100,
    }];
  });
};
