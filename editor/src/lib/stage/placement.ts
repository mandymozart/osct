/**
 * The placement math of a target's printed image on the stage (three-free). A place is stored as the content has it:
 * the surface (`left` / `right` page, the cover's `front` / `back`) and the box in mm from that surface's top left
 * corner. The stage's frame has its origin in the middle of the open book (the spine) or of the closed book, x to the
 * right, y towards the top of the page. The printed image is as wide as the place says and as high as the image's own
 * aspect makes it – the stage, the mock tracker's anchor (the image's centre, as the engine reports it) and the
 * placement handles all count from here, so the print, its outline, its entity and the inspector cannot drift apart.
 */

export type PrintSurface = "left" | "right" | "front" | "back";

/** A printed image's place: its surface and its box (mm from the surface's top left corner) */
export interface PrintBox {
  surface: string;
  x: number;
  y: number;
  width: number;
  /** The box's height as stored (the book's layout), used until the image's own aspect is known */
  height?: number;
}

/** One page of the book (mm) */
export interface PageSize {
  width: number;
  height: number;
}

/** A print's height per width while its image has not loaded and the place stores none */
export const DEFAULT_ASPECT = 0.75;
/** The narrowest print the handles make (mm) */
export const MIN_PRINT_WIDTH = 10;

/**
 * Where a surface's left edge lies in the stage's frame (mm): the open book has its spine at x = 0 – the left page
 * to the left, the right page to the right; the closed book (a cover) is centred on the origin
 */
export const surfaceLeft = (surface: string, page: PageSize): number =>
  surface === "left" ? -page.width : surface === "front" || surface === "back" ? -page.width / 2 : 0;

/** The printed height (mm): the image's aspect once known, else the stored height, else the default aspect */
export const printedHeight = (box: Pick<PrintBox, "width" | "height">, aspect?: number | null): number =>
  aspect && aspect > 0 ? box.width * aspect : box.height && box.height > 0 ? box.height : box.width * DEFAULT_ASPECT;

/** The print's centre in the stage's frame (mm, y up) – where its plane lies and where the tracker anchors its entity */
export const printCentre = (box: PrintBox, page: PageSize, aspect?: number | null): { x: number; y: number } => {
  const height = printedHeight(box, aspect);
  return { x: surfaceLeft(box.surface, page) + box.x + box.width / 2, y: page.height / 2 - box.y - height / 2 };
};

/** A point on the page: the surface it lies on and mm from that surface's top left corner */
export interface PageHit {
  surface: PrintSurface;
  x: number;
  y: number;
}

/** A point on the page read on another surface (mm from its left edge): the pages of the open book lie side by side */
const onSurface = (hit: PageHit, surface: string, page: PageSize): number =>
  hit.x + surfaceLeft(hit.surface, page) - surfaceLeft(surface, page);

/** A drag of a print's handle: the image (move) or its bottom right corner (width), with the grab point inside the image */
export interface PlacementDrag {
  kind: "move" | "width";
  grabX: number;
  grabY: number;
}

/** The grab point inside the image (mm), so the image does not jump to the pointer when a drag starts */
export const grabOffset = (place: PrintBox, hit: PageHit, page: PageSize): { grabX: number; grabY: number } => ({
  grabX: onSurface(hit, place.surface, page) - place.x,
  grabY: hit.y - place.y,
});

/** The same place `width` mm wide: a stored height scales with it, so the box keeps the image's proportions */
export const withWidth = <P extends PrintBox>(place: P, width: number): P =>
  place.height && place.width > 0 ? { ...place, width, height: Math.round(place.height * (width / place.width) * 100) / 100 } : { ...place, width };

/**
 * Where a drag puts the print (whole mm): a move keeps the grab point under the pointer and takes the surface the
 * pointer is over (across the spine it changes the page); the corner sets the width from the image's left edge, on
 * the image's own surface, never under `MIN_PRINT_WIDTH`
 */
export const draggedPlace = <P extends PrintBox>(place: P, drag: PlacementDrag, hit: PageHit, page: PageSize): P => {
  if (drag.kind === "move") {
    // The grab offset is a distance in the stage's frame: it holds on whichever surface the pointer is over
    return { ...place, surface: hit.surface, x: Math.round(hit.x - drag.grabX), y: Math.round(hit.y - drag.grabY) };
  }
  const width = Math.max(MIN_PRINT_WIDTH, Math.round(onSurface(hit, place.surface, page) - place.x));
  return withWidth(place, width);
};

/** A place shown instead of the content's while it is edited: the target's id and where it lies now */
export interface LivePlacement {
  id: string;
  place: PrintBox;
}

/**
 * The targets as laid out from the content, the one being placed where the placement says (the ghost *is* the
 * target: its print and its entity move with the handles). A stored height follows a changed width.
 */
export const withLivePlacement = <T extends { id: string; surface: string; x: number; y: number; width: number; height: number }>(
  targets: readonly T[], live: LivePlacement | null,
): T[] =>
  targets.map(target => {
    if (!live || target.id !== live.id) return target;
    const { surface, x, y, width } = live.place;
    const height = live.place.height ?? (target.width > 0 ? target.height * (width / target.width) : width * DEFAULT_ASPECT);
    return { ...target, surface, x, y, width, height };
  });
