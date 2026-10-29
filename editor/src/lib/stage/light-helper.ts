import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D, SphereGeometry } from "three";
import { entityNodes } from "@engine/content/game-config";
import { resolveLight, type EntityData, type Light, type SceneInspection } from "@engine/types";
import { SELECTION_COLOR } from "./shading";

/**
 * The stage's helpers for light nodes, after Blender's: a small bulb at the node's origin and lines for what the
 * light does – short rays for a point light, the cone of a spot, parallel rays for a directional light – drawn in
 * the node's own space so they move, turn and scale with it (−z is where a spot or the sun points). Orange while
 * the node is selected (the node has no mesh to outline), dark grey otherwise, drawn through everything. The
 * editor adds them to the node's placement group every frame a light node has none (the engine builds nodes
 * anew) and takes them away when the node goes; the reader never has them. Only the bulb can be picked.
 */
export const LIGHT_HELPER_NAME = "editor-light-helper";
const HELPER_COLOR = 0x2a2a2a;
/** Sizes in target widths: the bulb, the rays of a point light, a spot cone or sun rays without a distance */
const BULB_RADIUS = 0.05;
const RAY_FROM = 0.09;
const RAY_TO = 0.18;
const REACH_DEFAULT = 0.5;
const SUN_RADIUS = 0.1;
const CONE_SEGMENTS = 24;

export interface HelperSelection {
  targetId: string;
  path: number[];
}

/** The lines of a kind of light (pairs of points) */
const linesOf = (light: Light): number[] => {
  const points: number[] = [];
  const segment = (a: [number, number, number], b: [number, number, number]) => points.push(...a, ...b);
  if (light.kind === "point") {
    for (const axis of [0, 1, 2]) {
      for (const sign of [1, -1]) {
        const a: [number, number, number] = [0, 0, 0];
        const b: [number, number, number] = [0, 0, 0];
        a[axis] = sign * RAY_FROM;
        b[axis] = sign * RAY_TO;
        segment(a, b);
      }
    }
    return points;
  }
  const reach = light.distance > 0 ? light.distance : REACH_DEFAULT;
  if (light.kind === "spot") {
    const radius = reach * Math.tan((light.angle * Math.PI) / 180);
    const ring: [number, number, number][] = [];
    for (let i = 0; i < CONE_SEGMENTS; i++) {
      const a = (i / CONE_SEGMENTS) * Math.PI * 2;
      ring.push([Math.cos(a) * radius, Math.sin(a) * radius, -reach]);
    }
    ring.forEach((p, i) => segment(p, ring[(i + 1) % CONE_SEGMENTS]));
    for (let i = 0; i < CONE_SEGMENTS; i += CONE_SEGMENTS / 4) segment([0, 0, 0], ring[i]);
    segment([0, 0, 0], [0, 0, -reach]);
    return points;
  }
  // Directional: a ring of parallel rays and the centre one, as the sun's
  const ring: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring.push([Math.cos(a) * SUN_RADIUS, Math.sin(a) * SUN_RADIUS, 0]);
  }
  ring.forEach((p, i) => segment(p, ring[(i + 1) % 8]));
  ring.forEach(p => segment(p, [p[0], p[1], -reach * 0.6]));
  segment([0, 0, 0], [0, 0, -reach]);
  return points;
};

/** A helper for a light's values in the given colour */
export const buildLightHelper = (light: Light, color: number): Group => {
  const helper = new Group();
  helper.name = LIGHT_HELPER_NAME;
  const bulb = new Mesh(new SphereGeometry(BULB_RADIUS, 12, 8), new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }));
  bulb.name = "editor-light-bulb";
  bulb.renderOrder = 998;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(linesOf(light), 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 }));
  lines.name = "editor-light-lines";
  lines.renderOrder = 998;
  lines.frustumCulled = false;
  lines.raycast = () => {}; // the bulb is what a click picks, not the cone
  helper.add(bulb, lines);
  return helper;
};

const disposeHelper = (helper: Group): void => {
  helper.removeFromParent();
  helper.traverse(object => {
    const part = object as Mesh;
    if (!part.geometry) return;
    part.geometry.dispose();
    (Array.isArray(part.material) ? part.material : [part.material]).forEach(material => material?.dispose());
  });
};

const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export class LightHelpers {
  private helpers = new Map<Object3D, { helper: Group; key: string }>();
  /** The selected node: its helper is orange */
  selection: HelperSelection | null = null;
  private offFrame: () => void;

  constructor(
    private inspection: SceneInspection,
    /** The trees shown on the stage, by target (the live override or the draft's) */
    private trees: () => Array<{ targetId: string; tree: EntityData }>,
  ) {
    this.offFrame = inspection.onFrame(() => this.sync());
  }

  /** Every light node has a helper that matches its values and its selection; helpers of nodes that went are removed */
  sync(): void {
    const seen = new Set<Object3D>();
    for (const { targetId, tree } of this.trees()) {
      for (const { node, path } of entityNodes(tree)) {
        if (node.type !== "light") continue;
        const object = this.inspection.nodeObject(targetId, path);
        if (!object) continue;
        seen.add(object);
        const selected = !!this.selection && this.selection.targetId === targetId && samePath(this.selection.path, path);
        const light = resolveLight(node.light);
        const key = JSON.stringify([light, selected]);
        const current = this.helpers.get(object);
        if (current && current.key === key && current.helper.parent === object) continue;
        if (current) disposeHelper(current.helper);
        const helper = buildLightHelper(light, selected ? SELECTION_COLOR : HELPER_COLOR);
        object.add(helper);
        this.helpers.set(object, { helper, key });
      }
    }
    for (const [object, { helper }] of this.helpers) {
      if (seen.has(object)) continue;
      disposeHelper(helper);
      this.helpers.delete(object);
    }
  }

  dispose(): void {
    this.offFrame();
    this.helpers.forEach(({ helper }) => disposeHelper(helper));
    this.helpers.clear();
  }
}
