import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop, MathUtils, Object3D } from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { SceneInspection } from "@engine/types";
import type { SurfacePlace } from "@shared/types/game-config";

/**
 * The gizmo of the scene's selected surface (#314, the Surface mode): three.js `TransformControls` on a stand-in for
 * the surface – an object in the **scene's coordinate system** (`SurfacePlace`: mm, +y up, +z towards the reader, Euler
 * XYZ), which a root turned +90° about x puts into the stage frame (x right, y away from the reader, z up – the mock
 * stage's group). A drag moves or turns the stand-in and its outline at once; when it ends, the new place goes to the
 * page (`ondone`), which saves it – the board follows once the draft has it. Move (translate) or rotate, snapped to the
 * floor grid's spacing (#319) and 15° while snapping is on. The tracker ignores the pointer while an axis is hovered or dragged (`busy`), and
 * the click that ends a drag is no tap (`recentlyDragged`).
 */

export const SURFACE_GIZMO_MODES = ["translate", "rotate"] as const;
export type SurfaceGizmoMode = (typeof SURFACE_GIZMO_MODES)[number];

/** What the gizmo sits on: the surface, its place in the scene (mm, degrees) and its size (mm) */
export interface SurfaceGizmoTarget {
  id: string;
  place: Required<SurfacePlace>;
  widthMm: number;
  heightMm: number;
}

const DRAG_CLICK_MS = 300;
const TURN_SNAP_DEGREES = 15;
const OUTLINE_COLOR = 0xffffff;

const tenth = (value: number): number => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** The stand-in's place as the content writes it: its position in mm, its turn in degrees (Euler XYZ) */
export const placeOfObject = (object: Object3D): Required<SurfacePlace> => ({
  x: tenth(object.position.x * 1000),
  y: tenth(object.position.y * 1000),
  z: tenth(object.position.z * 1000),
  rx: tenth(MathUtils.radToDeg(object.rotation.x)),
  ry: tenth(MathUtils.radToDeg(object.rotation.y)),
  rz: tenth(MathUtils.radToDeg(object.rotation.z)),
});

/** Put the stand-in at a place (mm, degrees – Euler XYZ, as `surfaces.ts` turns a surface) */
export const placeObject = (object: Object3D, place: Required<SurfacePlace>): void => {
  object.position.set(place.x / 1000, place.y / 1000, place.z / 1000);
  object.rotation.set(MathUtils.degToRad(place.rx), MathUtils.degToRad(place.ry), MathUtils.degToRad(place.rz), "XYZ");
};

/** The scene's coordinate system inside the stage frame: +90° about x (scene y up = stage z up, scene z = stage −y) */
export const sceneRoot = (): Group => {
  const root = new Group();
  root.name = "editor-scene-frame";
  root.rotation.x = Math.PI / 2;
  return root;
};

export class SurfaceGizmo {
  private root = sceneRoot();
  private proxy = new Object3D();
  private outline: LineLoop;
  private controls: TransformControls;
  private helper: Object3D;
  private target: SurfaceGizmoTarget | null = null;
  private shownKey = "";
  private dragging = false;
  private dragEndedAt = 0;

  constructor(
    inspection: SceneInspection,
    /** The group the stand-in lives in: the mock stage's (the stage frame, moved with the stage) */
    parent: Object3D,
    /** A drag ended: the surface's new place */
    private ondone: (surfaceId: string, place: Required<SurfacePlace>) => void,
    /** Snapping is on now (the toolbar's grid & snap, Shift or Ctrl turning it around) */
    private snapping: () => boolean = () => false,
    /** The step a move snaps to (mm): the floor grid's spacing */
    private step: () => number = () => 10,
  ) {
    this.proxy.name = "editor-surface-proxy";
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(new Array(12).fill(0), 3));
    this.outline = new LineLoop(geometry, new LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, depthTest: false, depthWrite: false }));
    this.outline.renderOrder = 2;
    this.proxy.add(this.outline);
    this.root.add(this.proxy);
    this.root.visible = false;
    parent.add(this.root);
    this.controls = new TransformControls(inspection.camera, inspection.domElement);
    this.controls.setSpace("local");
    this.controls.size = 0.8;
    this.helper = this.controls.getHelper();
    this.helper.name = "editor-surface-gizmo";
    inspection.scene.add(this.helper);
    this.controls.addEventListener("dragging-changed", event => {
      this.dragging = !!event.value;
      if (this.dragging) {
        const snap = this.snapping();
        this.controls.setTranslationSnap(snap ? Math.max(1, this.step()) / 1000 : null);
        this.controls.setRotationSnap(snap ? MathUtils.degToRad(TURN_SNAP_DEGREES) : null);
        return;
      }
      this.dragEndedAt = performance.now();
      if (this.target) {
        const place = placeOfObject(this.proxy);
        this.target = { ...this.target, place };
        this.shownKey = keyOf(this.target);
        this.ondone(this.target.id, place);
      }
    });
  }

  get mode(): SurfaceGizmoMode {
    return this.controls.mode === "rotate" ? "rotate" : "translate";
  }

  set mode(mode: SurfaceGizmoMode) {
    this.controls.setMode(mode);
  }

  /** An axis is hovered or dragged: the gesture belongs to the gizmo, not to the stage's orbit */
  get busy(): boolean {
    return this.dragging || (!!this.target && !!this.controls.axis);
  }

  recentlyDragged(): boolean {
    return this.dragging || performance.now() - this.dragEndedAt < DRAG_CLICK_MS;
  }

  /** The gizmo on a surface at its place (null: none); while a drag runs the stand-in stays the person's */
  show(target: SurfaceGizmoTarget | null): void {
    if (this.dragging) return;
    const key = target ? keyOf(target) : "";
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.target = target;
    if (!target) {
      this.controls.detach();
      this.root.visible = false;
      return;
    }
    placeObject(this.proxy, target.place);
    // The outline lies where the surface does: flat in the stand-in's own x–z plane (its face +y), centred
    const w = target.widthMm / 2000;
    const h = target.heightMm / 2000;
    const position = this.outline.geometry.getAttribute("position") as Float32BufferAttribute;
    [[-w, 0, -h], [w, 0, -h], [w, 0, h], [-w, 0, h]].forEach(([x, y, z], i) => position.setXYZ(i, x, y, z));
    position.needsUpdate = true;
    this.outline.geometry.computeBoundingSphere();
    this.root.visible = true;
    this.controls.attach(this.proxy);
  }

  dispose(): void {
    this.controls.detach();
    this.helper.removeFromParent();
    this.root.removeFromParent();
    this.outline.geometry.dispose();
    (this.outline.material as LineBasicMaterial).dispose();
    this.controls.dispose();
  }
}

const keyOf = (target: SurfaceGizmoTarget): string => JSON.stringify(target);
