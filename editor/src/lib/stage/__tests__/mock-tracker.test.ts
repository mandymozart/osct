import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { Target } from "@engine/types";
import { getPreview, setPreviewActive, setTargetHidden, updatePreview } from "../preview";
import { getEngineState } from "@engine/utils/tracker-debug";
import { sceneFrames } from "../surfaces";

// Every scene of these tests: two pages side by side, `left` and `right`, the scene's origin between them (#319 – the
// surfaces at their places, arranged in a row)
const PAGE_MM = { width: 230, height: 320 };
const SURFACES = vi.hoisted(() => [
  { id: "left", widthMm: 230, heightMm: 320, place: { x: -115, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
  { id: "right", widthMm: 230, heightMm: 320, place: { x: 115, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
]);
vi.mock("@engine/content/game-config", () => ({ getScene: (id: string) => ({ id, label: id, surfaces: SURFACES, entries: [], targets: [] }) }));
const pages = sceneFrames({ surfaces: SURFACES });

const {
  cameraMatrix, facing, fitDistance, layoutTargets, MockTracker, PREVIEW_FOV, targetCentre, VIEW_PRESETS, wobbled,
} = await import("../mock-tracker");
type StageTarget = import("../mock-tracker").StageTarget;
type StageView = import("../mock-tracker").StageView;
type MockTracker = InstanceType<typeof MockTracker>;

const target = (id: string): Target => ({ id, entryId: id, sceneId: "s", imageSrc: `/${id}.jpg` });
const plainTarget = target;

/** A target printed with its centre on the scene's origin (the spine's middle): the camera's distance to it is the orbit's */
const atRoot = (id: string, sceneId = "s"): Target =>
  ({ ...target(id), sceneId, place: { surface: "right", x: -20, y: PAGE_MM.height / 2 - 20, width: 40, height: 40 } }) as Target;

/** The anchor's scale (1 unit = the printed width, in metres) and its position in camera space */
const decompose = (matrix: Matrix4) => {
  const position = new Vector3();
  const scale = new Vector3();
  matrix.decompose(position, new Quaternion(), scale);
  return { position, scale };
};

describe("mock stage layout", () => {
  it("lays targets without a place in a row across the middle of the scene's first surface", () => {
    const row = layoutTargets([target("a"), target("b"), target("c")], pages);
    expect(row.map(t => t.surface)).toEqual(["left", "left", "left"]);
    expect(row[0].x).toBeLessThan(row[1].x);
    expect(row[1].x).toBeLessThan(row[2].x);
    expect(row[0].width).toBe(row[2].width);
    expect(row[2].x + row[2].width).toBeLessThanOrEqual(PAGE_MM.width);
    expect(row[0].y + row[0].height / 2).toBeCloseTo(PAGE_MM.height / 2, 5);
    // No scene open: the stand-in double page
    expect(layoutTargets([target("a")]).map(t => t.surface)).toEqual(["surface"]);
  });

  it("places every target exactly where its place has it, on its surface", () => {
    const placed = (id: string, place: Target["place"]): Target => ({ ...target(id), place });
    const [a, b] = layoutTargets([placed("a", { surface: "left", x: 38.7, y: 9.5, width: 30.9, height: 23.3 }), placed("b", { surface: "right", x: 184.8, y: 287.5, width: 37.1 })], pages);
    expect(a).toMatchObject({ surface: "left", x: 38.7, y: 9.5, width: 30.9, height: 23.3 });
    expect(b).toMatchObject({ surface: "right", x: 184.8, width: 37.1, height: 37.1 * 0.75 });
    expect(targetCentre(a, pages).x).toBeCloseTo((-230 + 38.7 + 30.9 / 2) / 1000, 6);
    // A target without a place: the placed one stays where it is, the other lies in a row on the first surface
    const mixed = layoutTargets([placed("a", { surface: "right", x: 38.7, y: 9.5, width: 30.9 }), target("c")], pages);
    expect(mixed[0]).toMatchObject({ surface: "right", x: 38.7 });
    expect(mixed[1]).toMatchObject({ surface: "left", y: PAGE_MM.height * 0.6 });
  });

  it("skips targets without an image", () => {
    expect(layoutTargets([{ ...target("a"), imageSrc: "" }, target("b")]).map(t => t.id)).toEqual(["b"]);
  });
});

describe("mock stage geometry", () => {
  it("puts a target's centre on its surface in metres, the scene's origin at the spine, the surface's top away from the reader", () => {
    const centre = targetCentre({ id: "a", imageSrc: "", surface: "right", x: 0, y: 0, width: 230, height: 320 }, pages);
    expect(centre.x).toBeCloseTo(0.115, 6);
    expect(centre.y).toBeCloseTo(0, 6);
    const topLeft = targetCentre({ id: "a", imageSrc: "", surface: "left", x: 0, y: 0, width: 10, height: 10 }, pages);
    expect(topLeft.x).toBeCloseTo(-0.225, 6);
    expect(topLeft.y).toBeCloseTo(0.155, 6);
  });

  it("holds the camera at the preset's distance, looking at the focus", () => {
    const focus = new Vector3(0.1, 0.05, 0);
    const camera = cameraMatrix(VIEW_PRESETS.reader, focus);
    const eye = new Vector3().setFromMatrixPosition(camera);
    expect(eye.distanceTo(focus)).toBeCloseTo(0.35, 6);
    expect(eye.z).toBeGreaterThan(0); // above the page
    expect(eye.y).toBeLessThan(focus.y); // on the reader's side
    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().setFromRotationMatrix(camera));
    expect(forward.angleTo(focus.clone().sub(eye))).toBeCloseTo(0, 6);
  });

  it("looks straight down in the top view", () => {
    const camera = cameraMatrix(VIEW_PRESETS.top, new Vector3());
    const eye = new Vector3().setFromMatrixPosition(camera);
    expect(eye.x).toBeCloseTo(0, 6);
    expect(eye.y).toBeCloseTo(0, 6);
    expect(eye.z).toBeCloseTo(0.3, 6);
  });

  it("orbits through any tilt: level, from below, upside down (#335)", () => {
    const focus = new Vector3(0.1, 0.05, 0);
    for (const tilt of [-120, -45, 85, 90, 135, 180, 250]) {
      const camera = cameraMatrix({ distance: 400, tilt, yaw: 30 }, focus);
      const eye = new Vector3().setFromMatrixPosition(camera);
      expect(eye.distanceTo(focus)).toBeCloseTo(0.4, 6);
      const turn = new Quaternion().setFromRotationMatrix(camera);
      const forward = new Vector3(0, 0, -1).applyQuaternion(turn);
      expect(forward.angleTo(focus.clone().sub(eye))).toBeCloseTo(0, 5);
      expect(Number.isFinite(turn.w)).toBe(true);
    }
    // Level at 90°: the eye at the focus's height; past it, below the table
    expect(new Vector3().setFromMatrixPosition(cameraMatrix({ distance: 400, tilt: 90, yaw: 0 }, focus)).z).toBeCloseTo(0, 6);
    expect(new Vector3().setFromMatrixPosition(cameraMatrix({ distance: 400, tilt: 135, yaw: 0 }, focus)).z).toBeLessThan(0);
  });

  it("wobbles deterministically and not at all at zero", () => {
    const orbit = VIEW_PRESETS.reader;
    expect(wobbled(orbit, 0, 3).orbit).toEqual(orbit);
    const a = wobbled(orbit, 1, 1.25);
    const b = wobbled(orbit, 1, 1.25);
    expect(a.orbit).toEqual(b.orbit);
    expect(a.offset.toArray()).toEqual(b.offset.toArray());
    expect(Math.abs(a.orbit.distance - orbit.distance)).toBeLessThanOrEqual(2);
    expect(Math.abs(a.orbit.tilt - orbit.tilt)).toBeLessThanOrEqual(0.5);
  });
});

describe("MockTracker (IImageTracker without camera or engine)", () => {
  /** `a` printed 50 × 40 mm top left, `b` 30 × 20 mm bottom right of the left page (their `place`, #32) */
  const PLACES: Record<string, Target["place"]> = {
    a: { surface: "left", x: 20, y: 20, width: 50, height: 40 },
    b: { surface: "left", x: PAGE_MM.width - 50, y: PAGE_MM.height - 40, width: 30, height: 20 },
  };
  const target = (id: string): Target => ({ ...plainTarget(id), ...(PLACES[id] ? { place: PLACES[id] } : {}) });
  const container = document.createElement("div");
  let updates: Array<[string, Matrix4 | null]>;
  let tracker: MockTracker;
  let now = 1000;

  const stage = (): StageView & { layouts: number; hdris: Array<string | null>; frames: number; disposed: boolean } => ({
    layouts: 0, hdris: [], frames: 0, disposed: false,
    setLayout() { this.layouts++; },
    setHdri(hdri) { this.hdris.push(hdri); },
    update() { this.frames++; },
    dispose() { this.disposed = true; },
  });

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    updatePreview({ view: "reader", orbit: null, hdri: "ferndale_studio_04", wobble: 0, hidden: [] });
    updates = [];
    now = 1000;
    tracker = new MockTracker(container, { onUpdate: (id, matrix) => updates.push([id, matrix]) }, () => now);
  });

  afterEach(() => {
    tracker.stop();
    setPreviewActive(false);
    vi.unstubAllGlobals();
  });

  it("starts without asking for a camera and reports the scene's targets found, 1 unit = the printed width", async () => {
    expect(tracker.hasCamera).toBe(false);
    await tracker.startCamera();
    expect(tracker.hasCamera).toBe(true);
    await tracker.loadTargets({ sceneId: "s", targets: [target("a"), target("b")] });
    expect(tracker.tracking).toBe(true);
    tracker.tick(now);
    expect(updates.map(([id]) => id)).toEqual(["a", "b"]);
    const { position, scale } = decompose(updates[0][1]!);
    expect(scale.x).toBeCloseTo(0.05, 6); // 50 mm
    expect(position.z).toBeLessThan(0); // in front of the camera
    expect(getEngineState().current).toEqual({ sceneId: "s", targets: 2 });
    expect(getEngineState().seen).toEqual(["a", "b"]);
  });

  it("keeps the camera on the scene's root when the scene and its targets change (#105)", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ sceneId: "s", targets: [atRoot("a")] });
    tracker.tick(now);
    const before = updates.filter(([id]) => id === "a").at(-1)![1]!.clone();
    expect(decompose(before).position.length()).toBeCloseTo(0.35, 3); // the root at the reader's distance
    const elsewhere: Target = { ...target("z"), sceneId: "t", place: { surface: "left", x: 10, y: 10, width: 40 } } as Target;
    await tracker.loadTargets({ sceneId: "t", targets: [elsewhere, atRoot("a", "t")] });
    tracker.tick(now);
    const after = updates.filter(([id]) => id === "a").at(-1)![1]!;
    expect(after.equals(before)).toBe(true); // the first target moved, the camera did not
  });

  it("reports a hidden target lost once and found again when shown", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ sceneId: "s", targets: [target("a")] });
    tracker.tick(now);
    setTargetHidden("a", true);
    tracker.tick(now + 16);
    tracker.tick(now + 32);
    expect(updates.filter(([, matrix]) => matrix === null)).toHaveLength(1);
    setTargetHidden("a", false);
    tracker.tick(now + 48);
    expect(updates[updates.length - 1][1]).toBeInstanceOf(Matrix4);
  });

  it("stops reporting while paused and after stopTracking / stop", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ sceneId: "s", targets: [target("a")] });
    tracker.pause();
    tracker.tick(now);
    expect(updates).toHaveLength(0);
    tracker.resume();
    tracker.tick(now);
    expect(updates).toHaveLength(1);
    tracker.stopTracking();
    expect(updates[1]).toEqual(["a", null]);
    tracker.tick(now + 16);
    expect(updates).toHaveLength(2);
    tracker.stop();
    expect(tracker.hasCamera).toBe(false);
    expect(getEngineState().current).toBeNull();
  });

  it("follows the preview's view preset and a free orbit", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ sceneId: "s", targets: [atRoot("a")] });
    tracker.tick(now);
    const reader = decompose(updates[0][1]!).position.length();
    updatePreview({ view: "far" });
    tracker.tick(now + 16);
    expect(decompose(updates[1][1]!).position.length()).toBeCloseTo(0.7, 3);
    expect(reader).toBeCloseTo(0.35, 3);
    updatePreview({ orbit: { distance: 200, tilt: 10, yaw: 0 } });
    tracker.tick(now + 32);
    expect(decompose(updates[2][1]!).position.length()).toBeCloseTo(0.2, 3);
    expect(tracker.currentOrbit.distance).toBe(200);
  });

  it("gives the three.js camera the fixed field of view and the container's aspect", () => {
    const camera = new PerspectiveCamera(45, 1);
    Object.defineProperty(container, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 800, configurable: true });
    tracker.fit(camera);
    expect(camera.fov).toBe(PREVIEW_FOV);
    expect(camera.aspect).toBe(0.5);
  });


  it("feeds the stage the layout, the sky and every frame's camera", async () => {
    const view = stage();
    tracker.attachStage(view);
    await tracker.startCamera();
    expect(view.hdris).toContain("ferndale_studio_04");
    await tracker.loadTargets({ sceneId: "s", targets: [target("a")] });
    expect(view.layouts).toBe(1);
    tracker.tick(now);
    expect(view.frames).toBe(1);
    updatePreview({ hdri: "wooden_studio_07" });
    expect(view.hdris[view.hdris.length - 1]).toBe("wooden_studio_07");
    tracker.stop();
    expect(view.disposed).toBe(true);
  });
});

describe("MockTracker input (#131: the panels are no stage)", () => {
  let container: HTMLElement;
  let canvas: HTMLElement;
  let field: HTMLElement;
  let toolbarGap: HTMLElement;
  let tracker: MockTracker;

  const pointer = (type: string, target: EventTarget, x: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 1, button: 0, clientX: x, clientY: 100 }));
  const wheel = (target: EventTarget) =>
    target.dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true, cancelable: true, deltaY: 100 }));

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    updatePreview({ view: "reader", orbit: null, hidden: [] });
    // The editor's layout: the stage between the side panels, its toolbar inside it
    document.body.innerHTML = `
      <header class="top" data-app-ui><span class="crumb">experience</span></header>
      <aside class="tree" data-app-ui><div class="scene-row">scene</div></aside>
      <div class="stage"><canvas></canvas><div class="tools" role="toolbar" data-app-ui><span class="gap"></span></div></div>
      <aside class="panel" data-app-ui><div class="body"><span class="field">value</span></div></aside>`;
    container = document.querySelector(".stage")!;
    canvas = container.querySelector("canvas")!;
    field = document.querySelector(".field")!;
    toolbarGap = document.querySelector(".gap")!;
    tracker = new MockTracker(container, { onUpdate: () => {} }, () => 1000);
    await tracker.startCamera();
  });

  afterEach(() => {
    tracker.stop();
    setPreviewActive(false);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("orbits on a drag that starts on the stage, also once the pointer leaves it", () => {
    const yaw = tracker.currentOrbit.yaw;
    pointer("pointerdown", canvas, 100);
    pointer("pointermove", canvas, 140);
    pointer("pointermove", field, 200); // over the right panel now
    pointer("pointerup", field, 200);
    expect(tracker.currentOrbit.yaw).not.toBe(yaw);
  });

  it("ignores drags and the wheel in the top bar, the panels, the scene list and the toolbar", () => {
    const orbit = { ...tracker.currentOrbit };
    for (const target of [document.querySelector(".crumb")!, field, document.querySelector(".scene-row")!, toolbarGap]) {
      pointer("pointerdown", target, 100);
      pointer("pointermove", canvas, 200);
      pointer("pointerup", canvas, 200);
      wheel(target);
    }
    expect(tracker.currentOrbit).toEqual(orbit);
  });

  it("zooms with the wheel over the stage", () => {
    const distance = tracker.currentOrbit.distance;
    wheel(canvas);
    expect(tracker.currentOrbit.distance).toBeGreaterThan(distance);
  });
});

describe("MockTracker: the placement being edited is the target itself (#191)", () => {
  let updates: Array<[string, Matrix4 | null]>;
  let moved: StageTarget[];
  let aspect: number | undefined;
  let tracker: MockTracker;

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    // Straight down: camera space x / y are the stage's, so the anchors' offsets read in mm
    updatePreview({ view: "top", orbit: null, wobble: 0, hidden: [] });
    updates = [];
    moved = [];
    aspect = undefined;
    tracker = new MockTracker(document.createElement("div"), { onUpdate: (id, matrix) => updates.push([id, matrix]) }, () => 0);
    tracker.attachStage({
      setLayout() {},
      setHdri() {},
      update() {},
      dispose() {},
      movePrint(target) { moved.push(target); },
      printedAspect: () => aspect,
    });
    await tracker.startCamera();
    const placed = { ...target("a"), place: { surface: "right", x: 70, y: 100, width: 80 } } as Target;
    await tracker.loadTargets({ sceneId: "s", targets: [placed, target("b")] });
  });

  afterEach(() => {
    tracker.stop();
    setPreviewActive(false);
    vi.unstubAllGlobals();
  });

  const anchorOf = (id: string) => {
    updates = [];
    tracker.tick(0);
    return decompose(updates.find(([at]) => at === id)![1]!).position;
  };

  it("moves the print and the entity's anchor with the placement, and puts them back without it", () => {
    const saved = anchorOf("a");
    tracker.placeTarget("a", { surface: "left", x: 70, y: 100, width: 80 });
    expect(moved.at(-1)).toMatchObject({ id: "a", surface: "left", x: 70 });
    const placed = anchorOf("a");
    expect(placed.x - saved.x).toBeCloseTo(-0.23, 6);
    expect(placed.y - saved.y).toBeCloseTo(0, 6);
    // The content's place stays what the inspector falls back to
    expect(tracker.placeOf("a")).toMatchObject({ surface: "right", x: 70, y: 100, width: 80 });
    tracker.placeTarget(null, null);
    expect(moved.at(-1)).toMatchObject({ id: "a", surface: "right", x: 70 });
    expect(anchorOf("a").distanceTo(saved)).toBeCloseTo(0, 6);
  });

  it("puts the previous target back when another one is placed", () => {
    tracker.placeTarget("a", { surface: "left", x: 10, y: 10, width: 40 });
    const b = tracker.placeOf("b")!;
    tracker.placeTarget("b", { ...b, x: b.x + 5 });
    expect(moved.slice(-2).map(t => [t.id, t.surface, t.x])).toEqual([["a", "right", 70], ["b", b.surface, b.x + 5]]);
  });

  it("anchors the entity at the centre of the printed image, whose height follows the image", () => {
    const guessed = anchorOf("a"); // the 0.75 box until the image is known
    aspect = 1.45; // a portrait image: 116 mm high, its centre 28 mm lower
    expect(anchorOf("a").y - guessed.y).toBeCloseTo(-0.028, 6);
  });
});

describe("MockTracker camera: Home, Focus, fixed or free (#335)", () => {
  // A standing A3 poster behind the double page (rx 90, as the Demo Book's catpope-poster)
  const POSTER = { id: "poster", widthMm: 297, heightMm: 420, place: { x: 0, y: 300, z: 0, rx: 90, ry: 0, rz: 0 } };
  let container: HTMLElement;
  let tracker: MockTracker;
  let now = 1000;
  const FLIGHT_DONE = 1000;

  const drag = (dx: number, dy: number, shiftKey = false) => {
    const at = { clientX: 100, clientY: 100 };
    container.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, ...at, shiftKey }));
    container.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, button: 0, clientX: 100 + dx, clientY: 100 + dy, shiftKey }));
    container.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, button: 0, clientX: 100 + dx, clientY: 100 + dy, shiftKey }));
  };
  const eyeOf = (orbit: MockTracker["currentOrbit"]) => {
    const pan = orbit.pan ?? { x: 0, y: 0 };
    return new Vector3().setFromMatrixPosition(cameraMatrix(orbit, new Vector3(pan.x, pan.y, pan.z ?? 0).divideScalar(1000)));
  };
  const posterFrame = () => sceneFrames({ surfaces: [POSTER] })[0];

  beforeEach(async () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    updatePreview({ view: "reader", orbit: null, wobble: 0, hidden: [] });
    SURFACES.push(POSTER);
    document.body.innerHTML = `<div class="stage"><canvas></canvas></div>`;
    container = document.querySelector(".stage")!;
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    now = 1000;
    tracker = new MockTracker(container, { onUpdate: () => {} }, () => now);
    await tracker.startCamera();
    await tracker.loadTargets({ sceneId: "s", targets: [plainTarget("a")] });
  });

  afterEach(() => {
    tracker.stop();
    SURFACES.splice(SURFACES.indexOf(POSTER), 1);
    setPreviewActive(false);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("looks front-on at a face: the table from above, a poster facing the reader level, a side wall from the side", () => {
    expect(facing([0, 0, 1])).toEqual({ tilt: 0, yaw: 0 });
    expect(facing([0, -1, 0])).toEqual({ tilt: 90, yaw: 0 });
    expect(facing([1, 0, 0])).toEqual({ tilt: 90, yaw: 90 });
  });

  it("shows a face whole: the farther, the bigger, the narrower view the farther still", () => {
    expect(fitDistance(400, 400, 1)).toBeGreaterThan(fitDistance(200, 200, 1));
    expect(fitDistance(400, 100, 0.5)).toBeGreaterThan(fitDistance(400, 100, 2));
  });

  it("flies to a standing poster, turns around its middle and fixes the point to it", () => {
    expect(tracker.focusSurface("poster", "A3 poster")).toBe(true);
    now += FLIGHT_DONE;
    tracker.tick(now);
    const frame = posterFrame();
    const orbit = tracker.currentOrbit;
    const middle = new Vector3(...frame.origin).addScaledVector(new Vector3(...frame.right), frame.widthMm / 2).addScaledVector(new Vector3(...frame.down), frame.heightMm / 2);
    expect(new Vector3(orbit.pan!.x, orbit.pan!.y, orbit.pan!.z).distanceTo(middle)).toBeLessThan(1e-3);
    expect(middle.z).toBeGreaterThan(100); // the poster's middle stands above the table
    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().setFromRotationMatrix(cameraMatrix(orbit, middle.clone().divideScalar(1000))));
    expect(forward.dot(new Vector3(...frame.normal))).toBeCloseTo(-1, 5); // front-on
    expect(orbit).toMatchObject({ surface: "poster", label: "A3 poster" });
    expect(getPreview().orbit).toMatchObject({ surface: "poster", label: "A3 poster" });
  });

  it("frames the whole scene with nothing selected, the standing poster in it", () => {
    tracker.focusScene();
    now += FLIGHT_DONE;
    tracker.tick(now);
    expect(tracker.currentOrbit.pan!.z).toBeGreaterThan(50);
    expect(tracker.currentOrbit.distance).toBeGreaterThan(VIEW_PRESETS.reader.distance);
  });

  it("fixed: a pan slides the point along its surface; free: along the screen, up off the table", () => {
    updatePreview({ orbit: { distance: 400, tilt: 60, yaw: 0 } });
    drag(0, 50, true);
    expect(tracker.currentOrbit.pan!.z).toBeCloseTo(0, 6); // fixed to the table
    tracker.setFree(true);
    expect(getPreview().orbit?.free).toBe(true);
    drag(0, 50, true);
    expect(tracker.currentOrbit.pan!.z).toBeGreaterThan(10); // the scene follows the pointer down: the point goes up
    drag(0, -100, true);
    expect(tracker.currentOrbit.pan!.z).toBeLessThan(-10);
  });

  it("fixed, a surface seen edge-on: the pan moves along the screen (#369 – the table from the front)", () => {
    updatePreview({ orbit: { distance: 400, tilt: 90, yaw: 0 } }); // level with the table
    drag(0, 50, true);
    expect(tracker.currentOrbit.pan!.z).toBeGreaterThan(10);
    expect(tracker.currentOrbit.free).toBeFalsy();
  });

  it("back to fixed, the point lands on its surface along the line of sight – the camera does not move", () => {
    updatePreview({ orbit: { distance: 400, tilt: 30, yaw: 10, pan: { x: 20, y: 30, z: 120 }, free: true } });
    const before = eyeOf(tracker.currentOrbit);
    tracker.setFree(false);
    const orbit = tracker.currentOrbit;
    expect(orbit.free).toBeUndefined();
    expect(orbit.pan!.z).toBeCloseTo(0, 6);
    expect(eyeOf(orbit).distanceTo(before)).toBeLessThan(1e-6);
  });

  it("Home flies back to the reader's view and forgets the focus; a drag stops a flight where it is", () => {
    tracker.focusSurface("poster");
    now += 100;
    tracker.tick(now);
    drag(40, 0);
    const stopped = tracker.currentOrbit;
    expect(stopped.distance).not.toBe(VIEW_PRESETS.reader.distance);
    now += FLIGHT_DONE;
    tracker.tick(now);
    expect(tracker.currentOrbit.distance).toBe(stopped.distance); // no flight resumes
    tracker.home();
    expect(getPreview().orbit).toBeNull();
    now += FLIGHT_DONE;
    tracker.tick(now);
    expect(tracker.currentOrbit).toEqual(VIEW_PRESETS.reader);
  });
});
