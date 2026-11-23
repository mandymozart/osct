// The engine's accessors directly (RULES #14): the landing (#355) reads the layout too and imports nothing of the app
import { fetchLayoutSheets, layoutFileUrl } from "@engine/content/layout";
import { landingCover, type LayoutSheet } from "@shared/api/landing-extract";

export type { LayoutSheet } from "@shared/api/landing-extract";

let layout: Promise<LayoutSheet[]> | null = null;

/** The print layout's sheets (`layout/layout.json`), in print order; fetched once, [] when the content has no layout or the fetch fails */
export const layoutSheets = (): Promise<LayoutSheet[]> => (layout ??= fetchLayoutSheets((input, init) => fetch(input, init)));

/**
 * The book's front cover as a picture: the print layout's `cover-front` sheet (#285 – the back of the marginalia
 * card). Fetched once; null when the content has no layout or no cover sheet, or the fetch fails.
 */
export const bookCoverUrl = (): Promise<string | null> => layoutSheets().then(sheets => landingCover({ sheets, url: layoutFileUrl }));

/** Test seam: forget the fetched layout */
export const resetBookCover = (): void => {
  layout = null;
};
