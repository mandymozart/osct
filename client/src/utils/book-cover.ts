import { CONTENT_PATH, contentUrl, getContentSizes } from "@/utils/game-config";

/** The print layout inside the content (`layout/layout.json`, written by the delivery's layout step) */
const LAYOUT = `${CONTENT_PATH}layout/`;

/** A sheet of the print layout: a page, a spread or a cover, as one picture */
export interface LayoutSheet {
  id?: string;
  /** `cover-front`, `cover-back`, … */
  kind?: string;
  /** The printed page numbers on it (none for covers) */
  pages?: number[];
  /** Below `layout/` */
  image?: string;
  widthMm?: number;
  heightMm?: number;
}

/**
 * A file of the layout as the loaded content serves it. A content build that did not change the layout keeps it in an
 * earlier build's folder – files.json names it there (#354: staging's `layout.json` is not below the loaded version) –
 * else below the loaded version, or with the app.
 */
export const layoutFileUrl = (file: string): string => {
  const path = `${LAYOUT}${file}`;
  return Object.keys(getContentSizes() ?? {}).find(url => url.endsWith(path)) ?? contentUrl(path);
};

let layout: Promise<LayoutSheet[]> | null = null;

/** The layout's sheets, in print order; fetched once, [] when the content has no layout or the fetch fails */
export const layoutSheets = (): Promise<LayoutSheet[]> =>
  (layout ??= Promise.resolve()
    .then(() => fetch(layoutFileUrl("layout.json")))
    .then(response => (response?.ok ? (response.json() as Promise<{ sheets?: LayoutSheet[] }>) : null))
    .then(data => data?.sheets ?? [])
    .catch(() => []));

/** A sheet's picture as a URL */
export const sheetUrl = (sheet: LayoutSheet): string | null => (sheet.image ? layoutFileUrl(sheet.image) : null);

/**
 * The book's front cover as a picture: the print layout's `cover-front` sheet (#285 – the back of the marginalia
 * card). Fetched once; null when the content has no layout or no cover sheet, or the fetch fails.
 */
export const bookCoverUrl = (): Promise<string | null> =>
  layoutSheets().then(sheets => {
    const sheet = sheets.find(s => s.kind === "cover-front");
    return sheet ? sheetUrl(sheet) : null;
  });

/**
 * The sheet that shows these pages and the spreads before it in print order (`before` of them, nearest last) – the
 * landing's book opens through them onto a scene (#354); null when no sheet has the pages
 */
export const spreadSheets = async (pages: readonly number[], before: number): Promise<{ spread: LayoutSheet; earlier: LayoutSheet[] } | null> => {
  if (!pages.length) return null;
  const sheets = await layoutSheets();
  const index = sheets.findIndex(sheet => sheet.image && pages.every(page => sheet.pages?.includes(page)));
  if (index < 0) return null;
  const earlier = sheets.slice(0, index).filter(sheet => sheet.image && (sheet.pages?.length ?? 0) >= 2).slice(-before);
  return { spread: sheets[index], earlier };
};

/** Test seam: forget the fetched layout */
export const resetBookCover = (): void => {
  layout = null;
};
