import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { Target } from "@/types";
import type { TriggerInfos } from "../../utils/trigger-protocol";
import { setPreviewActive, setTargetHidden, updatePreview } from "../../utils/preview";
import { getEngineState } from "../../utils/tracker-debug";
import {
  BOOK_PAGE_MM, cameraMatrix, layoutTargets, MockTracker, PREVIEW_FOV, StageView, targetCentre, VIEW_PRESETS, wobbled,
} from "../mock-tracker";

const target = (id: string): Target => ({ id, entryId: id, spreadId: "s", imageSrc: `/${id}.jpg` });

/** The anchor's scale (1 unit = the printed width, in metres) and its position in camera space */
const decompose = (matrix: Matrix4) => {
  const position = new Vector3();
  const scale = new Vector3();
  matrix.decompose(position, new Quaternion(), scale);
  return { position, scale };
};

describe("mock stage layout", () => {
  it("lays targets without printed details in a row across the middle of the right page", () => {
    const row = layoutTargets([target("a"), target("b"), target("c")]);
    expect(row.map(t => t.surface)).toEqual(["right", "right", "right"]);
    expect(row[0].x).toBeLessThan(row[1].x);
    expect(row[1].x).toBeLessThan(row[2].x);
    expect(row[0].width).toBe(row[2].width);
    expect(row[2].x + row[2].width).toBeLessThanOrEqual(BOOK_PAGE_MM.width);
    expect(row[0].y + row[0].height / 2).toBeCloseTo(BOOK_PAGE_MM.height / 2, 5);
  });

  it("places printed images by their size and position words, stacking several in one region", () => {
    const infos: TriggerInfos = {
      a: { width: 31, height: 23, position: "top left" },
      b: { width: 49, height: 18, position: "bottom right" },
      c: { width: 40, height: 30, position: "top left" },
    };
    const [a, b, c] = layoutTargets([target("a"), target("b"), target("c")], infos);
    expect(a.width).toBe(31);
    expect(a.x).toBe(20);
    expect(a.y).toBe(20);
    expect(b.x + b.width).toBe(BOOK_PAGE_MM.width - 20);
    expect(b.y + b.height).toBe(BOOK_PAGE_MM.height - 20);
    expect(c.y).toBeGreaterThan(a.y + a.height);
  });

  it("places every target exactly where the book's layout has it, on its own page", () => {
    const layout = {
      page: { width: 230, height: 320 },
      sheets: [],
      targets: {
        a: { page: 4, surface: "left", x: 38.7, y: 9.5, width: 30.9, height: 23.3, sheet: "pp-004-005" },
        b: { page: 5, surface: "right", x: 184.8, y: 287.5, width: 37.1, height: 20.8, sheet: "pp-004-005" },
      },
    };
    const [a, b] = layoutTargets([target("a"), target("b")], {}, layout.page, layout);
    expect(a).toMatchObject({ surface: "left", x: 38.7, y: 9.5, width: 30.9 });
    expect(b).toMatchObject({ surface: "right", x: 184.8, width: 37.1 });
    expect(targetCentre(a, layout.page).x).toBeCloseTo((-230 + 38.7 + 30.9 / 2) / 1000, 6);
    // A target the layout does not know: the whole spread falls back to the protocol / the row
    expect(layoutTargets([target("a"), target("c")], {}, layout.page, layout)[0].surface).toBe("right");
  });

  it("uses exact positions when the layout was imported", () => {
    const [a] = layoutTargets([target("a")], { a: { width: 30.9, height: 23.3, x: 38.7, y: 9.5 } });
    expect(a).toMatchObject({ x: 38.7, y: 9.5, width: 30.9, height: 23.3 });
  });

  it("falls back to the row when only some targets have printed details", () => {
    const [a, b] = layoutTargets([target("a"), target("b")], { a: { width: 31, height: 23, position: "top left" } });
    expect(a.width).toBe(b.width);
    expect(a.y).toBe(b.y);
  });

  it("skips targets without an image", () => {
    expect(layoutTargets([{ ...target("a"), imageSrc: "" }, target("b")]).map(t => t.id)).toEqual(["b"]);
  });
});

describe("mock stage geometry", () => {
  it("puts a target's centre on the page in metres, the spine at the origin, the page top up", () => {
    const centre = targetCentre({ id: "a", imageSrc: "", surface: "right", x: 0, y: 0, width: 230, height: 320 });
    expect(centre.x).toBeCloseTo(0.115, 6);
    expect(centre.y).toBeCloseTo(0, 6);
    const topLeft = targetCentre({ id: "a", imageSrc: "", surface: "left", x: 0, y: 0, width: 10, height: 10 });
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
  const container = document.createElement("div");
  let updates: Array<[string, Matrix4 | null]>;
  let tracker: MockTracker;
  let now = 1000;

  const stage = (): StageView & { layouts: number; backdrops: string[]; frames: number; disposed: boolean } => ({
    layouts: 0, backdrops: [], frames: 0, disposed: false,
    setLayout() { this.layouts++; },
    setBackdrop(backdrop) { this.backdrops.push(backdrop); },
    update() { this.frames++; },
    dispose() { this.disposed = true; },
  });

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    localStorage.clear();
    setPreviewActive(true);
    updatePreview({ view: "reader", orbit: null, backdrop: "table", photo: null, wobble: 0, hidden: [] });
    updates = [];
    now = 1000;
    tracker = new MockTracker(container, { onUpdate: (id, matrix) => updates.push([id, matrix]) }, async () => ({ a: { width: 50, height: 40, position: "top left" }, b: { width: 30, height: 20, position: "bottom right" } }), () => now);
  });

  afterEach(() => {
    tracker.stop();
    setPreviewActive(false);
    vi.unstubAllGlobals();
  });

  it("starts without asking for a camera and reports the spread's targets found, 1 unit = the printed width", async () => {
    expect(tracker.hasCamera).toBe(false);
    await tracker.startCamera();
    expect(tracker.hasCamera).toBe(true);
    await tracker.loadTargets({ spreadId: "s", targets: [target("a"), target("b")] });
    expect(tracker.tracking).toBe(true);
    tracker.tick(now);
    expect(updates.map(([id]) => id)).toEqual(["a", "b"]);
    const { position, scale } = decompose(updates[0][1]!);
    expect(scale.x).toBeCloseTo(0.05, 6); // 50 mm
    expect(position.z).toBeLessThan(0); // in front of the camera
    expect(position.length()).toBeCloseTo(0.35, 3); // the focus (target a) at the reader's distance
    expect(getEngineState().current).toEqual({ spreadId: "s", targets: 2 });
    expect(getEngineState().seen).toEqual(["a", "b"]);
  });

  it("reports a hidden target lost once and found again when shown", async () => {
    await tracker.startCamera();
    await tracker.loadTargets({ spreadId: "s", targets: [target("a")] });
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
    await tracker.loadTargets({ spreadId: "s", targets: [target("a")] });
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
    await tracker.loadTargets({ spreadId: "s", targets: [target("a")] });
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

  it("feeds the stage the layout, the backdrop and every frame's camera", async () => {
    const view = stage();
    tracker.attachStage(view);
    await tracker.startCamera();
    expect(view.backdrops).toContain("table");
    await tracker.loadTargets({ spreadId: "s", targets: [target("a")] });
    expect(view.layouts).toBe(1);
    tracker.tick(now);
    expect(view.frames).toBe(1);
    updatePreview({ backdrop: "paper" });
    expect(view.backdrops[view.backdrops.length - 1]).toBe("paper");
    tracker.stop();
    expect(view.disposed).toBe(true);
  });
});
