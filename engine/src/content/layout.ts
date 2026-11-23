import { LAYOUT_PATH, type LayoutSheet } from "@shared/api/landing-extract";
import { contentUrl, getContentSizes } from "./game-config";

/**
 * The print layout of the loaded content (`layout/layout.json`, written by the delivery's layout step): its sheets, the
 * pictures of the printed book – the reader's card back (#285) and the landing's book (#354, #355). A content build
 * that did not change the layout keeps it in an earlier build's folder – files.json names it there (#354: staging's `layout.json` is not below the loaded version) – else below the loaded
 * version, or with the app.
 */
export const layoutFileUrl = (file: string): string => {
  const path = `${LAYOUT_PATH}${file}`;
  return Object.keys(getContentSizes() ?? {}).find(url => url.endsWith(path)) ?? contentUrl(path);
};

/** The layout's sheets in print order, read now; [] when the content has no layout or the fetch fails */
export const fetchLayoutSheets = async (fetchFn: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)): Promise<LayoutSheet[]> => {
  try {
    const response = await fetchFn(layoutFileUrl("layout.json"));
    const data = response?.ok ? ((await response.json()) as { sheets?: unknown }) : null;
    return Array.isArray(data?.sheets) ? (data.sheets as LayoutSheet[]) : [];
  } catch {
    return [];
  }
};

