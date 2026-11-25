import { Box3, type Camera, Matrix4, type Mesh, type Object3D, type PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { PlaceBox } from "./placement";
import type { SurfaceFrame } from "./surfaces";
import { frameRects } from "./origin";
import type { PreviewSettings } from "./preview";
import { pickable } from "./pick";
import {
  axisLines, boxLines, chosenLines, freeAxes, joinLines, moveIncrements, surfaceLines, pointLines, placeStageBox, SNAP_PX, snapActive, snapAngle,
  snapMove, snapPlace, snapScale, surfaceSnapSettings, thresholdMm, type PerAxis, type SnapGuide, type SnapLine, type StageBox, type StageFrame, type Vec3,
} from "./snap";

/**
 * The stage's snapping in the scene: turns the gizmo's node and the dragged print into the stage frame (mm, `snap.ts`),
 * collects what they may snap to – the origin's axes, the pages' edges, the other printed targets, the other objects'
 * boxes and pivots – and turns the snapped result back. The math is `snap.ts`; the stage (`stage.svelte.ts`) hands in
 * where everything is.
 *
 * A node snaps in **its target's frame** (#375): on a flat surface that is the table's (the stage frame, as before); on a
 * wall or a turned surface it is that surface's own plane – its top left corner at 0, x along its width, y up it, z off
 * its face (the axes the target's anchor has). There the lines are the surface's edges, its prints and the other nodes'
 * boxes and pivots measured in that plane, the steps are its own grid's, and the guides are drawn on it.
 */

const MM = 1000;

/** Where the snapper finds the stage's parts (the stage hands them in) */
export interface SnapSource {
  /** The stage's frame: metres, origin at the scene's origin, z up (null before the stage is built) */
  frame(): Object3D | null;
  /**
   * The scene's flat surfaces (#314); with `surface`, the frame a print on that surface snaps in – the table's for a flat
   * surface, the surface's own plane (`local`) for a wall or a turned one
   */
  stageFrame(surface?: string): StageFrame;
  settings(): PreviewSettings;
  /**
   * A surface's own grid (#316, #314): the step a print on it snaps to (its spacing over its subdivisions), null when
   * the grid is no snap target on that surface; no function: the settings' `gridMm` and `snapTo`
   */
  surfaceGrid?(surface: string): number | null;
  /** Shift or Ctrl is held: snapping turned around */
  modifier(): boolean;
  /** The entities' node objects of the scene, with their target */
  objects(): Array<{ targetId: string; object: Object3D }>;
  /** The printed targets where they lie, with their printed height (mm) */
  prints(): Array<{ id: string; place: PlaceBox; height: number }>;
  /** The camera and the stage's height in CSS px (the threshold is a few pixels) */
  view(): { camera: Camera; height: number } | null;
  /**
   * Draw the lines something snapped to (empty = none): in the stage frame, or with `surface` in that surface's own
   * plane (mm from its top left corner, y up – a wall's or a turned surface's)
   */
  guides(guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>, surface?: string): void;
  /** The surface a target's print lies on (#375; none: the table's frame) */
  surfaceOf?(targetId: string): string | undefined;
  /** A surface of the scene where it lies (stage mm) */
  surface?(id: string): SurfaceFrame | undefined;
}

/**
 * Where a drag snaps (#375): `toWorld` turns the frame's metres into the world, `stage` is its 2D frame (the table's
 * surfaces, or one surface's own rectangle – `local`), `surface` that surface's id
 */
interface SnapSpace {
  toWorld: Matrix4;
  inverse: Matrix4;
  stage: StageFrame;
  surface?: string;
}

/**
 * A surface's own plane as a frame (metres of the stage frame): its top left corner at 0, x along its width, y up it
 * (against `down`), z its face's normal – the axes a target's anchor on it has (`targetTurn`)
 */
export const surfacePlane = (surface: SurfaceFrame): Matrix4 => {
  const up = new Vector3(-surface.down[0], -surface.down[1], -surface.down[2]);
  return new Matrix4()
    .makeBasis(new Vector3(...surface.right), up, new Vector3(...surface.normal))
    .setPosition(surface.origin[0] / MM, surface.origin[1] / MM, surface.origin[2] / MM);
};

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** `ancestor` is `object` or one of its parents */
const within = (object: Object3D, ancestor: Object3D): boolean => {
  for (let at: Object3D | null = object; at; at = at.parent) if (at === ancestor) return true;
  return false;
};

/** An object's box in the stage frame (mm): the bounding boxes of its meshes, lines and points – the editor's own helpers left out – null when it has none */
export const boxInFrame = (object: Object3D, frameInverse: Matrix4): StageBox | null => {
  const box = new Box3();
  const corner = new Vector3();
  const toFrame = new Matrix4();
  object.updateWorldMatrix(true, true);
  object.traverse(child => {
    const geometry = (child as Mesh).geometry;
    if (!geometry?.getAttribute?.("position") || !pickable(child)) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    if (!b || b.isEmpty()) return;
    toFrame.multiplyMatrices(frameInverse, child.matrixWorld);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(toFrame);
      box.expandByPoint(corner);
    }
  });
  if (box.isEmpty()) return null;
  return { min: [box.min.x * MM, box.min.y * MM, box.min.z * MM], max: [box.max.x * MM, box.max.y * MM, box.max.z * MM] };
};

/** A move under way: the lines, the anchors and the axes the handle may change, fixed when the drag starts */
interface MoveDrag {
  space: SnapSpace;
  lines: PerAxis<SnapLine[]>;
  offsets: PerAxis<number[]>;
  free: PerAxis<boolean>;
  threshold: number;
}

export class SceneSnapper {
  private drag: MoveDrag | null = null;

  constructor(private source: SnapSource) {}

  /** Snapping is on right now: the setting, turned around while Shift or Ctrl is held */
  active(): boolean {
    return snapActive(this.source.settings().snap, this.source.modifier());
  }

  /** A rotation's angle (degrees) snapped to the rotate step */
  angle(degrees: number): number {
    return snapAngle(degrees, this.source.settings().snapRotate);
  }

  /** A scale factor snapped to the scale step */
  scale(value: number): number {
    return snapScale(value, this.source.settings().snapScale);
  }

  /**
   * A move of the gizmo starts: `axis` is the handle (`X`, `XY`, `XYZ` … in the node's own space). The frame it snaps in
   * (its target's, #375), the lines to snap to, the node's anchors (its box's edges and centre around its pivot) and the
   * frame's axes the handle may change are fixed now; the other objects do not move while it lasts.
   */
  beginMove(object: Object3D, axis: string | null): void {
    this.drag = null;
    const space = this.spaceOf(object);
    if (!space || !object.parent || !axis) return;
    const { inverse } = space;
    const pivot = this.pivotOf(object, inverse);
    const box = boxInFrame(object, inverse);
    const offsets = [0, 1, 2].map(k => (box ? [box.min[k] - pivot[k], (box.min[k] + box.max[k]) / 2 - pivot[k], box.max[k] - pivot[k]] : [])) as PerAxis<number[]>;
    // The handle's directions in the snap frame: the node's own axes as the gizmo draws them (local space)
    const toFrame = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(space.toWorld)).invert()
      .multiply(object.getWorldQuaternion(new Quaternion()));
    const directions = [...axis].flatMap(letter => (letter === "X" ? [X] : letter === "Y" ? [Y] : letter === "Z" ? [Z] : []))
      .map(d => d.clone().applyQuaternion(toFrame).toArray() as unknown as Vec3);
    // The centre handle moves in the screen's plane: it snaps on the page (the surface), not off it
    const free = axis === "XYZ" ? ([true, true, false] as PerAxis<boolean>) : freeAxes(directions);
    this.drag = { space, lines: this.lines({ moving: object, frame: space.stage, inverse }), offsets, free, threshold: this.threshold(object) };
  }

  /** The gizmo moved the node (in its parent's space): snap it, when snapping is on, and draw what it snapped to */
  move(object: Object3D): void {
    if (!this.drag || !object.parent || !this.active()) {
      this.source.guides([]);
      return;
    }
    const { space } = this.drag;
    const pivot = this.pivotOf(object, space.inverse);
    const { point, guides } = snapMove({
      point: pivot, offsets: this.drag.offsets, lines: this.drag.lines, free: this.drag.free, threshold: this.drag.threshold,
      increments: moveIncrements(pivot[0], this.settingsOn(space.surface), space.stage),
    });
    const world = new Vector3(point[0] / MM, point[1] / MM, point[2] / MM).applyMatrix4(space.toWorld);
    object.parent.updateWorldMatrix(true, false);
    object.position.copy(object.parent.worldToLocal(world));
    this.showGuides(guides, space.surface);
  }

  /** The drag ended: no guides, nothing held */
  end(): void {
    this.drag = null;
    this.source.guides([]);
  }

  /**
   * A print dragged by its placement handles (`draggedPlace`'s result): snapped when snapping is on (`modifier`: the
   * pointer's own Shift / Ctrl), with its guides; the print's own entity and outline are no lines for it
   */
  place<P extends PlaceBox>(targetId: string | null, place: P, height: number, kind: "move" | "width", modifier: boolean): P {
    const all = this.source.settings();
    if (!snapActive(all.snap, this.source.modifier() || modifier)) {
      this.source.guides([]);
      return place;
    }
    // The surface's own grid (#316, #314): its step (spacing over subdivisions) is the step of a print on it; snap off there: the move step
    const settings = this.settingsOn(place.surface);
    const frame = this.source.stageFrame(place.surface);
    const result = snapPlace(place, height, kind, {
      frame, lines: this.lines({ targetId, frame }), threshold: this.threshold(null), settings,
    });
    // A print snapped in a wall's own plane shows its guides on that wall (#375)
    this.showGuides(result.guides, frame.local ? place.surface : undefined);
    return result.place;
  }

  /**
   * Where a node snaps (#375): its target's surface's own plane when that is a wall or a turned surface, else the
   * table's frame (the stage frame); null before the stage is built
   */
  private spaceOf(object: Object3D): SnapSpace | null {
    const frame = this.source.frame();
    if (!frame) return null;
    frame.updateWorldMatrix(true, false);
    const table = (): SnapSpace => ({ toWorld: frame.matrixWorld.clone(), inverse: frame.matrixWorld.clone().invert(), stage: this.source.stageFrame() });
    const targetId = this.source.objects().find(entry => entry.object === object)?.targetId;
    const surfaceId = targetId !== undefined ? this.source.surfaceOf?.(targetId) : undefined;
    if (surfaceId === undefined) return table();
    const stage = this.source.stageFrame(surfaceId);
    const surface = this.source.surface?.(surfaceId);
    if (!stage.local || !surface) return table();
    const toWorld = frame.matrixWorld.clone().multiply(surfacePlane(surface));
    return { toWorld, inverse: toWorld.clone().invert(), stage, surface: surfaceId };
  }

  /** The snap settings on a surface: its own grid's step (#316, #314); none named: the settings as they are */
  private settingsOn(surface: string | undefined): PreviewSettings {
    const all = this.source.settings();
    return surface !== undefined && this.source.surfaceGrid ? surfaceSnapSettings(all, this.source.surfaceGrid(surface)) : all;
  }

  /** The pivot of a node (its position in its parent's space) in the snap frame, mm */
  private pivotOf(object: Object3D, frameInverse: Matrix4): Vec3 {
    object.parent?.updateWorldMatrix(true, false);
    const at = object.position.clone();
    if (object.parent) at.applyMatrix4(object.parent.matrixWorld);
    at.applyMatrix4(frameInverse);
    return [at.x * MM, at.y * MM, at.z * MM];
  }

  /** How many mm `SNAP_PX` pixels are where the drag happens (the node's pivot, or the page's centre) */
  private threshold(object: Object3D | null): number {
    const view = this.source.view();
    const frame = this.source.frame();
    if (!view || !frame) return 0;
    const at = object ? object.getWorldPosition(new Vector3()) : frame.getWorldPosition(new Vector3());
    const distance = at.distanceTo(view.camera.getWorldPosition(new Vector3())) * MM;
    const fov = (view.camera as PerspectiveCamera).fov ?? 50;
    return thresholdMm(SNAP_PX, distance, fov, view.height);
  }

  /**
   * The lines of the chosen snap targets: the axes, the pages' edges and the printed targets (outlines), the other
   * objects' boxes and pivots. A moving node leaves out itself and what hangs below it, and of its parents the boxes
   * (they hold it) – their pivots stay; a dragged print leaves out its own outline and its target's entity. `inverse`
   * turns the world into the snap frame (default: the stage frame's). In a surface's own plane (`local`) the origin's
   * axes count not; a moving node there still snaps to the objects (measured in that plane), a print only to the
   * surface's edges and prints.
   */
  private lines(skip: { moving?: Object3D; targetId?: string | null; frame?: StageFrame; inverse?: Matrix4 }): PerAxis<SnapLine[]> {
    const settings = this.source.settings();
    const frame = this.source.frame();
    const stage = skip.frame ?? this.source.stageFrame();
    const sources: PerAxis<readonly SnapLine[]>[] = [];
    // The origin's axes count on the table only
    if (settings.snapTo.includes("axes") && !stage.local) sources.push(axisLines(settings.origin, stage));
    if (settings.snapTo.includes("outlines")) {
      sources.push(surfaceLines(stage));
      const onFrame = new Set(frameRects(stage).map(rect => rect.id));
      for (const print of this.source.prints()) {
        if (print.id !== skip.targetId && (onFrame.has(print.place.surface) || !stage.surfaces?.length)) {
          sources.push(boxLines(placeStageBox(print.place, print.height, stage), "outlines"));
        }
      }
    }
    if (settings.snapTo.includes("objects") && frame && (!stage.local || skip.moving)) {
      const inverse = skip.inverse ?? frame.matrixWorld.clone().invert();
      for (const { targetId, object } of this.source.objects()) {
        if (skip.targetId && targetId === skip.targetId) continue;
        if (skip.moving && within(object, skip.moving)) continue;
        if (!pickable(object)) continue;
        sources.push(pointLines(this.pivotOf(object, inverse), "objects"));
        if (skip.moving && within(skip.moving, object)) continue;
        const box = boxInFrame(object, inverse);
        if (box) sources.push(boxLines(box, "objects"));
      }
    }
    return chosenLines(joinLines(...sources), settings.snapTo);
  }

  /** Draw the guides: in the stage frame, or on `surface`'s own plane */
  private showGuides(guides: readonly SnapGuide[], surface?: string): void {
    const lines = guides.map(guide => ({ axis: guide.axis, at: guide.line.at }));
    if (surface !== undefined) this.source.guides(lines, surface);
    else this.source.guides(lines);
  }
}
