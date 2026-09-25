import { Spread } from "@/types";
import { getSpreads } from "@/utils/game-config";

/**
 * Pure helpers of the looped spread menu (design p.6–7), kept apart from the element for tests.
 *
 * The loop renders the list several times (an odd number of copies) and keeps the scroll position in
 * the middle copy: when a scroll settles in another copy, it jumps by whole copies (instantly, the
 * content looks the same), so the menu can be scrolled left and right forever.
 */

/** Only spreads with content: something to scan (targets) */
export const getMenuSpreads = (): Spread[] => getSpreads().filter(s => s.targets.length > 0);

/** "20–21" (en dash, as in the design) */
export const formatPages = (spread: Pick<Spread, "firstPage" | "lastPage">): string =>
  spread.firstPage === spread.lastPage ? `${spread.firstPage}` : `${spread.firstPage}–${spread.lastPage}`;

/** Odd number of copies so that one full viewport of items exists on both sides of the middle copy */
export const loopCopies = (copyWidth: number, viewportWidth: number): number => {
  if (copyWidth <= 0) return 1;
  const side = Math.ceil(viewportWidth / copyWidth) + 1;
  return side * 2 + 1;
};

/**
 * Scroll position moved by whole copies so that the item under the viewport center is in the
 * middle copy (same spread under the center, equal room on both sides)
 */
export const normalizeLoopScroll = (
  scrollLeft: number,
  viewportWidth: number,
  copyWidth: number,
  copies: number,
): number => {
  if (copyWidth <= 0 || copies <= 1) return scrollLeft;
  const middle = Math.floor(copies / 2);
  const copy = Math.floor((scrollLeft + viewportWidth / 2) / copyWidth);
  return scrollLeft + (middle - copy) * copyWidth;
};
