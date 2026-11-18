import type { PrintSurface, SpreadFormat } from "@shared/types/game-config";
import type { SurfaceRect } from "./surfaces";

/**
 * The coordinate origin of the editor's positions (three-free). A position on a page is stored as the content has it:
 * mm from the top left corner of its surface (`left` / `right` page, the cover's `front` / `back`). The author may
 * read and enter it from another origin: one of the nine points of an alignment square (a design tool's anchor
 * picker) – the four corners and the four edge centres of the base format, on the page the position lies on, and the
 * centre: on the open book the book's centre (the spine's middle, one origin for both pages), on a cover the page's
 * centre. The axes always run x to the right and y downwards; only the zero moves, so a value left of or above it is
 * negative.
 */

/** The nine origins, row by row as the alignment square shows them */
export const ORIGINS = [
  "top-left", "top-centre", "top-right",
  "centre-left", "centre", "centre-right",
  "bottom-left", "bottom-centre", "bottom-right",
] as const;
export type OriginId = (typeof ORIGINS)[number];
export const isOriginId = (value: unknown): value is OriginId => ORIGINS.includes(value as OriginId);

/** Where an origin lies on the page: its column and row, 0 / 1 / 2 = start / middle / end */
export const ORIGIN_SPOTS: Record<OriginId, { col: 0 | 1 | 2; row: 0 | 1 | 2 }> = {
  "top-left": { col: 0, row: 0 }, "top-centre": { col: 1, row: 0 }, "top-right": { col: 2, row: 0 },
  "centre-left": { col: 0, row: 1 }, centre: { col: 1, row: 1 }, "centre-right": { col: 2, row: 1 },
  "bottom-left": { col: 0, row: 2 }, "bottom-centre": { col: 1, row: 2 }, "bottom-right": { col: 2, row: 2 },
};

export const ORIGIN_LABELS: Record<OriginId, string> = {
  "top-left": "top left",
  "top-centre": "top centre",
  "top-right": "top right",
  "centre-left": "left centre",
  centre: "book centre",
  "centre-right": "right centre",
  "bottom-left": "bottom left",
  "bottom-centre": "bottom centre",
  "bottom-right": "bottom right",
};

/** The origin's name for a spread of this format: the centre is the book's on the open book, the page's on a cover */
export const originLabel = (origin: OriginId, format: OriginFrame["format"]): string =>
  origin === "centre" && format !== "spread" ? "page centre" : ORIGIN_LABELS[origin];

/** What the origin is, for the Info view */
export const originHelp = (origin: OriginId, format: OriginFrame["format"]): string =>
  origin === "centre"
    ? format === "spread" ? "The book's centre: the spine's middle, one zero for both pages." : "The page's centre."
    : `The ${ORIGIN_LABELS[origin]} ${ORIGIN_SPOTS[origin].col === 1 || ORIGIN_SPOTS[origin].row === 1 ? "point" : "corner"} of the page a position lies on.`;

/** A surface by its side (content without surfaces) or by its id (a scene's surface, #314) */
export type SurfaceId = PrintSurface | (string & {});

export interface OriginFrame {
  /** The base format: one page (mm) */
  page: { width: number; height: number };
  /** The spread is the open book (two pages) or a cover (one) */
  format: SpreadFormat;
  /**
   * The scene's surfaces lying flat on the table (#314, `surfaces.ts` `surfaceRects`: stage mm, y up), each at its own
   * size; absent = the format's pages (two side by side, or the cover alone), one page each
   */
  surfaces?: readonly SurfaceRect[];
}

/** The surfaces the frame counts on: the scene's, else the format's pages around the origin */
export const frameRects = (frame: OriginFrame): readonly SurfaceRect[] => {
  if (frame.surfaces?.length) return frame.surfaces;
  const { width, height } = frame.page;
  return frame.format === "spread"
    ? [{ id: "left", side: "left", left: -width, top: height / 2, width, height }, { id: "right", side: "right", left: 0, top: height / 2, width, height }]
    : [{ id: frame.format === "back" ? "back" : "front", side: frame.format === "back" ? "back" : "front", left: -width / 2, top: height / 2, width, height }];
};

/** The rectangle around all the frame's surfaces (stage mm, y up): the "spread" its grid and lines count from */
export const frameBox = (frame: OriginFrame): { left: number; top: number; width: number; height: number } => {
  const rects = frameRects(frame);
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.max(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.left + r.width));
  const bottom = Math.min(...rects.map(r => r.top - r.height));
  return { left, top, width: right - left, height: top - bottom };
};

/** A surface of the frame by id or side (a cover's face stands for either cover), else the first */
export const rectOf = (frame: OriginFrame, surface: SurfaceId): SurfaceRect => {
  const rects = frameRects(frame);
  return rects.find(r => r.id === surface) ?? rects.find(r => r.side === surface)
    ?? (surface === "front" || surface === "back" ? rects.find(r => r.side === "front" || r.side === "back") : undefined) ?? rects[0];
};

/**
 * The origin's position in the surface's own frame (mm from its top left corner): the centre is the scene's origin
 * (the spine's middle on the open book, the cover's centre), the others a point of the surface itself
 */
export const originPoint = (origin: OriginId, frame: OriginFrame, surface: SurfaceId): { x: number; y: number } => {
  const rect = rectOf(frame, surface);
  if (origin === "centre") return { x: round(0 - rect.left), y: round(rect.top) };
  const { col, row } = ORIGIN_SPOTS[origin];
  return { x: (col * rect.width) / 2, y: (row * rect.height) / 2 };
};

const round = (value: number): number => Math.round(value * 100) / 100;

/** A position from the surface's top left corner → the same spot read from the origin */
export const toOrigin = (origin: OriginId, frame: OriginFrame, surface: SurfaceId, x: number, y: number): { x: number; y: number } => {
  const zero = originPoint(origin, frame, surface);
  return { x: round(x - zero.x), y: round(y - zero.y) };
};

/** A position read from the origin → mm from the surface's top left corner */
export const fromOrigin = (origin: OriginId, frame: OriginFrame, surface: SurfaceId, x: number, y: number): { x: number; y: number } => {
  const zero = originPoint(origin, frame, surface);
  return { x: round(x + zero.x), y: round(y + zero.y) };
};

/** A rectangle of the spread (mm from its top left corner) the grid covers, with the origin's zero inside its frame */
export interface GridArea {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The zero, in mm from the spread's top left corner */
  zeroX: number;
  zeroY: number;
}

/** The grid's areas: one over both pages for the book's centre, else one per page counting from that page's point */
export const gridAreas = (origin: OriginId, frame: OriginFrame): GridArea[] => {
  const box = frameBox(frame);
  if (origin === "centre") return [{ left: 0, top: 0, width: round(box.width), height: round(box.height), zeroX: round(0 - box.left), zeroY: round(box.top) }];
  return frameRects(frame).map(rect => {
    const left = round(rect.left - box.left);
    const top = round(box.top - rect.top);
    const zero = originPoint(origin, frame, rect.id);
    return { left, top, width: rect.width, height: rect.height, zeroX: round(left + zero.x), zeroY: round(top + zero.y) };
  });
};

/**
 * The grid's lines along one axis inside [start, start + size], as positions in the spread's frame: every `step`
 * from the zero in both directions, so a line always runs through the origin
 */
export const gridLines = (zero: number, start: number, size: number, step: number): number[] => {
  if (!(step > 0) || !(size > 0)) return [];
  const lines: number[] = [];
  let at = zero + Math.ceil((start - zero) / step - 1e-9) * step;
  for (; at <= start + size + 1e-9; at += step) lines.push(round(at));
  return lines;
};
