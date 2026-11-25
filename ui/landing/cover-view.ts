/**
 * Where the closed book's cover lies in the stage's box when the hero's 3D intro begins (#372): the picture view of
 * `scan-stage.ts` – straight down onto the cover – and the HTML stand-in in `landing-html.ts` (the cover until the 3D
 * runs) are sized from these numbers, so the 3D takes over without a jump. Tilman, 2026-11-25: "match the size of the
 * overlay exactly please".
 * Import-free: vite.config.js loads landing-html.ts, which imports this.
 */

/** The stage camera's vertical field of view (°) – the stage's box is its picture */
export const STAGE_FOV = 30;
/** How high the picture view's camera is over the page (the book's surface, z = 0) */
export const PICTURE_HEIGHT = 2.15;
/** A page's (and the cover's) width; the spread is 1 wide, the cover lies on its right half */
export const PAGE_WIDTH = 0.5;
/** The pages that turn after the cover */
export const PAGES = 3;
/** The leaves lie this far above one another (no flicker, no visible step) */
export const LIFT = 0.00025;
/** The closed cover's height over the page: it lies on top of the pages that turn (`lift(0)` in scan-stage.ts) */
export const COVER_LIFT = (PAGES + 1) * LIFT;

/** What the stage's box shows at the cover's height in the picture view (in the stage's units): the box is square, so its width too */
const viewAtCover = (): number => 2 * (PICTURE_HEIGHT - COVER_LIFT) * Math.tan((STAGE_FOV / 2) * (Math.PI / 180));

/** The cover's width as a share of the stage's box */
export const coverWidthShare = (): number => PAGE_WIDTH / viewAtCover();

