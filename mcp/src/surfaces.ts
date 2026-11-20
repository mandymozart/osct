// One surface of a scene changed by itself (#314 – put_surface): the API takes a scene's whole surface list
// (`PUT …/scenes/{id} { surfaces }`), so the tool reads the list, changes the one surface – adds, edits, removes or moves
// it – and sends the list back. The rule is here, pure, so it is tested without a server.
import { SCENE_PAGE_MM, SCENE_WALL_MM, type SurfaceInput } from "../../shared/api/editor";

/** A size preset of a surface: a double page (twice the page's width), a single page, a wall */
export const SURFACE_SIZE_PRESETS = ["double", "single", "wall"] as const;
export type SurfaceSizePreset = (typeof SURFACE_SIZE_PRESETS)[number];

/** A preset's size in mm */
export const presetSize = (preset: SurfaceSizePreset): { widthMm: number; heightMm: number } =>
  preset === "double" ? { widthMm: SCENE_PAGE_MM.width * 2, heightMm: SCENE_PAGE_MM.height }
  : preset === "single" ? { widthMm: SCENE_PAGE_MM.width, heightMm: SCENE_PAGE_MM.height }
  : { widthMm: SCENE_WALL_MM.width, heightMm: SCENE_WALL_MM.height };

/** What put_surface asks for one surface: its fields to set (label null = none), a preset size, its index, or its removal */
export interface SurfaceEdit {
  surface: string;
  remove?: boolean;
  label?: string | null;
  preset?: SurfaceSizePreset;
  widthMm?: number;
  heightMm?: number;
  place?: SurfaceInput["place"];
  position?: number;
}

/** The new list and what happened to the surface – or why it cannot be */
export type SurfaceEditResult =
  | { ok: true; surfaces: SurfaceInput[]; done: "added" | "changed" | "removed" | "unchanged" }
  | { ok: false; message: string };

/** A surface as the API lists it, without what is no content (the editor-only `reference`) */
const asInput = (surface: SurfaceInput & { reference?: unknown }): SurfaceInput => {
  const { reference: _reference, ...rest } = surface;
  return rest;
};

/**
 * One surface edited in a scene's list: an unknown id adds a surface (its size from `preset` or `widthMm` / `heightMm`;
 * its place given, else the server lays it in a row), a known one changes the fields sent (`preset` sets its size, a
 * size sent wins), `remove` takes it out (never the last one), `position` moves it to that index (0 = first) – a new
 * one goes last without it.
 */
export const editSurfaces = (current: readonly (SurfaceInput & { reference?: unknown })[], edit: SurfaceEdit, max: number): SurfaceEditResult => {
  const list = current.map(asInput);
  const at = list.findIndex(s => s.id === edit.surface);
  const changes = edit.label !== undefined || edit.preset !== undefined || edit.widthMm !== undefined || edit.heightMm !== undefined || edit.place !== undefined;
  if (edit.remove) {
    if (changes || edit.position !== undefined) return { ok: false, message: "remove takes no other field" };
    if (at < 0) return { ok: false, message: `no surface "${edit.surface}" in the scene (${list.map(s => s.id).join(", ")})` };
    if (list.length === 1) return { ok: false, message: "a scene keeps at least one surface" };
    return { ok: true, surfaces: list.filter(s => s.id !== edit.surface), done: "removed" };
  }
  const size = { ...(edit.preset ? presetSize(edit.preset) : {}), ...(edit.widthMm !== undefined ? { widthMm: edit.widthMm } : {}), ...(edit.heightMm !== undefined ? { heightMm: edit.heightMm } : {}) };
  let next: SurfaceInput;
  if (at < 0) {
    if (list.length >= max) return { ok: false, message: `a scene has at most ${max} surfaces` };
    if (size.widthMm === undefined || size.heightMm === undefined) return { ok: false, message: "a new surface needs its size: preset, or widthMm and heightMm" };
    next = { id: edit.surface, ...(edit.label ? { label: edit.label } : {}), widthMm: size.widthMm, heightMm: size.heightMm, ...(edit.place ? { place: edit.place } : {}) };
  } else {
    next = { ...list[at], ...size, ...(edit.place ? { place: edit.place } : {}) };
    if (edit.label) next.label = edit.label;
    else if (edit.label !== undefined) delete next.label;
  }
  const without = list.filter(s => s.id !== edit.surface);
  const index = edit.position !== undefined ? Math.max(0, Math.min(without.length, edit.position)) : at < 0 ? without.length : at;
  without.splice(index, 0, next);
  const done = at < 0 ? "added" : JSON.stringify(without) === JSON.stringify(list) ? "unchanged" : "changed";
  return { ok: true, surfaces: without, done };
};
