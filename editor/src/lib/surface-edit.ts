import { PRINT_SURFACES, type PrintPlacement, type PrintSurface, type SceneLayout, type SpreadFormat, type SurfaceData, type SurfacePlace } from "@shared/types/game-config";

/**
 * Editing a scene's surfaces (#314, `agents/SCENES.md` "Surfaces: create, edit, place"): the pure rules behind the Surface
 * mode, the Tree's Surfaces level and the Inspector's surfaces – a new surface from a preset (a page of the book's size, a
 * wall, a custom one), remove, reorder, change one surface's fields, the targets lying on a surface, the choices of
 * surface a placement offers, and a surface's name. Every edit returns the scene's whole new list – the API takes the
 * whole list (`PUT …/scenes/{id}` with `surfaces`).
 */

export const SURFACE_PRESETS = ["page", "wall", "custom"] as const;
export type SurfacePreset = (typeof SURFACE_PRESETS)[number];

/** A wall as added (mm): wide and tall enough for a poster wall; its place in a free scene stands it up behind the row */
export const WALL_MM = { width: 2000, height: 1500 } as const;
/** A custom surface as added (mm) – the Inspector sets its size */
export const CUSTOM_MM = { width: 300, height: 300 } as const;
/** How far behind the row's far edge a new wall stands (mm) */
const WALL_GAP_MM = 100;

/** What a surface is called: its label as printed with its side (`41 · left`), else its side */
export const surfaceName = (surface: Pick<SurfaceData, "side" | "label">): string =>
  surface.label?.trim() ? `${surface.label.trim()} · ${surface.side}` : surface.side;

/** An id for a new surface: the side itself while free, else the side with the first free number (`wall-2`) */
export const newSurfaceId = (surfaces: readonly Pick<SurfaceData, "id">[], side: string): string => {
  const taken = new Set(surfaces.map(s => s.id));
  if (!taken.has(side)) return side;
  for (let n = 2; ; n++) if (!taken.has(`${side}-${n}`)) return `${side}-${n}`;
};

/** The side a new page takes: the left page first, then the right, then a fold-out's middle */
const pageSide = (surfaces: readonly Pick<SurfaceData, "side">[]): string => {
  const sides = new Set(surfaces.map(s => s.side));
  return !sides.has("left") ? "left" : !sides.has("right") ? "right" : "middle";
};

/** The book's page size for a new page: a page the scene has (its left or right one), else the stage's page format */
export const pageSizeOf = (surfaces: readonly SurfaceData[] | undefined, fallback: { width: number; height: number }): { width: number; height: number } => {
  const page = surfaces?.find(s => s.side === "left" || s.side === "right");
  return page ? { width: page.widthMm, height: page.heightMm } : fallback;
};

/**
 * A new surface from a preset: a **page** of the book's page size (the left page, the right, then a middle), a **wall**
 * (`WALL_MM`, side wall; in a free scene standing ahead – `rx` 90 – behind the row, its foot on the table), a **custom**
 * one (`CUSTOM_MM`, side wall in a free scene, middle in a fixed one). A page lies in the row; a free scene's page too
 * (no place).
 */
export const presetSurface = (
  preset: SurfacePreset,
  surfaces: readonly SurfaceData[],
  options: { page: { width: number; height: number }; layout?: SceneLayout | null },
): SurfaceData => {
  const free = options.layout === "free";
  if (preset === "page") {
    const side = pageSide(surfaces);
    return { id: newSurfaceId(surfaces, side), side, widthMm: round(options.page.width), heightMm: round(options.page.height) };
  }
  if (preset === "wall") {
    const surface: SurfaceData = { id: newSurfaceId(surfaces, "wall"), side: "wall", widthMm: WALL_MM.width, heightMm: WALL_MM.height };
    return free ? { ...surface, place: wallPlace(surfaces, WALL_MM.height) } : surface;
  }
  const side = free ? "wall" : "middle";
  return { id: newSurfaceId(surfaces, side), side, widthMm: CUSTOM_MM.width, heightMm: CUSTOM_MM.height };
};

/** Where a new wall stands in a free scene: centred on x, its foot on the table, behind the row's far edge, facing the reader */
export const wallPlace = (surfaces: readonly SurfaceData[], height: number): Required<SurfacePlace> => {
  const depth = Math.max(0, ...surfaces.filter(s => !s.place).map(s => s.heightMm));
  return { x: 0, y: round(height / 2), z: -round(depth / 2 + WALL_GAP_MM), rx: 90, ry: 0, rz: 0 };
};

/**
 * Add a preset's surface: the new list and the new surface. A wall in a fixed scene makes the scene free (`layout`):
 * a wall stands, which only a free scene places – the pages stay where the row has them.
 */
export const addSurface = (
  preset: SurfacePreset,
  surfaces: readonly SurfaceData[],
  options: { page: { width: number; height: number }; layout?: SceneLayout | null },
): { surfaces: SurfaceData[]; added: SurfaceData; layout?: SceneLayout } => {
  const turnsFree = preset === "wall" && options.layout !== "free";
  const added = presetSurface(preset, surfaces, { ...options, layout: turnsFree ? "free" : options.layout });
  return { surfaces: [...surfaces, added], added, ...(turnsFree ? { layout: "free" as const } : {}) };
};

/** The list without the surface */
export const removeSurface = (surfaces: readonly SurfaceData[], id: string): SurfaceData[] => surfaces.filter(s => s.id !== id);

/** The surface one place earlier (−1) or later (+1); the list as it was at an end or for an unknown id */
export const moveSurface = (surfaces: readonly SurfaceData[], id: string, direction: -1 | 1): SurfaceData[] => {
  const from = surfaces.findIndex(s => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= surfaces.length) return [...surfaces];
  const next = [...surfaces];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

/** The surface moved to another index (a drop) */
export const moveSurfaceTo = (surfaces: readonly SurfaceData[], id: string, index: number): SurfaceData[] => {
  const from = surfaces.findIndex(s => s.id === id);
  if (from < 0) return [...surfaces];
  const next = surfaces.filter(s => s.id !== id);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, surfaces[from]);
  return next;
};

/** What one surface's edit may change: its label (empty = none), side, size, place (null = none) */
export interface SurfacePatch {
  label?: string;
  side?: string;
  widthMm?: number;
  heightMm?: number;
  place?: SurfacePlace | null;
}

/** The list with one surface changed – a label trimmed (empty: none), a size at least 1 mm, a place's numbers rounded */
export const updateSurface = (surfaces: readonly SurfaceData[], id: string, patch: SurfacePatch): SurfaceData[] =>
  surfaces.map(s => {
    if (s.id !== id) return s;
    const { label: _label, place: _place, ...rest } = s;
    const label = patch.label !== undefined ? patch.label.trim() : (s.label ?? "");
    const place = patch.place !== undefined ? patch.place : s.place;
    return {
      ...rest,
      ...(patch.side !== undefined && patch.side.trim() ? { side: patch.side.trim() } : {}),
      ...(patch.widthMm !== undefined ? { widthMm: Math.max(1, round(patch.widthMm)) } : {}),
      ...(patch.heightMm !== undefined ? { heightMm: Math.max(1, round(patch.heightMm)) } : {}),
      ...(label ? { label } : {}),
      ...(place ? { place: tidyPlace(place) } : {}),
    };
  });

/** A place's numbers rounded to a tenth (mm, degrees) */
export const tidyPlace = (place: SurfacePlace): SurfacePlace => ({
  x: round(place.x), y: round(place.y), z: round(place.z),
  ...(place.rx !== undefined ? { rx: round(place.rx) } : {}),
  ...(place.ry !== undefined ? { ry: round(place.ry) } : {}),
  ...(place.rz !== undefined ? { rz: round(place.rz) } : {}),
});

const round = (value: number): number => Math.round(value * 10) / 10;

/** Two lists the same (an edit that changed nothing is not saved) */
export const sameSurfaces = (a: readonly SurfaceData[] | undefined, b: readonly SurfaceData[] | undefined): boolean =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * A print lies on this surface: it names the surface by id, or (naming none, or one the scene does not have) its side is
 * the surface's and no earlier surface of the scene has that side
 */
export const liesOn = (print: Pick<PrintPlacement, "surface" | "surfaceId"> | undefined | null, surface: Pick<SurfaceData, "id" | "side">, surfaces: readonly Pick<SurfaceData, "id" | "side">[]): boolean => {
  if (!print) return false;
  if (print.surfaceId && surfaces.some(s => s.id === print.surfaceId)) return print.surfaceId === surface.id;
  return surfaces.find(s => s.side === print.surface)?.id === surface.id;
};

/** The targets (their ids) and entries (their titles) lying on a surface – what a removal names */
export const onSurface = (
  entries: readonly { id: string; title: string; surface?: string; target: { id: string; print?: Pick<PrintPlacement, "surface" | "surfaceId"> } | null }[],
  surface: Pick<SurfaceData, "id" | "side">,
  surfaces: readonly Pick<SurfaceData, "id" | "side">[],
): { targets: string[]; entries: string[] } => ({
  targets: entries.filter(e => e.target && liesOn(e.target.print, surface, surfaces)).map(e => e.target!.id),
  entries: entries.filter(e => e.surface === surface.id).map(e => e.title),
});

/** What a removal's confirmation says lies on the surface – empty when nothing does */
export const removalWarning = (on: { targets: string[]; entries: string[] }): string => {
  const parts = [
    on.targets.length ? `${on.targets.length === 1 ? "target" : "targets"} ${on.targets.join(", ")}` : "",
    on.entries.length ? `${on.entries.length === 1 ? "entry" : "entries"} ${on.entries.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} ${on.targets.length + on.entries.length === 1 ? "lies" : "lie"} on it – they keep their side and fall back to it.` : "";
};

/** A surface a placement may name: its choice's value, label, the side apps before schema 2.36 read, and its id */
export interface SurfaceChoice {
  value: string;
  label: string;
  surface: PrintSurface;
  surfaceId?: string;
}

/** The side a placement writes next to a surface's id (as `stage/surfaces.ts` `printSideOf`) */
const sideOf = (side: string, format: SpreadFormat | undefined): PrintSurface =>
  (PRINT_SURFACES as readonly string[]).includes(side) ? (side as PrintSurface) : format === "cover" ? "front" : format === "back" ? "back" : "right";

/**
 * The surfaces a placement offers: the scene's own (by id – a fold-out's middle, a wall), else the sides of content
 * without surfaces (the open book's pages, the cover's face)
 */
export const surfaceChoices = (surfaces: readonly SurfaceData[] | undefined, format: SpreadFormat | undefined): SurfaceChoice[] => {
  if (surfaces?.length) return surfaces.map(s => ({ value: s.id, label: surfaceName(s), surface: sideOf(s.side, format), surfaceId: s.id }));
  const sides: PrintSurface[] = format === "cover" ? ["front"] : format === "back" ? ["back"] : ["left", "right"];
  return sides.map(side => ({ value: side, label: side, surface: side }));
};

/** The choice a placement has now: its surface by id, else the first with its side */
export const choiceOf = (choices: readonly SurfaceChoice[], print: Pick<PrintPlacement, "surface" | "surfaceId">): string | null =>
  (print.surfaceId ? choices.find(c => c.surfaceId === print.surfaceId) : undefined)?.value
  ?? choices.find(c => c.value === print.surface)?.value
  ?? choices.find(c => c.surface === print.surface)?.value
  ?? null;

/** What a choice writes into a placement: the side and, for a scene's own surface, its id (none: the id goes) */
export const placeOnChoice = <P extends Pick<PrintPlacement, "surface" | "surfaceId">>(print: P, choice: SurfaceChoice): P => {
  const { surfaceId: _old, ...rest } = print;
  return { ...rest, surface: choice.surface, ...(choice.surfaceId ? { surfaceId: choice.surfaceId } : {}) } as P;
};
