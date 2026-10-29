import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { Target } from "@engine/types";
import { getSpread, getSpreads } from "@engine/content/game-config";
import { EMPTY_ENGINE_STATE, publishEngineState } from "@engine/utils/tracker-debug";
import { fetchTriggerInfos, TriggerInfos } from "@engine/utils/trigger-protocol";
import { fetchStageLayout, LayoutSheet, sheetForSpread, sheetImageUrl, StageLayout } from "./stage-layout";
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
  widthMm: number;
  heightMm: number;
}

/** The book as an object: how many spreads it has (the stage's block thickness follows) */
export interface StageBook {
  spreads: number;
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

const degrees = (value: number) => (value * Math.PI) / 180;

/**
 * Where the current spread's targets lie on the stage. With the book's layout (from the designed PDFs) every target
 * lies exactly where it is printed. Else, with printed-image details (the trigger protocol), each target gets its
 * printed size and position: exact `x` / `y` when given, else the region named by `position` ("top left" …) on the
 * right page, several in one region stacked downwards. Without details the targets lie in a row across the middle
 * of the right page.
 */
export const layoutTargets = (targets: readonly Target[], infos: TriggerInfos = {}, page: PageFormat = BOOK_PAGE_MM, layout: StageLayout | null = null): StageTarget[] => {
  const withImage = targets.filter(target => target.imageSrc);
  if (layout && withImage.length && withImage.every(target => layout.targets[target.id])) {
    return withImage.map(target => {
      const printed = layout.targets[target.id];
      return { id: target.id, imageSrc: target.imageSrc, surface: printed.surface, x: printed.x, y: printed.y, width: printed.width, height: printed.height };
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
        return { id: target.id, imageSrc: target.imageSrc, surface: "right", x: info.x, y: info.y, width, height };
      }
      const words = (info.position ?? "middle centre").toLowerCase();
      const column = words.includes("left") ? 0 : words.includes("right") ? 2 : 1;
      const row = words.includes("top") ? 0 : words.includes("bottom") ? 2 : 1;
      const stacked = used.get(words) ?? 0;
      used.set(words, stacked + 1);
      const x = column === 0 ? PAGE_MARGIN_MM : column === 2 ? page.width - PAGE_MARGIN_MM - width : (page.width - width) / 2;
      const rowTop = row === 0 ? PAGE_MARGIN_MM : row === 2 ? page.height - PAGE_MARGIN_MM - height : (page.height - height) / 2;
      return { id: target.id, imageSrc: target.imageSrc, surface: "right", x, y: rowTop + stacked * (height + 10), width, height };
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
    surface: "right",
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
  const pageLeft = target.surface === "left" ? -page.width : 0;
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

/** What the stage draws – set by the tracker, which owns the layout and the camera */
export interface StageView {
  /** The spread's targets on the page format, over the sheet's image when the book's layout has one */
  setLayout(targets: readonly StageTarget[], page: PageFormat, sheet: StageSheet | null, book: StageBook): void;
  setBackdrop(backdrop: PreviewState["backdrop"], photo: string | null): void;
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
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private dragging = false;
  private lastPinch = 0;
  private cameraWorld = new Matrix4();
  private cameraInverse = new Matrix4();
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
    stage.setBackdrop(this.preview.backdrop, this.preview.photo);
  }

  /** The page format: the book's layout, else this book's constant */
  private pageFormat(): PageFormat {
    return this.layout?.page ?? BOOK_PAGE_MM;
  }

  private stageBook(): StageBook {
    return { spreads: Math.max(1, getSpreads().length) };
  }

  private stageSheet(): StageSheet | null {
    const sheet = this.sheet;
    return sheet ? { image: sheetImageUrl(sheet), widthMm: sheet.widthMm, heightMm: sheet.heightMm } : null;
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
    this.sheet = sheetForSpread(this.layout, getSpread(spreadId));
    this.targets = layoutTargets(targets, this.infos, this.pageFormat(), this.layout);
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
    this.stage?.update(this.cameraInverse);
  }

  /** The point the camera looks at: the first target's centre, else the right page's centre */
  private focus(): Vector3 {
    const first = this.targets[0];
    const page = this.pageFormat();
    return first ? targetCentre(first, page) : new Vector3(page.width / 2000, 0, 0);
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
    if (initial || state.backdrop !== previous.backdrop || state.photo !== previous.photo) {
      this.stage?.setBackdrop(state.backdrop, state.photo);
    }
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

  // ── Input: the whole document, except the app's UI (the panels are dialogs) ──────────────────────

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
    if (this.paused || onAppUi(event)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    if (this.pointers.size === 1) this.dragging = false;
    this.lastPinch = 0;
  };

  private onPointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const other = a === pointer ? b : a;
      const distance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (this.lastPinch) this.zoom(this.lastPinch / distance);
      this.lastPinch = distance;
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
      this.orbit.yaw += dx * ORBIT_DEGREES_PER_PX;
      this.orbit.tilt = Math.min(MAX_TILT, Math.max(0, this.orbit.tilt + dy * TILT_DEGREES_PER_PX));
      this.orbitChanged();
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.lastPinch = 0;
  };

  /** A click that ends a drag is no tap on the scene (ArScene listens on the document in the bubble phase) */
  private onClick = (event: MouseEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    event.stopPropagation();
    event.preventDefault();
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.paused || onAppUi(event)) return;
    updatePreview({ view: "reader", orbit: null });
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.paused || onAppUi(event)) return;
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

const sameOrbit = (a: Orbit, b: Orbit) => a.distance === b.distance && a.tilt === b.tilt && a.yaw === b.yaw;
