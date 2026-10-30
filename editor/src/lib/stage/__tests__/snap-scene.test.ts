import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { boxInFrame, SceneSnapper, type SnapSource } from "../snap-scene";
import type { PreviewSettings } from "../preview";

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
    stageFrame: () => ({ page: { width: 230, height: 320 }, format: "spread" }),
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
