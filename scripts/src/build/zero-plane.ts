import fs from 'fs';
import path from 'path';
import { Box3, Euler, MathUtils, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { resolvePlacement, type EntityData } from '../../../shared/types/game-config';
import { CONTENT_DIR } from '../config';
import { buildWarnings } from '../lib/errors';

/**
 * The page is the book's zero plane (#189): every model that stands on a page has its lowest point at z = 0 of its
 * target (the paper) – not floating above it, not sunk into it. The check reads each model's bounding box from its glTF
 * file (the accessors' min / max of its meshes' positions through the scene's node transforms), carries it through the
 * placement of every node above it in the entity's tree, and warns when its lowest point is further from the page than
 * `ZERO_PLANE_TOLERANCE`, with the z position that would put it there. A model meant to float (a bird, a lamp on a wire)
 * keeps the warning – the author decides; nothing is refused.
 */

/** How far (in target widths) a model's lowest point may be from the page before the build warns: half a millimetre on a 10 cm target */
export const ZERO_PLANE_TOLERANCE = 0.005;

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

interface GltfNode { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface Gltf {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GltfNode[];
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>;
  accessors?: Array<{ min?: number[]; max?: number[] }>;
}

/** The JSON of a glTF file: a .glb's first chunk, or a .gltf as it is; null when it is neither */
export const readGltfJson = (bytes: Buffer): Gltf | null => {
  try {
    if (bytes.length >= 20 && bytes.readUInt32LE(0) === GLB_MAGIC) {
      const length = bytes.readUInt32LE(12);
      if (bytes.readUInt32LE(16) !== JSON_CHUNK) return null;
      return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
    }
    return JSON.parse(bytes.toString('utf8')) as Gltf;
  } catch {
    return null;
  }
};

const nodeMatrix = (node: GltfNode): Matrix4 => {
  if (node.matrix?.length === 16) return new Matrix4().fromArray(node.matrix);
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  return new Matrix4().compose(new Vector3(t[0], t[1], t[2]), new Quaternion(r[0], r[1], r[2], r[3]), new Vector3(s[0], s[1], s[2]));
};

/** The bounding box of a glTF's default scene in the model's own space (what three's loader shows), or null without meshes */
export const gltfBounds = (gltf: Gltf): Box3 | null => {
  const box = new Box3();
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? [];
  const visit = (index: number, parent: Matrix4, depth: number) => {
    const node = gltf.nodes?.[index];
    if (!node || depth > 64) return;
    const world = parent.clone().multiply(nodeMatrix(node));
    for (const primitive of node.mesh !== undefined ? gltf.meshes?.[node.mesh]?.primitives ?? [] : []) {
      const accessor = gltf.accessors?.[primitive.attributes.POSITION];
      if (!accessor?.min || !accessor.max) continue;
      box.union(new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(world));
    }
    (node.children ?? []).forEach(child => visit(child, world, depth + 1));
  };
  roots.forEach(root => visit(root, new Matrix4(), 0));
  return box.isEmpty() ? null : box;
};

/** A node's placement as a matrix in its parent's space (the engine's: position, rotation in degrees XYZ, scale) */
export const placementMatrix = (node: EntityData): Matrix4 => {
  const { position, rotation, scale } = resolvePlacement(node.type, node.params);
  const euler = new Euler(...(rotation.map(MathUtils.degToRad) as [number, number, number]), 'XYZ');
  return new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(euler), new Vector3(...scale));
};

/** A model's file on disk from its content path (`/assets/content/entries/key/key.glb`), or null for another URL */
const contentPath = (src: string): string | null => {
  const prefix = '/assets/content/';
  return src.startsWith(prefix) ? path.join(CONTENT_DIR, ...src.slice(prefix.length).split('/')) : null;
};

export interface ZeroPlaneFinding {
  label: string;
  /** The lowest point's z in target widths (> 0 floats, < 0 sinks) */
  lowest: number;
  /** The node's position that puts the lowest point on the page */
  position: [number, number, number];
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * The models of a tree that float or sink: every model node's box (from `bounds`, by its file) through the placements
 * above it. `bounds` reads a model's box in its own space (null: unknown – not checked).
 */
export const zeroPlaneFindings = (root: EntityData, label: string, bounds: (src: string) => Box3 | null): ZeroPlaneFinding[] => {
  const findings: ZeroPlaneFinding[] = [];
  const walk = (node: EntityData, parent: Matrix4, at: string) => {
    const world = parent.clone().multiply(placementMatrix(node));
    const src = node.type === 'model' ? node.assets[0]?.src : undefined;
    const box = src ? bounds(src) : null;
    if (box) {
      const lowest = box.clone().applyMatrix4(world).min.z;
      if (Math.abs(lowest) > ZERO_PLANE_TOLERANCE) {
        // Moving the node by d in its parent's space moves the box by the parent's rotation and scale applied to d
        const inParent = new Vector3(0, 0, -lowest).applyMatrix3(new Matrix3().setFromMatrix4(parent).invert());
        const { position } = resolvePlacement(node.type, node.params);
        findings.push({ label: at, lowest: round(lowest), position: [round(position[0] + inParent.x), round(position[1] + inParent.y), round(position[2] + inParent.z)] });
      }
    }
    (node.children ?? []).forEach((child, i) => walk(child, world, `${at} children[${i}]`));
  };
  walk(root, new Matrix4(), label);
  return findings;
};

/** The box of a model file of the content, read once per file */
const cache = new Map<string, Box3 | null>();
export const contentModelBounds = (src: string): Box3 | null => {
  if (cache.has(src)) return cache.get(src)!;
  const file = contentPath(src);
  let box: Box3 | null = null;
  if (file && fs.existsSync(file)) {
    const gltf = readGltfJson(fs.readFileSync(file));
    box = gltf ? gltfBounds(gltf) : null;
  }
  cache.set(src, box);
  return box;
};

/** Warn about every model of the content that floats above or sinks into its page */
export function warnZeroPlane(nodes: Array<{ label: string; node: EntityData }>): void {
  for (const { label, node } of nodes) {
    for (const finding of zeroPlaneFindings(node, label, contentModelBounds)) {
      buildWarnings.push(
        `${finding.label}: the model's lowest point is ${Math.abs(finding.lowest)} target widths ${finding.lowest > 0 ? 'above' : 'below'} the page – ` +
        `position [${finding.position.join(', ')}] stands it on the page (#189)`,
      );
    }
  }
}
