import { Matrix4, Object3D, PerspectiveCamera, Quaternion, Raycaster, Vector3 } from "three";
import type { SpreadFormat, Target } from "@engine/types";
import { getSpread, getSpreads } from "@engine/content/game-config";
import { EMPTY_ENGINE_STATE, publishEngineState } from "@engine/utils/tracker-debug";
import { fetchTriggerInfos, TriggerInfos } from "@engine/utils/trigger-protocol";
import { fetchStageLayout, LayoutSheet, printedPlaceOf, sheetForSpread, sheetImageUrl, sheetSharpImageUrl, StageLayout } from "./stage-layout";
import { getPreview, PreviewOrbit, PreviewState, PreviewView, subscribePreview, updatePreview } from "./preview";
import type { IImageTracker, ImageTrackerOptions, TrackedSpread } from "@engine/scene/tracker-types";
import { onAppUi } from "@engine/scene/ui";

/** The simulated camera's vertical field of view – about what the engine reports on a phone at 960 × 720 */
export const PREVIEW_FOV = 60;
const NEAR = 0.01;
const FAR = 100;

/**
 * The page of the book the stage shows (mm) when the content has no layout (`utils/stage-layout.ts`): one page of
 * the double page, the spread is two of them side by side. This book's print format.
 */
export const BOOK_PAGE_MM = { width: 230, height: 320 } as const;

/** The surfaces a target lies on: the pages of the open book, or the closed book's front / back cover */
export type StageSurface = "left" | "right" | "front" | "back";

/**
 * Where a surface's left edge lies in the stage's frame (mm): the open book has its spine at x = 0 – the left page
 * to the left, the right page to the right; the closed book (a cover) is centred on the origin
 */
export const surfaceLeft = (surface: string, page: PageFormat): number =>
  surface === "left" ? -page.width : surface === "front" || surface === "back" ? -page.width / 2 : 0;

/** The surface a target falls back to on a spread: the right page of the open book, the cover's own face */
export const defaultSurface = (format: SpreadFormat | undefined): StageSurface =>
  format === "cover" ? "front" : format === "back" ? "back" : "right";

export interface PageFormat {
  width: number;
  height: number;
}

/** A target on the stage: its printed image, on which surface (left / right page) and where (mm from its top left corner) */
export interface StageTarget {
  id: string;
  imageSrc: string;
  surface: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The sheet of the book under the targets, as laid out: its rendered image and size */
export interface StageSheet {
  image: string;
  /** A much sharper image of the sheet, fetched once the camera is close (absent: the base image only) */
  imageSharp?: string;
  widthMm: number;
  heightMm: number;
}

/** The book as an object: how many spreads it has (the stage's block thickness follows), and what the spread is */
export interface StageBook {
  spreads: number;
  /** A double page (`book`), the front cover or the back cover: the stage draws the open or the closed book */
  format: SpreadFormat;
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
const MAX_DISTANCE = 1500;
const MAX_TILT = 85;
/** The looked-at point may be panned this far from the spread's own (mm) */
const MAX_PAN = 600;
/** A pointer that moved this far is a drag (orbit), not a tap */
const DRAG_PX = 8;
const ORBIT_DEGREES_PER_PX = 0.4;
const TILT_DEGREES_PER_PX = 0.3;
const WHEEL_STEP = 0.08;
/** The free orbit is stored this long after the last change */
const STORE_DELAY_MS = 300;

/** Hand shake at wobble 1: a few millimetres and half a degree, slow and fast parts */
const WOBBLE_MM = 2;
const WOBBLE_DEGREES = 0.5;

const DEFAULT_PRINT_MM = 60;
const PAGE_MARGIN_MM = 20;
const ROW_GAP_MM = 25;

const gridOf = (state: PreviewState) => ({ on: state.grid, mm: state.gridMm, origin: state.origin });

const degrees = (value: number) => (value * Math.PI) / 180;

/**
 * Where the current spread's targets lie on the stage. With the book's layout (from the designed PDFs) every target
 * lies exactly where it is printed. Else, with printed-image details (the trigger protocol), each target gets its
 * printed size and position: exact `x` / `y` when given, else the region named by `position` ("top left" …) on the
 * right page, several in one region stacked downwards. Without details the targets lie in a row across the middle
 * of the right page. "The right page" is a cover's own surface (`front` / `back`) on a cover.
 */
export const layoutTargets = (targets: readonly Target[], infos: TriggerInfos = {}, page: PageFormat = BOOK_PAGE_MM, layout: StageLayout | null = null, format: SpreadFormat | undefined = undefined): StageTarget[] => {
  const withImage = targets.filter(target => target.imageSrc);
  const fallback = defaultSurface(format);
  // A target's own `print` (made in the editor) or the book's layout: every target has a printed place
  const placed = (target: Target): StageTarget | null => {
    const own = target.print;
    if (own) return { id: target.id, imageSrc: target.imageSrc, surface: own.surface, x: own.x, y: own.y, width: own.width, height: own.height ?? own.width * 0.75 };
    const printed = layout?.targets[target.id];
    return printed ? { id: target.id, imageSrc: target.imageSrc, surface: printed.surface, x: printed.x, y: printed.y, width: printed.width, height: printed.height } : null;
  };
  const placedTargets = withImage.map(placed);
  if (withImage.length && placedTargets.every(target => target !== null)) return placedTargets as StageTarget[];
  if (placedTargets.some(target => target !== null)) {
    // A mix: the placed ones where they are, the rest in a row across the right page's lower half
    const rest = withImage.filter((_, i) => placedTargets[i] === null);
    const width = Math.min(60, (page.width - 20) / Math.max(1, rest.length) - 10);
    return withImage.map((target, i) => placedTargets[i] ?? {
      id: target.id, imageSrc: target.imageSrc, surface: fallback, x: 10 + rest.indexOf(target) * (width + 10), y: page.height * 0.6, width, height: width * 0.75,
    });
  }
  const known = withImage.filter(target => infos[target.id]?.width);
  if (known.length === withImage.length && withImage.length) {
    const used = new Map<string, number>();
    return withImage.map(target => {
      const info = infos[target.id]!;
      const width = info.width!;
      const height = info.height ?? width * 0.75;
      if (info.x !== undefined && info.y !== undefined) {
        return { id: target.id, imageSrc: target.imageSrc, surface: fallback, x: info.x, y: info.y, width, height };
      }
      const words = (info.position ?? "middle centre").toLowerCase();
      const column = words.includes("left") ? 0 : words.includes("right") ? 2 : 1;
      const row = words.includes("top") ? 0 : words.includes("bottom") ? 2 : 1;
      const stacked = used.get(words) ?? 0;
      used.set(words, stacked + 1);
      const x = column === 0 ? PAGE_MARGIN_MM : column === 2 ? page.width - PAGE_MARGIN_MM - width : (page.width - width) / 2;
      const rowTop = row === 0 ? PAGE_MARGIN_MM : row === 2 ? page.height - PAGE_MARGIN_MM - height : (page.height - height) / 2;
      return { id: target.id, imageSrc: target.imageSrc, surface: fallback, x, y: rowTop + stacked * (height + 10), width, height };
    });
  }
  // A row across the middle of the right page, shrunk to fit when there are many
  const count = withImage.length;
  const fit = Math.min(DEFAULT_PRINT_MM, (page.width - 2 * PAGE_MARGIN_MM - (count - 1) * ROW_GAP_MM) / Math.max(1, count));
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
 * The stage's frame: metres, origin in the centre of the double page (the spine), x to the right, y towards the
 * top of the page, z out of the page. A target's centre in that frame.
 */
export const targetCentre = (target: StageTarget, page: PageFormat = BOOK_PAGE_MM): Vector3 => {
  const pageLeft = surfaceLeft(target.surface, page);
  return new Vector3(
    (pageLeft + target.x + target.width / 2) / 1000,
    (page.height / 2 - target.y - target.height / 2) / 1000,
    0,
  );
};

/**
 * The simulated camera in the stage's frame: on a sphere around `focus`, `tilt` degrees from the vertical towards
 * the reader (the bottom edge of the page), turned `yaw` degrees around the vertical; up = the top of the page.
 */
export const cameraMatrix = (orbit: Orbit, focus: Vector3, target = new Matrix4()): Matrix4 => {
  const tilt = degrees(orbit.tilt);
  const yaw = degrees(orbit.yaw);
  const d = orbit.distance / 1000;
  const eye = new Vector3(Math.sin(yaw) * Math.sin(tilt) * d, -Math.cos(yaw) * Math.sin(tilt) * d, Math.cos(tilt) * d).add(focus);
  const up = new Vector3(-Math.sin(yaw), Math.cos(yaw), 0);
  const rotation = new Matrix4().lookAt(eye, focus, up);
  return target.compose(eye, new Quaternion().setFromRotationMatrix(rotation), new Vector3(1, 1, 1));
};

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

/** The stage's frame (z up, the reader on −y) turned into a world with y up and the book ahead on −z: −90° about x */
const STAGE_TO_WORLD = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const LOOK_UP = new Matrix4();

/** What the stage draws – set by the tracker, which owns the layout and the camera */
export interface StageView {
  /** The spread's targets on the page format, over the sheet's image when the book's layout has one */
  setLayout(targets: readonly StageTarget[], page: PageFormat, sheet: StageSheet | null, book: StageBook): void;
  /** The sky and the light: an HDRI (shown while the shading is rendered) */
  setHdri(hdri: PreviewState["hdri"]): void;
  /** The desk under the book */
  setDesk?(desk: PreviewState["desk"]): void;
  /** A translucent image where a target is about to be printed (the new-target form, the placement rows); null = none */
  setGhost?(ghost: StageTarget | null): void;
  /** The printed images on the page, each with `userData.targetId` (picking a target by its print) */
  printedPlanes?(): Object3D[];
  /** The grid over the page: spacing in mm, counted from the origin */
  setGrid?(grid: { on: boolean; mm: number; origin: PreviewState["origin"] }): void;
  /** The camera's distance from the page (mm), every frame: close up the sheet's sharper image is fetched */
  setDetail?(distanceMm: number): void;
  /** The viewport's shading: the sky and the HDRI's light show only while rendered */
  setShading?(mode: PreviewState["shading"]): void;
  /** The ghost's image and corner (the placement handles) */
  ghostParts?(): { image: Object3D | null; corner: Object3D | null };
  /** Where a ray meets the page, in mm from the page's top left corner, and on which page */
  pageHit?(raycaster: Raycaster): { surface: StageSurface; x: number; y: number } | null;
  /** Every frame: the stage's frame relative to the camera (the camera stays at the origin) */
  update(cameraInverse: Matrix4): void;
  dispose(): void;
}

/**
 * The editor's tracker: no camera, no engine. The current spread's targets lie on a simulated page (the mock stage);
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
  /** The current spread's targets as the engine handed them over (laid out again by `relayout`) */
  private tracked: readonly Target[] = [];
  private spreadId: string | null = null;
  private held: TrackedSpread[] = [];
  /** Targets reported found right now */
  private found = new Set<string>();
  private infos: TriggerInfos = {};
  private layout: StageLayout | null = null;
  private sheet: LayoutSheet | null = null;
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

  /** The stage's printed images (for picking) */
  printedPlanes(): Object3D[] {
    return this.stage?.printedPlanes?.() ?? [];
  }

  /** Where the book's layout prints a target (null without a layout or a place for it) */
  printedPlace(targetId: string) {
    return printedPlaceOf(this.layout, targetId);
  }

  ghostParts(): { image: Object3D | null; corner: Object3D | null } {
    return this.stage?.ghostParts?.() ?? { image: null, corner: null };
  }

  pageHit(raycaster: Raycaster): { surface: StageSurface; x: number; y: number } | null {
    return this.stage?.pageHit?.(raycaster) ?? null;
  }

  /** Show where a target would be printed (the form's placement) */
  setGhost(ghost: StageTarget | null): void {
    this.ghost = ghost;
    this.stage?.setGhost?.(ghost);
  }
  private dragging = false;
  private lastPinch = 0;
  private cameraWorld = new Matrix4();
  private cameraInverse = new Matrix4();
  /** Degrees the camera looks up from where the orbit points it (the environment's preview: the world above the book) */
  private lookUp = 0;
  private pose = new Matrix4();

  constructor(
    private container: HTMLElement,
    private options: ImageTrackerOptions,
    private loadInfos: () => Promise<TriggerInfos> = fetchTriggerInfos,
    private now: () => number = () => performance.now(),
    private loadLayout: () => Promise<StageLayout | null> = fetchStageLayout,
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
    if (this.targets.length) stage.setLayout(this.targets, this.pageFormat(), this.stageSheet(), this.stageBook());
    stage.setShading?.(this.preview.shading);
    stage.setHdri(this.preview.hdri);
    stage.setDesk?.(this.preview.desk);
    stage.setGrid?.(gridOf(this.preview));
    stage.setGhost?.(this.ghost);
  }

  /** The page format: the book's layout, else this book's constant */
  pageFormat(): PageFormat {
    return this.layout?.page ?? BOOK_PAGE_MM;
  }

  private stageBook(): StageBook {
    const spread = this.spreadId ? getSpread(this.spreadId) : undefined;
    return { spreads: Math.max(1, getSpreads().filter(s => !s.format || s.format === "spread").length), format: spread?.format ?? "spread" };
  }

  private stageSheet(): StageSheet | null {
    const sheet = this.sheet;
    return sheet ? { image: sheetImageUrl(sheet), imageSharp: sheetSharpImageUrl(sheet), widthMm: sheet.widthMm, heightMm: sheet.heightMm } : null;
  }

  async startCamera(): Promise<void> {
    if (this.started) return;
    [this.infos, this.layout] = await Promise.all([this.loadInfos(), this.loadLayout()]);
    this.started = true;
    this.startedAt = this.now();
    this.applyPreview(getPreview(), true);
    this.unsubscribe = subscribePreview(state => this.applyPreview(state, false));
    this.listen(true);
    this.loop();
    this.publishState();
  }

  async loadTargets({ spreadId, targets }: TrackedSpread): Promise<void> {
    if (!this.started) throw new Error("loadTargets() needs the camera");
    this.stopTracking();
    this.spreadId = spreadId;
    this.tracked = targets;
    this.relayout();
  }

  /**
   * Lay the current spread out again from the content as it is now – its format (open book or closed cover), its
   * sheet – without loading its targets anew: the engine does not reload a spread that is already tracked.
   */
  relayout(): void {
    if (!this.spreadId) return;
    const spread = getSpread(this.spreadId);
    this.sheet = sheetForSpread(this.layout, spread);
    this.targets = layoutTargets(this.tracked, this.infos, this.pageFormat(), this.layout, spread?.format);
    this.stage?.setLayout(this.targets, this.pageFormat(), this.stageSheet(), this.stageBook());
    this.publishState();
  }

  prepareTargets(spreads: readonly TrackedSpread[]): void {
    this.held = [...spreads];
    this.publishState();
  }

  growTargets(spreads: readonly TrackedSpread[]): void {
    this.held = [...spreads];
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
    this.spreadId = null;
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

  /** Look up from the orbit's direction by this many degrees (0 = at the book); the targets stay found */
  setLookUp(degrees: number): void {
    this.lookUp = Math.min(90, Math.max(-30, degrees));
  }

  /**
   * The camera's orientation in a world with y up (the stage's +z), as a phone's gyroscope would report it: what turns
   * the engine's look-around world in the environment's preview
   */
  worldOrientation(out = new Quaternion()): Quaternion {
    return out.setFromRotationMatrix(this.cameraWorld).premultiply(STAGE_TO_WORLD);
  }

  /** A fixed field of view; the aspect follows the container, as the engine's intrinsics would */
  fit(camera: PerspectiveCamera): void {
    this.camera = camera;
    camera.fov = PREVIEW_FOV;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width && height) camera.aspect = width / height;
    camera.near = NEAR;
    camera.far = FAR;
    camera.updateProjectionMatrix();
  }

  /** One frame at `nowMs`: the camera from the orbit (+ wobble), every visible target's anchor, the stage */
  tick(nowMs: number): void {
    if (!this.started || this.paused) return;
    const t = (nowMs - this.startedAt) / 1000;
    const { orbit, offset } = wobbled(this.orbit, this.preview.wobble, t);
    cameraMatrix(orbit, this.focus(), this.cameraWorld);
    if (offset.lengthSq() > 0) this.cameraWorld.setPosition(new Vector3().setFromMatrixPosition(this.cameraWorld).add(offset));
    if (this.lookUp) this.cameraWorld.multiply(LOOK_UP.makeRotationX((this.lookUp * Math.PI) / 180));
    this.cameraInverse.copy(this.cameraWorld).invert();
    const hidden = new Set(this.preview.hidden);
    for (const target of this.targets) {
      if (hidden.has(target.id)) {
        if (this.found.delete(target.id)) this.options.onUpdate(target.id, null);
        continue;
      }
      const scale = target.width / 1000;
      this.pose.compose(targetCentre(target, this.pageFormat()), new Quaternion(), new Vector3(scale, scale, scale));
      const matrix = new Matrix4().multiplyMatrices(this.cameraInverse, this.pose);
      if (!this.found.has(target.id)) {
        this.found.add(target.id);
        this.publishState();
      }
      this.options.onUpdate(target.id, matrix);
    }
    this.stage?.setDetail?.(this.orbit.distance);
    this.stage?.update(this.cameraInverse);
  }

  /**
   * The point the camera looks at: the spread's root (the spine's middle on an open book, the cover's middle) plus the
   * author's pan. Never a target's centre: a spread change or targets arriving would move the camera (#105)
   */
  private focus(): Vector3 {
    const pan = this.orbit.pan;
    return new Vector3((pan?.x ?? 0) / 1000, (pan?.y ?? 0) / 1000, 0);
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
    if (initial || state.view !== previous.view || (state.orbit === null && previous.orbit !== null)) {
      this.orbit = { ...(state.orbit ?? VIEW_PRESETS[state.view]) };
    } else if (state.orbit && !sameOrbit(state.orbit, this.orbit)) {
      this.orbit = { ...state.orbit };
    }
    if (initial || state.shading !== previous.shading) this.stage?.setShading?.(state.shading);
    if (initial || state.hdri !== previous.hdri) this.stage?.setHdri(state.hdri);
    if (initial || state.desk !== previous.desk) this.stage?.setDesk?.(state.desk);
    if (initial || state.grid !== previous.grid || state.gridMm !== previous.gridMm || state.origin !== previous.origin) this.stage?.setGrid?.(gridOf(state));
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
    const yaw = degrees(this.orbit.yaw);
    // The screen's right and up in the page plane (the camera's up is the top of the page, turned by the yaw)
    const right = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const up = { x: -Math.sin(yaw), y: Math.cos(yaw) };
    const pan = this.orbit.pan ?? { x: 0, y: 0 };
    this.orbit.pan = {
      x: Math.min(MAX_PAN, Math.max(-MAX_PAN, pan.x - (right.x * dx - up.x * dy) * mmPerPx)),
      y: Math.min(MAX_PAN, Math.max(-MAX_PAN, pan.y - (right.y * dx - up.y * dy) * mmPerPx)),
    };
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
        this.orbit.yaw += dx * ORBIT_DEGREES_PER_PX;
        this.orbit.tilt = Math.min(MAX_TILT, Math.max(0, this.orbit.tilt + dy * TILT_DEGREES_PER_PX));
        this.orbitChanged();
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
    updatePreview({ view: "reader", orbit: null });
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.paused || !this.onStage(event)) return;
    event.preventDefault();
    this.zoom(1 + Math.sign(event.deltaY) * WHEEL_STEP);
  };

  /** The debug overlay's engine view: the spread "held" with all its targets ready, found = reported */
  private publishState(): void {
    if (!this.started) return;
    const heldSpreads = this.held.filter(spread => spread.spreadId !== this.spreadId);
    publishEngineState({
      current: this.spreadId ? { spreadId: this.spreadId, targets: this.targets.length } : null,
      held: heldSpreads.map(spread => ({ spreadId: spread.spreadId, targets: spread.targets.length })),
      preparing: [],
      targets: this.targets.length + heldSpreads.reduce((n, spread) => n + spread.targets.length, 0),
      ready: this.targets.length + heldSpreads.reduce((n, spread) => n + spread.targets.length, 0),
      extractingSince: null,
      budget: null,
      growing: null,
      seen: [...this.found],
      lastSwitch: null,
    });
  }
}

const sameOrbit = (a: Orbit, b: Orbit) =>
  a.distance === b.distance && a.tilt === b.tilt && a.yaw === b.yaw && (a.pan?.x ?? 0) === (b.pan?.x ?? 0) && (a.pan?.y ?? 0) === (b.pan?.y ?? 0);
