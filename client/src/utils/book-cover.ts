import { CONTENT_PATH, contentUrl } from "@/utils/game-config";

/** The print layout inside the content (`layout/layout.json`, written by the delivery's layout step) */
const LAYOUT = `${CONTENT_PATH}layout/`;

let cover: Promise<string | null> | null = null;

/**
 * The book's front cover as a picture: the print layout's `cover-front` sheet (#285 – the back of the marginalia
 * card). Fetched once; null when the content has no layout or no cover sheet, or the fetch fails.
 */
export const bookCoverUrl = (): Promise<string | null> =>
  (cover ??= Promise.resolve()
    .then(() => fetch(contentUrl(`${LAYOUT}layout.json`)))
    .then(response => (response?.ok ? (response.json() as Promise<{ sheets?: Array<{ kind?: string; image?: string }> }>) : null))
    .then(layout => {
      const sheet = layout?.sheets?.find(s => s.kind === "cover-front");
      return sheet?.image ? contentUrl(`${LAYOUT}${sheet.image}`) : null;
    })
    .catch(() => null));

/** Test seam: forget the fetched cover */
export const resetBookCover = (): void => {
  cover = null;
};
