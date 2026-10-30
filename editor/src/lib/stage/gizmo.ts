import { MathUtils, type Object3D } from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { SceneInspection, Vector3Data } from "@engine/types";
import { outline, SELECTION_COLOR, type Outline } from "./shading";

/**
 * The transform gizmo of the editor's stage: three.js `TransformControls` on the selected node's object (the
 * placement group the engine builds per node), in the node's own space – a drag changes the node's position,
 * rotation or scale **relative to its parent**, exactly the values the Entity panel shows. Modes move / rotate /
 * scale (W / E / R, the toolbar); Ctrl snaps (0.05 target widths, 15°, 0.1). The hover is the stage's (it follows the
 * pick mode). The tracker ignores pointer gestures while an axis is hovered or dragged (`busy`), and a tap right after
 * a drag is no selection (`recentlyDragged`).
 */

export type GizmoMode = "translate" | "rotate" | "scale";
export const GIZMO_MODES: readonly GizmoMode[] = ["translate", "rotate", "scale"];
export const GIZMO_KEYS: Record<string, GizmoMode> = { w: "translate", e: "rotate", r: "scale" };
/** Snap steps while Ctrl is held: target widths, degrees, scale */
export const SNAP = { translate: 0.05, rotate: 15, scale: 0.1 } as const;
/** A click this soon after a drag ended is the drag's own click, not a tap */
const DRAG_CLICK_MS = 300;

export interface GizmoPlacement {
  position: Vector3Data;
  rotation: Vector3Data;
  scale: number | Vector3Data;
}

const round = (value: number) => +value.toFixed(4);

/** The node's placement as the content stores it: position, rotation in degrees, an even scale as one number */
export const placementOf = (object: Object3D): GizmoPlacement => {
  const position: Vector3Data = [round(object.position.x), round(object.position.y), round(object.position.z)];
  const rotation: Vector3Data = [
    round(MathUtils.radToDeg(object.rotation.x)),
    round(MathUtils.radToDeg(object.rotation.y)),
    round(MathUtils.radToDeg(object.rotation.z)),
  ];
  const s: Vector3Data = [round(object.scale.x), round(object.scale.y), round(object.scale.z)];
  return { position, rotation, scale: s[0] === s[1] && s[1] === s[2] ? s[0] : s };
};

export interface GizmoSelection {
  targetId: string;
  path: number[];
}

export class Gizmo {
  private controls: TransformControls;
  private helper: Object3D;
  private selectionOutline: Outline | null = null;
  private selection: GizmoSelection | null = null;
  private attached: Object3D | null = null;
  private dragging = false;
  private dragEndedAt = 0;
  private offFrame: () => void;

  constructor(
    private inspection: SceneInspection,
    /** A drag changed the selected node's placement */
    private onchange: (selection: GizmoSelection, placement: GizmoPlacement) => void,
  ) {
    const { camera, domElement, scene } = inspection;
    this.controls = new TransformControls(camera, domElement);
    this.controls.setSpace("local");
    this.controls.size = 0.8;
    this.helper = this.controls.getHelper();
    this.helper.name = "editor-gizmo";
    scene.add(this.helper);
    this.controls.addEventListener("dragging-changed", event => {
      this.dragging = !!event.value;
      if (!this.dragging) this.dragEndedAt = performance.now();
    });
    this.controls.addEventListener("objectChange", () => {
      if (this.selection && this.attached) this.onchange(this.selection, placementOf(this.attached));
    });
    // A rebuilt node (the scene built the spread again) is attached and outlined again
    this.offFrame = inspection.onFrame(() => {
      if (this.selection && this.attached && !this.attached.parent) this.sync();
    });
  }

  get mode(): GizmoMode {
    return this.controls.mode as GizmoMode;
  }

  set mode(mode: GizmoMode) {
    this.controls.setMode(mode);
  }

  /** Ctrl held: snap */
  snap(on: boolean): void {
    this.controls.setTranslationSnap(on ? SNAP.translate : null);
    this.controls.setRotationSnap(on ? MathUtils.degToRad(SNAP.rotate) : null);
    this.controls.setScaleSnap(on ? SNAP.scale : null);
  }

  /** An axis is hovered or dragged: the gesture belongs to the gizmo, not to the stage's orbit */
  get busy(): boolean {
    return this.dragging || !!this.controls.axis;
  }

  recentlyDragged(): boolean {
    return this.dragging || performance.now() - this.dragEndedAt < DRAG_CLICK_MS;
  }

  /** Put the gizmo on a node (null = none) */
  select(selection: GizmoSelection | null): void {
    this.selection = selection;
    this.sync();
  }

  /** Attach the selected node's current object (the scene may have rebuilt it) and outline it */
  sync(): void {
    const object = this.selection ? this.inspection.nodeObject(this.selection.targetId, this.selection.path) : null;
    if (object === this.attached && (object ? this.controls.object === object : true)) return;
    this.attached = object;
    this.selectionOutline?.remove();
    this.selectionOutline = object ? outline(object, SELECTION_COLOR) : null;
    if (object) this.controls.attach(object);
    else this.controls.detach();
  }

  /** The selection's outline drawn again (a node's meshes changed, the shading swapped materials) */
  refreshOutline(): void {
    this.selectionOutline?.remove();
    this.selectionOutline = this.attached ? outline(this.attached, SELECTION_COLOR) : null;
  }

  dispose(): void {
    this.offFrame();
    this.selectionOutline?.remove();
    this.selectionOutline = null;
    this.controls.detach();
    this.helper.removeFromParent();
    this.controls.dispose();
  }
}
