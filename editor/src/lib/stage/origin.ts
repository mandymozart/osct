/**
 * The coordinate origin of the editor's positions (three-free). A position on a page is stored as the content has it:
 * mm from the top left corner of its surface (`left` / `right` page, the cover's `front` / `back`). The author may
 * read and enter it from another origin: the centre of the book (the spine's middle, one origin for both pages) or
 * any corner of the base format – the page's own corner, on the page the position lies on. The axes always run x to
 * the right and y downwards; only the zero moves, so a value left of or above it is negative.
 */

export const ORIGINS = ["top-left", "top-right", "bottom-left", "bottom-right", "centre"] as const;
export type OriginId = (typeof ORIGINS)[number];
export const isOriginId = (value: unknown): value is OriginId => ORIGINS.includes(value as OriginId);

export const ORIGIN_LABELS: Record<OriginId, string> = {
  "top-left": "top left",
  "top-right": "top right",
  "bottom-left": "bottom left",
  "bottom-right": "bottom right",
  centre: "book centre",
};

export type SurfaceId = "left" | "right" | "front" | "back";

export interface OriginFrame {
  /** The base format: one page (mm) */
  page: { width: number; height: number };
  /** The spread is the open book (two pages) or a cover (one) */
  format: "spread" | "cover" | "back";
}

/** Where a surface's left edge lies from the spread's left edge (mm) */
const surfaceOffset = (surface: SurfaceId, page: OriginFrame["page"]): number => (surface === "right" ? page.width : 0);

/** The spread's width: two pages for the open book, one for a cover */
const spreadWidth = ({ page, format }: OriginFrame): number => (format === "spread" ? 2 * page.width : page.width);

/** The origin's position in the surface's own frame (mm from its top left corner) */
export const originPoint = (origin: OriginId, frame: OriginFrame, surface: SurfaceId): { x: number; y: number } => {
  const { width, height } = frame.page;
  switch (origin) {
    case "top-left": return { x: 0, y: 0 };
    case "top-right": return { x: width, y: 0 };
    case "bottom-left": return { x: 0, y: height };
    case "bottom-right": return { x: width, y: height };
    case "centre": return { x: spreadWidth(frame) / 2 - surfaceOffset(surface, frame.page), y: height / 2 };
  }
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

/** The grid's areas: one over both pages for the book's centre, else one per page counting from that page's corner */
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
