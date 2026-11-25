import { Box3, Matrix4, type Object3D, type PerspectiveCamera, Quaternion, type Raycaster, Vector3 } from "three";
import type { Target } from "@engine/types";
import { getScene } from "@engine/content/game-config";
import { EMPTY_ENGINE_STATE, publishEngineState } from "@engine/utils/tracker-debug";
import { type AxisView, getPreview, type PreviewOrbit, type PreviewState, type PreviewView, subscribePreview, type SurfaceGrid, updatePreview } from "./preview";
import type { IImageTracker, ImageTrackerOptions, TrackedScene } from "@engine/scene/tracker-types";
import { onAppUi } from "@engine/scene/ui";
import { framesOf, type LivePlacement, type PlaceBox, placeCentre, placeHeight, surfaceAxes, surfaceLeft, type Surfaces, withLivePlacement } from "./placement";
import { DEFAULT_SURFACE, findSurface, sceneSurfaces, surfaceFrame, type SceneSurface, type SurfaceFrame, type SurfaceReference, type SurfaceReferences, toStage } from "./surfaces";

export { surfaceLeft };

/** The simulated camera's vertical field of view – about what the engine reports on a phone at 960 × 720 */
export const PREVIEW_FOV = 60;
const NEAR = 0.01;
const FAR = 100;

/** The surface a target lies on: its id (`TargetPlace.surface`, else the scene's first surface) */
export type StageSurface = string;

/** A target on the stage: its printed image, on which surface (its id) and where (mm from its top left corner) */
export interface StageTarget {
  id: string;
  imageSrc: string;
  surface: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Switched off (`enabled: false`, #249): not in the reader's experience – the target marks draw it orange, dashed (#323) */
  off?: boolean;
}

/** The open scene as the stage draws it: its surfaces where they lie (`surfaces.ts`) and their reference images */
export interface StageScene {
  surfaces: readonly SceneSurface[];
  /** Reference images by surface id (#314): shown on their surface, else paper */
  references?: Readonly<Record<string, SurfaceReference>>;
}

export interface Orbit extends PreviewOrbit {}

/** Where the phone is held: distance from the looked-at point in mm, tilt from the vertical and yaw in degrees */
export const VIEW_PRESETS: Record<PreviewView, Orbit> = {
  reader: { distance: 350, tilt: 30, yaw: 0 },
  top: { distance: 300, tilt: 0, yaw: 0 },
  low: { distance: 320, tilt: 75, yaw: 20 },
  far: { distance: 700, tilt: 30, yaw: 0 },
};

const MIN_DISTANCE = 80;
/** Far enough to see a room whole */
const MAX_DISTANCE = 10000;
/** The looked-at point may be panned this far from the scene's own (mm): a room (#335) */
const MAX_PAN = 10000;
/** A focus or Home flies there in this long (ms), easing out */
const FLIGHT_MS = 350;
/** A focused thing fills this much less than the whole view (room around it) */
const FIT_MARGIN = 1.25;
/** A pointer that moved this far is a drag (orbit), not a tap */
const DRAG_PX = 8;
const ORBIT_DEGREES_PER_PX = 0.4;
const TILT_DEGREES_PER_PX = 0.3;
const WHEEL_STEP = 0.08;
/** The free orbit is stored this long after the last change */
const STORE_DELAY_MS = 300;

/**
 * Orthographic (#369), the editor's only – the engine's camera stays perspective (plugins, picking and the transform
 * gizmos hold it): the eye moves this far back (mm) and the field of view narrows so the looked-at point's plane shows as
 * large as before. What is 1 m nearer or farther then shows 0.5 % larger or smaller – a parallel view to the eye.
 */
const ORTHO_EYE_MM = 200_000;
/** Ortho and perspective blend into each other in this long (ms): a dolly zoom, the looked-at plane keeps its size */
const ORTHO_BLEND_MS = 250;
/** A drag on the zoom button: the distance's factor per pixel (down = nearer, as Blender's) */
const ZOOM_PER_PX = 0.01;
/** A plane counts as edge-on (a pan moves along the screen, #369) when the line of sight is within ~10° of it */
const EDGE_ON = Math.sin((10 * Math.PI) / 180);

/**
 * The six views the gizmo snaps to (#369, Blender's numpad views) in the stage's frame (z up, the reader on −y): top
 * looks down with the page's top up, bottom looks up (y pointing down, as Blender's), front from the reader's side,
 * back from the far side, right from +x, left from −x.
 */
export const AXIS_VIEWS = {
  top: { tilt: 0, yaw: 0 },
  bottom: { tilt: 180, yaw: 0 },
  front: { tilt: 90, yaw: 0 },
  back: { tilt: 90, yaw: 180 },
  right: { tilt: 90, yaw: 90 },
  left: { tilt: 90, yaw: -90 },
} as const satisfies Record<AxisView, { tilt: number; yaw: number }>;

/** A view's opposite (the gizmo's ball already facing you, Ctrl + numpad, numpad 9) */
export const OPPOSITE_VIEW: Record<AxisView, AxisView> = { top: "bottom", bottom: "top", front: "back", back: "front", right: "left", left: "right" };

/** Which view a gizmo ball snaps to: the axis and its sign (+z = top, −y = front, +x = right) */
export const axisViewOf = (axis: "x" | "y" | "z", positive: boolean): AxisView =>
  axis === "z" ? (positive ? "top" : "bottom") : axis === "y" ? (positive ? "back" : "front") : positive ? "right" : "left";

/** Hand shake at wobble 1: a few millimetres and half a degree, slow and fast parts */
const WOBBLE_MM = 2;
const WOBBLE_DEGREES = 0.5;

const DEFAULT_PLACE_MM = 60;
const SURFACE_MARGIN_MM = 20;
const ROW_GAP_MM = 25;

/** The stage's grids from the preview (`StageGrids`): the surfaces' own grid, the floor grid and the vertical grid */
export const gridOf = (state: PreviewState): StageGrids => ({
  on: state.grid, mm: state.gridMm, origin: state.origin, axis: state.axis, surfaces: state.surfaceGrids,
  floor: state.floorGrid, floorMm: state.floorMm, wall: state.wallGrid, wallZ: state.wallZ,
});

/** What the stage draws of the grids (#316, #319): see `PreviewSettings` */
export interface StageGrids {
  /** The surfaces' own grid (the targets'): on / off, its spacing (mm), its origin, its vertical axis */
  on: boolean;
  mm: number;
  origin: PreviewState["origin"];
  axis: boolean;
  /** A surface's own grid by its id (the open scene's – #316, #314): spacing, subdivisions, on / off; a field left out: the above */
  surfaces: Readonly<Record<string, SurfaceGrid>>;
  /** The scene's floor grid on y = 0 and its spacing (mm) – the snap grid of surface places */
  floor: boolean;
  floorMm: number;
  /** The vertical grid: a plane at the scene's z = `wallZ` (mm), the floor grid's spacing */
  wall: boolean;
  wallZ: number;
}

/** The HDRI the stage shows: the chosen one, or none while it is switched off (#327) */
export const hdriOf = (state: Pick<PreviewState, "hdri" | "hdriOn">): PreviewState["hdri"] | null => (state.hdriOn ? state.hdri : null);

/** A sameness check of two grids (the stage draws them again only on a change) */
const sameGrids = (a: StageGrids, b: StageGrids): boolean => JSON.stringify(a) === JSON.stringify(b);

const degrees = (value: number) => (value * Math.PI) / 180;

/**
 * Where the open scene's targets lie on the stage. A target's own `place` (schema 3.0 – the printed book's layout,
 * #321) puts it on its surface (by id, else the scene's first). Targets without a place lie in a row across the first
 * surface (its middle when none is placed, its lower half next to placed ones).
 */
export const layoutTargets = (
  targets: readonly Target[], surfaces: ReadonlyArray<{ id: string; widthMm: number; heightMm: number }> = [],
): StageTarget[] => {
  const withImage = targets.filter(target => target.imageSrc);
  const first = surfaces[0] ?? DEFAULT_SURFACE;
  const page = { width: first.widthMm, height: first.heightMm };
  const fallback = first.id;
  const placed = (target: Target): StageTarget | null => {
    const own = target.place;
    if (!own) return null;
    const surface = findSurface(surfaces, own.surface)?.id ?? fallback;
    return { id: target.id, imageSrc: target.imageSrc, surface, x: own.x, y: own.y, width: own.width, height: own.height ?? own.width * 0.75 };
  };
  const placedTargets = withImage.map(placed);
  if (withImage.length && placedTargets.every(target => target !== null)) return placedTargets as StageTarget[];
  if (placedTargets.some(target => target !== null)) {
    // A mix: the placed ones where they are, the rest in a row across the first surface's lower half
    const rest = withImage.filter((_, i) => placedTargets[i] === null);
    const width = Math.min(60, (page.width - 20) / Math.max(1, rest.length) - 10);
    return withImage.map((target, i) => placedTargets[i] ?? {
      id: target.id, imageSrc: target.imageSrc, surface: fallback, x: 10 + rest.indexOf(target) * (width + 10), y: page.height * 0.6, width, height: width * 0.75,
    });
  }
  // A row across the middle of the first surface, shrunk to fit when there are many
  const count = withImage.length;
  const fit = Math.min(DEFAULT_PLACE_MM, (page.width - 2 * SURFACE_MARGIN_MM - (count - 1) * ROW_GAP_MM) / Math.max(1, count));
  const width = Math.max(10, fit);
  const total = count * width + (count - 1) * ROW_GAP_MM;
  const left = (page.width - total) / 2;
  return withImage.map((target, i) => ({
    id: target.id,
    imageSrc: target.imageSrc,
    surface: fallback,
    x: left + i * (width + ROW_GAP_MM),
    y: (page.height - width * 0.75) / 2,
    width,
    height: width * 0.75,
  }));
};

/**
 * The stage's frame: metres, origin at the scene's origin (a double page's spine), x to the right, y away from the
 * reader, z up. A target's centre in that frame – the centre of its printed image, whose height
 * follows the image's aspect once the stage knows it (`placement.ts`), as the engine anchors at the image's centre.
 */
export const targetCentre = (target: StageTarget, page: Surfaces = [], aspect?: number | null): Vector3 => {
  const centre = placeCentre(target, page, aspect);
  return new Vector3(centre.x / 1000, centre.y / 1000, centre.z / 1000);
};

/** How a target's image lies in the stage's frame: as its surface (flat on the table = no turn; a wall stands, #314) */
export const targetTurn = (target: StageTarget, surfaces: Surfaces = [], out = new Quaternion()): Quaternion => {
  const axes = surfaceAxes(surfaces, target.surface);
  return out.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(...axes.x), new Vector3(...axes.y), new Vector3(...axes.z)));
};

/**
 * The simulated camera in the stage's frame: on a sphere around `focus`, `tilt` degrees from the vertical towards
 * the reader (the bottom edge of the page), turned `yaw` degrees around the vertical; up = the top of the page.
 * Any tilt: past 90° the camera looks up from below the table, past 180° it is upside down over the far side (#335).
 */
export const cameraMatrix = (orbit: Orbit, focus: Vector3, target = new Matrix4()): Matrix4 => {
  const turn = cameraTurn(orbit);
  const eye = new Vector3(0, 0, orbit.distance / 1000).applyQuaternion(turn).add(focus);
  return target.compose(eye, turn, new Vector3(1, 1, 1));
};

/** The camera's turn: above the focus looking down (up = the top of the page), tilted about its own x, then turned about z */
const cameraTurn = (orbit: Pick<Orbit, "tilt" | "yaw">, out = new Quaternion()): Quaternion =>
  out.setFromAxisAngle(Z_AXIS, degrees(orbit.yaw)).multiply(new Quaternion().setFromAxisAngle(X_AXIS, degrees(orbit.tilt)));

const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/** The tilt and yaw that look straight at a face whose normal (stage frame) is `normal`: front-on (#335) */
export const facing = (normal: readonly [number, number, number]): { tilt: number; yaw: number } => {
  const n = new Vector3(...normal).normalize();
  const tilt = (Math.acos(Math.min(1, Math.max(-1, n.z))) * 180) / Math.PI;
  const yaw = Math.hypot(n.x, n.y) < 1e-6 ? 0 : (Math.atan2(n.x, -n.y) * 180) / Math.PI;
  return { tilt: tidyDegrees(tilt), yaw: tidyDegrees(yaw) };
};

const tidyDegrees = (value: number): number => Math.round(value * 1e6) / 1e6;

/** How far away the camera shows a `width` × `height` mm face whole, in a view of `aspect` (width / height) */
export const fitDistance = (width: number, height: number, aspect: number): number =>
  ((Math.max(height, width / Math.max(aspect, 0.1)) / 2) / Math.tan(degrees(PREVIEW_FOV) / 2)) * FIT_MARGIN;

/** A screen axis moved along a plane (normal `n`): its part in the plane at full length – none when it stands on the plane */
const alongPlane = (axis: Vector3, n: Vector3): Vector3 => {
  const inPlane = axis.clone().sub(n.clone().multiplyScalar(axis.dot(n)));
  return inPlane.lengthSq() < 1e-6 ? inPlane.set(0, 0, 0) : inPlane.normalize();
};

/** The shortest turn from one angle to another (degrees) */
const turnBetween = (from: number, to: number): number => ((((to - from + 180) % 360) + 360) % 360) - 180;

/** An orbit on the way between two (0…1): the distance evenly in scale, the angles the short way, the point in a line */
export const orbitBetween = (from: Orbit, to: Orbit, k: number): Orbit => {
  const a = from.pan ?? { x: 0, y: 0 };
  const b = to.pan ?? { x: 0, y: 0 };
  return {
    ...to,
    distance: from.distance * Math.pow(to.distance / from.distance, k),
    tilt: from.tilt + turnBetween(from.tilt, to.tilt) * k,
    yaw: from.yaw + turnBetween(from.yaw, to.yaw) * k,
    pan: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * k },
  };
};

/** What the camera can focus on (#335): a point (mm, the stage frame), how big it is, the face's normal, its surface */
export interface CameraSpot {
  centre: { x: number; y: number; z: number };
  /** The size to show whole (mm) – a face's width and height, a thing's diameter both */
  width: number;
  height: number;
  /** Look straight at this face (its normal, stage frame); none = from where the camera looks now */
  normal?: readonly [number, number, number];
  /** Or from this direction (the whole scene: the reader's) */
  direction?: { tilt: number; yaw: number };
  /** The surface the point is fixed to (a pan slides along its plane); none = the table */
  surface?: string;
  /** What the stage's corner calls it */
  label: string;
}

/** A tilt brought into −180…180° (the orbit turns freely; the stored value stays small) */
const wrapTilt = (tilt: number): number => ((((tilt + 180) % 360) + 360) % 360) - 180;

/** Hand shake at `wobble` (0…1) at time `t` (seconds), applied to the orbit and as a sideways offset in metres */
export const wobbled = (orbit: Orbit, wobble: number, t: number): { orbit: Orbit; offset: Vector3 } => {
  if (wobble <= 0) return { orbit, offset: new Vector3() };
  return {
    orbit: {
      distance: orbit.distance + Math.sin(t * 1.3) * WOBBLE_MM * wobble,
      tilt: orbit.tilt + Math.sin(t * 2.1) * WOBBLE_DEGREES * wobble,
      yaw: orbit.yaw + Math.cos(t * 1.7) * WOBBLE_DEGREES * wobble,
    },
    offset: new Vector3(Math.sin(t * 5.3), Math.cos(t * 4.1), 0).multiplyScalar((WOBBLE_MM / 1000) * wobble),
  };
};


/** What the stage draws – set by the tracker, which owns the layout and the camera */
export interface StageView {
  /** The open scene: its surfaces at their places (each a board with its reference image, else paper) and the targets on them */
  setLayout(targets: readonly StageTarget[], scene: StageScene): void;
  /** The targets hidden in the tree (the eye, #250): their printed images are not drawn either */
  setHiddenPrints?(hidden: ReadonlySet<string>): void;
  /** The sky and the light: an HDRI (shown while the shading is rendered) */
  setHdri(hdri: PreviewState["hdri"] | null): void;
  /** The desk's top under the scene (the frame stays) */
  setTop?(top: PreviewState["top"]): void;
  /** The desk shown or not (#358): off = no table under the scene */
  setDesk?(on: boolean): void;
  /**
   * A translucent image where a target is about to be printed (the new-target form, the placement rows); null = none.
   * `handlesOnly`: the target itself moves with the placement (`movePrint`), the ghost adds only its handles.
   */
  setGhost?(ghost: StageTarget | null, options?: { handlesOnly?: boolean }): void;
  /** A target's printed image moves to another place (the placement being edited) – nothing else is built anew */
  movePrint?(target: StageTarget): void;
  /** A printed image's height per width, once its image has loaded (undefined before) */
  printedAspect?(targetId: string): number | undefined;
  /** The printed images on the page, each with `userData.targetId` (picking a target by its print) */
  targetPlanes?(): Object3D[];
  /** The grids: the surfaces' own (spacing per surface, counted from the origin, its vertical axis), the floor grid, the vertical grid */
  setGrid?(grid: StageGrids): void;
  /**
   * The lines a drag snapped to (mm of the stage frame – with `surface`, of that surface's own plane: from its top left
   * corner, y up), drawn while it lasts; empty = none
   */
  setGuides?(guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>, surface?: string): void;
  /** The stage's frame (metres, origin at the scene's origin, z up) */
  frame?(): Object3D;
  /** The viewport's shading: the sky and the HDRI's light show only while rendered */
  setShading?(mode: PreviewState["shading"]): void;
  /** The ghost's image and corner (the placement handles) */
  ghostParts?(): { image: Object3D | null; corner: Object3D | null };
  /** Where a ray meets the scene's surfaces, in mm from the surface's top left corner, and on which surface (its id) */
  surfaceHit?(raycaster: Raycaster): { surface: StageSurface; x: number; y: number } | null;
  /**
   * The surfaces marked on the stage (#314, for the Surface mode): `outlined` wear a thin outline, `highlighted` the
   * selection's – ids of the open scene's surfaces; unknown ids are left out
   */
  setSurfaceMarks?(outlined: readonly string[], highlighted: string | null): void;
  /** The target marks (#323): every target's place framed with its id, green / orange for on / switched off */
  setTargetMarks?(on: boolean): void;
  /** Ortho shown or on the way (#369): the sky sphere steps aside for a plain ground */
  setOrtho?(on: boolean): void;
  /** Every frame: the stage's frame relative to the camera (the camera stays at the origin) */
  update(cameraInverse: Matrix4): void;
  dispose(): void;
}

/**
 * The editor's tracker: no camera, no engine. The open scene's targets lie on its surfaces (the mock stage);
 * every frame each target not switched off is reported found with the pose of its printed image relative to a
 * camera that the author moves (drag = orbit, wheel / pinch = distance, double tap = the reader's view, presets in
 * the preview panel). `ArScene` sees matrices arriving and stopping, as with the engine – reveal, unlock and outro
 * happen as in AR. The anchor convention is the engine's: 1 unit = the target's printed width, origin in its
 * centre, the image in the x/y plane.
 */
export class MockTracker implements IImageTracker {
  /** The stage is always in view: the scene renders every frame */
  readonly continuous = true;
  private started = false;
  private paused = false;
  private targets: StageTarget[] = [];
  /** The targets as laid out from the content, before a placement being edited moves one (`targets` is with it) */
  private laidOut: StageTarget[] = [];
  /** The placement being edited: that target lies there, print and entity, until it is saved or dropped */
  private livePlacement: LivePlacement | null = null;
  /** The current scene's targets as the engine handed them over (laid out again by `relayout`) */
  private tracked: readonly Target[] = [];
  private sceneId: string | null = null;
  private held: TrackedScene[] = [];
  /** Targets reported found right now */
  private found = new Set<string>();
  private stage: StageView | null = null;
  private camera: PerspectiveCamera | null = null;
  private orbit: Orbit = { ...VIEW_PRESETS.reader };
  private preview: PreviewState = getPreview();
  private unsubscribe: (() => void) | null = null;
  private frame = 0;
  private startedAt = 0;
  private storeTimer = 0;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number; button: number }>();
  /** Two fingers: where their midpoint was (they pan together while they pinch) */
  private lastMid: { x: number; y: number } | null = null;
  /** A pointer gesture that belongs to an editor tool (the gizmo's handle under the pointer): not an orbit */
  ignorePointer: ((event: PointerEvent) => boolean) | null = null;
  private ghost: StageTarget | null = null;
  private ghostOptions: { handlesOnly?: boolean } = {};

  /** The stage's printed images (for picking) */
  targetPlanes(): Object3D[] {
    return this.stage?.targetPlanes?.() ?? [];
  }

  ghostParts(): { image: Object3D | null; corner: Object3D | null } {
    return this.stage?.ghostParts?.() ?? { image: null, corner: null };
  }

  surfaceHit(raycaster: Raycaster): { surface: StageSurface; x: number; y: number } | null {
    return this.stage?.surfaceHit?.(raycaster) ?? null;
  }

  /** Show where a target would be printed (the form's placement); `handlesOnly` while the target itself follows it */
  setGhost(ghost: StageTarget | null, options: { handlesOnly?: boolean } = {}): void {
    this.ghost = ghost;
    this.ghostOptions = options;
    this.stage?.setGhost?.(ghost, options);
  }

  /** Where a target lies on the stage as the content places it (its own place, the protocol or the row) */
  placeOf(targetId: string): StageTarget | null {
    return this.laidOut.find(target => target.id === targetId) ?? null;
  }

  /** A printed image's height per width once its image has loaded */
  printedAspect(targetId: string): number | undefined {
    return this.stage?.printedAspect?.(targetId);
  }

  /** Every printed target where it lies now (a placement being edited included), with its printed height (mm) */
  placedBoxes(): Array<{ id: string; place: StageTarget; height: number }> {
    return this.targets.map(target => ({ id: target.id, place: target, height: placeHeight(target, this.printedAspect(target.id)) }));
  }

  /** The stage's frame (null before the stage is attached) */
  stageFrame(): Object3D | null {
    return this.stage?.frame?.() ?? null;
  }

  /** Draw the lines a drag snapped to (mm of the stage frame, or of `surface`'s own plane); empty = none */
  setGuides(guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>, surface?: string): void {
    this.stage?.setGuides?.(guides, surface);
  }

  /**
   * The placement being edited moves the target itself – its print on the page and the anchor its entity follows –
   * instead of showing a second image (`null` = back to the content's place). The content changes only on a save.
   */
  placeTarget(targetId: string | null, place: PlaceBox | null): void {
    const before = this.livePlacement?.id ?? null;
    this.livePlacement = targetId && place ? { id: targetId, place: { ...place } } : null;
    this.targets = withLivePlacement(this.laidOut, this.livePlacement);
    for (const id of new Set([before, targetId])) {
      const target = id ? this.targets.find(t => t.id === id) : undefined;
      if (target) this.stage?.movePrint?.(target);
    }
  }
  private dragging = false;
  private lastPinch = 0;
  private cameraWorld = new Matrix4();
  private cameraInverse = new Matrix4();
  private pose = new Matrix4();

  constructor(
    private container: HTMLElement,
    private options: ImageTrackerOptions,
    private now: () => number = () => performance.now(),
  ) {}

  get hasCamera(): boolean {
    return this.started;
  }

  get tracking(): boolean {
    return this.targets.length > 0;
  }

  /** No camera picture: the look-around's sky sample and the camera panel show nothing */
  get cameraVideo(): HTMLVideoElement | null {
    return null;
  }

  get currentOrbit(): Orbit {
    return { ...this.orbit };
  }

  /** The stage that draws the page; the tracker feeds it the layout and the camera */
  attachStage(stage: StageView): void {
    this.stage?.dispose();
    this.stage = stage;
    if (this.sceneId) stage.setLayout(this.targets, this.stageScene());
    stage.setShading?.(this.preview.shading);
    stage.setHdri(hdriOf(this.preview));
    stage.setTop?.(this.preview.top);
    stage.setDesk?.(this.preview.desk);
    stage.setGrid?.(gridOf(this.preview));
    stage.setGhost?.(this.ghost, this.ghostOptions);
    stage.setSurfaceMarks?.(this.marks.outlined, this.marks.highlighted);
    stage.setOrtho?.(this.orthoShown);
  }

  private stageScene(): StageScene {
    const references = this.sceneId ? this.references[this.sceneId] : undefined;
    return { surfaces: this.surfaces, ...(references ? { references } : {}) };
  }

  /** The open scene's surfaces where they lie (#314, `place`) */
  private surfaces: SceneSurface[] = [];
  /** …and in the stage frame (the placement math, the anchors, the hits) */
  private frames: SurfaceFrame[] = [];

  /** The open scene's surfaces in the stage frame (mm) – empty before a scene is open */
  surfaceFrames(): readonly SurfaceFrame[] {
    return this.frames;
  }

  /** The open scene's surfaces with their places in the scene (#314: the surface gizmo sits on one) */
  sceneSurfaces(): readonly SceneSurface[] {
    return this.surfaces;
  }

  /** Where the surfaces lie for the placement math: the scene's frames (none: the stand-in double page) */
  private placeSurfaces(): Surfaces {
    return this.frames;
  }

  /** The reference images (#314) by scene id and surface id, set by the page; the open scene's lie on its surfaces */
  private references: SurfaceReferences = {};

  setSurfaceReferences(references: SurfaceReferences): void {
    this.references = references;
    this.relayout();
  }

  /** Outline / highlight surfaces by id on the stage (the Surface mode) */
  setSurfaceMarks(outlined: readonly string[], highlighted: string | null): void {
    this.marks = { outlined: [...outlined], highlighted };
    this.stage?.setSurfaceMarks?.(outlined, highlighted);
  }
  private marks: { outlined: string[]; highlighted: string | null } = { outlined: [], highlighted: null };

  async startCamera(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.now();
    this.applyPreview(getPreview(), true);
    this.unsubscribe = subscribePreview(state => this.applyPreview(state, false));
    this.listen(true);
    this.loop();
    this.publishState();
  }

  async loadTargets({ sceneId, targets }: TrackedScene): Promise<void> {
    if (!this.started) throw new Error("loadTargets() needs the camera");
    this.stopTracking();
    this.sceneId = sceneId;
    this.tracked = targets;
    this.relayout();
  }

  /**
   * Lay the open scene out again from the content as it is now – its surfaces where they lie – without loading its
   * targets anew: the engine does not reload a scene that is already tracked.
   */
  relayout(): void {
    if (!this.sceneId) return;
    const scene = getScene(this.sceneId);
    this.surfaces = sceneSurfaces(scene);
    this.frames = this.surfaces.map(surfaceFrame);
    // The editor loads the switched-off targets too (`keepSwitchedOffTargets`): the target marks tell them apart (#323)
    const off = new Set(this.tracked.filter(target => target.enabled === false).map(target => target.id));
    this.laidOut = layoutTargets(this.tracked, this.frames).map(target => (off.has(target.id) ? { ...target, off: true } : target));
    this.targets = withLivePlacement(this.laidOut, this.livePlacement);
    this.stage?.setLayout(this.targets, this.stageScene());
    this.stage?.setSurfaceMarks?.(this.marks.outlined, this.marks.highlighted);
    this.publishState();
  }

  prepareTargets(scenes: readonly TrackedScene[]): void {
    this.held = [...scenes];
    this.publishState();
  }

  growTargets(scenes: readonly TrackedScene[]): void {
    this.held = [...scenes];
    this.publishState();
  }

  pause(): void {
    if (!this.started || this.paused) return;
    this.paused = true;
    this.found.clear(); // as the engine: nothing is reported lost at a pause, the scene drops its poses itself
    cancelAnimationFrame(this.frame);
    this.publishState();
  }

  resume(): void {
    if (!this.started || !this.paused) return;
    this.paused = false;
    this.loop();
  }

  stopTracking(): void {
    this.found.forEach(id => this.options.onUpdate(id, null));
    this.found.clear();
    this.targets = [];
    this.laidOut = [];
    this.sceneId = null;
  }

  stop(): void {
    this.stopTracking();
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.storeTimer);
    this.listen(false);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stage?.dispose();
    this.stage = null;
    this.held = [];
    this.started = false;
    this.paused = false;
    publishEngineState(EMPTY_ENGINE_STATE);
  }

  /** A fixed field of view; the aspect follows the container, as the engine's intrinsics would */
  fit(camera: PerspectiveCamera): void {
    this.camera = camera;
    this.takeProjection(camera);
    // Ortho (#369) narrows the field and moves the planes – as drawn now, so a resize keeps the lens
    const lens = orthoLens(this.orbit.distance, this.orthoBlend * this.orthoBlend * (3 - 2 * this.orthoBlend));
    camera.fov = lens.fov;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width && height) camera.aspect = width / height;
    camera.near = Math.max(NEAR, (lens.eye - this.orbit.distance) / 1000 - 20);
    camera.far = lens.eye / 1000 + FAR;
    camera.updateProjectionMatrix();
  }

  /** One frame at `nowMs`: the camera from the orbit (+ wobble), every visible target's anchor, the stage */
  tick(nowMs: number): void {
    if (!this.started || this.paused) return;
    const t = (nowMs - this.startedAt) / 1000;
    this.fly(nowMs);
    const { orbit, offset } = wobbled(this.orbit, this.preview.wobble, t);
    const lens = this.lens(nowMs, orbit.distance);
    cameraMatrix({ ...orbit, distance: lens.eye }, this.focus(), this.cameraWorld);
    if (offset.lengthSq() > 0) this.cameraWorld.setPosition(new Vector3().setFromMatrixPosition(this.cameraWorld).add(offset));
    this.cameraInverse.copy(this.cameraWorld).invert();
    const hidden = new Set(this.preview.hidden);
    for (const target of this.targets) {
      if (hidden.has(target.id)) {
        if (this.found.delete(target.id)) this.options.onUpdate(target.id, null);
        continue;
      }
      const scale = target.width / 1000;
      const surfaces = this.placeSurfaces();
      this.pose.compose(targetCentre(target, surfaces, this.stage?.printedAspect?.(target.id)), targetTurn(target, surfaces), new Vector3(scale, scale, scale));
      const matrix = new Matrix4().multiplyMatrices(this.cameraInverse, this.pose);
      if (!this.found.has(target.id)) {
        this.found.add(target.id);
        this.publishState();
      }
      this.options.onUpdate(target.id, matrix);
    }
    this.stage?.setHiddenPrints?.(hidden);
    this.stage?.update(this.cameraInverse);
  }

  /** How far ortho is blended in (0…1, #369) and when it was last stepped */
  private orthoBlend = 0;
  private lensAt = 0;

  /**
   * The lens at `nowMs` (#369): ortho blends in or out over `ORTHO_BLEND_MS`, the camera's field of view and clip
   * planes follow – the eye far back in ortho, the planes around what lies within 20 m of the looked-at point
   */
  private lens(nowMs: number, distance: number): { eye: number; fov: number } {
    const step = this.lensAt ? Math.max(0, nowMs - this.lensAt) / ORTHO_BLEND_MS : 1;
    this.lensAt = nowMs;
    const goal = this.orbit.ortho ? 1 : 0;
    this.orthoBlend = goal > this.orthoBlend ? Math.min(goal, this.orthoBlend + step) : Math.max(goal, this.orthoBlend - step);
    const k = this.orthoBlend * this.orthoBlend * (3 - 2 * this.orthoBlend);
    const lens = orthoLens(distance, k);
    // Arrived: true ortho (#369) – the projection three's orthographic camera has, half as high as the looked-at plane
    // shows; on the way the telephoto lens blends (the two look the same where they meet)
    const ortho = this.orthoBlend >= 1;
    const half = ortho ? orthoHalfHeight(distance) : 0;
    const camera = this.camera;
    if (camera) {
      const near = Math.max(NEAR, (lens.eye - distance) / 1000 - 20);
      const far = lens.eye / 1000 + FAR;
      if (camera.fov !== lens.fov || camera.near !== near || camera.far !== far || ortho !== this.trueOrtho || half !== this.orthoHalf) {
        camera.fov = lens.fov;
        camera.near = near;
        camera.far = far;
        this.trueOrtho = ortho;
        this.orthoHalf = half;
        camera.updateProjectionMatrix();
      }
    }
    // The sky sphere around the stage has no place in a parallel view (nor in the far-back eye on the way): a plain ground
    const showing = this.orthoBlend > 0;
    if (showing !== this.orthoShown) {
      this.orthoShown = showing;
      this.stage?.setOrtho?.(showing);
    }
    return lens;
  }

  /** True ortho now (#369): the camera's projection is orthographic, three's flags say so */
  private trueOrtho = false;
  /** Its half height (m, at the looked-at point) */
  private orthoHalf = 0;
  /** Ortho shown or on the way: the stage's sky steps aside */
  private orthoShown = false;
  /** The cameras whose projection this tracker takes over (once each) */
  private patched = new WeakSet<PerspectiveCamera>();

  /**
   * Take over the camera's projection (#369): every `updateProjectionMatrix` – the tracker's and the view's on a resize –
   * is followed by the ortho one while true ortho is on. The camera then says it is orthographic (`isOrthographicCamera`,
   * `top` / `bottom` …), so three's ray casting, the transform gizmos and the renderer treat it as one. The editor's
   * only: the reader's camera is never handed to this tracker.
   */
  private takeProjection(camera: PerspectiveCamera): void {
    if (this.patched.has(camera)) return;
    this.patched.add(camera);
    const perspective = camera.updateProjectionMatrix.bind(camera);
    camera.updateProjectionMatrix = () => {
      perspective();
      applyOrtho(camera, this.trueOrtho ? this.orthoHalf : null);
    };
  }

  /** Ortho now, as drawn (#369): the blend has arrived */
  get orthographic(): boolean {
    return this.orthoBlend >= 1;
  }

  /**
   * The point the camera looks at: the scene's origin (a double page's spine) plus the author's pan. Never a target's
   * centre: a scene change or targets arriving would move the camera (#105)
   */
  private focus(): Vector3 {
    const pan = this.orbit.pan;
    return new Vector3((pan?.x ?? 0) / 1000, (pan?.y ?? 0) / 1000, (pan?.z ?? 0) / 1000);
  }

  // ── The camera's point (#335): Home, a focus on what is selected, fixed to a surface or free ──

  /** A focus or Home on its way: where it started, where it goes, when it started, what is stored when it lands */
  private flight: { from: Orbit; to: Orbit; start: number; store: boolean } | null = null;

  /** Home: back to the reader's view around the scene's origin, fixed to the table (as a double click) */
  home(): void {
    this.flyTo({ ...VIEW_PRESETS.reader }, false);
    updatePreview({ view: "reader", orbit: null });
  }

  /** Turn around `spot`: the camera flies to show it whole – front-on to a face – and its point is fixed to its surface */
  focusOn(spot: CameraSpot): void {
    const direction = spot.direction ?? (spot.normal ? facing(spot.normal) : { tilt: this.orbit.tilt, yaw: this.orbit.yaw });
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, fitDistance(Math.max(spot.width, 1), Math.max(spot.height, 1), width / height)));
    const { x, y, z } = spot.centre;
    // Ortho chosen by hand stays (#369); a snapped view and the ortho that came with it are left
    const byHand = !!this.orbit.ortho && !this.orbit.autoOrtho;
    const to: Orbit = { distance, ...direction, pan: { x, y, z }, label: spot.label, ...(spot.surface ? { surface: spot.surface } : {}), ...(byHand ? { ortho: true } : {}) };
    this.flyTo(to, true);
    updatePreview({ orbit: { ...to } });
  }

  /** Focus on a surface of the open scene by id: its middle, front-on, the surface whole */
  focusSurface(id: string, label = id): boolean {
    const spot = this.surfaceSpot(id, label);
    if (spot) this.focusOn(spot);
    return !!spot;
  }

  /** A surface of the open scene as a spot: its middle, its size, its normal (null: no such surface) */
  surfaceSpot(id: string, label = id): CameraSpot | null {
    const frame = this.frames.find(f => f.id === id);
    if (!frame) return null;
    const [x, y, z] = toStage(frame, frame.widthMm / 2, frame.heightMm / 2);
    return { centre: { x, y, z }, width: frame.widthMm, height: frame.heightMm, normal: frame.normal, surface: id, label };
  }

  /** Focus on a printed target by id: its image's middle, front-on to its surface */
  focusTarget(id: string, label = id): boolean {
    const spot = this.targetSpot(id, label);
    if (spot) this.focusOn(spot);
    return !!spot;
  }

  /** A printed target as a spot: its image's middle and size, its surface's normal (null: not on the stage) */
  targetSpot(id: string, label = id): CameraSpot | null {
    const target = this.targets.find(t => t.id === id);
    if (!target) return null;
    const surfaces = this.placeSurfaces();
    const height = placeHeight(target, this.printedAspect(id));
    const centre = placeCentre(target, surfaces, this.printedAspect(id));
    const frame = this.frames.find(f => f.id === target.surface);
    return { centre, width: target.width, height, ...(frame ? { normal: frame.normal } : {}), surface: target.surface, label };
  }

  /**
   * Focus on several things at once (#369, a multi-selection): the box around them all, from where the camera looks now,
   * the point fixed to `surface` (the active one's) – none = the table
   */
  focusSpots(spots: readonly CameraSpot[], label: string, surface?: string): void {
    const box = spotsBox(spots);
    if (!box) return;
    this.focusOn({ centre: box.centre, width: box.size, height: box.size, label, ...(surface ? { surface } : {}) });
  }

  // ── The camera control (#369): the views, ortho, the lock following the selection, the buttons' drags ──

  /** Snap to one of the six views around the looked-at point (Blender's numpad, the gizmo's balls); ortho with it */
  snapView(view: AxisView): void {
    this.landFlight();
    const to = snappedTo(this.orbit, view);
    this.flyTo(to, true);
    updatePreview({ orbit: { ...to } });
  }

  /** The view the camera is snapped to (null: none – orbited, or never snapped) */
  get axisView(): AxisView | null {
    return (this.flight?.to ?? this.orbit).axisView ?? null;
  }

  /** Orthographic or perspective, by hand: it stays when the camera orbits */
  setOrtho(ortho: boolean): void {
    this.landFlight();
    const { autoOrtho: _auto, ortho: _ortho, ...rest } = this.orbit;
    this.orbit = ortho ? { ...rest, ortho: true } : rest;
    window.clearTimeout(this.storeTimer);
    updatePreview({ orbit: { ...this.orbit } });
  }

  /**
   * What the camera's point is fixed to follows the selection (#369, the last click): the active one's surface – none =
   * the table. The view does not move; a pan slides along the new plane from where the point is.
   */
  lockTo(surface: string | undefined): void {
    const orbit = this.flight?.to ?? this.orbit;
    if (orbit.surface === surface) return;
    const { surface: _surface, ...rest } = this.orbit;
    this.orbit = surface ? { ...rest, surface } : rest;
    if (this.flight) {
      const { surface: _s, ...to } = this.flight.to;
      this.flight.to = surface ? { ...to, surface } : to;
    }
    this.orbitChanged();
  }

  /** A drag on the gizmo (#369): orbits as a drag on the stage does */
  orbitBy(dx: number, dy: number): void {
    this.stopFlight();
    this.turn(dx, dy);
  }

  /** A drag on the zoom button (#369): down = nearer, up = farther */
  zoomBy(dy: number): void {
    this.stopFlight();
    this.zoom(Math.exp(-dy * ZOOM_PER_PX));
  }

  /** A drag on the pan button (#369): the stage follows the pointer, as Shift + drag */
  panBy(dx: number, dy: number): void {
    this.stopFlight();
    this.pan(dx, dy);
  }

  /** Orbit by a pointer movement (px): the view snapped to is left, ortho that came with it goes */
  private turn(dx: number, dy: number): void {
    this.orbit = leftView(this.orbit);
    this.orbit.yaw += dx * ORBIT_DEGREES_PER_PX;
    this.orbit.tilt = wrapTilt(this.orbit.tilt + dy * TILT_DEGREES_PER_PX);
    this.orbitChanged();
  }

  /** Focus on the whole scene: every surface – a standing poster too – from the reader's side */
  focusScene(label = "the scene"): void {
    const corners = framesOf(this.frames).flatMap(frame =>
      [[0, 0], [frame.widthMm, 0], [0, frame.heightMm], [frame.widthMm, frame.heightMm]].map(([u, v]) => new Vector3(...toStage(frame, u, v))));
    const box = new Box3().setFromPoints(corners);
    const centre = box.getCenter(new Vector3());
    const diameter = box.getSize(new Vector3()).length();
    const { tilt, yaw } = VIEW_PRESETS.reader;
    this.focusOn({ centre: { x: centre.x, y: centre.y, z: centre.z }, width: diameter, height: diameter, direction: { tilt, yaw }, label });
  }

  /**
   * Free (#335): the point leaves its surface, a pan moves it along the screen. Back to fixed: the point slides along
   * the line of sight onto the surface it was fixed to (the table without one) – the view does not jump.
   */
  setFree(free: boolean): void {
    this.landFlight();
    if (free === !!this.orbit.free) return;
    const { free: _, ...rest } = this.orbit;
    this.orbit = free ? { ...rest, free: true } : this.landed(rest);
    window.clearTimeout(this.storeTimer);
    updatePreview({ orbit: { ...this.orbit } });
  }

  /** The orbit with its point moved along the line of sight onto its surface's plane (else straight onto it) */
  private landed(orbit: Orbit): Orbit {
    const frame = orbit.surface ? this.frames.find(f => f.id === orbit.surface) : undefined;
    const origin = frame ? new Vector3(...frame.origin) : new Vector3();
    const n = this.fixedNormal(orbit);
    const pan = orbit.pan ?? { x: 0, y: 0 };
    const point = new Vector3(pan.x, pan.y, pan.z ?? 0);
    const sight = new Vector3(0, 0, -1).applyQuaternion(cameraTurn(orbit));
    const eye = point.clone().sub(sight.clone().multiplyScalar(orbit.distance));
    const facingPlane = sight.dot(n);
    const along = Math.abs(facingPlane) > 1e-3 ? origin.clone().sub(eye).dot(n) / facingPlane : -1;
    if (along >= MIN_DISTANCE && along <= MAX_DISTANCE) {
      const hit = eye.add(sight.multiplyScalar(along));
      return { ...orbit, distance: along, pan: { x: hit.x, y: hit.y, z: hit.z } };
    }
    const onPlane = point.sub(n.clone().multiplyScalar(point.clone().sub(origin).dot(n)));
    return { ...orbit, pan: { x: onPlane.x, y: onPlane.y, z: onPlane.z } };
  }

  /** The normal of the plane a fixed point slides along: its surface's, else the table's */
  private fixedNormal(orbit: Orbit = this.orbit): Vector3 {
    const frame = orbit.surface ? this.frames.find(f => f.id === orbit.surface) : undefined;
    return frame ? new Vector3(...frame.normal).normalize() : new Vector3(0, 0, 1);
  }

  private flyTo(to: Orbit, store: boolean): void {
    window.clearTimeout(this.storeTimer);
    this.flight = { from: { ...this.orbit }, to, start: this.now(), store };
  }

  /** A flight's step at `nowMs`; it lands at its end (and is stored when it was a focus) */
  private fly(nowMs: number): void {
    const flight = this.flight;
    if (!flight) return;
    const k = Math.min(1, Math.max(0, (nowMs - flight.start) / FLIGHT_MS));
    if (k >= 1) {
      this.landFlight();
      return;
    }
    this.orbit = orbitBetween(flight.from, flight.to, 1 - Math.pow(1 - k, 3));
  }

  /** Stop a flight where it is now (a drag or the wheel takes over from there) */
  private stopFlight(): void {
    if (!this.flight) return;
    this.flight = null;
    this.orbitChanged();
  }

  /** End a flight where it goes (a mode change) */
  private landFlight(): void {
    const flight = this.flight;
    if (!flight) return;
    this.flight = null;
    this.orbit = { ...flight.to };
    if (flight.store) updatePreview({ orbit: { ...flight.to } });
  }

  private loop(): void {
    cancelAnimationFrame(this.frame);
    const step = () => {
      if (!this.started || this.paused) return;
      this.tick(this.now());
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private applyPreview(state: PreviewState, initial: boolean): void {
    const previous = this.preview;
    this.preview = state;
    let next: Orbit | null = null;
    if (initial || state.view !== previous.view || (state.orbit === null && previous.orbit !== null)) {
      next = { ...(state.orbit ?? VIEW_PRESETS[state.view]) };
    } else if (state.orbit && !sameOrbit(state.orbit, this.orbit)) {
      next = { ...state.orbit };
    }
    // A focus or Home stores where it goes as it starts: the flight takes the camera there
    if (next && !(this.flight && sameOrbit(next, this.flight.to))) {
      this.flight = null;
      this.orbit = next;
    }
    if (initial || state.shading !== previous.shading) this.stage?.setShading?.(state.shading);
    if (initial || state.hdri !== previous.hdri || state.hdriOn !== previous.hdriOn) this.stage?.setHdri(hdriOf(state));
    if (initial || state.top !== previous.top) this.stage?.setTop?.(state.top);
    if (initial || state.desk !== previous.desk) this.stage?.setDesk?.(state.desk);
    if (initial || !sameGrids(gridOf(state), gridOf(previous))) this.stage?.setGrid?.(gridOf(state));
    if (initial || state.targetMarks !== previous.targetMarks) this.stage?.setTargetMarks?.(state.targetMarks);
    if (state.hidden !== previous.hidden) this.publishState();
  }

  /** The free orbit, stored once the author pauses */
  private orbitChanged(): void {
    window.clearTimeout(this.storeTimer);
    this.storeTimer = window.setTimeout(() => updatePreview({ orbit: { ...this.orbit } }), STORE_DELAY_MS);
  }

  private zoom(factor: number): void {
    this.orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, this.orbit.distance * factor));
    this.orbitChanged();
  }

  /** Move the looked-at point by a pointer movement (px): the stage follows the pointer in the page plane */
  private pan(dx: number, dy: number): void {
    const height = this.container.clientHeight || window.innerHeight || 1;
    const mmPerPx = (2 * this.orbit.distance * Math.tan(degrees(PREVIEW_FOV) / 2)) / height;
    // The screen's right and up (#335): free, as they are – the point follows the pointer anywhere; fixed, along the
    // plane of the surface the point is fixed to (the table without one), each at full speed
    const turn = cameraTurn(this.orbit);
    let right = new Vector3(1, 0, 0).applyQuaternion(turn);
    let up = new Vector3(0, 1, 0).applyQuaternion(turn);
    const sight = new Vector3(0, 0, -1).applyQuaternion(turn);
    // A plane seen edge-on (#369 – the table from the front, a wall from above) has no screen direction to slide along:
    // the pan moves along the screen there, as free
    if (!this.orbit.free && Math.abs(sight.dot(this.fixedNormal())) >= EDGE_ON) {
      const n = this.fixedNormal();
      right = alongPlane(right, n);
      up = alongPlane(up, n);
    }
    const move = right.multiplyScalar(-dx).add(up.multiplyScalar(dy)).multiplyScalar(mmPerPx);
    const pan = this.orbit.pan ?? { x: 0, y: 0 };
    const reach = (value: number) => Math.min(MAX_PAN, Math.max(-MAX_PAN, value));
    this.orbit.pan = { x: reach(pan.x + move.x), y: reach(pan.y + move.y), z: reach((pan.z ?? 0) + move.z) };
    this.orbitChanged();
  }

  // ── Input: from the document (a drag goes on outside the stage), started only on the stage, never on the app's UI ──

  /** A gesture starts on the stage: inside the container and not on a panel, bar, menu or control (#131) */
  private onStage(event: Event): boolean {
    return !onAppUi(event) && event.target instanceof Node && this.container.contains(event.target);
  }

  private listen(on: boolean): void {
    const capture: AddEventListenerOptions = { capture: true };
    const listeners: Array<[string, EventListener, AddEventListenerOptions]> = [
      ["pointerdown", this.onPointerDown as EventListener, capture],
      ["pointermove", this.onPointerMove as EventListener, capture],
      ["pointerup", this.onPointerUp as EventListener, capture],
      ["pointercancel", this.onPointerUp as EventListener, capture],
      ["click", this.onClick as EventListener, capture],
      ["dblclick", this.onDoubleClick as EventListener, capture],
      ["wheel", this.onWheel as EventListener, { capture: true, passive: false }],
    ];
    listeners.forEach(([type, listener, options]) =>
      on ? document.addEventListener(type, listener, options) : document.removeEventListener(type, listener, options));
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.paused || !this.onStage(event) || this.ignorePointer?.(event)) return;
    this.stopFlight();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button });
    if (this.pointers.size === 1) this.dragging = false;
    this.lastPinch = 0;
    this.lastMid = null;
    if (event.button === 1) event.preventDefault(); // the middle button pans; no autoscroll
  };

  private onPointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    if (this.ignorePointer?.(event)) {
      // The gizmo took the gesture after all (touch: no hover before the press)
      this.pointers.delete(event.pointerId);
      return;
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const other = a === pointer ? b : a;
      const distance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (this.lastPinch) this.zoom(this.lastPinch / distance);
      this.lastPinch = distance;
      const mid = { x: (event.clientX + other.x) / 2, y: (event.clientY + other.y) / 2 };
      if (this.lastMid) this.pan(mid.x - this.lastMid.x, mid.y - this.lastMid.y);
      this.lastMid = mid;
      this.dragging = true;
    } else {
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!this.dragging && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < DRAG_PX) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        return;
      }
      this.dragging = true;
      if (pointer.button === 1 || event.shiftKey) {
        // Shift + drag or the middle button: pan (as in every 3D tool); plain drag: orbit
        this.pan(dx, dy);
      } else {
        this.turn(dx, dy);
      }
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.lastPinch = 0;
    this.lastMid = null;
  };

  /** A click that ends a drag is no tap on the scene (ArScene listens on the document in the bubble phase) */
  private onClick = (event: MouseEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    event.stopPropagation();
    event.preventDefault();
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.paused || !this.onStage(event)) return;
    this.home();
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.paused || !this.onStage(event)) return;
    event.preventDefault();
    this.stopFlight();
    this.zoom(1 + Math.sign(event.deltaY) * WHEEL_STEP);
  };

  /** The debug overlay's engine view: the scene "held" with all its targets ready, found = reported */
  private publishState(): void {
    if (!this.started) return;
    const heldScenes = this.held.filter(scene => scene.sceneId !== this.sceneId);
    publishEngineState({
      current: this.sceneId ? { sceneId: this.sceneId, targets: this.targets.length } : null,
      held: heldScenes.map(scene => ({ sceneId: scene.sceneId, targets: scene.targets.length })),
      preparing: [],
      targets: this.targets.length + heldScenes.reduce((n, scene) => n + scene.targets.length, 0),
      ready: this.targets.length + heldScenes.reduce((n, scene) => n + scene.targets.length, 0),
      extractingSince: null,
      budget: null,
      growing: null,
      seen: [...this.found],
      lastSwitch: null,
    });
  }
}

const sameOrbit = (a: Orbit, b: Orbit) =>
  a.distance === b.distance && a.tilt === b.tilt && a.yaw === b.yaw && (a.pan?.x ?? 0) === (b.pan?.x ?? 0) && (a.pan?.y ?? 0) === (b.pan?.y ?? 0)
  && (a.pan?.z ?? 0) === (b.pan?.z ?? 0) && a.surface === b.surface && a.label === b.label && !!a.free === !!b.free
  && !!a.ortho === !!b.ortho && !!a.autoOrtho === !!b.autoOrtho && a.axisView === b.axisView;

/** An orbit that has left its snapped view (#369): no view any more, and ortho that came with the snap is perspective again */
export const leftView = (orbit: Orbit): Orbit => {
  if (!orbit.axisView && !orbit.autoOrtho) return orbit;
  const { axisView: _view, autoOrtho, ortho, ...rest } = orbit;
  return autoOrtho || !ortho ? rest : { ...rest, ortho };
};

/** The orbit snapped to a view (#369): its direction, the view named, ortho – automatically unless it was ortho by hand */
export const snappedTo = (orbit: Orbit, view: AxisView): Orbit => {
  const byHand = !!orbit.ortho && !orbit.autoOrtho;
  return { ...orbit, ...AXIS_VIEWS[view], axisView: view, ortho: true, ...(byHand ? { autoOrtho: undefined } : { autoOrtho: true }) };
};

/**
 * Where the eye is (mm from the looked-at point) and the field of view (degrees) for an orbit `distance` away at ortho
 * blend `k` (0 = perspective, 1 = ortho, #369): the eye moves back evenly in scale, the field narrows so the looked-at
 * plane keeps its size
 */
export const orthoLens = (distance: number, k: number): { eye: number; fov: number } => {
  if (k <= 0) return { eye: distance, fov: PREVIEW_FOV };
  const eye = k <= 0 ? distance : distance * Math.pow(Math.max(1, ORTHO_EYE_MM / distance), Math.min(1, k));
  const fov = (2 * Math.atan((Math.tan(degrees(PREVIEW_FOV) / 2) * distance) / eye) * 180) / Math.PI;
  return { eye, fov };
};

/** The half height (m) a true ortho view shows: as much as the perspective view shows at the looked-at point (#369) */
export const orthoHalfHeight = (distance: number): number => (distance / 1000) * Math.tan(degrees(PREVIEW_FOV) / 2);

/**
 * Make a perspective camera orthographic (#369), or perspective again (`half` null): the projection three's
 * `OrthographicCamera` builds and the flags and sides its code reads – the ray caster, `TransformControls` and the renderer
 * then treat it as orthographic. Called right after the camera's own `updateProjectionMatrix`.
 */
export const applyOrtho = (camera: PerspectiveCamera, half: number | null): void => {
  const flags = camera as unknown as { isPerspectiveCamera: boolean; isOrthographicCamera: boolean; left: number; right: number; top: number; bottom: number };
  flags.isPerspectiveCamera = half === null;
  flags.isOrthographicCamera = half !== null;
  if (half === null) return;
  const width = half * camera.aspect;
  Object.assign(flags, { left: -width, right: width, top: half, bottom: -half });
  camera.projectionMatrix.makeOrthographic(-width, width, half, -half, camera.near, camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
};

/** A box (mm, the stage frame) around spots: their centres, each grown by half its larger side */
export const spotsBox = (spots: readonly CameraSpot[]): { centre: { x: number; y: number; z: number }; size: number } | null => {
  if (!spots.length) return null;
  const box = new Box3();
  for (const spot of spots) {
    const half = Math.max(spot.width, spot.height) / 2;
    const { x, y, z } = spot.centre;
    box.expandByPoint(new Vector3(x - half, y - half, z - half)).expandByPoint(new Vector3(x + half, y + half, z + half));
  }
  const centre = box.getCenter(new Vector3());
  return { centre: { x: centre.x, y: centre.y, z: centre.z }, size: Math.max(20, box.getSize(new Vector3()).length()) };
};
