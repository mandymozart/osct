import { Box3, type Camera, Matrix4, type Mesh, type Object3D, type PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { PrintBox } from "./placement";
import type { PreviewSettings } from "./preview";
import { pickable } from "./pick";
import {
  axisLines, boxLines, chosenLines, freeAxes, joinLines, moveIncrements, pageLines, pointLines, printStageBox, SNAP_PX, snapActive, snapAngle,
  snapMove, snapPlace, snapScale, thresholdMm, type PerAxis, type SnapGuide, type SnapLine, type StageBox, type StageFrame, type Vec3,
} from "./snap";

/**
 * The stage's snapping in the scene: turns the gizmo's node and the dragged print into the stage frame (mm, `snap.ts`),
 * collects what they may snap to – the origin's axes, the pages' edges, the other printed targets, the other objects'
 * boxes and pivots – and turns the snapped result back. The math is `snap.ts`; the stage (`stage.svelte.ts`) hands in
 * where everything is.
 */

/** Where the snapper finds the stage's parts (the stage hands them in) */
export interface SnapSource {
  /** The stage's frame: metres, origin in the middle of the book, z out of the page (null before the stage is built) */
  frame(): Object3D | null;
  /** The spread's page size and format */
  stageFrame(): StageFrame;
  settings(): PreviewSettings;
  /** Shift or Ctrl is held: snapping turned around */
  modifier(): boolean;
  /** The entities' node objects of the spread, with their target */
  objects(): Array<{ targetId: string; object: Object3D }>;
  /** The printed targets where they lie, with their printed height (mm) */
  prints(): Array<{ id: string; place: PrintBox; height: number }>;
  /** The camera and the stage's height in CSS px (the threshold is a few pixels) */
  view(): { camera: Camera; height: number } | null;
  /** Draw the lines something snapped to (empty = none) */
  guides(guides: ReadonlyArray<{ axis: 0 | 1 | 2; at: number }>): void;
}

const MM = 1000;
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
   * A move of the gizmo starts: `axis` is the handle (`X`, `XY`, `XYZ` … in the node's own space). The lines to snap to,
   * the node's anchors (its box's edges and centre around its pivot) and the stage axes the handle may change are fixed
   * now; the other objects do not move while it lasts.
   */
  beginMove(object: Object3D, axis: string | null): void {
    this.drag = null;
    const frame = this.source.frame();
    if (!frame || !object.parent || !axis) return;
    const inverse = frame.matrixWorld.clone().invert();
    const pivot = this.pivotOf(object, inverse);
    const box = boxInFrame(object, inverse);
    const offsets = [0, 1, 2].map(k => (box ? [box.min[k] - pivot[k], (box.min[k] + box.max[k]) / 2 - pivot[k], box.max[k] - pivot[k]] : [])) as PerAxis<number[]>;
    // The handle's directions in the stage frame: the node's own axes as the gizmo draws them (local space)
    const toFrame = frame.getWorldQuaternion(new Quaternion()).invert().multiply(object.getWorldQuaternion(new Quaternion()));
    const directions = [...axis].flatMap(letter => (letter === "X" ? [X] : letter === "Y" ? [Y] : letter === "Z" ? [Z] : []))
      .map(d => d.clone().applyQuaternion(toFrame).toArray() as unknown as Vec3);
    // The centre handle moves in the screen's plane: it snaps on the page, not in height
    const free = axis === "XYZ" ? ([true, true, false] as PerAxis<boolean>) : freeAxes(directions);
    this.drag = { lines: this.lines({ moving: object }), offsets, free, threshold: this.threshold(object) };
  }

  /** The gizmo moved the node (in its parent's space): snap it, when snapping is on, and draw what it snapped to */
  move(object: Object3D): void {
    const frame = this.source.frame();
    if (!this.drag || !frame || !object.parent || !this.active()) {
      this.source.guides([]);
      return;
    }
    const inverse = frame.matrixWorld.clone().invert();
    const pivot = this.pivotOf(object, inverse);
    const settings = this.source.settings();
    const { point, guides } = snapMove({
      point: pivot, offsets: this.drag.offsets, lines: this.drag.lines, free: this.drag.free, threshold: this.drag.threshold,
      increments: moveIncrements(pivot[0], settings, this.source.stageFrame()),
    });
    const world = new Vector3(point[0] / MM, point[1] / MM, point[2] / MM).applyMatrix4(frame.matrixWorld);
    object.parent.updateWorldMatrix(true, false);
    object.position.copy(object.parent.worldToLocal(world));
    this.showGuides(guides);
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
  place<P extends PrintBox>(targetId: string | null, place: P, height: number, kind: "move" | "width", modifier: boolean): P {
    const settings = this.source.settings();
    if (!snapActive(settings.snap, this.source.modifier() || modifier)) {
      this.source.guides([]);
      return place;
    }
    const result = snapPlace(place, height, kind, {
      frame: this.source.stageFrame(), lines: this.lines({ targetId }), threshold: this.threshold(null), settings,
    });
    this.showGuides(result.guides);
    return result.place;
  }

  /** The pivot of a node (its position in its parent's space) in the stage frame, mm */
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
   * (they hold it) – their pivots stay; a dragged print leaves out its own outline and its target's entity.
   */
  private lines(skip: { moving?: Object3D; targetId?: string | null }): PerAxis<SnapLine[]> {
    const settings = this.source.settings();
    const frame = this.source.frame();
    const stage = this.source.stageFrame();
    const sources: PerAxis<readonly SnapLine[]>[] = [];
    if (settings.snapTo.includes("axes")) sources.push(axisLines(settings.origin, stage));
    if (settings.snapTo.includes("outlines")) {
      sources.push(pageLines(stage));
      for (const print of this.source.prints()) {
        if (print.id !== skip.targetId) sources.push(boxLines(printStageBox(print.place, print.height, stage), "outlines"));
      }
    }
    if (settings.snapTo.includes("objects") && frame) {
      const inverse = frame.matrixWorld.clone().invert();
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

  private showGuides(guides: readonly SnapGuide[]): void {
    this.source.guides(guides.map(guide => ({ axis: guide.axis, at: guide.line.at })));
  }
}
