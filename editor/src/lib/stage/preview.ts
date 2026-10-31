/**
 * The editor's preview (three-free, main chunk): the AR scene runs over a simulated camera picture – the mock
 * tracker and the mock stage (`ar/mock-tracker.ts`, `ar/mock-stage.ts`) stand in for the camera and the engine.
 *
 * - `active`: the editor page is open – `ArScene` builds the mock tracker instead of the engine (a change while the
 *   scene exists rebuilds it). Not stored: the route decides.
 * - The settings the stage toolbar changes, stored on this device (`osct-preview`): the view preset or a free orbit,
 *   the shading, the sky (an HDRI), the desk's top, the hand-shake amount and the origin (the *view* group, #229), the
 *   grid and its vertical axis, and the snapping (the *grid & snap* group: on / off, what it snaps to, the precision
 *   per gizmo mode – `snap.ts`).
 * - `hidden`: targets switched off in the panel – the mock reports them as lost (outro), on again as found (reveal).
 *   Not stored.
 */

import { isOriginId, originLabel, type OriginFrame, type OriginId } from "./origin";
import { clampSnap, SNAP_TARGETS, type SnapTarget } from "./snap";
import { readStoredJson, writeStoredJson } from "#lib/storage.js";

export const PREVIEW_VIEWS = ["reader", "top", "low", "far"] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

/** The HDRIs the stage offers as sky and light (Poly Haven, CC0 – `editor/static/hdri/README.md`) */
export const HDRIS = [
  { id: "ferndale_studio_04", name: "Ferndale Studio 04" },
  { id: "wooden_studio_07", name: "Wooden Studio 07" },
  { id: "wooden_studio_13", name: "Wooden Studio 13" },
  { id: "wooden_studio_14", name: "Wooden Studio 14" },
  { id: "wooden_studio_17", name: "Wooden Studio 17" },
  { id: "wooden_studio_19", name: "Wooden Studio 19" },
] as const;
export type HdriId = (typeof HDRIS)[number]["id"];
export const isHdriId = (value: unknown): value is HdriId => HDRIS.some(h => h.id === value);

/**
 * The stage's desk (our own low-poly model – `editor/static/models/README.md`; designers' furniture, so the designers
 * who use the tool feel at home): Egon Eiermann's table frame with one of two tops of the same size (#226) – its own
 * screen-printed plywood top, or blue-grey linoleum on an oak-faced plywood board. The setting switches only the top.
 */
export const DESK_NAME = "Eiermann";
export const TOPS = [
  { id: "plywood", name: "plywood" },
  { id: "linoleum", name: "linoleum" },
] as const;
export type TopId = (typeof TOPS)[number]["id"];
export const isTopId = (value: unknown): value is TopId => TOPS.some(t => t.id === value);
const DEFAULT_TOP: TopId = "plywood";

/**
 * The top from stored settings: `top`, or the desk stored before #226 (`desk`) – the Eiermann desk is its plywood
 * top, Schöpfer's desk (gone) the linoleum top, so nobody's stage breaks; anything else the default
 */
const LEGACY_DESKS: Readonly<Record<string, TopId>> = { eiermann: "plywood", schoepfer: "linoleum" };
export const storedTop = (stored: { top?: unknown; desk?: unknown }): TopId =>
  isTopId(stored.top) ? stored.top
    : typeof stored.desk === "string" && Object.hasOwn(LEGACY_DESKS, stored.desk) ? LEGACY_DESKS[stored.desk]
      : DEFAULT_TOP;

/**
 * The stage toolbar's *view* group in a few words (#229 – the Stage tab's closed *stage* head until then): the desk and
 * its top, the origin, the hand shake and the sky – "Eiermann · plywood · origin top left · no shake · sky Wooden
 * Studio 17"; with the book's environment the sky is its world ("· the environment's sky"). The group's tooltip; the
 * grid and snapping are the *grid & snap* group's own.
 */
export const viewSummary = (
  settings: Pick<PreviewSettings, "top" | "wobble" | "origin" | "hdri">,
  { format = "spread", environment = false }: { format?: OriginFrame["format"]; environment?: boolean } = {},
): string => [
  DESK_NAME,
  TOPS.find(t => t.id === settings.top)?.name ?? settings.top,
  `origin ${originLabel(settings.origin, format)}`,
  settings.wobble > 0 ? `shake ${Math.round(settings.wobble * 100) / 100}` : "no shake",
  environment ? "the environment's sky" : `sky ${HDRIS.find(h => h.id === settings.hdri)?.name ?? settings.hdri}`,
].join(" · ");

/** A free view of the stage: distance from the looked-at point in mm, tilt from the vertical and yaw in degrees */
export interface PreviewOrbit {
  distance: number;
  tilt: number;
  yaw: number;
  /** The looked-at point moved from the spread's own: mm in the page plane (a pan) */
  pan?: { x: number; y: number };
}

/**
 * The viewport's shading, after Blender's: **wireframe** (every entity as lines), **solid** (one matte grey, the
 * scene's lights), **textured** (the content's materials, the scene's lights, no sky) and **rendered** (the
 * content's materials under the HDRI's sky and light). Applied per entity mesh – the originals are kept and come
 * back – so the stage, the gizmo and the outlines keep their own materials.
 */
export const SHADING_MODES = ["wireframe", "solid", "textured", "rendered"] as const;
export type ShadingMode = (typeof SHADING_MODES)[number];
export const isShadingMode = (value: unknown): value is ShadingMode => SHADING_MODES.includes(value as ShadingMode);

export interface PreviewSettings {
  view: PreviewView;
  /** The viewport's shading (Blender's): wireframe, solid, textured, rendered (the HDRI's sky and light) */
  shading: ShadingMode;
  /** A free orbit (dragged, zoomed) replaces the preset until the next preset is chosen */
  orbit: PreviewOrbit | null;
  /** The HDRI shown as sky and used as light (while the shading is rendered) */
  hdri: HdriId;
  /** The desk's top under the book (the frame is always the Eiermann) */
  top: TopId;
  /** 0 = still, 1 = a hand holding a phone */
  wobble: number;
  /** A grid over the page (the stage), its spacing in mm, and the origin it and the positions are counted from */
  grid: boolean;
  gridMm: number;
  origin: OriginId;
  /** The vertical axis: a line for the height through the origin, shown with the grid */
  axis: boolean;
  /** The gizmo and the placement handles snap (Shift or Ctrl held turns it around for a drag) */
  snap: boolean;
  /** What a move snaps to */
  snapTo: SnapTarget[];
  /** The precision per mode: the move's step when the grid is no snap target (mm), the rotation's (degrees), the scale's */
  snapMove: number;
  snapRotate: number;
  snapScale: number;
}

export interface PreviewState extends PreviewSettings {
  active: boolean;
  hidden: readonly string[];
}

const STORAGE_KEY = "osct-preview";

const DEFAULTS: PreviewSettings = {
  view: "reader", shading: "rendered", orbit: null, hdri: "wooden_studio_17", top: DEFAULT_TOP, wobble: 0, grid: false, gridMm: 10, origin: "top-left",
  axis: true, snap: false, snapTo: [...SNAP_TARGETS], snapMove: 1, snapRotate: 15, snapScale: 0.1,
};

/** The grid's spacing stays between 1 mm and the page's size */
export const clampGrid = (mm: number): number => Math.min(500, Math.max(1, mm));

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const readSettings = (): PreviewSettings => {
  const parsed = readStoredJson(STORAGE_KEY);
  if (!parsed || typeof parsed !== "object") return { ...DEFAULTS, snapTo: [...DEFAULTS.snapTo] };
  const stored = parsed as Partial<PreviewSettings> & { desk?: unknown };
  return {
    view: PREVIEW_VIEWS.includes(stored.view as PreviewView) ? (stored.view as PreviewView) : DEFAULTS.view,
    shading: isShadingMode(stored.shading) ? stored.shading : DEFAULTS.shading,
    orbit: isOrbit(stored.orbit) ? stored.orbit : null,
    hdri: isHdriId(stored.hdri) ? stored.hdri : DEFAULTS.hdri,
    top: storedTop(stored),
    wobble: typeof stored.wobble === "number" && Number.isFinite(stored.wobble) ? Math.min(1, Math.max(0, stored.wobble)) : 0,
    grid: stored.grid === true,
    gridMm: typeof stored.gridMm === "number" && Number.isFinite(stored.gridMm) ? clampGrid(stored.gridMm) : DEFAULTS.gridMm,
    origin: isOriginId(stored.origin) ? stored.origin : DEFAULTS.origin,
    axis: typeof stored.axis === "boolean" ? stored.axis : DEFAULTS.axis,
    snap: stored.snap === true,
    snapTo: Array.isArray(stored.snapTo) ? SNAP_TARGETS.filter(target => (stored.snapTo as unknown[]).includes(target)) : [...DEFAULTS.snapTo],
    snapMove: finite(stored.snapMove) ? clampSnap("move", stored.snapMove) : DEFAULTS.snapMove,
    snapRotate: finite(stored.snapRotate) ? clampSnap("rotate", stored.snapRotate) : DEFAULTS.snapRotate,
    snapScale: finite(stored.snapScale) ? clampSnap("scale", stored.snapScale) : DEFAULTS.snapScale,
  };
};

const isOrbit = (value: unknown): value is PreviewOrbit => {
  if (!value || typeof value !== "object") return false;
  const orbit = value as Record<string, unknown>;
  if (!["distance", "tilt", "yaw"].every(key => Number.isFinite(orbit[key]))) return false;
  const pan = orbit.pan as Record<string, unknown> | undefined;
  return pan === undefined || (!!pan && typeof pan === "object" && Number.isFinite(pan.x) && Number.isFinite(pan.y));
};

const writeSettings = (settings: PreviewSettings): void => {
  writeStoredJson(STORAGE_KEY, settings);
};

let state: PreviewState = { ...readSettings(), active: false, hidden: [] };
const listeners = new Set<(state: PreviewState) => void>();

const publish = (): void => {
  listeners.forEach(listener => listener(state));
};

export const getPreview = (): PreviewState => state;

/** The editor page is open (true) or left (false) */
export const setPreviewActive = (active: boolean): void => {
  if (state.active === active) return;
  state = { ...state, active, hidden: active ? state.hidden : [] };
  publish();
};

/** Change settings (stored) and / or the hidden targets; a preset view clears the free orbit */
export const updatePreview = (patch: Partial<Omit<PreviewState, "active">>): void => {
  const next: PreviewState = { ...state, ...patch };
  if (patch.view !== undefined && patch.orbit === undefined) next.orbit = null;
  state = next;
  const { active: _active, hidden: _hidden, ...settings } = state;
  writeSettings(settings);
  publish();
};

/** Show or hide a target on the stage (hidden = reported as lost) */
export const setTargetHidden = (targetId: string, hidden: boolean): void => {
  const without = state.hidden.filter(id => id !== targetId);
  updatePreview({ hidden: hidden ? [...without, targetId] : without });
};

export const subscribePreview = (listener: (state: PreviewState) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
