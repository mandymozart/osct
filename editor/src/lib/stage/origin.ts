import type { PrintSurface, SpreadFormat } from "@shared/types/game-config";

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

export type SurfaceId = PrintSurface;

export interface OriginFrame {
  /** The base format: one page (mm) */
  page: { width: number; height: number };
  /** The spread is the open book (two pages) or a cover (one) */
  format: SpreadFormat;
}

/** Where a surface's left edge lies from the spread's left edge (mm) */
const surfaceOffset = (surface: SurfaceId, page: OriginFrame["page"]): number => (surface === "right" ? page.width : 0);

/** The spread's width: two pages for the open book, one for a cover */
const spreadWidth = ({ page, format }: OriginFrame): number => (format === "spread" ? 2 * page.width : page.width);

/** The origin's position in the surface's own frame (mm from its top left corner) */
export const originPoint = (origin: OriginId, frame: OriginFrame, surface: SurfaceId): { x: number; y: number } => {
  const { width, height } = frame.page;
  if (origin === "centre") return { x: spreadWidth(frame) / 2 - surfaceOffset(surface, frame.page), y: height / 2 };
  const { col, row } = ORIGIN_SPOTS[origin];
  return { x: (col * width) / 2, y: (row * height) / 2 };
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
  const { width, height } = frame.page;
  if (origin === "centre") return [{ left: 0, top: 0, width: spreadWidth(frame), height, zeroX: spreadWidth(frame) / 2, zeroY: height / 2 }];
  const surfaces: SurfaceId[] = frame.format === "spread" ? ["left", "right"] : ["front"];
  return surfaces.map(surface => {
    const left = surfaceOffset(surface, frame.page);
    const zero = originPoint(origin, frame, surface);
    return { left, top: 0, width, height, zeroX: left + zero.x, zeroY: zero.y };
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
