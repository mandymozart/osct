import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import { boxInFrame, SceneSnapper, surfacePlane, type SnapSource } from "../snap-scene";
import type { PreviewSettings } from "../preview";
import { toStage, type SurfaceFrame } from "../surfaces";

/**
 * A stage frame (metres) with a target's anchor on the right page (1 unit = the 60 mm printed width) holding a 30 mm
 * cube, and another entity's cube elsewhere – the gizmo's move in the scene
 */
const scene = (patch: Partial<PreviewSettings> = {}) => {
  const frame = new Group();
  const anchor = new Group();
  anchor.position.set(0.1, 0, 0);
  anchor.scale.setScalar(0.06);
  frame.add(anchor);
  const cube = () => new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  const moving = cube();
  anchor.add(moving);
  const other = cube();
  other.position.set(0.2, 0, 0); // 200 mm from the spine, as large as the moving cube: its box from 185 to 215 mm
  other.scale.setScalar(0.06);
  frame.add(other);
  const camera = new PerspectiveCamera(50, 1);
  camera.position.set(0.1, 0, 0.5);
  frame.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const guides: Array<ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>> = [];
  const settings = { snap: true, snapTo: ["grid", "axes", "objects", "outlines"], gridMm: 10, snapMove: 1, snapRotate: 15, snapScale: 0.1, origin: "top-left", ...patch } as PreviewSettings;
  let modifier = false;
  const source: SnapSource = {
    frame: () => frame,
    stageFrame: () => ({ surfaces: [{ id: "left", left: -230, top: 160, width: 230, height: 320 }, { id: "right", left: 0, top: 160, width: 230, height: 320 }] }),
    settings: () => settings,
    modifier: () => modifier,
    objects: () => [{ targetId: "a", object: moving }, { targetId: "b", object: other }],
    prints: () => [],
    view: () => ({ camera, height: 800 }),
    guides: g => guides.push(g),
  };
  return { frame, moving, other, snapper: new SceneSnapper(source), guides, hold: (on: boolean) => (modifier = on) };
};

describe("snap in the scene: the gizmo's move (#190)", () => {
  it("reads a node's box in the stage frame (mm)", () => {
    const { frame, moving } = scene();
    const box = boxInFrame(moving, frame.matrixWorld.clone().invert())!;
    expect(box.min.map(v => Math.round(v))).toEqual([85, -15, -15]);
    expect(box.max.map(v => Math.round(v))).toEqual([115, 15, 15]);
  });

  it("puts the node's edge on another object's edge in reach, along the handle's axis only, with its guide", () => {
    const { moving, snapper, guides } = scene();
    snapper.beginMove(moving, "X");
    // dragged to 1.32 widths: the pivot at 179.2 mm, the cube's edges at 164.2 and 194.2 – every line 5.8 mm or more
    // away, beyond the threshold (8 px ≈ 4.7 mm here), so the pivot steps on the grid: 180 mm = 1.333 widths
    moving.position.set(1.32, 0.01, 0);
    snapper.move(moving);
    expect(+moving.position.x.toFixed(4)).toBe(1.3333);
    // y is not the handle's: it stays as dragged
    expect(moving.position.y).toBeCloseTo(0.01, 9);
    // within reach: the right edge (188.8 mm) 3.8 mm past the other's left edge (185)
    moving.position.set(1.23, 0, 0);
    snapper.move(moving);
    expect(+(100 + moving.position.x * 60 + 15).toFixed(3)).toBe(185);
    expect(guides.at(-1)).toEqual([{ axis: 0, at: 185 }]);
    snapper.end();
    expect(guides.at(-1)).toEqual([]);
  });

  it("leaves the node where the gizmo put it while snapping is turned around", () => {
    const { moving, snapper, hold } = scene();
    snapper.beginMove(moving, "X");
    hold(true);
    moving.position.set(1.23, 0, 0);
    snapper.move(moving);
    expect(moving.position.x).toBe(1.23);
  });

  it("snaps to nothing it is not asked to: objects off, grid off – the move step", () => {
    const { moving, snapper } = scene({ snapTo: ["axes"], snapMove: 5 });
    snapper.beginMove(moving, "X");
    moving.position.set(1.23, 0, 0);
    snapper.move(moving);
    // the pivot at 173.8 mm steps to 175
    expect(+(100 + moving.position.x * 60).toFixed(3)).toBe(175);
  });

  it("snaps rotation and scale by their steps", () => {
    const { snapper } = scene({ snapRotate: 45, snapScale: 0.25 });
    expect(snapper.angle(30)).toBe(45);
    expect(snapper.scale(0.6)).toBe(0.5);
  });
});

/**
 * A wall (#375): 400 × 300 mm standing up 200 mm away from the reader, facing them – its top left corner 300 mm high.
 * Target `a`'s 60 mm print lies on it at (100, 50) with a 30 mm cube on its anchor; print `c` at (250, 50).
 */
const WALL: SurfaceFrame = {
  id: "wall", widthMm: 400, heightMm: 300, origin: [0, 200, 300], right: [1, 0, 0], down: [0, 0, -1], normal: [0, -1, 0], flat: false,
};

const wallScene = () => {
  const frame = new Group();
  const anchor = new Group();
  // The anchor as the tracker sets it: at the print's centre, the wall's axes (x right, y up it, z its normal), 1 unit = 60 mm
  const centre = toStage(WALL, 130, 80);
  anchor.position.set(centre[0] / 1000, centre[1] / 1000, centre[2] / 1000);
  anchor.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)));
  anchor.scale.setScalar(0.06);
  frame.add(anchor);
  const moving = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
  anchor.add(moving);
  const camera = new PerspectiveCamera(50, 1);
  camera.position.set(0.2, -0.3, 0.15);
  frame.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const guides: Array<{ guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>; surface?: string }> = [];
  const settings = { snap: true, snapTo: ["grid", "axes", "objects", "outlines"], gridMm: 10, snapMove: 1, snapRotate: 15, snapScale: 0.1, origin: "top-left" } as PreviewSettings;
  const source: SnapSource = {
    frame: () => frame,
    stageFrame: surface => (surface === "wall"
      ? { surfaces: [{ id: "wall", left: 0, top: 0, width: 400, height: 300 }], local: true }
      : { surfaces: [{ id: "table", left: -230, top: 160, width: 460, height: 320 }] }),
    settings: () => settings,
    modifier: () => false,
    objects: () => [{ targetId: "a", object: moving }],
    prints: () => [
      { id: "a", place: { surface: "wall", x: 100, y: 50, width: 60 }, height: 60 },
      { id: "c", place: { surface: "wall", x: 250, y: 50, width: 60 }, height: 60 },
    ],
    view: () => ({ camera, height: 800 }),
    guides: (g, surface) => guides.push({ guides: g, surface }),
    surfaceOf: () => "wall",
    surface: id => (id === "wall" ? WALL : undefined),
  };
  return { moving, snapper: new SceneSnapper(source), guides };
};

describe("snap in the target's frame: a node on a wall (#375)", () => {
  it("lays a surface's own plane over its frame: its corner at 0, x along it, y up it", () => {
    const plane = surfacePlane(WALL);
    const point = new Vector3(0.13, -0.08, 0).applyMatrix4(plane).multiplyScalar(1000);
    expect(point.toArray().map(v => +v.toFixed(6))).toEqual([...toStage(WALL, 130, 80)]);
  });

  it("puts the node's edge on another print's edge on the wall, along the wall, with its guide on the wall", () => {
    const { moving, snapper, guides } = wallScene();
    snapper.beginMove(moving, "X");
    // dragged 1.72 widths: the cube's right edge at 248.2 mm along the wall, 1.8 mm short of print c's left edge
    moving.position.set(1.72, 0, 0);
    snapper.move(moving);
    expect(+(130 + moving.position.x * 60 + 15).toFixed(3)).toBe(250);
    expect(guides.at(-1)).toEqual({ guides: [{ axis: 0, at: 250 }], surface: "wall" });
  });

  it("snaps up the wall: the handle along the anchor's y is the wall's y", () => {
    const { moving, snapper, guides } = wallScene();
    snapper.beginMove(moving, "Y");
    // the cube's top 1.4 mm below the wall's top edge: caught by it
    moving.position.set(0, 1.06, 0);
    snapper.move(moving);
    expect(Math.abs(-80 + moving.position.y * 60 + 15)).toBeLessThan(1e-6);
    expect(guides.at(-1)).toEqual({ guides: [{ axis: 1, at: 0 }], surface: "wall" });
  });

  it("steps on the grid counted from the wall's corner when no line is near", () => {
    const { moving, snapper } = wallScene();
    snapper.beginMove(moving, "X");
    // the pivot at 202 mm along the wall: no edge within reach (the edges at 187 and 217), the grid's 200
    moving.position.set(72 / 60, 0, 0);
    snapper.move(moving);
    expect(+(130 + moving.position.x * 60).toFixed(3)).toBe(200);
  });
});
